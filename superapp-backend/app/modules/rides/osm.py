"""Free, key-less place data from OpenStreetMap for "Jinni Spots".

Why this design (cost = 0, works for ANY city):
  * Overpass API (read-only OSM query) is queried ONCE per city by an admin — never per customer request — and
    the result is stored in our own `ride_places` table. Customers read from our DB (fast, offline from OSM).
  * Importance is scored (airport > railway > bus > hospital > mall > …, + a bonus for places OSM links to
    Wikipedia/Wikidata, i.e. genuinely well known) so the top of the list is what locals recognise.
  * Imported spots land INACTIVE: admin reviews and switches on the good ones (OSM data can be incomplete).
  * Customer search uses Nominatim (OSM geocoder) through a server-side cache + 1 req/s limiter, bounded to
    the service area. Public Nominatim is for light use; point NOMINATIM_URL at a self-hosted one when you grow.
"""
import json
import logging
import re
from typing import Any, Optional

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

# (OSM filter, category, importance weight)
CATEGORIES = [
    ('["aeroway"="aerodrome"]["name"]', "airport", 100),
    ('["railway"="station"]["name"]', "railway", 95),
    ('["amenity"="bus_station"]["name"]', "bus_stand", 90),
    ('["amenity"="hospital"]["name"]', "hospital", 80),
    ('["shop"="mall"]["name"]', "mall", 72),
    ('["tourism"~"attraction|museum"]["name"]', "attraction", 68),
    ('["historic"~"fort|palace|monument|castle"]["name"]', "heritage", 66),
    ('["amenity"~"university|college"]["name"]', "college", 62),
    ('["amenity"="marketplace"]["name"]', "market", 58),
    ('["leisure"="stadium"]["name"]', "stadium", 52),
]
FAME_BONUS = 15  # has wikipedia/wikidata tag


def build_query(lat: float, lng: float, radius_m: int) -> str:
    parts = "".join(f"nwr(around:{radius_m},{lat},{lng}){flt};" for flt, _c, _w in CATEGORIES)
    return f"[out:json][timeout:40];({parts});out center tags 400;"


def _classify(tags: dict) -> Optional[tuple[str, int]]:
    def has(k, vals):
        v = tags.get(k)
        return v is not None and (vals is None or v in vals)
    if has("aeroway", {"aerodrome"}): return "airport", 100
    if has("railway", {"station"}): return "railway", 95
    if has("amenity", {"bus_station"}): return "bus_stand", 90
    if has("amenity", {"hospital"}): return "hospital", 80
    if has("shop", {"mall"}): return "mall", 72
    if has("tourism", {"attraction", "museum"}): return "attraction", 68
    if has("historic", {"fort", "palace", "monument", "castle"}): return "heritage", 66
    if has("amenity", {"university", "college"}): return "college", 62
    if has("amenity", {"marketplace"}): return "market", 58
    if has("leisure", {"stadium"}): return "stadium", 52
    return None


ICONS = {"airport": "✈️", "railway": "🚉", "bus_stand": "🚌", "hospital": "🏥", "mall": "🛍️", "attraction": "🏯",
         "heritage": "🏰", "college": "🎓", "market": "🛒", "stadium": "🏟️"}


def _norm(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", name.lower()).strip()


def parse_elements(elements: list[dict], center: tuple[float, float], limit: int = 30) -> list[dict]:
    """Overpass elements -> ranked, de-duplicated candidate spots."""
    from app.modules.rides.service import haversine_km
    best: dict[str, dict] = {}
    for el in elements:
        tags = el.get("tags") or {}
        name = (tags.get("name:en") or tags.get("name") or "").strip()
        cls = _classify(tags)
        if not name or not cls:
            continue
        lat = el.get("lat") if el.get("lat") is not None else (el.get("center") or {}).get("lat")
        lng = el.get("lon") if el.get("lon") is not None else (el.get("center") or {}).get("lon")
        if lat is None or lng is None:
            continue
        cat, weight = cls
        fame = FAME_BONUS if (tags.get("wikipedia") or tags.get("wikidata")) else 0
        dist = haversine_km(center[0], center[1], lat, lng)
        score = weight + fame - min(dist, 30) * 0.5   # closer to the centre ranks slightly higher
        cand = {"name": name[:80], "area": (tags.get("addr:suburb") or tags.get("addr:city") or None),
                "icon": ICONS.get(cat), "lat": float(lat), "lng": float(lng), "category": cat,
                "osm_id": f"{el.get('type', 'n')[0]}{el.get('id')}", "score": round(score, 2)}
        key = _norm(name)
        if key not in best or cand["score"] > best[key]["score"]:
            best[key] = cand
    ranked = sorted(best.values(), key=lambda c: -c["score"])
    return ranked[:limit]


async def fetch_candidates(lat: float, lng: float, radius_km: float, limit: int = 30) -> list[dict]:
    q = build_query(lat, lng, int(radius_km * 1000))
    async with httpx.AsyncClient(timeout=60, headers={"User-Agent": settings.OSM_USER_AGENT}) as c:
        r = await c.post(settings.OVERPASS_URL, data={"data": q})
        r.raise_for_status()
        return parse_elements(r.json().get("elements", []), (lat, lng), limit)


# ── Nominatim search (cached, rate-limited, bounded) ─────────────────────────

def viewbox(lat: float, lng: float, radius_km: float) -> str:
    dlat = radius_km / 110.574
    dlng = radius_km / (111.320 * max(0.1, abs(__import__("math").cos(__import__("math").radians(lat)))))
    return f"{lng - dlng},{lat + dlat},{lng + dlng},{lat - dlat}"  # left,top,right,bottom


def parse_nominatim(rows: list[dict]) -> list[dict]:
    out = []
    for r in rows:
        try:
            title = (r.get("name") or (r.get("display_name") or "").split(",")[0]).strip()
            out.append({"text": title or r["display_name"][:60], "subtitle": ", ".join(x.strip() for x in (r.get("display_name") or "").split(",")[1:3]),
                        "lat": float(r["lat"]), "lng": float(r["lon"])})
        except (KeyError, ValueError):
            continue
    return out


async def nominatim_search(redis, q: str, center: Optional[tuple[float, float]], radius_km: Optional[float]) -> list[dict]:
    key = "nominatim:" + _norm(q) + (f":{round(center[0], 2)},{round(center[1], 2)}" if center else "")
    cached = await redis.get(key)
    if cached:
        return json.loads(cached)
    # Public-instance etiquette: at most 1 request / second across all workers.
    if not await redis.set("nominatim:gate", "1", nx=True, px=1100):
        return []
    params: dict[str, Any] = {"q": q, "format": "jsonv2", "limit": 6, "countrycodes": "in", "addressdetails": 0}
    if center and radius_km:
        params.update({"viewbox": viewbox(center[0], center[1], radius_km), "bounded": 1})
    try:
        async with httpx.AsyncClient(timeout=8, headers={"User-Agent": settings.OSM_USER_AGENT}) as c:
            r = await c.get(f"{settings.NOMINATIM_URL}/search", params=params)
            r.raise_for_status()
            res = parse_nominatim(r.json())
    except Exception:
        logger.warning("Nominatim search failed", exc_info=True)
        return []
    await redis.set(key, json.dumps(res), ex=86400)
    return res
