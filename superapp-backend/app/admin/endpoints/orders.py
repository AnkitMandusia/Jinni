"""Admin: orders overview endpoint + manual delivery completion."""
from typing import Optional
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from redis.asyncio import Redis

from app.database import get_db
from app.dependencies import require_role, get_redis
from app.modules.users.models import User
from app.modules.orders.models import Order, DeliveryAuditLog

router = APIRouter(prefix="/orders", tags=["admin-orders"])


class ManualCompleteRequest(BaseModel):
    reason: str = Field(..., min_length=10, max_length=500, description="Mandatory audit reason")


@router.get("")
async def list_orders(
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    """List all orders with optional status filter."""
    query = select(Order)
    if status:
        query = query.where(Order.status == status)

    total = (await db.execute(select(func.count()).select_from(query.subquery()))).scalar()
    orders = (
        await db.execute(query.order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size))
    ).scalars().all()

    return {
        "orders": [
            {
                "id": str(o.id),
                "order_number": o.order_number,
                "order_type": str(o.order_type),
                "status": str(o.status),
                "customer_id": str(o.customer_id),
                "store_id": str(o.store_id) if o.store_id else None,
                "delivery_agent_id": str(o.delivery_agent_id) if o.delivery_agent_id else None,
                "total_amount": float(o.total_amount),
                "payment_method": str(o.payment_method),
                "payment_status": str(o.payment_status),
                "delivery_pincode": o.delivery_pincode,
                "created_at": o.created_at.isoformat(),
                "delivered_at": o.delivered_at.isoformat() if o.delivered_at else None,
            }
            for o in orders
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/delivery-audit-log")
async def list_delivery_audit_log(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    """Super Admin: full history of manual delivery completions, newest first."""
    total = (await db.execute(select(func.count()).select_from(DeliveryAuditLog))).scalar() or 0
    rows = (await db.execute(
        select(DeliveryAuditLog)
        .order_by(DeliveryAuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
    )).scalars().all()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "entries": [
            {
                "id": str(a.id),
                "order_id": str(a.order_id),
                "order_number": a.order_number,
                "admin_id": str(a.admin_id),
                "admin_phone": a.admin_phone,
                "previous_status": a.previous_status,
                "new_status": a.new_status,
                "reason": a.reason,
                "completion_method": a.completion_method,
                "created_at": a.created_at.isoformat(),
            }
            for a in rows
        ],
    }


@router.get("/{order_id}/delivery-verification")
async def get_delivery_verification(
    order_id: UUID,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    admin: User = Depends(require_role("admin")),
):
    """Super Admin: delivery OTP communication status (no OTP revealed)."""
    from app.modules.delivery_otp import service as otp_svc

    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    otp_status = await otp_svc.get_otp_status(str(order_id), redis)
    customer = await db.get(User, order.customer_id) if order.customer_id else None
    agent = await db.get(User, order.delivery_agent_id) if order.delivery_agent_id else None

    audit_rows = (await db.execute(
        select(DeliveryAuditLog)
        .where(DeliveryAuditLog.order_id == order_id)
        .order_by(DeliveryAuditLog.created_at.desc())
    )).scalars().all()

    phone_hint = None
    if customer and customer.phone:
        p = "".join(c for c in customer.phone if c.isdigit())
        phone_hint = f"***{p[-4:]}" if len(p) >= 4 else "****"

    return {
        "order_id": str(order.id),
        "order_number": order.order_number,
        "status": str(order.status),
        "customer_phone_hint": phone_hint or otp_status.get("phone_hint"),
        "delivery_agent_id": str(order.delivery_agent_id) if order.delivery_agent_id else None,
        "delivery_agent_name": getattr(agent, "full_name", None) if agent else None,
        "otp_active": otp_status.get("active", False),
        "channel_status": otp_status.get("channel_status"),
        "whatsapp_status": otp_status.get("whatsapp_status"),
        "sms_status": otp_status.get("sms_status"),
        "failure_reason": otp_status.get("failure_reason"),
        "expires_in": otp_status.get("expires_in"),
        "manual_complete_available": str(order.status) in ("picked_up", "in_transit", "delivery_assigned"),
        "delivered_at": order.delivered_at.isoformat() if order.delivered_at else None,
        "manual_complete_history": [
            {
                "admin_id": str(a.admin_id),
                "reason": a.reason,
                "previous_status": a.previous_status,
                "new_status": a.new_status,
                "created_at": a.created_at.isoformat(),
            }
            for a in audit_rows
        ],
    }


@router.post("/{order_id}/manual-complete")
async def manual_complete_delivery(
    order_id: UUID,
    body: ManualCompleteRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    admin: User = Depends(require_role("admin")),
):
    """Super Admin only: manually mark delivery complete after verifying the situation.

    Requires a mandatory reason. Creates an immutable audit record in Redis + logs.
    """
    order = await db.get(Order, order_id)
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if str(order.status) == "delivered":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Order is already delivered",
        )

    if str(order.status) not in ("picked_up", "in_transit", "delivery_assigned"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order status {order.status} is not eligible for manual completion",
        )

    prev_status = str(order.status)
    order.status = "delivered"
    order.delivered_at = datetime.utcnow()
    # Clear any static OTP
    if hasattr(order, "delivery_otp"):
        order.delivery_otp = None
    await db.commit()
    await db.refresh(order)

    # Invalidate any active OTP
    try:
        from app.modules.delivery_otp.service import (
            REDIS_OTP_PREFIX, REDIS_META_PREFIX, REDIS_ATTEMPTS_PREFIX
        )
        pipe = redis.pipeline()
        pipe.delete(f"{REDIS_OTP_PREFIX}{order_id}")
        pipe.delete(f"{REDIS_META_PREFIX}{order_id}")
        pipe.delete(f"{REDIS_ATTEMPTS_PREFIX}{order_id}")
        pipe.delete(f"dotp:plain:{order_id}")
        await pipe.execute()
    except Exception:
        pass

    # Immutable audit trail — Postgres row, not Redis. See DeliveryAuditLog
    # docstring / migration 0011 for why: Redis lists are neither durable nor
    # actually tamper-proof, and this is a compliance-relevant action.
    from app.modules.orders.models import DeliveryAuditLog
    audit_row = DeliveryAuditLog(
        order_id=order_id,
        order_number=order.order_number,
        admin_id=admin.id,
        admin_phone=getattr(admin, "phone", None),
        previous_status=prev_status,
        new_status="delivered",
        reason=body.reason,
        completion_method="admin_manual",
    )
    db.add(audit_row)
    await db.commit()

    import logging
    logging.getLogger("audit").warning(
        "MANUAL_DELIVERY_COMPLETE order=%s admin=%s reason=%s prev=%s",
        order_id, admin.id, body.reason, prev_status,
    )

    # Notify customer
    try:
        customer = await db.get(User, order.customer_id)
        if customer and getattr(customer, "fcm_token", None):
            from app.modules.notifications.service import send_push
            await send_push(
                fcm_token=customer.fcm_token,
                title="Order Delivered! ✅",
                body=f"Your order #{order.order_number} has been delivered.",
                data={"type": "delivered", "order_id": str(order.id), "completion_method": "admin_manual"},
            )
    except Exception:
        pass

    # Realtime: customer app, delivery partner app and every connected
    # Super Admin dashboard update without a manual refresh.
    try:
        from app.realtime.manager import emit_order_event_cluster_safe
        await emit_order_event_cluster_safe(
            redis,
            "order.delivery_status_updated",
            order_id=str(order.id),
            customer_id=order.customer_id,
            delivery_agent_id=order.delivery_agent_id,
            store_id=order.store_id,
            data={"status": "delivered", "completionMethod": "admin_manual"},
        )
    except Exception:
        logging.getLogger("audit").exception("Realtime emit failed for order=%s", order.id)

    return {
        "message": "Order manually marked as delivered",
        "order_id": str(order.id),
        "order_number": order.order_number,
        "status": "delivered",
        "completion_method": "admin_manual",
        "audit": {"admin_id": str(admin.id), "reason": body.reason, "previous_status": prev_status},
    }
