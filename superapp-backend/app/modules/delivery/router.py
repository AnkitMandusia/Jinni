"""Delivery agent API endpoints."""
import uuid
import random
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from sqlalchemy.orm import selectinload
from redis.asyncio import Redis

from app.database import get_db
from app.dependencies import get_current_active_user, get_redis
from app.modules.users.models import User, DeliveryAgentProfile
from app.modules.orders.models import Order, OrderItem
from app.modules.notifications.service import send_push, send_push_multicast

router = APIRouter(prefix="/delivery", tags=["delivery"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class ToggleOnlineRequest(BaseModel):
    is_online: bool


class DeliverWithOTPRequest(BaseModel):
    otp: str


class LocationUpdateRequest(BaseModel):
    latitude: float
    longitude: float
    accuracy: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None


class UpdateDeliveryProfileRequest(BaseModel):
    pincode: Optional[str] = None
    vehicle_type: Optional[str] = None
    bank_account: Optional[str] = None
    bank_ifsc: Optional[str] = None
    upi_id: Optional[str] = None


# ── Helpers ───────────────────────────────────────────────────────────────────

def _require_delivery(user: User) -> None:
    if user.role != "delivery":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only delivery agents can access this endpoint"
        )


async def _get_profile(db: AsyncSession, user_id: UUID) -> DeliveryAgentProfile:
    result = await db.execute(
        select(DeliveryAgentProfile).where(DeliveryAgentProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if not profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Delivery agent profile not found. Contact admin."
        )
    return profile


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.patch("/online")
async def toggle_online(
    data: ToggleOnlineRequest,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """[Delivery] Go online / offline."""
    _require_delivery(user)
    profile = await _get_profile(db, user.id)
    profile.is_available = data.is_online
    profile.last_location_at = datetime.utcnow()
    await db.commit()
    return {
        "is_online": profile.is_available,
        "message": "You are now online" if data.is_online else "You are now offline",
    }


@router.get("/dashboard")
async def get_dashboard(
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """[Delivery] Dashboard stats + active order."""
    _require_delivery(user)
    profile = await _get_profile(db, user.id)

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    today_count = (await db.execute(
        select(func.count(Order.id)).where(and_(
            Order.delivery_agent_id == user.id,
            Order.status == "delivered",
            Order.delivered_at >= today_start,
        ))
    )).scalar() or 0

    today_earnings = float((await db.execute(
        select(func.sum(Order.delivery_fee)).where(and_(
            Order.delivery_agent_id == user.id,
            Order.status == "delivered",
            Order.delivered_at >= today_start,
        ))
    )).scalar() or 0)

    cod_collected = float((await db.execute(
        select(func.sum(Order.total_amount)).where(and_(
            Order.delivery_agent_id == user.id,
            Order.status == "delivered",
            Order.payment_method == "cod",
            Order.delivered_at >= today_start,
        ))
    )).scalar() or 0)

    active_result = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(and_(
            Order.delivery_agent_id == user.id,
            Order.status.in_(["delivery_assigned", "picked_up", "in_transit"]),
        ))
        .order_by(Order.created_at.asc())
    )
    active_orders_rows = active_result.scalars().all()

    active_orders_data = [
        {
            "id": str(o.id),
            "order_number": o.order_number,
            "status": str(o.status),
            "total_amount": float(o.total_amount),
            "payment_method": str(o.payment_method),
            "delivery_fee": float(o.delivery_fee),
            "delivery_address": o.delivery_address,
            "pickup_address": o.pickup_address,
            # delivery_otp intentionally omitted — see delivery_otp module.
            "items": [{"name": i.product_name, "qty": i.quantity} for i in o.items],
        }
        for o in active_orders_rows
    ]

    return {
        "is_online": profile.is_available,
        "agent_name": profile.name,
        "vehicle_type": profile.vehicle_type,
        "active_orders": active_orders_data,
        "today_stats": {
            "orders_count": today_count,
            "earnings": today_earnings,
            "cod_collected": cod_collected,
        },
    }


@router.get("/orders/available")
async def get_available_orders(
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """[Delivery] List orders ready for pickup (no agent assigned)."""
    _require_delivery(user)
    profile = await _get_profile(db, user.id)

    if not profile.is_available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Go online first to see available orders",
        )

    filters = [
        Order.status == "ready_for_pickup",
        Order.delivery_agent_id == None,
    ]
    if profile.pincode:
        filters.append(Order.delivery_pincode == profile.pincode)

    result = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(and_(*filters))
        .order_by(Order.ready_at.desc())
        .limit(20)
    )
    orders = result.scalars().all()

    return [
        {
            "id": str(o.id),
            "order_number": o.order_number,
            "total_amount": float(o.total_amount),
            "delivery_fee": float(o.delivery_fee),
            "payment_method": str(o.payment_method),
            "delivery_address": o.delivery_address,
            "pickup_address": o.pickup_address,
            "delivery_pincode": o.delivery_pincode,
            "items_count": len(o.items),
            "items": [{"name": i.product_name, "qty": i.quantity} for i in o.items],
            "ready_at": o.ready_at.isoformat() if o.ready_at else None,
            "created_at": o.created_at.isoformat() if o.created_at else None,
        }
        for o in orders
    ]


@router.post("/orders/{order_id}/accept")
async def accept_delivery(
    order_id: UUID,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """[Delivery] Accept delivery assignment (race-to-accept with Redis lock)."""
    _require_delivery(user)
    profile = await _get_profile(db, user.id)

    if not profile.is_available:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You must be online to accept deliveries",
        )

    lock_key = f"delivery_accept:{order_id}"
    lock_val = str(uuid.uuid4())
    acquired = await redis.set(lock_key, lock_val, nx=True, ex=10)

    if not acquired:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Order already accepted by another delivery agent",
        )

    try:
        order = await db.get(Order, order_id, options=[selectinload(Order.items)])
        if not order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

        if str(order.status) != "ready_for_pickup":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Order is {order.status}, not available for delivery",
            )

        if order.delivery_agent_id is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Order already has a delivery agent",
            )

        # Defense-in-depth: the "ready for pickup" list already filters by the agent's
        # pincode, but this is the endpoint that actually assigns the order, so re-check
        # here too rather than trusting the client-supplied order_id's origin.
        if profile.pincode and order.delivery_pincode and profile.pincode != order.delivery_pincode:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"This order is for pincode {order.delivery_pincode}, outside your serviceable pincode ({profile.pincode}).",
            )

        order.delivery_agent_id = user.id
        order.status = "delivery_assigned"
        await db.commit()
        await db.refresh(order)

        customer = await db.get(User, order.customer_id)
        if customer and customer.fcm_token:
            await send_push(
                fcm_token=customer.fcm_token,
                title="Delivery Agent Assigned 🚴",
                body=f"Your order #{order.order_number} has a delivery agent on the way!",
                data={"type": "delivery_assigned", "order_id": str(order.id)},
            )

        return {
            "message": "Delivery accepted successfully",
            "order_id": str(order.id),
            "order_number": order.order_number,
            "delivery_address": order.delivery_address,
            "pickup_address": order.pickup_address,
            # delivery_otp intentionally omitted — OTPs are no longer stored on
            # the order row and must never be returned by any API response.
            "total_amount": float(order.total_amount),
            "payment_method": str(order.payment_method),
        }

    finally:
        val = await redis.get(lock_key)
        if val and val.decode() == lock_val:
            await redis.delete(lock_key)


@router.post("/orders/{order_id}/pickup")
async def confirm_pickup(
    order_id: UUID,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """[Delivery] Confirm package picked up from store/restaurant."""
    _require_delivery(user)

    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if order.delivery_agent_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your order")

    if str(order.status) != "delivery_assigned":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order is {order.status}, cannot confirm pickup",
        )

    order.status = "picked_up"
    order.picked_up_at = datetime.utcnow()
    await db.commit()

    customer = await db.get(User, order.customer_id)
    if customer and customer.fcm_token:
        await send_push(
            fcm_token=customer.fcm_token,
            title="Order Picked Up 📦",
            body=f"Your order #{order.order_number} is on its way!",
            data={"type": "picked_up", "order_id": str(order.id)},
        )

    return {"message": "Pickup confirmed", "status": "picked_up"}


@router.post("/orders/{order_id}/deliver")
async def confirm_delivery_removed(order_id: UUID):
    """REMOVED. This endpoint used to compare a plaintext, non-expiring OTP
    stored on the order row and returned that same plaintext OTP from
    /orders/{id}/accept — it bypassed hashing, expiry, attempt limits and
    leaked the code via the API. Delivery confirmation now goes exclusively
    through:
      POST /orders/{order_id}/delivery-otp          (initiate)
      POST /orders/{order_id}/delivery-otp/resend
      POST /orders/{order_id}/delivery-otp/verify    (completes the order)
    Kept as a 410 stub so old mobile app builds get a clear error instead of
    a silent 404.
    """
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail=(
            "This endpoint has been retired for security reasons. "
            "Update the app and use /orders/{order_id}/delivery-otp/verify."
        ),
    )


@router.get("/orders")
async def get_my_deliveries(
    status_filter: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """[Delivery] Order history for this agent."""
    _require_delivery(user)

    query = (
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.delivery_agent_id == user.id)
    )
    if status_filter:
        query = query.where(Order.status == status_filter)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar()
    query = query.order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    orders = (await db.execute(query)).scalars().all()

    return {
        "orders": [
            {
                "id": str(o.id),
                "order_number": o.order_number,
                "status": str(o.status),
                "total_amount": float(o.total_amount),
                "delivery_fee": float(o.delivery_fee),
                "payment_method": str(o.payment_method),
                "delivery_address": o.delivery_address,
                "items_count": len(o.items),
                "created_at": o.created_at.isoformat(),
                "delivered_at": o.delivered_at.isoformat() if o.delivered_at else None,
            }
            for o in orders
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/earnings")
async def get_earnings(
    period: str = Query("today", pattern="^(today|week|month)$"),
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """[Delivery] Earnings breakdown by period."""
    _require_delivery(user)

    now = datetime.utcnow()
    if period == "today":
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "week":
        start = now - timedelta(days=7)
    else:
        start = now - timedelta(days=30)

    result = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(and_(
            Order.delivery_agent_id == user.id,
            Order.status == "delivered",
            Order.delivered_at >= start,
        ))
        .order_by(Order.delivered_at.desc())
    )
    orders = result.scalars().all()

    total_earnings = sum(float(o.delivery_fee or 0) for o in orders)
    cod_collected = sum(float(o.total_amount or 0) for o in orders if str(o.payment_method) == "cod")

    return {
        "period": period,
        "orders_count": len(orders),
        "earnings": total_earnings,
        "cod_collected": cod_collected,
        "orders": [
            {
                "id": str(o.id),
                "order_number": o.order_number,
                "total_amount": float(o.total_amount),
                "delivery_fee": float(o.delivery_fee or 0),
                "payment_method": str(o.payment_method),
                "delivered_at": o.delivered_at.isoformat() if o.delivered_at else None,
            }
            for o in orders
        ],
    }


@router.patch("/location")
async def update_location(
    data: LocationUpdateRequest,
    order_id: Optional[UUID] = Query(None),
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """[Delivery] Update current GPS location and optionally attach it to an active order."""
    _require_delivery(user)
    profile = await _get_profile(db, user.id)
    profile.current_lat = data.latitude
    profile.current_lng = data.longitude
    profile.last_location_at = datetime.utcnow()

    if order_id:
        order = await db.get(Order, order_id)
        if not order or order.delivery_agent_id != user.id:
            raise HTTPException(status_code=403, detail="Order is not assigned to you")
        if str(order.status) == "picked_up":
            order.status = "in_transit"

        from app.modules.orders.models import DeliveryLocation
        db.add(DeliveryLocation(
            delivery_agent_id=user.id,
            order_id=order_id,
            latitude=data.latitude,
            longitude=data.longitude,
            accuracy=data.accuracy,
            speed=data.speed,
            heading=data.heading,
        ))
    await db.commit()
    return {"message": "Location updated", "lat": data.latitude, "lng": data.longitude, "order_id": str(order_id) if order_id else None}


@router.get("/profile")
async def get_delivery_profile(
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """[Delivery] Get own profile details."""
    _require_delivery(user)
    profile = await _get_profile(db, user.id)
    return {
        "id": str(profile.id),
        "name": profile.name,
        "vehicle_type": profile.vehicle_type,
        "license_no": profile.license_no,
        "pincode": profile.pincode,
        "bank_account": profile.bank_account,
        "bank_ifsc": profile.bank_ifsc,
        "upi_id": profile.upi_id,
        "is_available": profile.is_available,
        "current_lat": profile.current_lat,
        "current_lng": profile.current_lng,
    }


@router.patch("/profile")
async def update_delivery_profile(
    data: UpdateDeliveryProfileRequest,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """[Delivery] Update profile fields including pincode."""
    _require_delivery(user)
    profile = await _get_profile(db, user.id)
    if data.pincode is not None:
        profile.pincode = data.pincode
    if data.vehicle_type is not None:
        profile.vehicle_type = data.vehicle_type
    if data.bank_account is not None:
        profile.bank_account = data.bank_account
    if data.bank_ifsc is not None:
        profile.bank_ifsc = data.bank_ifsc
    if data.upi_id is not None:
        profile.upi_id = data.upi_id
    await db.commit()
    return {
        "message": "Profile updated",
        "pincode": profile.pincode,
        "vehicle_type": profile.vehicle_type,
        "upi_id": profile.upi_id,
    }
