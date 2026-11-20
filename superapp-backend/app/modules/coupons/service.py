"""Shared coupon validation + pricing.

Single source of truth used by:
  * POST /coupons/validate         (checkout "Apply" button preview)
  * FoodOrderService.create_order  (server-side re-validation at order time)
  * OrderService.create_order      (grocery — previously ignored coupon_code
    entirely, so the app showed a discount the server never applied)

The order-time call is authoritative: the amount charged (and sent to Paytm)
must equal what is computed here, never what the client displays.
"""
from datetime import datetime
from decimal import Decimal
from typing import Optional, Tuple
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.coupons.router import Coupon, CouponRedemption
from app.modules.orders.models import Order


def calc_discount(coupon: Coupon, subtotal: Decimal) -> Decimal:
    if coupon.discount_type == "percent":
        d = (subtotal * coupon.discount_value / Decimal("100")).quantize(Decimal("0.01"))
        if coupon.max_discount is not None:
            d = min(d, coupon.max_discount)
    else:
        d = min(coupon.discount_value, subtotal)
    return max(Decimal("0.00"), d)


async def validate_coupon_for_order(
    db: AsyncSession,
    *,
    code: str,
    user_id: UUID,
    order_type: str,
    subtotal: Decimal,
) -> Tuple[Coupon, Decimal]:
    """Return (coupon, discount) or raise HTTP 400 with a customer-readable reason."""
    code = (code or "").strip().upper()
    coupon = (await db.execute(select(Coupon).where(Coupon.code == code))).scalar_one_or_none()
    if not coupon or not coupon.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid coupon")

    now = datetime.utcnow()
    if coupon.starts_at and now < coupon.starts_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Coupon not started yet")
    if coupon.expires_at and now > coupon.expires_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Coupon expired")
    if coupon.applies_to not in ("all", order_type):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Coupon not valid for this order type")
    if subtotal < coupon.min_order_amount:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Minimum order ₹{coupon.min_order_amount}")
    if coupon.max_uses_total is not None and coupon.used_count >= coupon.max_uses_total:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Coupon fully redeemed")

    user_uses = (await db.execute(
        select(func.count()).select_from(CouponRedemption).where(
            CouponRedemption.coupon_id == coupon.id, CouponRedemption.user_id == user_id
        )
    )).scalar() or 0
    if user_uses >= coupon.max_uses_per_user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You already used this coupon")

    if coupon.coupon_kind == "first_order":
        prior = (await db.execute(
            select(func.count()).select_from(Order).where(Order.customer_id == user_id)
        )).scalar() or 0
        if prior > 0:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "First-order coupon only")

    return coupon, calc_discount(coupon, subtotal)


def record_cod_redemption(
    db: AsyncSession, coupon: Optional[Coupon], discount: Decimal, order: Order, user_id: UUID
) -> None:
    """COD orders redeem immediately; online orders redeem after Paytm confirms
    payment (see payments_paytm). Caller commits."""
    if coupon and discount > 0 and order.payment_method == "cod":
        db.add(CouponRedemption(
            coupon_id=coupon.id, user_id=user_id, order_id=order.id, discount_amount=discount,
        ))
        coupon.used_count = (coupon.used_count or 0) + 1
