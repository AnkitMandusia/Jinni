"""Coupons — validate for checkout; admin CRUD via require_role('admin')."""
from datetime import datetime
from decimal import Decimal
from typing import List, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import Column, String, Boolean, DateTime, Integer, Numeric, Text, ForeignKey, select, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Base, get_db
from app.dependencies import get_current_active_user, require_role
from app.modules.users.models import User
from app.modules.orders.models import Order

router = APIRouter(prefix="/coupons", tags=["coupons"])


class Coupon(Base):
    __tablename__ = "coupons"
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    code = Column(String(40), unique=True, nullable=False, index=True)
    title = Column(String(120), nullable=False)
    description = Column(Text, nullable=True)
    discount_type = Column(String(20), nullable=False, default="flat")  # percent|flat
    discount_value = Column(Numeric(10, 2), nullable=False)
    max_discount = Column(Numeric(10, 2), nullable=True)
    min_order_amount = Column(Numeric(10, 2), nullable=False, default=0)
    applies_to = Column(String(20), nullable=False, default="all")  # food|grocery|all
    coupon_kind = Column(String(20), nullable=False, default="one_time")  # first_order|one_time|repeat|timed
    max_uses_total = Column(Integer, nullable=True)
    max_uses_per_user = Column(Integer, nullable=False, default=1)
    used_count = Column(Integer, nullable=False, default=0)
    starts_at = Column(DateTime, nullable=True)
    expires_at = Column(DateTime, nullable=True)
    is_active = Column(Boolean, default=True)
    created_by = Column(PGUUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class CouponRedemption(Base):
    __tablename__ = "coupon_redemptions"
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    coupon_id = Column(PGUUID(as_uuid=True), ForeignKey("coupons.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    order_id = Column(PGUUID(as_uuid=True), ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    discount_amount = Column(Numeric(10, 2), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)


class ValidateRequest(BaseModel):
    code: str
    order_type: str = "food"
    subtotal: Decimal = Field(..., ge=0)
    restaurant_id: Optional[UUID] = None


class ValidateResponse(BaseModel):
    valid: bool
    discount_amount: Decimal = Decimal("0")
    message: str
    code: Optional[str] = None


class CouponCreate(BaseModel):
    code: str = Field(..., min_length=3, max_length=40)
    title: str
    description: Optional[str] = None
    discount_type: str = Field(default="flat", pattern="^(flat|percent)$")
    discount_value: Decimal = Field(..., gt=0)
    max_discount: Optional[Decimal] = None
    min_order_amount: Decimal = Decimal("0")
    applies_to: str = Field(default="all", pattern="^(food|grocery|all)$")
    coupon_kind: str = Field(default="one_time", pattern="^(first_order|one_time|repeat|timed)$")
    max_uses_total: Optional[int] = None
    max_uses_per_user: int = 1
    starts_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None


@router.post("/validate", response_model=ValidateResponse)
async def validate_coupon(
    body: ValidateRequest,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    # Imported lazily: service imports Coupon/CouponRedemption from this module.
    from app.modules.coupons.service import validate_coupon_for_order

    coupon, discount = await validate_coupon_for_order(
        db, code=body.code, user_id=user.id, order_type=body.order_type, subtotal=body.subtotal,
    )
    return ValidateResponse(
        valid=True,
        discount_amount=discount,
        message=f"₹{discount} off applied",
        code=coupon.code,
    )


@router.post("/admin", status_code=201)
async def admin_create_coupon(
    body: CouponCreate,
    admin: User = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    exists = (await db.execute(select(Coupon).where(Coupon.code == body.code.upper()))).scalar_one_or_none()
    if exists:
        raise HTTPException(409, "Code already exists")
    c = Coupon(
        id=uuid4(),
        code=body.code.upper(),
        title=body.title,
        description=body.description,
        discount_type=body.discount_type,
        discount_value=body.discount_value,
        max_discount=body.max_discount,
        min_order_amount=body.min_order_amount,
        applies_to=body.applies_to,
        coupon_kind=body.coupon_kind,
        max_uses_total=body.max_uses_total,
        max_uses_per_user=body.max_uses_per_user,
        starts_at=body.starts_at,
        expires_at=body.expires_at,
        created_by=admin.id,
        is_active=True,
    )
    db.add(c)
    await db.commit()
    return {"id": str(c.id), "code": c.code}


@router.get("/admin")
async def admin_list_coupons(admin: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Coupon).order_by(Coupon.created_at.desc()))).scalars().all()
    return [
        {
            "id": str(c.id),
            "code": c.code,
            "title": c.title,
            "discount_type": c.discount_type,
            "discount_value": str(c.discount_value),
            "coupon_kind": c.coupon_kind,
            "is_active": c.is_active,
            "used_count": c.used_count,
            "expires_at": c.expires_at.isoformat() if c.expires_at else None,
        }
        for c in rows
    ]
