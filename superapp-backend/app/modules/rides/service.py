"""Ride rules: fare, distance, availability, serialization. Pure helpers are unit-tested."""
import math
import random
from datetime import datetime, timedelta
from decimal import ROUND_CEILING, Decimal
from typing import Optional
from urllib.parse import quote, urlencode

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.orders.models import Order
from app.modules.rides.models import Ride, RideSettings, RideStatus
from app.modules.users.models import DeliveryAgentProfile, User

EARTH_RADIUS_KM = 6371.0088
MIN_TRIP_KM = Decimal("0.20")  # pickup and drop must differ meaningfully

# What a rider may do next. ACCEPTED -> IN_PROGRESS lets a rider skip tapping "arrived".
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


def compute_fare(distance_km: Decimal, settings: RideSettings) -> Decimal:
    """base + per_km x distance, at least min_fare, rounded UP to the next ₹5 (easy cash change)."""
    raw = Decimal(settings.base_fare) + Decimal(settings.per_km) * Decimal(distance_km)
    raw = max(raw, Decimal(settings.min_fare))
    return (raw / 5).to_integral_value(rounding=ROUND_CEILING) * 5


def new_ride_number() -> str:
    return f"RD{datetime.utcnow():%y%m%d}{random.randint(1000, 9999)}"


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


async def expire_if_stale(db: AsyncSession, ride: Ride, settings: RideSettings) -> bool:
    """Lazy expiry (no scheduler needed): an unaccepted request past its timeout is closed."""
    if is_stale(ride, settings):
        ride.status = RideStatus.EXPIRED
        ride.cancelled_at = datetime.utcnow()
        ride.cancel_reason = "No rider accepted in time"
        return True
    return False


async def rider_is_busy(db: AsyncSession, rider_id) -> bool:
    """One job at a time: an active ride OR an active food/grocery delivery."""
    ride = (await db.execute(
        select(func.count()).select_from(Ride).where(
            Ride.rider_id == rider_id, Ride.status.in_(RideStatus.RIDER_ACTIVE))
    )).scalar() or 0
    if ride:
        return True
    delivery = (await db.execute(
        select(func.count()).select_from(Order).where(
            Order.delivery_agent_id == rider_id,
            Order.status.in_(("delivery_assigned", "picked_up", "in_transit")))
    )).scalar() or 0
    return bool(delivery)


async def rider_has_active_ride(db: AsyncSession, rider_id) -> bool:
    return bool((await db.execute(
        select(func.count()).select_from(Ride).where(
            Ride.rider_id == rider_id, Ride.status.in_(RideStatus.RIDER_ACTIVE))
    )).scalar())


async def online_rider_count(db: AsyncSession) -> int:
    return int((await db.execute(
        select(func.count()).select_from(DeliveryAgentProfile)
        .join(User, User.id == DeliveryAgentProfile.user_id)
        .where(User.role == "delivery", User.status == "active",
               DeliveryAgentProfile.is_available == True,  # noqa: E712
               DeliveryAgentProfile.ride_enabled == True)  # noqa: E712
    )).scalar() or 0)


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


def serialize_ride(
    ride: Ride, *, customer: Optional[User] = None, rider: Optional[User] = None,
    rider_profile: Optional[DeliveryAgentProfile] = None, settings: Optional[RideSettings] = None,
    viewer: str = "customer",
) -> dict:
    """viewer: customer | rider | admin. Phone numbers are only shared once a rider is assigned."""
    assigned = ride.status in (RideStatus.ACCEPTED, RideStatus.ARRIVED, RideStatus.IN_PROGRESS, RideStatus.COMPLETED)
    out = {
        "id": str(ride.id), "ride_number": ride.ride_number, "status": ride.status,
        "pickup": {"text": ride.pickup_text, "lat": ride.pickup_lat, "lng": ride.pickup_lng,
                   "maps_url": maps_url(ride.pickup_lat, ride.pickup_lng)},
        "drop": {"text": ride.drop_text, "lat": ride.drop_lat, "lng": ride.drop_lng,
                 "maps_url": maps_url(ride.drop_lat, ride.drop_lng)},
        "distance_km": float(ride.distance_km), "fare": float(ride.fare),
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
        "cancel_reason": ride.cancel_reason,
        "rider": None, "customer": None,
    }
    if rider and (assigned or viewer == "admin"):
        out["rider"] = {"id": str(rider.id), "name": (rider_profile.name if rider_profile else None) or _name(rider),
                        "phone": rider.phone, "vehicle_type": rider_profile.vehicle_type if rider_profile else None,
                        "rating": rider_profile.rating if rider_profile else None}
    if customer and (viewer == "admin" or (viewer == "rider" and assigned)):
        out["customer"] = {"id": str(customer.id), "name": _name(customer) or "Customer", "phone": customer.phone}
    elif customer and viewer == "rider":  # unassigned request: first name only
        out["customer"] = {"name": (_name(customer) or "Customer").split()[0], "phone": None}

    # UPI: customer pays the rider (or the platform id if the rider has none) after the ride.
    if ride.payment_method == "upi" and ride.status == RideStatus.COMPLETED and ride.payment_status != "paid" and settings:
        vpa = (rider_profile.upi_id if rider_profile and rider_profile.upi_id else None) or settings.platform_upi_id
        if vpa:
            out["upi"] = {"vpa": vpa, "link": upi_link(vpa, ride.fare, ride.ride_number)}
    return out
