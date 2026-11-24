"""Ride booking API: customer endpoints under /rides, rider endpoints under /rides/rider.

Riders are existing delivery partners (role == "delivery"). Admin endpoints live in
app/admin/endpoints/rides.py.
"""
import logging
from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, model_validator
from redis.asyncio import Redis
from sqlalchemy import and_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_active_user, get_redis
from app.modules.notifications.service import send_push, send_push_multicast
from app.modules.rides import service
from app.modules.rides.models import Ride, RidePlace, RideRejection, RideSettings, RideStatus
from app.modules.users.models import DeliveryAgentProfile, User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/rides", tags=["rides"])

# ── schemas ──────────────────────────────────────────────────────────────────


class Point(BaseModel):
    text: str = Field(..., min_length=2, max_length=255)
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class EstimateRequest(BaseModel):
    pickup: Point
    drop: Point


class BookRequest(EstimateRequest):
    payment_method: str = Field(..., pattern="^(cash|upi)$")
    # The fare the customer saw. If the server's fare differs (rates changed), we return 409
    # with the new fare instead of silently charging a different amount.
    expected_fare: Decimal = Field(..., ge=0)
    note: Optional[str] = Field(None, max_length=200)


class CancelRequest(BaseModel):
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
    if user.role != "delivery":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only delivery partners can take rides")
    profile = (await db.execute(
        select(DeliveryAgentProfile).where(DeliveryAgentProfile.user_id == user.id))).scalar_one_or_none()
    if not profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Delivery partner profile not found. Contact admin.")
    if not profile.ride_enabled:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Rides are not enabled for your account. Contact admin.")
    return profile


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


async def emit(redis: Redis, ride: Ride) -> None:
    try:
        from app.realtime.manager import emit_order_event_cluster_safe
        await emit_order_event_cluster_safe(
            redis, "ride.status_updated", order_id=str(ride.id),
            customer_id=ride.customer_id, delivery_agent_id=ride.rider_id,
            data={"status": ride.status})
    except Exception:
        logger.exception("ride realtime emit failed ride=%s", ride.id)


async def _notify_riders_new_ride(db: AsyncSession, ride: Ride) -> None:
    try:
        rows = (await db.execute(
            select(User, DeliveryAgentProfile).join(DeliveryAgentProfile, DeliveryAgentProfile.user_id == User.id)
            .where(User.role == "delivery", User.status == "active",
                   DeliveryAgentProfile.is_available == True,  # noqa: E712
                   DeliveryAgentProfile.ride_enabled == True)  # noqa: E712
        )).all()
        tokens = []
        for u, _p in rows:
            if u.fcm_token and not await service.rider_is_busy(db, u.id):
                tokens.append(u.fcm_token)
        if tokens:
            await send_push_multicast(
                fcm_tokens=tokens, title="🧞 New ride request",
                body=f"{ride.pickup_text} → {ride.drop_text} · ₹{ride.fare:.0f}",
                data={"type": "ride_request", "ride_id": str(ride.id)})
    except Exception:
        logger.exception("ride broadcast push failed ride=%s", ride.id)


# ── customer ─────────────────────────────────────────────────────────────────

@router.get("/config")
async def ride_config(user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    """Everything the booking screen needs in one call."""
    s = await service.get_settings(db)
    places = (await db.execute(
        select(RidePlace).where(RidePlace.is_active == True)  # noqa: E712
        .order_by(RidePlace.display_order, RidePlace.name))).scalars().all()
    online = await service.online_rider_count(db)
    await db.commit()
    return {
        "enabled": s.is_enabled,
        "riders_online": online,
        "payment_methods": ["cash", "upi"],
        "min_fare": float(s.min_fare),
        "max_distance_km": float(s.max_distance_km),
        "places": [{"id": str(p.id), "name": p.name, "area": p.area, "icon": p.icon, "lat": p.lat, "lng": p.lng}
                   for p in places],
    }


def _price(s: RideSettings, body: EstimateRequest) -> tuple[Decimal, Decimal]:
    if not s.is_enabled:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Jinni rides are paused right now. Please try later.")
    dist = service.trip_distance_km(s, body.pickup.lat, body.pickup.lng, body.drop.lat, body.drop.lng)
    if dist < service.MIN_TRIP_KM:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pickup and drop are too close — pick a different drop.")
    if dist > Decimal(s.max_distance_km):
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            f"Rides are limited to {s.max_distance_km:.0f} km in this city.")
    return dist, service.compute_fare(dist, s)


@router.post("/estimate")
async def estimate(body: EstimateRequest, user: User = Depends(get_current_active_user),
                   db: AsyncSession = Depends(get_db)):
    _require_customer(user)
    s = await service.get_settings(db)
    dist, fare = _price(s, body)
    await db.commit()
    return {"distance_km": float(dist), "fare": float(fare), "currency": "INR"}


@router.post("", status_code=status.HTTP_201_CREATED)
async def book_ride(body: BookRequest, user: User = Depends(get_current_active_user),
                    db: AsyncSession = Depends(get_db), redis: Redis = Depends(get_redis)):
    _require_customer(user)
    s = await service.get_settings(db)
    dist, fare = _price(s, body)
    if abs(fare - body.expected_fare) > Decimal("0.5"):
        raise HTTPException(status.HTTP_409_CONFLICT,
                            detail={"code": "fare_changed", "fare": float(fare),
                                    "message": f"The fare is now ₹{fare:.0f}. Please confirm again."})

    # One live ride per customer. Lock the user row so two taps can't both pass this check.
    await db.execute(select(User.id).where(User.id == user.id).with_for_update())
    live = (await db.execute(select(Ride).where(
        Ride.customer_id == user.id, Ride.status.in_(RideStatus.ACTIVE)))).scalars().all()
    for r in live:
        await service.expire_if_stale(db, r, s)
    if any(r.status in RideStatus.ACTIVE for r in live):
        await db.commit()
        raise HTTPException(status.HTTP_409_CONFLICT, "You already have a ride in progress.")

    ride = Ride(
        ride_number=service.new_ride_number(), customer_id=user.id, status=RideStatus.REQUESTED,
        pickup_text=body.pickup.text.strip(), pickup_lat=body.pickup.lat, pickup_lng=body.pickup.lng,
        drop_text=body.drop.text.strip(), drop_lat=body.drop.lat, drop_lng=body.drop.lng,
        distance_km=dist, fare=fare, payment_method=body.payment_method, note=body.note,
        requested_at=datetime.utcnow(),
    )
    db.add(ride)
    try:
        await db.commit()
    except IntegrityError:  # ride_number collision (4 random digits/day) — retry once
        await db.rollback()
        ride.ride_number = service.new_ride_number() + "X"
        db.add(ride)
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


# ── rider (must be declared before "/{ride_id}") ─────────────────────────────

@router.get("/rider/available")
async def rider_available(user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    """Open ride requests this rider may accept. Empty when offline, busy, or rides are off."""
    profile = await _rider_ctx(db, user)
    s = await service.get_settings(db)
    if not profile.is_available or not s.is_enabled or await service.rider_is_busy(db, user.id):
        await db.commit()
        return {"rides": [], "busy": await service.rider_is_busy(db, user.id)}
    rejected = select(RideRejection.ride_id).where(RideRejection.rider_id == user.id)
    rows = (await db.execute(select(Ride).where(
        Ride.status == RideStatus.REQUESTED, Ride.id.notin_(rejected))
        .order_by(Ride.requested_at.asc()).limit(10))).scalars().all()
    fresh = []
    for r in rows:
        if not await service.expire_if_stale(db, r, s):
            fresh.append(r)
    await db.commit()
    return {"rides": [await _load(db, r, s, "rider") for r in fresh], "busy": False}


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
    return {
        "rides": [await _load(db, r, s, "rider") for r in rows], "page": page,
        "page_totals": {"completed": len(done), "fare": float(sum(r.fare for r in done)),
                        "cash": float(sum(r.fare for r in done if r.payment_method == "cash" and r.payment_status == "paid")),
                        "upi": float(sum(r.fare for r in done if r.payment_method == "upi" and r.payment_status == "paid")),
                        "unpaid": float(sum(r.fare for r in done if r.payment_status != "paid"))},
    }


@router.post("/rider/{ride_id}/accept")
async def rider_accept(ride_id: UUID, user: User = Depends(get_current_active_user),
                       db: AsyncSession = Depends(get_db), redis: Redis = Depends(get_redis)):
    profile = await _rider_ctx(db, user)
    s = await service.get_settings(db)
    if not profile.is_available:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Go online to accept rides")
    if await service.rider_is_busy(db, user.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "Finish your current job before taking a new ride")
    ride = await db.get(Ride, ride_id)
    if not ride:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride not found")
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
                 f"{profile.name} accepted your ride.", {"type": "ride_accepted", "ride_id": str(ride.id)})
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
async def rider_release(ride_id: UUID, user: User = Depends(get_current_active_user),
                        db: AsyncSession = Depends(get_db), redis: Redis = Depends(get_redis)):
    """Rider can't make it (breakdown etc.): hand the ride back to the pool before the customer boards."""
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


async def _rider_step(db: AsyncSession, redis: Redis, user: User, ride_id: UUID, to: str,
                      stamp: str) -> tuple[Ride, RideSettings]:
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
    ride, s = await _rider_step(db, redis, user, ride_id, RideStatus.ARRIVED, "arrived_at")
    await db.commit()
    await notify(db, ride.customer_id, "Your rider has arrived 📍", "Meet your rider at the pickup point.",
                 {"type": "ride_arrived", "ride_id": str(ride.id)})
    await emit(redis, ride)
    return await _load(db, ride, s, "rider")


@router.post("/rider/{ride_id}/start")
async def rider_start(ride_id: UUID, user: User = Depends(get_current_active_user),
                      db: AsyncSession = Depends(get_db), redis: Redis = Depends(get_redis)):
    ride, s = await _rider_step(db, redis, user, ride_id, RideStatus.IN_PROGRESS, "started_at")
    await db.commit()
    await emit(redis, ride)
    return await _load(db, ride, s, "rider")


@router.post("/rider/{ride_id}/complete")
async def rider_complete(ride_id: UUID, body: CompleteRequest, user: User = Depends(get_current_active_user),
                         db: AsyncSession = Depends(get_db), redis: Redis = Depends(get_redis)):
    ride, s = await _rider_step(db, redis, user, ride_id, RideStatus.COMPLETED, "completed_at")
    if body.payment_received:
        _mark_paid(ride, user.id, body.payment_ref)
    await db.commit()
    await notify(db, ride.customer_id, "Ride completed ✨",
                 f"Fare ₹{ride.fare:.0f}" + (" — please pay by UPI." if ride.payment_method == "upi"
                                              and ride.payment_status != "paid" else ". Thank you!"),
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


# ── customer, by id (after the fixed paths above) ────────────────────────────

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
    _require_customer(user)
    s = await service.get_settings(db)
    ride = (await db.execute(select(Ride).where(Ride.id == ride_id).with_for_update())).scalar_one_or_none()
    if not ride or ride.customer_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride not found")
    if ride.status in (RideStatus.CANCELLED, RideStatus.EXPIRED):
        return await _load(db, ride, s, "customer")  # idempotent
    if ride.status not in service.CUSTOMER_CANCELLABLE:
        raise HTTPException(status.HTTP_409_CONFLICT, "This ride can't be cancelled now")
    rider_id = ride.rider_id
    ride.status = RideStatus.CANCELLED
    ride.cancelled_at = datetime.utcnow()
    ride.cancelled_by = user.id
    ride.cancel_reason = (body.reason or "").strip() or "Cancelled by customer"
    await db.commit()
    await notify(db, rider_id, "Ride cancelled", f"{ride.ride_number} was cancelled by the customer.",
                 {"type": "ride_cancelled", "ride_id": str(ride.id)})
    await emit(redis, ride)
    return await _load(db, ride, s, "customer")
