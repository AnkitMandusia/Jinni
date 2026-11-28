"""Ride pricing: fixed fare cards (default) + optional dynamic multiplier. Pure functions (unit-tested).

effective multiplier (dynamic mode only) =
    clamp( manual_multiplier x peak_window_multiplier x demand_multiplier , 1.0 , max_multiplier )
  * manual_multiplier  - admin's "special pricing" dial (rain, festival, …)
  * peak window        - time-of-day rules in IST, e.g. 08:00-10:00 x1.2
  * demand multiplier  - live: open requests per idle rider of that vehicle (auto_surge)
In "fixed" mode the multiplier is always 1.0, i.e. exactly the fare card.
"""
from datetime import datetime, time, timedelta, timezone
from decimal import ROUND_CEILING, Decimal
from typing import Any, Iterable, Optional

IST = timezone(timedelta(hours=5, minutes=30))  # India has no DST — a fixed offset is exact (and needs no tzdata)


def now_ist(now_utc: Optional[datetime] = None) -> datetime:
    base = now_utc or datetime.now(timezone.utc)
    if base.tzinfo is None:
        base = base.replace(tzinfo=timezone.utc)
    return base.astimezone(IST)


def _parse_hhmm(v: str) -> time:
    h, m = v.split(":")
    return time(int(h), int(m))


def validate_windows(windows: Iterable[dict]) -> list[dict]:
    """Normalise + validate admin-entered peak windows; raises ValueError with a readable message."""
    out = []
    for w in windows or []:
        try:
            start, end = _parse_hhmm(str(w["start"])), _parse_hhmm(str(w["end"]))
            mult = Decimal(str(w["multiplier"]))
        except Exception:
            raise ValueError("Each peak window needs start (HH:MM), end (HH:MM) and a multiplier")
        if start == end:
            raise ValueError("A peak window can't start and end at the same time")
        if not (Decimal("1") <= mult <= Decimal("3")):
            raise ValueError("Peak multiplier must be between 1.0 and 3.0")
        out.append({"label": str(w.get("label") or "Busy time")[:30], "start": start.strftime("%H:%M"),
                    "end": end.strftime("%H:%M"), "multiplier": float(mult)})
    return out


def peak_multiplier(windows: Iterable[dict], at: datetime) -> tuple[Decimal, Optional[str]]:
    """Highest multiplier among windows containing `at` (IST). Windows may wrap past midnight."""
    t = at.time()
    best, label = Decimal("1"), None
    for w in windows or []:
        s, e = _parse_hhmm(w["start"]), _parse_hhmm(w["end"])
        inside = (s <= t < e) if s < e else (t >= s or t < e)
        m = Decimal(str(w["multiplier"]))
        if inside and m > best:
            best, label = m, w.get("label") or "Busy time"
    return best, label


def demand_multiplier(open_requests: int, idle_riders: int, step: Decimal) -> Decimal:
    """+`step` for every open request beyond one per idle rider. With NO idle riders each request counts double."""
    if open_requests <= 0:
        return Decimal("1")
    shortfall = open_requests - idle_riders if idle_riders > 0 else open_requests * 2
    if shortfall <= 0:
        return Decimal("1")
    return Decimal("1") + Decimal(shortfall) * Decimal(step)


def effective_multiplier(settings: Any, *, now: datetime, open_requests: int, idle_riders: int) -> tuple[Decimal, Optional[str]]:
    """(multiplier, human reason). Reason is what the customer sees next to the info icon."""
    if getattr(settings, "pricing_mode", "fixed") != "dynamic":
        return Decimal("1.00"), None
    manual = Decimal(settings.manual_multiplier)
    peak, peak_label = peak_multiplier(settings.peak_windows or [], now)
    demand = (demand_multiplier(open_requests, idle_riders, Decimal(settings.auto_surge_step))
              if settings.auto_surge_enabled else Decimal("1"))
    m = manual * peak * demand
    m = max(Decimal("1"), min(m, Decimal(settings.max_multiplier))).quantize(Decimal("0.01"))
    if m <= Decimal("1"):
        return Decimal("1.00"), None
    # Largest contributor names the reason.
    top = max((manual, "Special pricing"), (peak, peak_label or "Busy time"), (demand, "High demand"), key=lambda x: x[0])
    return m, top[1]


def distance_fare(fare_card: Any, distance_km: Decimal) -> Decimal:
    raw = Decimal(fare_card.base_fare) + Decimal(fare_card.per_km) * Decimal(distance_km)
    return max(raw, Decimal(fare_card.min_fare))


def round_up_5(x: Decimal) -> Decimal:
    return (x / 5).to_integral_value(rounding=ROUND_CEILING) * 5


def quote_fare(fare_card: Any, distance_km: Decimal, multiplier: Decimal) -> Decimal:
    """Final fare: card fare x multiplier, rounded UP to the next ₹5 (easy cash change)."""
    return round_up_5(distance_fare(fare_card, distance_km) * Decimal(multiplier))
