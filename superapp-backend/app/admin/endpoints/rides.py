"""Admin: ride management (bookings, manual assignment, fares, places, ride partners, payments)."""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_redis, require_role
from app.modules.rides import service
from app.modules.rides.models import Ride, RidePlace, RideSettings, RideStatus
from app.modules.rides.router import _load, _mark_paid, emit, notify
from app.modules.users.models import DeliveryAgentProfile, User

router = APIRouter(prefix="/rides", tags=["admin-rides"])
Admin = Depends(require_role("admin"))


# ── bookings ─────────────────────────────────────────────────────────────────

@router.get("/summary")
async def summary(db: AsyncSession = Depends(get_db), admin: User = Admin):
    today = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    by_status = dict((await db.execute(select(Ride.status, func.count()).where(Ride.requested_at >= today)
                                       .group_by(Ride.status))).all())
    money = (await db.execute(
        select(Ride.payment_method, Ride.payment_status, func.coalesce(func.sum(Ride.fare), 0), func.count())
        .where(Ride.status == RideStatus.COMPLETED, Ride.completed_at >= today)
        .group_by(Ride.payment_method, Ride.payment_status))).all()
    return {
        "today_by_status": by_status,
        "today_payments": [{"method": m, "payment_status": ps, "amount": float(a), "count": c} for m, ps, a, c in money],
        "riders_online": await service.online_rider_count(db),
        "open_requests": int((await db.execute(select(func.count()).select_from(Ride)
                                               .where(Ride.status == RideStatus.REQUESTED))).scalar() or 0),
    }


@router.get("")
async def list_rides(status_: Optional[str] = Query(None, alias="status"),
                     payment_status: Optional[str] = None, payment_method: Optional[str] = None,
                     page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
                     db: AsyncSession = Depends(get_db), admin: User = Admin):
    s = await service.get_settings(db)
    q = select(Ride)
    if status_:
        q = q.where(Ride.status == status_)
    if payment_status:
        q = q.where(Ride.payment_status == payment_status)
    if payment_method:
        q = q.where(Ride.payment_method == payment_method)
    total = int((await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0)
    rows = (await db.execute(q.order_by(Ride.requested_at.desc()).offset((page - 1) * page_size)
                             .limit(page_size))).scalars().all()
    for r in rows:
        await service.expire_if_stale(db, r, s)
    await db.commit()
    return {"rides": [await _load(db, r, s, "admin") for r in rows], "total": total, "page": page}


class AssignBody(BaseModel):
    rider_id: UUID


@router.post("/{ride_id}/assign")
async def assign(ride_id: UUID, body: AssignBody, db: AsyncSession = Depends(get_db),
                 redis: Redis = Depends(get_redis), admin: User = Admin):
    """Manually assign (or reassign, before the customer boards) a ride to a ride-enabled partner."""
    s = await service.get_settings(db)
    ride = (await db.execute(select(Ride).where(Ride.id == ride_id).with_for_update())).scalar_one_or_none()
    if not ride:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride not found")
    if ride.status not in (RideStatus.REQUESTED, RideStatus.ACCEPTED, RideStatus.ARRIVED):
        raise HTTPException(status.HTTP_409_CONFLICT, f"A {ride.status} ride can't be assigned")
    rider = await db.get(User, body.rider_id)
    profile = (await db.execute(select(DeliveryAgentProfile).where(
        DeliveryAgentProfile.user_id == body.rider_id))).scalar_one_or_none()
    if not rider or rider.role != "delivery" or rider.status != "active" or not profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pick an active delivery partner")
    if not profile.ride_enabled:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Rides are disabled for this partner")
    if ride.rider_id != rider.id and await service.rider_is_busy(db, rider.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "This partner is busy with another job")
    prev = ride.rider_id
    ride.rider_id = rider.id
    ride.status = RideStatus.ACCEPTED
    ride.accepted_at = datetime.utcnow()
    ride.arrived_at = None
    ride.assigned_by_admin = True
    await db.commit()
    await notify(db, rider.id, "🧞 Ride assigned to you", f"{ride.pickup_text} → {ride.drop_text}",
                 {"type": "ride_assigned", "ride_id": str(ride.id)})
    if prev and prev != rider.id:
        await notify(db, prev, "Ride reassigned", f"{ride.ride_number} was given to another partner.",
                     {"type": "ride_reassigned", "ride_id": str(ride.id)})
    await notify(db, ride.customer_id, "Your Jinni carpet is on the way 🧞",
                 f"{profile.name} will pick you up.", {"type": "ride_accepted", "ride_id": str(ride.id)})
    await emit(redis, ride)
    return await _load(db, ride, s, "admin")


class AdminCancelBody(BaseModel):
    reason: str = Field(..., min_length=3, max_length=200)


@router.post("/{ride_id}/cancel")
async def admin_cancel(ride_id: UUID, body: AdminCancelBody, db: AsyncSession = Depends(get_db),
                       redis: Redis = Depends(get_redis), admin: User = Admin):
    s = await service.get_settings(db)
    ride = (await db.execute(select(Ride).where(Ride.id == ride_id).with_for_update())).scalar_one_or_none()
    if not ride:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride not found")
    if ride.status in RideStatus.CLOSED:
        raise HTTPException(status.HTTP_409_CONFLICT, f"Ride is already {ride.status}")
    rider_id = ride.rider_id
    ride.status = RideStatus.CANCELLED
    ride.cancelled_at = datetime.utcnow()
    ride.cancelled_by = admin.id
    ride.cancel_reason = body.reason.strip()
    await db.commit()
    await notify(db, ride.customer_id, "Ride cancelled", body.reason, {"type": "ride_cancelled", "ride_id": str(ride.id)})
    await notify(db, rider_id, "Ride cancelled", f"{ride.ride_number}: {body.reason}",
                 {"type": "ride_cancelled", "ride_id": str(ride.id)})
    await emit(redis, ride)
    return await _load(db, ride, s, "admin")


class FareBody(BaseModel):
    fare: Decimal = Field(..., gt=0, le=Decimal("5000"))
    reason: str = Field(..., min_length=3, max_length=200)


@router.patch("/{ride_id}/fare")
async def adjust_fare(ride_id: UUID, body: FareBody, db: AsyncSession = Depends(get_db), admin: User = Admin):
    """Per-ride correction (long wait, detour). Not allowed once the payment is settled."""
    s = await service.get_settings(db)
    ride = (await db.execute(select(Ride).where(Ride.id == ride_id).with_for_update())).scalar_one_or_none()
    if not ride:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride not found")
    if ride.payment_status == "paid" or ride.status in (RideStatus.CANCELLED, RideStatus.EXPIRED):
        raise HTTPException(status.HTTP_409_CONFLICT, "Fare can't be changed for this ride")
    ride.fare = body.fare.quantize(Decimal("0.01"))
    ride.fare_adjusted_reason = body.reason.strip()
    await db.commit()
    return await _load(db, ride, s, "admin")


class MarkPaidBody(BaseModel):
    reference: Optional[str] = Field(None, max_length=100)


@router.post("/{ride_id}/mark-paid")
async def mark_paid(ride_id: UUID, body: MarkPaidBody, db: AsyncSession = Depends(get_db), admin: User = Admin):
    s = await service.get_settings(db)
    ride = (await db.execute(select(Ride).where(Ride.id == ride_id).with_for_update())).scalar_one_or_none()
    if not ride:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Ride not found")
    if ride.status != RideStatus.COMPLETED:
        raise HTTPException(status.HTTP_409_CONFLICT, "Only completed rides can be marked paid")
    if ride.payment_status != "paid":
        _mark_paid(ride, admin.id, body.reference)
        await db.commit()
    return await _load(db, ride, s, "admin")


# ── fare settings ────────────────────────────────────────────────────────────

class SettingsBody(BaseModel):
    is_enabled: bool
    base_fare: Decimal = Field(..., ge=0, le=500)
    per_km: Decimal = Field(..., ge=0, le=200)
    min_fare: Decimal = Field(..., ge=0, le=1000)
    road_factor: Decimal = Field(..., ge=1, le=3)
    max_distance_km: Decimal = Field(..., gt=0, le=200)
    request_timeout_minutes: int = Field(..., ge=1, le=60)
    platform_upi_id: Optional[str] = Field(None, max_length=100, pattern=r"^[\w.\-]{2,}@[\w.\-]{2,}$")


def _settings_out(s: RideSettings) -> dict:
    return {"is_enabled": s.is_enabled, "base_fare": float(s.base_fare), "per_km": float(s.per_km),
            "min_fare": float(s.min_fare), "road_factor": float(s.road_factor),
            "max_distance_km": float(s.max_distance_km), "request_timeout_minutes": s.request_timeout_minutes,
            "platform_upi_id": s.platform_upi_id}


@router.get("/settings")
async def get_settings_(db: AsyncSession = Depends(get_db), admin: User = Admin):
    s = await service.get_settings(db)
    await db.commit()
    return _settings_out(s)


@router.put("/settings")
async def put_settings(body: SettingsBody, db: AsyncSession = Depends(get_db), admin: User = Admin):
    s = await service.get_settings(db)
    for k, v in body.model_dump().items():
        setattr(s, k, (v.strip() or None) if isinstance(v, str) else v)
    await db.commit()
    return _settings_out(s)


# ── places ("Jinni Spots") ───────────────────────────────────────────────────

class PlaceBody(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    area: Optional[str] = Field(None, max_length=80)
    icon: Optional[str] = Field(None, max_length=8)
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    display_order: int = Field(0, ge=0, le=999)
    is_active: bool = True


def _place_out(p: RidePlace) -> dict:
    return {"id": str(p.id), "name": p.name, "area": p.area, "icon": p.icon, "lat": p.lat, "lng": p.lng,
            "display_order": p.display_order, "is_active": p.is_active}


@router.get("/places")
async def list_places(db: AsyncSession = Depends(get_db), admin: User = Admin):
    rows = (await db.execute(select(RidePlace).order_by(RidePlace.display_order, RidePlace.name))).scalars().all()
    return [_place_out(p) for p in rows]


@router.post("/places", status_code=201)
async def create_place(body: PlaceBody, db: AsyncSession = Depends(get_db), admin: User = Admin):
    p = RidePlace(**body.model_dump())
    db.add(p)
    await db.commit()
    return _place_out(p)


@router.put("/places/{place_id}")
async def update_place(place_id: UUID, body: PlaceBody, db: AsyncSession = Depends(get_db), admin: User = Admin):
    p = await db.get(RidePlace, place_id)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Place not found")
    for k, v in body.model_dump().items():
        setattr(p, k, v)
    await db.commit()
    return _place_out(p)


@router.delete("/places/{place_id}", status_code=204)
async def delete_place(place_id: UUID, db: AsyncSession = Depends(get_db), admin: User = Admin):
    p = await db.get(RidePlace, place_id)
    if p:
        await db.delete(p)
        await db.commit()


# ── ride partners (= delivery partners with the ride switch) ─────────────────

@router.get("/partners")
async def partners(db: AsyncSession = Depends(get_db), admin: User = Admin):
    rows = (await db.execute(
        select(User, DeliveryAgentProfile).join(DeliveryAgentProfile, DeliveryAgentProfile.user_id == User.id)
        .where(User.role == "delivery").order_by(DeliveryAgentProfile.name))).all()
    out = []
    for u, p in rows:
        done = int((await db.execute(select(func.count()).select_from(Ride).where(
            Ride.rider_id == u.id, Ride.status == RideStatus.COMPLETED))).scalar() or 0)
        on_ride = await service.rider_has_active_ride(db, u.id)
        busy = await service.rider_is_busy(db, u.id)
        out.append({"id": str(u.id), "name": p.name, "phone": u.phone, "account_status": u.status,
                    "online": bool(p.is_available), "ride_enabled": bool(p.ride_enabled), "upi_id": p.upi_id,
                    "state": "on_ride" if on_ride else "on_delivery" if busy else "idle",
                    "completed_rides": done})
    return out


class PartnerBody(BaseModel):
    ride_enabled: bool


@router.patch("/partners/{user_id}")
async def set_partner(user_id: UUID, body: PartnerBody, db: AsyncSession = Depends(get_db), admin: User = Admin):
    p = (await db.execute(select(DeliveryAgentProfile).where(DeliveryAgentProfile.user_id == user_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Delivery partner not found")
    p.ride_enabled = body.ride_enabled
    await db.commit()
    return {"id": str(user_id), "ride_enabled": p.ride_enabled}
