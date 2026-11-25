"""Admin: ride management (bookings, assignment, pricing, spots, partners, SOS, payments)."""
from datetime import datetime
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from redis.asyncio import Redis
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_redis, require_role
from app.modules.delivery.kyc import VEHICLE_CLASSES as KYC_CLASSES, expiry_issues
from app.modules.rides import dues as dues_svc
from app.modules.rides import osm, pricing, service
from app.modules.rides.models import (
    Ride, RideFare, RidePlace, RideSettings, RideSOS, RideStatus, VEHICLE_CLASSES,
)
from app.modules.rides.router import _load, _mark_paid, emit, notify, ride_block_reason
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
        select(Ride.payment_method, Ride.payment_status, func.coalesce(func.sum(Ride.fare + Ride.dues_amount), 0), func.count())
        .where(Ride.status == RideStatus.COMPLETED, Ride.completed_at >= today)
        .group_by(Ride.payment_method, Ride.payment_status))).all()
    return {
        "today_by_status": by_status,
        "today_payments": [{"method": m, "payment_status": ps, "amount": float(a), "count": c} for m, ps, a, c in money],
        "riders_online": await service.online_rider_count(db, idle_only=False),
        "open_requests": int((await db.execute(select(func.count()).select_from(Ride)
                                               .where(Ride.status == RideStatus.REQUESTED))).scalar() or 0),
        "open_sos": int((await db.execute(select(func.count()).select_from(RideSOS)
                                           .where(RideSOS.status == "open"))).scalar() or 0),
        "pending_partners": int((await db.execute(select(func.count()).select_from(User)
                                                  .where(User.role == "delivery", User.status == "pending_approval"))).scalar() or 0),
    }


@router.get("")
async def list_rides(status_: Optional[str] = Query(None, alias="status"),
                     payment_status: Optional[str] = None, payment_method: Optional[str] = None,
                     vehicle_class: Optional[str] = None,
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
    if vehicle_class:
        q = q.where(Ride.vehicle_class == vehicle_class)
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
    """Manually assign (or reassign, before the customer boards) a ride to a verified, ride-enabled partner
    whose vehicle matches the booking. Offline partners can be assigned (admin knows they're around)."""
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
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pick an approved delivery partner")
    if not profile.ride_enabled or not profile.documents_verified:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This partner isn't verified/enabled for rides")
    if profile.vehicle_class != ride.vehicle_class:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"This is a {ride.vehicle_class} ride; the partner drives a {profile.vehicle_class}")
    if ride.rider_id != rider.id and await service.rider_is_busy(db, rider.id):
        raise HTTPException(status.HTTP_409_CONFLICT, "This partner is busy with another job")
    prev = ride.rider_id
    ride.rider_id = rider.id
    ride.status = RideStatus.ACCEPTED
    ride.accepted_at = datetime.utcnow()
    ride.arrived_at = None
    ride.start_attempts = 0
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
    """Admin cancellation never charges the customer a fee."""
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
    ride.cancel_reason_code = "admin"
    ride.cancellation_fee = Decimal("0.00")
    await dues_svc.release(db, f"ride:{ride.id}")
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


class WaiveBody(BaseModel):
    reason: str = Field(..., min_length=3, max_length=200)


@router.post("/{ride_id}/waive-fee")
async def waive_fee(ride_id: UUID, body: WaiveBody, db: AsyncSession = Depends(get_db), admin: User = Admin):
    """Forgive a cancellation fee (customer complained / rider at fault). Works even after it was folded into
    a later ride/order only if that one hasn't been charged yet — otherwise it's just marked waived for the record."""
    s = await service.get_settings(db)
    ride = (await db.execute(select(Ride).where(Ride.id == ride_id).with_for_update())).scalar_one_or_none()
    if not ride or Decimal(ride.cancellation_fee or 0) <= 0:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No cancellation fee on this ride")
    ride.fee_waived = True
    ride.fare_adjusted_reason = (ride.fare_adjusted_reason or f"Fee waived: {body.reason.strip()}")[:200]
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


# ── pricing settings + fare cards ────────────────────────────────────────────

class PeakWindow(BaseModel):
    label: str = Field("Busy time", max_length=30)
    start: str = Field(..., pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    end: str = Field(..., pattern=r"^([01]\d|2[0-3]):[0-5]\d$")
    multiplier: float = Field(..., ge=1, le=3)


class SettingsBody(BaseModel):
    is_enabled: bool
    road_factor: Decimal = Field(..., ge=1, le=3)
    max_distance_km: Decimal = Field(..., gt=0, le=200)
    request_timeout_minutes: int = Field(..., ge=1, le=60)
    platform_upi_id: Optional[str] = Field(None, max_length=100, pattern=r"^[\w.\-]{2,}@[\w.\-]{2,}$")
    pricing_mode: str = Field("fixed", pattern="^(fixed|dynamic)$")
    manual_multiplier: Decimal = Field(Decimal("1.00"), ge=1, le=3)
    auto_surge_enabled: bool = False
    auto_surge_step: Decimal = Field(Decimal("0.25"), ge=0, le=1)
    max_multiplier: Decimal = Field(Decimal("2.00"), ge=1, le=3)
    peak_windows: list[PeakWindow] = []
    boost_options: list[int] = Field(default_factory=lambda: [10, 20, 30], max_length=5)
    max_boost: Decimal = Field(Decimal("50"), ge=0, le=500)
    cancel_grace_seconds: int = Field(120, ge=0, le=900)
    cancel_fee: Decimal = Field(Decimal("20"), ge=0, le=500)
    avg_speed_kmph: int = Field(25, ge=5, le=80)
    service_lat: Optional[float] = Field(None, ge=-90, le=90)
    service_lng: Optional[float] = Field(None, ge=-180, le=180)
    service_radius_km: Optional[Decimal] = Field(None, gt=0, le=200)
    sos_helpline: str = Field("112", pattern=r"^\d{2,6}$")

    @field_validator("boost_options")
    @classmethod
    def _boosts(cls, v):
        if any(x <= 0 or x > 200 for x in v):
            raise ValueError("Boost amounts must be between ₹1 and ₹200")
        return sorted(set(v))


def _fare_out(f: RideFare) -> dict:
    return {"vehicle_class": f.vehicle_class, "label": f.label, "base_fare": float(f.base_fare),
            "per_km": float(f.per_km), "min_fare": float(f.min_fare), "is_enabled": f.is_enabled}


async def _settings_out(db: AsyncSession, s: RideSettings) -> dict:
    fares = await service.get_fares(db)
    return {
        "is_enabled": s.is_enabled, "road_factor": float(s.road_factor), "max_distance_km": float(s.max_distance_km),
        "request_timeout_minutes": s.request_timeout_minutes, "platform_upi_id": s.platform_upi_id,
        "pricing_mode": s.pricing_mode, "manual_multiplier": float(s.manual_multiplier),
        "auto_surge_enabled": s.auto_surge_enabled, "auto_surge_step": float(s.auto_surge_step),
        "max_multiplier": float(s.max_multiplier), "peak_windows": s.peak_windows or [],
        "boost_options": s.boost_options or [], "max_boost": float(s.max_boost),
        "cancel_grace_seconds": s.cancel_grace_seconds, "cancel_fee": float(s.cancel_fee),
        "avg_speed_kmph": s.avg_speed_kmph, "service_lat": s.service_lat, "service_lng": s.service_lng,
        "service_radius_km": float(s.service_radius_km) if s.service_radius_km is not None else None,
        "sos_helpline": s.sos_helpline,
        "fares": [_fare_out(fares[c]) for c in VEHICLE_CLASSES],
        "current_multipliers": {c: dict(zip(("multiplier", "reason"), map(lambda x: float(x) if isinstance(x, Decimal) else x,
                                                                          await service.multiplier_now(db, s, c)))) for c in VEHICLE_CLASSES},
    }


@router.get("/settings")
async def get_settings_(db: AsyncSession = Depends(get_db), admin: User = Admin):
    s = await service.get_settings(db)
    out = await _settings_out(db, s)
    await db.commit()
    return out


@router.put("/settings")
async def put_settings(body: SettingsBody, db: AsyncSession = Depends(get_db), admin: User = Admin):
    if (body.service_lat is None) != (body.service_lng is None) or (body.service_lat is None) != (body.service_radius_km is None):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Set service latitude, longitude and radius together (or clear all three)")
    if body.max_boost < (max(body.boost_options) if body.boost_options else 0):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Max total boost must be at least the largest boost option")
    try:
        windows = pricing.validate_windows([w.model_dump() for w in body.peak_windows])
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    s = await service.get_settings(db)
    data = body.model_dump()
    data["peak_windows"] = windows
    for k, v in data.items():
        setattr(s, k, (v.strip() or None) if isinstance(v, str) and k == "platform_upi_id" else v)
    await db.commit()
    return await _settings_out(db, s)


class FareCardBody(BaseModel):
    label: str = Field(..., min_length=2, max_length=30)
    base_fare: Decimal = Field(..., ge=0, le=1000)
    per_km: Decimal = Field(..., ge=0, le=300)
    min_fare: Decimal = Field(..., ge=0, le=2000)
    is_enabled: bool = True


@router.put("/fares/{vehicle_class}")
async def put_fare(vehicle_class: str, body: FareCardBody, db: AsyncSession = Depends(get_db), admin: User = Admin):
    if vehicle_class not in VEHICLE_CLASSES:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Unknown vehicle type")
    fares = await service.get_fares(db)
    f = fares[vehicle_class]
    for k, v in body.model_dump().items():
        setattr(f, k, v)
    await db.commit()
    return _fare_out(f)


@router.get("/pricing/preview")
async def pricing_preview(db: AsyncSession = Depends(get_db), admin: User = Admin):
    """What riders would be quoted RIGHT NOW (current multiplier included) for sample trip lengths —
    lets admin sanity-check fixed vs dynamic settings before saving."""
    s = await service.get_settings(db)
    fares = await service.get_fares(db)
    out = []
    for vc in VEHICLE_CLASSES:
        mult, reason = await service.multiplier_now(db, s, vc)
        rows = []
        for km in (2, 5, 10):
            d = Decimal(km)
            rows.append({"km": km, "base": float(pricing.round_up_5(pricing.distance_fare(fares[vc], d))),
                         "now": float(pricing.quote_fare(fares[vc], d, mult))})
        out.append({"vehicle_class": vc, "label": fares[vc].label, "multiplier": float(mult), "reason": reason, "samples": rows,
                    "open_requests": await service.open_request_count(db, vc),
                    "idle_riders": await service.online_rider_count(db, vc)})
    return out


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
            "display_order": p.display_order, "is_active": p.is_active, "source": p.source,
            "category": p.category, "score": p.score}


@router.get("/places")
async def list_places(db: AsyncSession = Depends(get_db), admin: User = Admin):
    rows = (await db.execute(select(RidePlace).order_by(RidePlace.is_active.desc(), RidePlace.display_order,
                                                        RidePlace.score.desc(), RidePlace.name))).scalars().all()
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


class ImportBody(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)
    radius_km: float = Field(8, gt=0, le=30)
    limit: int = Field(25, ge=1, le=60)
    activate: bool = False


@router.post("/places/import-osm")
async def import_osm(body: ImportBody, db: AsyncSession = Depends(get_db), admin: User = Admin):
    """One-time, per-city import of well-known places from OpenStreetMap (free, no key). New spots are saved
    HIDDEN unless `activate` is true so admin can review them. Existing OSM spots are never duplicated."""
    try:
        cands = await osm.fetch_candidates(body.lat, body.lng, body.radius_km, body.limit)
    except Exception as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"OpenStreetMap lookup failed ({e.__class__.__name__}). Try again in a minute.")
    have_ids = set((await db.execute(select(RidePlace.osm_id).where(RidePlace.osm_id.isnot(None)))).scalars())
    have_names = {n.lower() for n in (await db.execute(select(RidePlace.name))).scalars()}
    added = 0
    for c in cands:
        if c["osm_id"] in have_ids or c["name"].lower() in have_names:
            continue
        db.add(RidePlace(name=c["name"], area=c["area"], icon=c["icon"], lat=c["lat"], lng=c["lng"],
                         category=c["category"], osm_id=c["osm_id"], score=c["score"], source="osm",
                         is_active=body.activate, display_order=100))
        added += 1
    await db.commit()
    return {"found": len(cands), "added": added, "skipped_existing": len(cands) - added, "activated": body.activate}


class BulkActive(BaseModel):
    ids: list[UUID] = Field(..., min_length=1, max_length=200)
    is_active: bool


@router.post("/places/bulk-active")
async def bulk_active(body: BulkActive, db: AsyncSession = Depends(get_db), admin: User = Admin):
    rows = (await db.execute(select(RidePlace).where(RidePlace.id.in_(body.ids)))).scalars().all()
    for p in rows:
        p.is_active = body.is_active
    await db.commit()
    return {"updated": len(rows)}


# ── ride partners (= delivery partners; KYC + approval live here) ────────────

def _partner_out(u: User, p: DeliveryAgentProfile, *, done: int, on_ride: bool, busy: bool) -> dict:
    return {
        "id": str(u.id), "name": p.name, "phone": u.phone, "email": u.email, "account_status": u.status,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "online": bool(p.is_available), "ride_enabled": bool(p.ride_enabled), "upi_id": p.upi_id,
        "state": "on_ride" if on_ride else "on_delivery" if busy else "idle", "completed_rides": done,
        "rating": p.rating, "rating_count": p.rating_count,
        "vehicle_class": p.vehicle_class, "vehicle_type": p.vehicle_type, "vehicle_number": p.vehicle_number,
        "vehicle_make_model": p.vehicle_make_model, "vehicle_color": p.vehicle_color,
        "license_no": p.license_no, "dob": p.dob.isoformat() if p.dob else None,
        "dl_expiry": p.dl_expiry.isoformat() if p.dl_expiry else None,
        "rc_expiry": p.rc_expiry.isoformat() if p.rc_expiry else None,
        "insurance_expiry": p.insurance_expiry.isoformat() if p.insurance_expiry else None,
        "aadhaar_last4": p.aadhaar_last4, "emergency_name": p.emergency_name, "emergency_phone": p.emergency_phone,
        "documents_verified": bool(p.documents_verified),
        "documents_verified_at": p.documents_verified_at.isoformat() if p.documents_verified_at else None,
        "kyc_issues": expiry_issues(p), "ride_block_reason": ride_block_reason(p),
        "take_rides": bool(p.take_rides), "take_deliveries": bool(p.take_deliveries),
    }


@router.get("/partners")
async def partners(db: AsyncSession = Depends(get_db), admin: User = Admin):
    rows = (await db.execute(
        select(User, DeliveryAgentProfile).join(DeliveryAgentProfile, DeliveryAgentProfile.user_id == User.id)
        .where(User.role == "delivery").order_by(User.status.desc(), DeliveryAgentProfile.name))).all()
    out = []
    for u, p in rows:
        done = int((await db.execute(select(func.count()).select_from(Ride).where(
            Ride.rider_id == u.id, Ride.status == RideStatus.COMPLETED))).scalar() or 0)
        out.append(_partner_out(u, p, done=done, on_ride=await service.rider_has_active_ride(db, u.id),
                                busy=await service.rider_is_busy(db, u.id)))
    return out


class PartnerBody(BaseModel):
    ride_enabled: Optional[bool] = None
    documents_verified: Optional[bool] = None
    vehicle_class: Optional[str] = Field(None, pattern="^(bike|auto|cab)$")


@router.patch("/partners/{user_id}")
async def set_partner(user_id: UUID, body: PartnerBody, db: AsyncSession = Depends(get_db), admin: User = Admin):
    p = (await db.execute(select(DeliveryAgentProfile).where(DeliveryAgentProfile.user_id == user_id))).scalar_one_or_none()
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Delivery partner not found")
    if body.ride_enabled is not None:
        p.ride_enabled = body.ride_enabled
    if body.vehicle_class is not None:
        p.vehicle_class = body.vehicle_class
        p.vehicle_type = KYC_CLASSES[body.vehicle_class]
    if body.documents_verified is not None:
        if body.documents_verified and (issues := expiry_issues(p)):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Can't verify: {issues[0]}")
        p.documents_verified = body.documents_verified
        p.documents_verified_at = datetime.utcnow() if body.documents_verified else None
        p.documents_verified_by = admin.id if body.documents_verified else None
    await db.commit()
    return {"id": str(user_id), "ride_enabled": p.ride_enabled, "documents_verified": p.documents_verified,
            "vehicle_class": p.vehicle_class}


# ── SOS ──────────────────────────────────────────────────────────────────────

@router.get("/sos")
async def list_sos(status_: str = Query("open", alias="status", pattern="^(open|resolved|all)$"),
                   db: AsyncSession = Depends(get_db), admin: User = Admin):
    q = select(RideSOS).order_by(RideSOS.created_at.desc()).limit(100)
    if status_ != "all":
        q = q.where(RideSOS.status == status_)
    s = await service.get_settings(db)
    out = []
    for sos in (await db.execute(q)).scalars().all():
        ride = await db.get(Ride, sos.ride_id)
        raiser = await db.get(User, sos.raised_by)
        out.append({
            "id": str(sos.id), "status": sos.status, "raised_by_role": sos.raised_by_role,
            "raised_by": {"name": raiser.name if raiser else None, "phone": raiser.phone if raiser else None},
            "lat": sos.lat, "lng": sos.lng, "note": sos.note,
            "map_url": f"https://www.google.com/maps/search/?api=1&query={sos.lat},{sos.lng}" if sos.lat is not None else None,
            "created_at": sos.created_at.isoformat() if sos.created_at else None,
            "resolved_at": sos.resolved_at.isoformat() if sos.resolved_at else None, "resolution": sos.resolution,
            "ride": await _load(db, ride, s, "admin") if ride else None,
            "helpline": s.sos_helpline,
        })
    return out


class ResolveBody(BaseModel):
    resolution: str = Field(..., min_length=3, max_length=300)


@router.post("/sos/{sos_id}/resolve")
async def resolve_sos(sos_id: UUID, body: ResolveBody, db: AsyncSession = Depends(get_db), admin: User = Admin):
    sos = await db.get(RideSOS, sos_id)
    if not sos:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "SOS not found")
    sos.status, sos.resolved_at, sos.resolved_by, sos.resolution = "resolved", datetime.utcnow(), admin.id, body.resolution.strip()
    await db.commit()
    return {"ok": True}


@router.get("/sos-count")
async def sos_count(db: AsyncSession = Depends(get_db), admin: User = Admin):
    """Cheap endpoint the console header polls on every page."""
    return {"open": int((await db.execute(select(func.count()).select_from(RideSOS).where(RideSOS.status == "open"))).scalar() or 0)}
