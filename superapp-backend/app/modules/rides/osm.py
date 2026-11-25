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


def pick_diverse(ranked: list[dict], limit: int, per_category: int = 4) -> list[dict]:
    """Best-first, but at most `per_category` of each kind so the list isn't 10 railway halts and 12 hospitals."""
    counts: dict[str, int] = {}
    out = []
    for c in ranked:
        if counts.get(c["category"], 0) >= per_category:
            continue
        counts[c["category"]] = counts.get(c["category"], 0) + 1
        out.append(c)
        if len(out) >= limit:
            break
    return out


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
    return pick_diverse(sorted(best.values(), key=lambda c: -c["score"]), limit)


FALLBACK_OVERPASS = ["https://overpass.kumi.systems/api/interpreter", "https://overpass.private.coffee/api/interpreter"]

# Plain-language terms for the Nominatim fallback: (search text, category, weight)
NOMINATIM_TERMS = [("airport", "airport", 100), ("railway station", "railway", 95), ("bus stand", "bus_stand", 90),
                   ("hospital", "hospital", 80), ("mall", "mall", 72), ("tourist attraction", "attraction", 68),
                   ("fort", "heritage", 66), ("college", "college", 62), ("market", "market", 58), ("stadium", "stadium", 52)]


# What Nominatim must say the result IS (category, {types}) for each of our categories — drops look-alike noise
# such as a suburb called "Kanakpura" when searching "railway station".
EXPECTED = {
    "airport": ("aeroway", {"aerodrome", "terminal"}), "railway": ("railway", {"station"}),
    "bus_stand": ("amenity", {"bus_station"}), "hospital": ("amenity", {"hospital"}), "mall": ("shop", {"mall"}),
    "attraction": ("tourism", {"attraction", "museum", "viewpoint"}), "heritage": ("historic", {"fort", "palace", "monument", "castle"}),
    "college": ("amenity", {"college", "university"}), "market": ("amenity", {"marketplace"}), "stadium": ("leisure", {"stadium"}),
}
_GENERIC = {"airport", "hospital", "railway station", "bus stand", "mall", "market", "fort", "college", "stadium"}


def _matches(cat: str, r: dict) -> bool:
    want = EXPECTED.get(cat)
    return not want or (r.get("category") == want[0] and r.get("type") in want[1])


def parse_nominatim_places(rows_by_term: list[tuple[str, int, list[dict]]], center: tuple[float, float], limit: int) -> list[dict]:
    """Nominatim results (per category term) -> ranked, de-duplicated candidates. Nominatim's own `importance`
    (0..1, derived from Wikipedia links) is used as the fame signal."""
    best: dict[str, dict] = {}
    for cat, weight, rows in rows_by_term:
        for r in rows:
            try:
                lat, lng = float(r["lat"]), float(r["lon"])
            except (KeyError, ValueError):
                continue
            name = (r.get("name") or (r.get("display_name") or "").split(",")[0]).strip()
            if not name or name.lower() in _GENERIC or not _matches(cat, r):
                continue
            from app.modules.rides.service import haversine_km
            score = weight + float(r.get("importance") or 0) * 30 - min(haversine_km(center[0], center[1], lat, lng), 30) * 0.5
            cand = {"name": name[:80], "area": None, "icon": ICONS.get(cat), "lat": lat, "lng": lng, "category": cat,
                    "osm_id": f"{(r.get('osm_type') or 'n')[0]}{r.get('osm_id')}", "score": round(score, 2)}
            key = _norm(name)
            if key not in best or cand["score"] > best[key]["score"]:
                best[key] = cand
    return pick_diverse(sorted(best.values(), key=lambda c: -c["score"]), limit)


async def _fetch_via_nominatim(lat: float, lng: float, radius_km: float, limit: int) -> list[dict]:
    import asyncio
    out = []
    async with httpx.AsyncClient(timeout=30, headers={"User-Agent": settings.OSM_USER_AGENT}) as c:
        for term, cat, weight in NOMINATIM_TERMS:
            try:
                r = await c.get(f"{settings.NOMINATIM_URL}/search", params={
                    "q": term, "format": "jsonv2", "limit": 10, "countrycodes": "in", "bounded": 1,
                    "viewbox": viewbox(lat, lng, radius_km)})
                r.raise_for_status()
                out.append((cat, weight, r.json()))
            except Exception as e:  # noqa: BLE001 - one slow category must not sink the whole import
                logger.warning("Nominatim term %r failed: %s", term, e or e.__class__.__name__)
            await asyncio.sleep(1.1)   # public-instance etiquette: 1 request/second
    return parse_nominatim_places(out, (lat, lng), limit)


async def fetch_candidates(lat: float, lng: float, radius_km: float, limit: int = 30) -> list[dict]:
    """Overpass first (richest, one request). Public Overpass servers are free but sometimes busy, so on failure
    we fall back to category searches through Nominatim — also free, slower (≈12 s), still no key."""
    q = build_query(lat, lng, int(radius_km * 1000))
    async with httpx.AsyncClient(timeout=40, headers={"User-Agent": settings.OSM_USER_AGENT}) as c:
        for url in [settings.OVERPASS_URL, *[u for u in FALLBACK_OVERPASS if u != settings.OVERPASS_URL]]:
            try:
                r = await c.post(url, data={"data": q})
                r.raise_for_status()
                found = parse_elements(r.json().get("elements", []), (lat, lng), limit)
                if found:
                    return found
            except Exception as e:  # noqa: BLE001 - try the next source
                logger.warning("Overpass %s failed: %s", url, e or e.__class__.__name__)
    return await _fetch_via_nominatim(lat, lng, radius_km, limit)


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
