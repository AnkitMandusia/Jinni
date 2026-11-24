"""Ride rules: fares/quotes, availability, serialization. Pure helpers are unit-tested."""
import math
import random
import secrets
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional
from urllib.parse import quote, urlencode

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.orders.models import Order
from app.modules.rides import dues as dues_svc
from app.modules.rides import pricing
from app.modules.rides.models import DEFAULT_FARES, VEHICLE_CLASSES, Ride, RideFare, RideSettings, RideStatus
from app.modules.users.models import DeliveryAgentProfile, User

EARTH_RADIUS_KM = 6371.0088
MIN_TRIP_KM = Decimal("0.20")  # pickup and drop must differ meaningfully
MAX_START_ATTEMPTS = 5
LOCATION_FRESH_SECONDS = 120   # rider GPS older than this isn't shown to the customer

# What a rider may do next. ACCEPTED -> IN_PROGRESS lets a rider skip tapping "arrived" (code still required).
RIDER_TRANSITIONS = {
    RideStatus.ACCEPTED: (RideStatus.ARRIVED, RideStatus.IN_PROGRESS),
    RideStatus.ARRIVED: (RideStatus.IN_PROGRESS,),
    RideStatus.IN_PROGRESS: (RideStatus.COMPLETED,),
}
# Customer may cancel until they're on board.
CUSTOMER_CANCELLABLE = (RideStatus.REQUESTED, RideStatus.ACCEPTED, RideStatus.ARRIVED)


def haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi, dlmb = p2 - p1, math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


def trip_distance_km(settings: RideSettings, plat: float, plng: float, dlat: float, dlng: float) -> Decimal:
    """Road distance estimate = straight line x road_factor (no routing API)."""
    d = Decimal(str(haversine_km(plat, plng, dlat, dlng))) * Decimal(settings.road_factor)
    return d.quantize(Decimal("0.01"))


def eta_minutes(settings: RideSettings, km: float) -> int:
    return max(1, math.ceil(km / max(int(settings.avg_speed_kmph), 5) * 60))


def new_ride_number() -> str:
    return f"RD{datetime.utcnow():%y%m%d}{random.randint(1000, 9999)}"


def new_start_code() -> str:
    return f"{secrets.randbelow(10000):04d}"


def in_service_area(settings: RideSettings, lat: float, lng: float) -> bool:
    if settings.service_lat is None or settings.service_lng is None or not settings.service_radius_km:
        return True
    return haversine_km(settings.service_lat, settings.service_lng, lat, lng) <= float(settings.service_radius_km)


def is_stale(ride: Ride, settings: RideSettings, now: Optional[datetime] = None) -> bool:
    now = now or datetime.utcnow()
    return (
        ride.status == RideStatus.REQUESTED
        and ride.requested_at is not None
        and now - ride.requested_at > timedelta(minutes=int(settings.request_timeout_minutes))
    )


async def get_settings(db: AsyncSession) -> RideSettings:
    s = await db.get(RideSettings, 1)
    if not s:
        s = RideSettings(id=1)
        db.add(s)
        await db.flush()
    return s


async def get_fares(db: AsyncSession) -> dict[str, RideFare]:
    rows = (await db.execute(select(RideFare))).scalars().all()
    have = {f.vehicle_class: f for f in rows}
    for vc in VEHICLE_CLASSES:  # self-heal if a row was deleted / DB freshly created without the seed
        if vc not in have:
            label, base, per_km, min_fare = DEFAULT_FARES[vc]
            f = RideFare(vehicle_class=vc, label=label, base_fare=base, per_km=per_km, min_fare=min_fare, is_enabled=True)
            db.add(f)
            have[vc] = f
    if len(have) != len(rows):
        await db.flush()
    return have


async def expire_if_stale(db: AsyncSession, ride: Ride, settings: RideSettings) -> bool:
    """Lazy expiry (no scheduler needed): an unaccepted request past its timeout is closed."""
    if is_stale(ride, settings):
        ride.status = RideStatus.EXPIRED
        ride.cancelled_at = datetime.utcnow()
        ride.cancel_reason = "No rider accepted in time"
        await dues_svc.release(db, f"ride:{ride.id}")  # dues folded into this ride become due again
        return True
    return False


def _busy_clauses(rider_col):
    """SQL: rider currently has an active ride or active delivery."""
    active_ride = exists().where(Ride.rider_id == rider_col, Ride.status.in_(RideStatus.RIDER_ACTIVE))
    active_delivery = exists().where(Order.delivery_agent_id == rider_col,
                                     Order.status.in_(("delivery_assigned", "picked_up", "in_transit")))
    return active_ride, active_delivery


async def rider_is_busy(db: AsyncSession, rider_id) -> bool:
    """One job at a time: an active ride OR an active food/grocery delivery."""
    a, d = _busy_clauses(rider_id)
    return bool((await db.execute(select(a | d))).scalar())


async def rider_has_active_ride(db: AsyncSession, rider_id) -> bool:
    return bool((await db.execute(select(exists().where(
        Ride.rider_id == rider_id, Ride.status.in_(RideStatus.RIDER_ACTIVE))))).scalar())


def eligible_rider_filters(vehicle_class: Optional[str] = None):
    """Riders who may be offered rides: active account, online, admin-enabled, own switch on, documents verified."""
    f = [User.role == "delivery", User.status == "active",
         DeliveryAgentProfile.is_available == True,  # noqa: E712
         DeliveryAgentProfile.ride_enabled == True,  # noqa: E712
         DeliveryAgentProfile.take_rides == True,    # noqa: E712
         DeliveryAgentProfile.documents_verified == True]  # noqa: E712
    if vehicle_class:
        f.append(DeliveryAgentProfile.vehicle_class == vehicle_class)
    return f


async def online_rider_count(db: AsyncSession, vehicle_class: Optional[str] = None, idle_only: bool = True) -> int:
    """How many carpets are awake (online, eligible and — by default — not already on a job)."""
    q = (select(func.count()).select_from(DeliveryAgentProfile)
         .join(User, User.id == DeliveryAgentProfile.user_id).where(*eligible_rider_filters(vehicle_class)))
    if idle_only:
        a, d = _busy_clauses(User.id)
        q = q.where(~a, ~d)
    return int((await db.execute(q)).scalar() or 0)


async def open_request_count(db: AsyncSession, vehicle_class: str, minutes: int = 10) -> int:
    since = datetime.utcnow() - timedelta(minutes=minutes)
    return int((await db.execute(select(func.count()).select_from(Ride).where(
        Ride.vehicle_class == vehicle_class, Ride.status == RideStatus.REQUESTED,
        Ride.requested_at >= since))).scalar() or 0)


async def multiplier_now(db: AsyncSession, settings: RideSettings, vehicle_class: str,
                         now_utc: Optional[datetime] = None) -> tuple[Decimal, Optional[str]]:
    if settings.pricing_mode != "dynamic":
        return Decimal("1.00"), None
    open_reqs = await open_request_count(db, vehicle_class) if settings.auto_surge_enabled else 0
    idle = await online_rider_count(db, vehicle_class) if settings.auto_surge_enabled else 0
    return pricing.effective_multiplier(settings, now=pricing.now_ist(now_utc), open_requests=open_reqs, idle_riders=idle)


async def build_quote(db: AsyncSession, settings: RideSettings, vehicle_class: str,
                      plat: float, plng: float, dlat: float, dlng: float, customer_id=None) -> dict:
    """Everything the app shows before booking. Server-side only — the client never sends a price."""
    fares = await get_fares(db)
    card = fares.get(vehicle_class)
    if not card or not card.is_enabled:
        raise ValueError("This vehicle type isn't available right now")
    dist = trip_distance_km(settings, plat, plng, dlat, dlng)
    mult, reason = await multiplier_now(db, settings, vehicle_class)
    fare = pricing.quote_fare(card, dist, mult)
    dues = await dues_svc.total_due(db, customer_id) if customer_id else Decimal("0.00")
    return {"vehicle_class": vehicle_class, "distance_km": dist, "fare": fare, "surge_multiplier": mult,
            "surge_reason": reason, "base_fare_no_surge": pricing.round_up_5(pricing.distance_fare(card, dist)),
            "dues_amount": dues, "total_payable": fare + dues}


# ── Navigation + payment links (built server-side so apps stay dumb) ────────

def maps_url(lat: float, lng: float, label: str = "") -> str:
    """Opens Google Maps navigation (app if installed, browser otherwise). Free, no API key."""
    return f"https://www.google.com/maps/dir/?api=1&destination={lat},{lng}&travelmode=driving"


def upi_link(vpa: str, amount: Decimal, ride_number: str) -> str:
    q = urlencode({"pa": vpa, "pn": "Jinni Ride", "am": f"{Decimal(amount):.2f}", "cu": "INR",
                   "tn": f"Jinni ride {ride_number}", "tr": ride_number}, quote_via=quote)
    return f"upi://pay?{q}"


def _name(u: Optional[User]) -> Optional[str]:
    return (u.name or "").strip() or None if u else None


def total_payable(ride: Ride) -> Decimal:
    return Decimal(ride.fare) + Decimal(ride.dues_amount or 0)


def rider_location_info(ride: Ride, profile: Optional[DeliveryAgentProfile], settings: Optional[RideSettings],
                        now: Optional[datetime] = None) -> Optional[dict]:
    """Free "live" tracking: rider phone GPS -> straight-line distance & ETA. No map tiles, no paid API."""
    if not profile or not settings or ride.status not in (RideStatus.ACCEPTED, RideStatus.ARRIVED, RideStatus.IN_PROGRESS):
        return None
    if profile.current_lat is None or profile.current_lng is None or not profile.last_location_at:
        return None
    now = now or datetime.utcnow()
    age = (now - profile.last_location_at).total_seconds()
    if age > LOCATION_FRESH_SECONDS:
        return None
    tlat, tlng = ((ride.drop_lat, ride.drop_lng) if ride.status == RideStatus.IN_PROGRESS
                  else (ride.pickup_lat, ride.pickup_lng))
    km = haversine_km(profile.current_lat, profile.current_lng, tlat, tlng) * float(settings.road_factor)
    out = {"to": "drop" if ride.status == RideStatus.IN_PROGRESS else "pickup", "distance_km": round(km, 2),
           "eta_min": eta_minutes(settings, km), "age_seconds": int(age)}
    if ride.status == RideStatus.IN_PROGRESS:
        total = max(float(ride.distance_km), 0.1)
        out["progress"] = round(max(0.0, min(1.0, 1 - km / total)), 3)
    return out


def serialize_ride(
    ride: Ride, *, customer: Optional[User] = None, rider: Optional[User] = None,
    rider_profile: Optional[DeliveryAgentProfile] = None, settings: Optional[RideSettings] = None,
    viewer: str = "customer", now: Optional[datetime] = None,
) -> dict:
    """viewer: customer | rider | admin. Phone numbers are only shared once a rider is assigned."""
    assigned = ride.status in (RideStatus.ACCEPTED, RideStatus.ARRIVED, RideStatus.IN_PROGRESS, RideStatus.COMPLETED)
    payable = total_payable(ride)
    out = {
        "id": str(ride.id), "ride_number": ride.ride_number, "status": ride.status,
        "vehicle_class": ride.vehicle_class,
        "pickup": {"text": ride.pickup_text, "lat": ride.pickup_lat, "lng": ride.pickup_lng,
                   "maps_url": maps_url(ride.pickup_lat, ride.pickup_lng)},
        "drop": {"text": ride.drop_text, "lat": ride.drop_lat, "lng": ride.drop_lng,
                 "maps_url": maps_url(ride.drop_lat, ride.drop_lng)},
        "distance_km": float(ride.distance_km), "fare": float(ride.fare),
        "surge_multiplier": float(ride.surge_multiplier or 1), "boost_amount": float(ride.boost_amount or 0),
        "dues_amount": float(ride.dues_amount or 0), "total_payable": float(payable),
        "fare_adjusted_reason": ride.fare_adjusted_reason, "note": ride.note,
        "payment_method": ride.payment_method, "payment_status": ride.payment_status,
        "payment_ref": ride.payment_ref,
        "paid_at": ride.paid_at.isoformat() if ride.paid_at else None,
        "assigned_by_admin": bool(ride.assigned_by_admin),
        "requested_at": ride.requested_at.isoformat() if ride.requested_at else None,
        "accepted_at": ride.accepted_at.isoformat() if ride.accepted_at else None,
        "started_at": ride.started_at.isoformat() if ride.started_at else None,
        "completed_at": ride.completed_at.isoformat() if ride.completed_at else None,
        "cancelled_at": ride.cancelled_at.isoformat() if ride.cancelled_at else None,
        "cancel_reason": ride.cancel_reason, "cancellation_fee": float(ride.cancellation_fee or 0),
        "fee_waived": bool(ride.fee_waived),
        "rating": ride.rating, "rating_comment": ride.rating_comment,
        "rider": None, "customer": None,
    }
    if rider and (assigned or viewer == "admin"):
        p = rider_profile
        out["rider"] = {"id": str(rider.id), "name": (p.name if p else None) or _name(rider), "phone": rider.phone,
                        "vehicle_type": p.vehicle_type if p else None, "vehicle_class": p.vehicle_class if p else None,
                        "vehicle_number": p.vehicle_number if p else None,
                        "vehicle_make_model": p.vehicle_make_model if p else None,
                        "vehicle_color": p.vehicle_color if p else None,
                        "rating": p.rating if p else None, "rating_count": p.rating_count if p else 0}
    if customer and (viewer == "admin" or (viewer == "rider" and assigned)):
        out["customer"] = {"id": str(customer.id), "name": _name(customer) or "Customer", "phone": customer.phone}
    elif customer and viewer == "rider":  # unassigned request: first name only
        out["customer"] = {"name": (_name(customer) or "Customer").split()[0], "phone": None}

    if viewer == "customer" and ride.status in (RideStatus.REQUESTED, RideStatus.ACCEPTED, RideStatus.ARRIVED):
        out["start_code"] = ride.start_code  # the customer reads this out to the rider
    if viewer == "customer" and settings:
        fee, why = dues_svc.cancel_fee_now(ride, settings, now)
        out["cancel_info"] = {"fee": float(fee), "note": why, "free": fee <= 0}
    if viewer in ("customer", "admin"):
        loc = rider_location_info(ride, rider_profile, settings, now)
        if loc:
            out["rider_location"] = loc

    # UPI: customer pays the rider (or the platform id if the rider has none) after the ride.
    if ride.payment_method == "upi" and ride.status == RideStatus.COMPLETED and ride.payment_status != "paid" and settings:
        vpa = (rider_profile.upi_id if rider_profile and rider_profile.upi_id else None) or settings.platform_upi_id
        if vpa:
            out["upi"] = {"vpa": vpa, "link": upi_link(vpa, payable, ride.ride_number)}
    return out
