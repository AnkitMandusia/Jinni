"""Ride booking API: customer endpoints under /rides, rider endpoints under /rides/rider.

Riders are existing delivery partners (role == "delivery"). Admin endpoints live in
app/admin/endpoints/rides.py.
"""
import hmac
import logging
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from redis.asyncio import Redis
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_active_user, get_redis
from app.modules.delivery.kyc import expiry_issues
from app.modules.notifications.service import send_push, send_push_multicast
from app.modules.rides import dues as dues_svc
from app.modules.rides import osm, service
from app.modules.rides.models import (
    Ride, RidePlace, RideRejection, RideSettings, RideSOS, RideStatus,
)
from app.modules.users.models import DeliveryAgentProfile, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/rides", tags=["rides"])

RATING_WINDOW = timedelta(days=7)

# ── schemas ──────────────────────────────────────────────────────────────────


class Point(BaseModel):
    text: str = Field(..., min_length=2, max_length=255)
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class EstimateRequest(BaseModel):
    pickup: Point
    drop: Point
    vehicle_class: str = Field("bike", pattern="^(bike|auto|cab)$")


class BookRequest(EstimateRequest):
    payment_method: str = Field(..., pattern="^(cash|upi)$")
    # The fare the customer saw. If the server's fare differs (rates/surge changed), we return 409
    # with the new fare instead of silently charging a different amount.
    expected_fare: Decimal = Field(..., ge=0)
    note: Optional[str] = Field(None, max_length=200)


class CancelRequest(BaseModel):
    reason_code: Optional[str] = Field(None, max_length=30)
    reason: Optional[str] = Field(None, max_length=200)


class BoostRequest(BaseModel):
    amount: int = Field(..., ge=1, le=500)


class RateRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = Field(None, max_length=300)


class SOSRequest(BaseModel):
    lat: Optional[float] = Field(None, ge=-90, le=90)
    lng: Optional[float] = Field(None, ge=-180, le=180)
    note: Optional[str] = Field(None, max_length=300)


class StartRequest(BaseModel):
    code: str = Field(..., pattern=r"^\d{4}$")


class LocationRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class ReleaseRequest(BaseModel):
    reason: Optional[str] = Field(None, max_length=200)


class CompleteRequest(BaseModel):
    # Cash: rider confirms they collected it. UPI: leave False; confirm later once the UPI lands.
    payment_received: bool = False
    payment_ref: Optional[str] = Field(None, max_length=100)


class ConfirmPaymentRequest(BaseModel):
    payment_ref: Optional[str] = Field(None, max_length=100)


# ── helpers ──────────────────────────────────────────────────────────────────

def _require_customer(user: User) -> None:
    if user.role != "customer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only customers can book rides")


async def _rider_ctx(db: AsyncSession, user: User) -> DeliveryAgentProfile:
    """Delivery partner who has NOT been switched off for rides by admin."""
    if user.role != "delivery":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only delivery partners can take rides")
    profile = (await db.execute(
        select(DeliveryAgentProfile).where(DeliveryAgentProfile.user_id == user.id))).scalar_one_or_none()
    if not profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Delivery partner profile not found. Contact admin.")
    if not profile.ride_enabled:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Rides are not enabled for your account. Contact admin.")
    return profile


def ride_block_reason(profile: DeliveryAgentProfile) -> Optional[str]:
    """Why this partner can't take rides right now (None = fine). Shown in the app instead of failing silently."""
    if not profile.documents_verified:
        return "Your documents are pending verification by Jinni. Visit the office with your licence, RC and insurance."
    if not profile.vehicle_class:
        return "Add your vehicle type in Profile to take rides."
    issues = expiry_issues(profile)
    if issues:
        return issues[0] + ". Update it in Profile."
    if not profile.take_rides:
        return "Rides are switched off in your Profile."
    return None


async def _load(db: AsyncSession, ride: Ride, settings: RideSettings, viewer: str) -> dict:
    customer = await db.get(User, ride.customer_id)
    rider = await db.get(User, ride.rider_id) if ride.rider_id else None
    profile = None
    if rider:
        profile = (await db.execute(
            select(DeliveryAgentProfile).where(DeliveryAgentProfile.user_id == rider.id))).scalar_one_or_none()
    return service.serialize_ride(ride, customer=customer, rider=rider, rider_profile=profile,
                                  settings=settings, viewer=viewer)


async def notify(db: AsyncSession, user_id: Optional[UUID], title: str, body: str, data: dict) -> None:
    """Best-effort push; a push failure must never fail the ride action."""
    if not user_id:
        return
    try:
        u = await db.get(User, user_id)
        if u and u.fcm_token:
            await send_push(fcm_token=u.fcm_token, title=title, body=body, data=data)
    except Exception:
        logger.exception("ride push failed user=%s", user_id)


async def emit(redis: Redis, ride: Ride, event: str = "ride.status_updated") -> None:
    try:
        from app.realtime.manager import emit_order_event_cluster_safe
        await emit_order_event_cluster_safe(
            redis, event, order_id=str(ride.id),
            customer_id=ride.customer_id, delivery_agent_id=ride.rider_id,
            data={"status": ride.status})
    except Exception:
        logger.exception("ride realtime emit failed ride=%s", ride.id)


async def _notify_riders_new_ride(db: AsyncSession, ride: Ride, title: str = "🧞 New ride request") -> None:
    try:
        rows = (await db.execute(
            select(User, DeliveryAgentProfile).join(DeliveryAgentProfile, DeliveryAgentProfile.user_id == User.id)
            .where(*service.eligible_rider_filters(ride.vehicle_class)))).all()
        rejected = set((await db.execute(select(RideRejection.rider_id).where(RideRejection.ride_id == ride.id))).scalars())
        tokens = []
        for u, _p in rows:
            if u.fcm_token and u.id not in rejected and not await service.rider_is_busy(db, u.id):
                tokens.append(u.fcm_token)
        if tokens:
            await send_push_multicast(
                fcm_tokens=tokens, title=title,
                body=f"{ride.pickup_text} → {ride.drop_text} · ₹{service.total_payable(ride):.0f}",
                data={"type": "ride_request", "ride_id": str(ride.id)})
    except Exception:
        logger.exception("ride broadcast push failed ride=%s", ride.id)


async def _notify_admins(db: AsyncSession, title: str, body: str, data: dict) -> None:
    try:
        tokens = [t for (t,) in (await db.execute(
            select(User.fcm_token).where(User.role == "admin", User.status == "active",
                                         User.fcm_token.isnot(None)))).all() if t]
        if tokens:
            await send_push_multicast(fcm_tokens=tokens, title=title, body=body, data=data)
    except Exception:
        logger.exception("admin push failed")


# ── customer ─────────────────────────────────────────────────────────────────

@router.get("/config")
async def ride_config(lat: Optional[float] = Query(None, ge=-90, le=90), lng: Optional[float] = Query(None, ge=-180, le=180),
                      user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    """Everything the booking screen needs in one call. If the phone's location is given, spots are
    returned nearest-first with distances (computed here, from our own table — no map API)."""
    s = await service.get_settings(db)
    fares = await service.get_fares(db)
    vehicles = []
    for vc, f in fares.items():
        mult, reason = await service.multiplier_now(db, s, vc)
        vehicles.append({"vehicle_class": vc, "label": f.label, "enabled": bool(f.is_enabled),
                         "riders_online": await service.online_rider_count(db, vc),
                         "min_fare": float(f.min_fare), "surge_multiplier": float(mult), "surge_reason": reason})
    places = (await db.execute(
        select(RidePlace).where(RidePlace.is_active == True)  # noqa: E712
        .order_by(RidePlace.display_order, RidePlace.score.desc(), RidePlace.name))).scalars().all()
    out_places = []
    for p in places:
        d = round(service.haversine_km(lat, lng, p.lat, p.lng), 2) if lat is not None and lng is not None else None
        out_places.append({"id": str(p.id), "name": p.name, "area": p.area, "icon": p.icon, "category": p.category,
                           "lat": p.lat, "lng": p.lng, "distance_km": d})
    if lat is not None and lng is not None:
        out_places.sort(key=lambda p: p["distance_km"])  # nearest first
    dues = await dues_svc.total_due(db, user.id) if user.role == "customer" else Decimal("0")
    await db.commit()
    return {
        "enabled": s.is_enabled,
        "vehicles": vehicles,
        "riders_online": sum(v["riders_online"] for v in vehicles if v["enabled"]),
        "payment_methods": ["cash", "upi"],
        "max_distance_km": float(s.max_distance_km),
        "boost_options": s.boost_options or [],
        "cancel_reasons": [{"code": r["code"], "label": r["label"], "rider_fault": r["rider_fault"]} for r in dues_svc.CANCEL_REASONS],
        "sos_helpline": s.sos_helpline,
        "dues_total": float(dues),
        "service_area": ({"lat": s.service_lat, "lng": s.service_lng, "radius_km": float(s.service_radius_km),
                          "inside": service.in_service_area(s, lat, lng) if lat is not None and lng is not None else None}
                         if s.service_lat is not None and s.service_radius_km else None),
        "places": out_places,
    }


async def _price(db: AsyncSession, s: RideSettings, body: EstimateRequest, customer_id=None) -> dict:
    if not s.is_enabled:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Jinni rides are paused right now. Please try later.")
    if not service.in_service_area(s, body.pickup.lat, body.pickup.lng):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Jinni Carpet isn't available at this pickup location yet. Choose a pickup inside our service area.")
    dist = service.trip_distance_km(s, body.pickup.lat, body.pickup.lng, body.drop.lat, body.drop.lng)
    if dist < service.MIN_TRIP_KM:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pickup and drop are too close — pick a different drop.")
    if dist > Decimal(s.max_distance_km):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Rides are limited to {s.max_distance_km:.0f} km in this city.")
    try:
        return await service.build_quote(db, s, body.vehicle_class, body.pickup.lat, body.pickup.lng,
                                         body.drop.lat, body.drop.lng, customer_id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))


def _quote_json(q: dict) -> dict:
    return {"vehicle_class": q["vehicle_class"], "distance_km": float(q["distance_km"]), "fare": float(q["fare"]),
            "surge_multiplier": float(q["surge_multiplier"]), "surge_reason": q["surge_reason"],
            "base_fare_no_surge": float(q["base_fare_no_surge"]), "dues_amount": float(q["dues_amount"]),
            "total_payable": float(q["total_payable"]), "currency": "INR"}


@router.get("/availability")
async def availability(lat: float = Query(..., ge=-90, le=90), lng: float = Query(..., ge=-180, le=180),
                       user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    """Which vehicle types have a rider *near this pickup* right now. The app fades out the ones that don't.
    Riders' positions are never returned — only whether someone is close enough."""
    s = await service.get_settings(db)
    fares = await service.get_fares(db)
    counts = await service.nearby_counts(db, s, lat, lng)
    await db.commit()
    return {"radius_km": float(s.nearby_radius_km), "required": bool(s.require_nearby_rider),
            "vehicles": [{"vehicle_class": vc, "available": counts.get(vc, 0) > 0 or not s.require_nearby_rider,
                          "nearby": counts.get(vc, 0), "enabled": bool(fares[vc].is_enabled)}
                         for vc in fares]}


@router.post("/estimate")
async def estimate(body: EstimateRequest, user: User = Depends(get_current_active_user),
                   db: AsyncSession = Depends(get_db)):
    _require_customer(user)
    s = await service.get_settings(db)
    q = await _price(db, s, body, user.id)
    await db.commit()
    return _quote_json(q)


@router.post("", status_code=status.HTTP_201_CREATED)
async def book_ride(body: BookRequest, user: User = Depends(get_current_active_user),
                    db: AsyncSession = Depends(get_db), redis: Redis = Depends(get_redis)):
    _require_customer(user)
    s = await service.get_settings(db)

    # One live ride per customer. Lock the user row so two taps can't both pass this check.
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    live = (await db.execute(select(Ride).where(
        Ride.customer_id == user.id, Ride.status.in_(RideStatus.ACTIVE)))).scalars().all()
    for r in live:
        await service.expire_if_stale(db, r, s)
    if any(r.status in RideStatus.ACTIVE for r in live):
        await db.commit()
        raise HTTPException(status.HTTP_409_CONFLICT, "You already have a ride in progress.")

    q = await _price(db, s, body, user.id)
    if s.require_nearby_rider:
        near = (await service.nearby_counts(db, s, body.pickup.lat, body.pickup.lng)).get(body.vehicle_class, 0)
        if near == 0:
            await db.commit()
            raise HTTPException(status.HTTP_409_CONFLICT, detail={
                "code": "no_rider_nearby",
                "message": f"No {body.vehicle_class} rider is available near your pickup right now. Try another vehicle or check again in a minute."})
    if abs(q["fare"] - body.expected_fare) > Decimal("0.5"):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            detail={"code": "fare_changed", "fare": float(q["fare"]),
                                    "message": f"The fare is now ₹{q['fare']:.0f}. Please confirm again."})

    ride = Ride(
        ride_number=service.new_ride_number(), customer_id=user.id, status=RideStatus.REQUESTED,
        vehicle_class=body.vehicle_class, start_code=service.new_start_code(),
        pickup_text=body.pickup.text.strip(), pickup_lat=body.pickup.lat, pickup_lng=body.pickup.lng,
        drop_text=body.drop.text.strip(), drop_lat=body.drop.lat, drop_lng=body.drop.lng,
        distance_km=q["distance_km"], fare=q["fare"], surge_multiplier=q["surge_multiplier"],
        payment_method=body.payment_method, note=body.note, requested_at=datetime.utcnow(),
    )
    db.add(ride)
    try:
        await db.flush()
    except IntegrityError:  # ride_number collision (4 random digits/day) — retry once
        await db.rollback()
        await db.execute(select(User.id).where(User.id == user.id).with_for_update())
        ride.ride_number = service.new_ride_number() + "X"
        db.add(ride)
        await db.flush()
    # Earlier cancellation fees ride along with this booking (released again if this ride fails).
    ride.dues_amount = await dues_svc.apply_to(db, user.id, f"ride:{ride.id}")
    await db.commit()
    await db.refresh(ride)
    await _notify_riders_new_ride(db, ride)
    return await _load(db, ride, s, "customer")


@router.get("/active")
async def active_ride(user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    _require_customer(user)
    s = await service.get_settings(db)
    ride = (await db.execute(select(Ride).where(
        Ride.customer_id == user.id, Ride.status.in_(RideStatus.ACTIVE))
        .order_by(Ride.requested_at.desc()).limit(1))).scalar_one_or_none()
    if ride and await service.expire_if_stale(db, ride, s):
        await db.commit()
        return {"ride": None}
    await db.commit()
    return {"ride": await _load(db, ride, s, "customer") if ride else None}


@router.get("/my")
async def my_rides(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=50),
                   user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    _require_customer(user)
    s = await service.get_settings(db)
    rows = (await db.execute(select(Ride).where(Ride.customer_id == user.id)
                             .order_by(Ride.requested_at.desc()).offset((page - 1) * page_size)
                             .limit(page_size))).scalars().all()
    for r in rows:
        await service.expire_if_stale(db, r, s)
    await db.commit()
    return {"rides": [await _load(db, r, s, "customer") for r in rows], "page": page}


@router.get("/dues")
async def my_dues(user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    """Outstanding ride-cancellation charges (shown in Profile and next to the total at checkout)."""
    rows = await dues_svc.outstanding(db, user.id)
    return {
        "total": float(sum((Decimal(r.cancellation_fee) for r in rows), Decimal("0"))),
        "items": [{"ride_id": str(r.id), "ride_number": r.ride_number, "fee": float(r.cancellation_fee),
                   "date": r.cancelled_at.isoformat() if r.cancelled_at else None,
                   "reason": "Cancelled after a rider was assigned",
                   "route": f"{r.pickup_text} → {r.drop_text}"} for r in rows],
        "info": "Cancelling a ride after a rider is on the way carries a small fee. "
                "It is added to your next ride or order, so you only pay it once.",
    }


@router.get("/places/search")
async def search_places(q: str = Query(..., min_length=3, max_length=80),
                        lat: Optional[float] = Query(None, ge=-90, le=90), lng: Optional[float] = Query(None, ge=-180, le=180),
                        user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db),
                        redis: Redis = Depends(get_redis)):
    """Free address search (OpenStreetMap Nominatim) — cached 24h, rate-limited, bounded to the service area.
    Returns [] on any failure; the app then falls back to the phone's own geocoder."""
    s = await service.get_settings(db)
    center = (s.service_lat, s.service_lng) if s.service_lat is not None and s.service_radius_km else (
        (lat, lng) if lat is not None and lng is not None else None)
    radius = float(s.service_radius_km) if s.service_lat is not None and s.service_radius_km else 30.0
    return {"results": await osm.nominatim_search(redis, q.strip(), center, radius if center else None)}


# ── rider (must be declared before "/{ride_id}") ─────────────────────────────

@router.get("/rider/available")
async def rider_available(user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    """Open ride requests this rider may accept. Empty (with a reason) when offline, busy, unverified or off."""
    profile = await _rider_ctx(db, user)
    s = await service.get_settings(db)
    block = ride_block_reason(profile)
    busy = await service.rider_is_busy(db, user.id)
    if block or not profile.is_available or not s.is_enabled or busy:
        await db.commit()
        return {"rides": [], "busy": busy, "blocked_reason": block, "online": bool(profile.is_available)}
    rejected = select(RideRejection.ride_id).where(RideRejection.rider_id == user.id)
    rows = (await db.execute(select(Ride).where(
        Ride.status == RideStatus.REQUESTED, Ride.vehicle_class == profile.vehicle_class, Ride.id.notin_(rejected))
        .order_by(Ride.requested_at.asc()).limit(10))).scalars().all()
    fresh = []
    for r in rows:
        if not await service.expire_if_stale(db, r, s):
            fresh.append(r)
    await db.commit()
    return {"rides": [await _load(db, r, s, "rider") for r in fresh], "busy": False, "blocked_reason": None, "online": True}


@router.get("/rider/active")
async def rider_active(user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    await _rider_ctx(db, user)
    s = await service.get_settings(db)
    ride = (await db.execute(select(Ride).where(
        Ride.rider_id == user.id, Ride.status.in_(RideStatus.RIDER_ACTIVE))
        .order_by(Ride.accepted_at.desc()).limit(1))).scalar_one_or_none()
    return {"ride": await _load(db, ride, s, "rider") if ride else None}


@router.get("/rider/history")
async def rider_history(page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=50),
                        user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    await _rider_ctx(db, user)
    s = await service.get_settings(db)
    rows = (await db.execute(select(Ride).where(
        Ride.rider_id == user.id, Ride.status.in_((RideStatus.COMPLETED, RideStatus.CANCELLED)))
        .order_by(Ride.requested_at.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()
    done = [r for r in rows if r.status == RideStatus.COMPLETED]
    pay = service.total_payable
    return {
        "rides": [await _load(db, r, s, "rider") for r in rows], "page": page,
        "page_totals": {"completed": len(done), "fare": float(sum(pay(r) for r in done)),
                        "cash": float(sum(pay(r) for r in done if r.payment_method == "cash" and r.payment_status == "paid")),
                        "upi": float(sum(pay(r) for r in done if r.payment_method == "upi" and r.payment_status == "paid")),
                        "unpaid": float(sum(pay(r) for r in done if r.payment_status != "paid"))},
    }


@router.post("/rider/location")
async def rider_location(body: LocationRequest, user: User = Depends(get_current_active_user),
                         db: AsyncSession = Depends(get_db)):
    """Rider phone GPS -> customer's distance/ETA. Stored ONLY while the rider is on a ride (privacy + cost)."""
    profile = await _rider_ctx(db, user)
    # Stored while on a ride (customer ETA) or while online (so nearby customers can see this vehicle type is
    # available). Never shared with customers as coordinates.
    if not (profile.is_available or await service.rider_has_active_ride(db, user.id)):
        return {"ok": False}
    profile.current_lat, profile.current_lng, profile.last_location_at = body.lat, body.lng, datetime.utcnow()
    await db.commit()
    return {"ok": True}


@router.post("/rider/{ride_id}/accept")
async def rider_accept(ride_id: UUID, user: User = Depends(get_current_active_user),
                       db: AsyncSession = Depends(get_db), redis: Redis = Depends(get_redis)):
    profile = await _rider_ctx(db, user)
    s = await service.get_settings(db)
    if not profile.is_available:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Go online to accept rides")
    block = ride_block_reason(profile)
    if block:
        raise HTTPException(status.HTTP_403_FORBIDDEN, block)
    if await service.rider_is_busy(db, user.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Finish your current job before taking a new ride")
    ride = await db.get(Ride, ride_id)
    if not ride:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride not found")
    if ride.vehicle_class != profile.vehicle_class:
        raise HTTPException(status.HTTP_403_FORBIDDEN, f"This is a {ride.vehicle_class} ride; your vehicle is a {profile.vehicle_class}.")
    if await service.expire_if_stale(db, ride, s):
        await db.commit()
        raise HTTPException(status.HTTP_409_CONFLICT, "This request has expired")
    # Atomic race-to-accept: only one rider's UPDATE can match status='requested'.
    res = await db.execute(update(Ride).where(Ride.id == ride_id, Ride.status == RideStatus.REQUESTED,
                                              Ride.rider_id.is_(None))
                           .values(status=RideStatus.ACCEPTED, rider_id=user.id, accepted_at=datetime.utcnow()))
    await db.commit()
    if res.rowcount != 1:
        raise HTTPException(status.HTTP_409_CONFLICT, "Another rider already took this ride")
    await db.refresh(ride)
    await notify(db, ride.customer_id, "Your Jinni carpet is on the way 🧞",
                 f"{profile.name} accepted your ride. Share your ride code only when you board.",
                 {"type": "ride_accepted", "ride_id": str(ride.id)})
    await emit(redis, ride)
    return await _load(db, ride, s, "rider")


@router.post("/rider/{ride_id}/reject")
async def rider_reject(ride_id: UUID, user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    """Hide this request from me; it stays open for other riders."""
    await _rider_ctx(db, user)
    if not await db.get(Ride, ride_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride not found")
    try:
        db.add(RideRejection(ride_id=ride_id, rider_id=user.id))
        await db.commit()
    except IntegrityError:
        await db.rollback()
    return {"ok": True}


@router.post("/rider/{ride_id}/release")
async def rider_release(ride_id: UUID, body: ReleaseRequest, user: User = Depends(get_current_active_user),
                        db: AsyncSession = Depends(get_db), redis: Redis = Depends(get_redis)):
    """Rider can't make it (breakdown etc.): hand the ride back to the pool before the customer boards.
    No fee for the customer (it isn't their doing)."""
    await _rider_ctx(db, user)
    ride = (await db.execute(select(Ride).where(Ride.id == ride_id).with_for_update())).scalar_one_or_none()
    if not ride or ride.rider_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride not found")
    if ride.status not in (RideStatus.ACCEPTED, RideStatus.ARRIVED):
        raise HTTPException(status.HTTP_409_CONFLICT, "You can only hand back a ride before the customer boards")
    db.add(RideRejection(ride_id=ride.id, rider_id=user.id))
    ride.rider_id = None
    ride.status = RideStatus.REQUESTED
    ride.accepted_at = ride.arrived_at = None
    ride.start_attempts = 0
    ride.assigned_by_admin = False
    ride.requested_at = datetime.utcnow()  # fresh timeout window for the next rider
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Ride already handed back")
    await notify(db, ride.customer_id, "Finding you another rider",
                 "Your rider couldn't make it. We're finding a new one.", {"type": "ride_released", "ride_id": str(ride.id)})
    await _notify_riders_new_ride(db, ride)
    await emit(redis, ride)
    return {"ok": True}


async def _rider_step(db: AsyncSession, user: User, ride_id: UUID, to: str, stamp: str) -> tuple[Ride, RideSettings]:
    await _rider_ctx(db, user)
    s = await service.get_settings(db)
    ride = (await db.execute(select(Ride).where(Ride.id == ride_id).with_for_update())).scalar_one_or_none()
    if not ride or ride.rider_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride not found")
    if to not in service.RIDER_TRANSITIONS.get(ride.status, ()):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Ride is {ride.status}; cannot move to {to}")
    ride.status = to
    setattr(ride, stamp, datetime.utcnow())
    return ride, s


@router.post("/rider/{ride_id}/arrived")
async def rider_arrived(ride_id: UUID, user: User = Depends(get_current_active_user),
                        db: AsyncSession = Depends(get_db), redis: Redis = Depends(get_redis)):
    ride, s = await _rider_step(db, user, ride_id, RideStatus.ARRIVED, "arrived_at")
    await db.commit()
    await notify(db, ride.customer_id, "Your rider has arrived 📍",
                 "Meet your rider at the pickup point. Tell them your ride code to start.",
                 {"type": "ride_arrived", "ride_id": str(ride.id)})
    await emit(redis, ride)
    return await _load(db, ride, s, "rider")


@router.post("/rider/{ride_id}/start")
async def rider_start(ride_id: UUID, body: StartRequest, user: User = Depends(get_current_active_user),
                      db: AsyncSession = Depends(get_db), redis: Redis = Depends(get_redis)):
    """Starts the ride ONLY with the customer's 4-digit code (proves the right person boarded)."""
    await _rider_ctx(db, user)
    s = await service.get_settings(db)
    ride = (await db.execute(select(Ride).where(Ride.id == ride_id).with_for_update())).scalar_one_or_none()
    if not ride or ride.rider_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride not found")
    if ride.status == RideStatus.IN_PROGRESS:
        return await _load(db, ride, s, "rider")  # idempotent (double tap)
    if RideStatus.IN_PROGRESS not in service.RIDER_TRANSITIONS.get(ride.status, ()):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Ride is {ride.status}; cannot start")
    if ride.start_attempts >= service.MAX_START_ATTEMPTS:
        raise HTTPException(status.HTTP_423_LOCKED, "Too many wrong codes. Ask the customer to check their code or contact Jinni support.")
    if not ride.start_code or not hmac.compare_digest(ride.start_code, body.code):
        ride.start_attempts += 1
        left = service.MAX_START_ATTEMPTS - ride.start_attempts
        await db.commit()  # persist the attempt even though we raise
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Wrong code. {left} attempt{'s' if left != 1 else ''} left.")
    ride.status = RideStatus.IN_PROGRESS
    ride.started_at = datetime.utcnow()
    await db.commit()
    await emit(redis, ride)
    return await _load(db, ride, s, "rider")


@router.post("/rider/{ride_id}/complete")
async def rider_complete(ride_id: UUID, body: CompleteRequest, user: User = Depends(get_current_active_user),
                         db: AsyncSession = Depends(get_db), redis: Redis = Depends(get_redis)):
    ride, s = await _rider_step(db, user, ride_id, RideStatus.COMPLETED, "completed_at")
    if body.payment_received:
        _mark_paid(ride, user.id, body.payment_ref)
    from app.modules.finance.service import snapshot_ride
    await snapshot_ride(db, ride)  # freeze commission / rider amount
    await db.commit()
    await notify(db, ride.customer_id, "Ride completed ✨",
                 f"Total ₹{service.total_payable(ride):.0f}" + (" — please pay by UPI." if ride.payment_method == "upi"
                                                              and ride.payment_status != "paid" else ". Please rate your rider!"),
                 {"type": "ride_completed", "ride_id": str(ride.id)})
    await emit(redis, ride)
    return await _load(db, ride, s, "rider")


def _mark_paid(ride: Ride, by: UUID, ref: Optional[str]) -> None:
    ride.payment_status = "paid"
    ride.paid_at = datetime.utcnow()
    ride.payment_confirmed_by = by
    if ref:
        ride.payment_ref = ref.strip()


@router.post("/rider/{ride_id}/confirm-payment")
async def rider_confirm_payment(ride_id: UUID, body: ConfirmPaymentRequest, user: User = Depends(get_current_active_user),
                                db: AsyncSession = Depends(get_db), redis: Redis = Depends(get_redis)):
    """Rider confirms money received (cash handed over, or UPI credited) after the ride."""
    await _rider_ctx(db, user)
    s = await service.get_settings(db)
    ride = (await db.execute(select(Ride).where(Ride.id == ride_id).with_for_update())).scalar_one_or_none()
    if not ride or ride.rider_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride not found")
    if ride.status != RideStatus.COMPLETED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Complete the ride first")
    if ride.payment_status != "paid":
        _mark_paid(ride, user.id, body.payment_ref)
        await db.commit()
        await emit(redis, ride)
    return await _load(db, ride, s, "rider")


# ── by id (after the fixed paths above) ──────────────────────────────────────

@router.get("/{ride_id}")
async def get_ride(ride_id: UUID, user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    s = await service.get_settings(db)
    ride = await db.get(Ride, ride_id)
    # 404 (not 403) for other people's rides so ids can't be probed. Riders may view their own.
    if not ride or user.id not in (ride.customer_id, ride.rider_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride not found")
    if await service.expire_if_stale(db, ride, s):
        await db.commit()
    return await _load(db, ride, s, "rider" if user.id == ride.rider_id else "customer")


@router.post("/{ride_id}/cancel")
async def cancel_ride(ride_id: UUID, body: CancelRequest, user: User = Depends(get_current_active_user),
                      db: AsyncSession = Depends(get_db), redis: Redis = Depends(get_redis)):
    """Customer cancels (until boarded). Free before a rider is assigned / within the grace period / when the
    reason is the rider's fault; otherwise a fee is recorded and carried to their next ride or order."""
    _require_customer(user)
    s = await service.get_settings(db)
    ride = (await db.execute(select(Ride).where(Ride.id == ride_id).with_for_update())).scalar_one_or_none()
    if not ride or ride.customer_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride not found")
    if ride.status in (RideStatus.CANCELLED, RideStatus.EXPIRED):
        return await _load(db, ride, s, "customer")  # idempotent
    if ride.status not in service.CUSTOMER_CANCELLABLE:
        raise HTTPException(status.HTTP_409_CONFLICT, "This ride can't be cancelled now")

    code = body.reason_code if body.reason_code in dues_svc.REASON_BY_CODE else "other"
    reason = dues_svc.REASON_BY_CODE[code]
    fee, _why = dues_svc.cancel_fee_now(ride, s)
    if fee > 0 and reason["rider_fault"]:
        fee = Decimal("0.00")
    rider_id = ride.rider_id
    ride.status = RideStatus.CANCELLED
    ride.cancelled_at = datetime.utcnow()
    ride.cancelled_by = user.id
    ride.cancel_reason_code = code
    ride.cancel_reason = (body.reason or "").strip() or reason["label"]
    ride.cancellation_fee = fee
    await dues_svc.release(db, f"ride:{ride.id}")  # fees this ride had absorbed become due again
    await db.commit()
    await notify(db, rider_id, "Ride cancelled", f"{ride.ride_number} was cancelled by the customer.",
                 {"type": "ride_cancelled", "ride_id": str(ride.id)})
    await emit(redis, ride)
    return await _load(db, ride, s, "customer")


@router.post("/{ride_id}/boost")
async def boost_fare(ride_id: UUID, body: BoostRequest, user: User = Depends(get_current_active_user),
                     db: AsyncSession = Depends(get_db), redis: Redis = Depends(get_redis)):
    """"No rider yet?" — customer adds a little extra to attract riders (Rapido/Uber 'add tip' idea).
    Options and the total cap are admin-set; the request is re-sent to riders and gets a fresh timeout."""
    _require_customer(user)
    s = await service.get_settings(db)
    ride = (await db.execute(select(Ride).where(Ride.id == ride_id).with_for_update())).scalar_one_or_none()
    if not ride or ride.customer_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride not found")
    if ride.status != RideStatus.REQUESTED:
        raise HTTPException(status.HTTP_409_CONFLICT, "You can add to the fare only while we're finding a rider")
    if body.amount not in (s.boost_options or []):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That amount isn't available")
    if Decimal(ride.boost_amount) + body.amount > Decimal(s.max_boost):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"You can add up to ₹{s.max_boost:.0f} in total")
    ride.fare = Decimal(ride.fare) + body.amount
    ride.boost_amount = Decimal(ride.boost_amount) + body.amount
    ride.requested_at = datetime.utcnow()
    await db.commit()
    await _notify_riders_new_ride(db, ride, title="💸 Fare increased — new ride")
    await emit(redis, ride)
    return await _load(db, ride, s, "customer")


@router.post("/{ride_id}/rate")
async def rate_ride(ride_id: UUID, body: RateRequest, user: User = Depends(get_current_active_user),
                    db: AsyncSession = Depends(get_db)):
    _require_customer(user)
    s = await service.get_settings(db)
    ride = (await db.execute(select(Ride).where(Ride.id == ride_id).with_for_update())).scalar_one_or_none()
    if not ride or ride.customer_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride not found")
    if ride.status != RideStatus.COMPLETED:
        raise HTTPException(status.HTTP_409_CONFLICT, "You can rate a ride after it's completed")
    if ride.rating is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "You've already rated this ride")
    if ride.completed_at and datetime.utcnow() - ride.completed_at > RATING_WINDOW:
        raise HTTPException(status.HTTP_409_CONFLICT, "The rating window for this ride has closed")
    ride.rating = body.rating
    ride.rating_comment = (body.comment or "").strip() or None
    ride.rated_at = datetime.utcnow()
    profile = (await db.execute(select(DeliveryAgentProfile).where(
        DeliveryAgentProfile.user_id == ride.rider_id).with_for_update())).scalar_one_or_none()
    if profile:  # running average over real ratings (the 4.8 default doesn't count as a rating)
        n = profile.rating_count or 0
        profile.rating = round((float(profile.rating or 0) * n + body.rating) / (n + 1), 2) if n else float(body.rating)
        profile.rating_count = n + 1
    await db.commit()
    return await _load(db, ride, s, "customer")


@router.post("/{ride_id}/sos")
async def raise_sos(ride_id: UUID, body: SOSRequest, user: User = Depends(get_current_active_user),
                    db: AsyncSession = Depends(get_db), redis: Redis = Depends(get_redis)):
    """Emergency button for the passenger OR the rider during a live ride. Alerts the Jinni admin desk right away
    (push + live console banner) with ride, vehicle, both phone numbers and the sender's location."""
    s = await service.get_settings(db)
    ride = await db.get(Ride, ride_id)
    if not ride or user.id not in (ride.customer_id, ride.rider_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride not found")
    recent_done = (ride.status == RideStatus.COMPLETED and ride.completed_at
                   and datetime.utcnow() - ride.completed_at < timedelta(minutes=15))
    if ride.status not in RideStatus.RIDER_ACTIVE and not recent_done:
        raise HTTPException(status.HTTP_409_CONFLICT, "SOS is available during a ride. In an emergency call 112.")
    role = "rider" if user.id == ride.rider_id else "customer"
    existing = (await db.execute(select(RideSOS).where(
        RideSOS.ride_id == ride.id, RideSOS.raised_by == user.id, RideSOS.status == "open"))).scalar_one_or_none()
    if not existing:
        db.add(RideSOS(ride_id=ride.id, raised_by=user.id, raised_by_role=role, lat=body.lat, lng=body.lng,
                       note=(body.note or "").strip() or None))
        await db.commit()
        who = "Passenger" if role == "customer" else "Rider"
        await _notify_admins(db, "🚨 SOS — ride emergency", f"{who} pressed SOS on {ride.ride_number}",
                             {"type": "ride_sos", "ride_id": str(ride.id)})
        await emit(redis, ride, event="ride.sos")
    return {"ok": True, "helpline": s.sos_helpline,
            "message": "Jinni support has been alerted. If you are in danger, call the emergency number now."}


# ── legacy import kept for admin module (see app/admin/endpoints/rides.py) ───
__all__ = ["router", "emit", "notify", "_load", "_mark_paid", "ride_block_reason"]
