"""Admin: grocery / general store partners — onboarding review, health, payouts readiness and controls."""
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_role
from app.modules.finance import service as fin
from app.modules.grocery.models import Product
from app.modules.orders.models import Order
from app.modules.users.models import StoreProfile, User

router = APIRouter(prefix="/stores", tags=["admin-stores"])


def _f(x) -> float:
    return float(x or 0)


def _checks(sp: StoreProfile) -> list[dict]:
    """What a real store needs before it can take orders and be paid. Admin sees what is still missing."""
    has_loc = sp.latitude is not None and sp.longitude is not None
    return [
        {"key": "address", "label": "Address & pincode", "ok": bool(sp.address and sp.pincode), "required": True},
        {"key": "location", "label": "Map location (for delivery radius)", "ok": has_loc, "required": False},
        {"key": "gstin", "label": "GSTIN", "ok": bool(sp.gstin), "required": False},
        {"key": "fssai", "label": "FSSAI licence (food items)", "ok": bool(sp.fssai), "required": False},
        {"key": "payout", "label": "Payout account (UPI or bank)", "ok": bool(sp.upi_id or (sp.bank_account and sp.bank_ifsc)), "required": True},
    ]


def _row(u: User, sp: StoreProfile, stats: dict, balance: dict | None) -> dict:
    checks = _checks(sp)
    return {
        "user_id": str(u.id), "store_name": sp.store_name, "owner_name": sp.owner_name, "phone": u.phone, "email": u.email,
        "account_status": u.status, "is_open": bool(sp.is_open), "address": sp.address, "city": sp.city, "pincode": sp.pincode,
        "delivery_radius_km": sp.delivery_radius_km, "gstin": sp.gstin, "fssai": sp.fssai, "upi_id": sp.upi_id,
        "bank_account": ("••••" + sp.bank_account[-4:]) if sp.bank_account else None, "bank_ifsc": sp.bank_ifsc,
        "latitude": sp.latitude, "longitude": sp.longitude, "rating": sp.rating, "rating_count": sp.rating_count,
        "joined_at": u.created_at.isoformat() if u.created_at else None, "approved_at": None,
        "checks": checks, "ready": all(c["ok"] for c in checks if c["required"]),
        **stats,
        "payable": _f(balance["payable"]) if balance else 0.0, "earned": _f(balance["earned"]) if balance else 0.0,
        "paid_out": _f(balance["paid_out"]) if balance else 0.0,
    }


async def _stats(db: AsyncSession, ids: list) -> dict:
    out = {i: {"orders": 0, "delivered": 0, "cancelled": 0, "sales": 0.0, "products": 0, "active_products": 0, "low_stock": 0, "out_of_stock": 0, "last_order_at": None} for i in ids}
    if not ids:
        return out
    for sid, tot, dl, cx, sales, last in (await db.execute(
        select(Order.store_id, func.count(),
               func.sum(case((Order.status == "delivered", 1), else_=0)),
               func.sum(case((Order.status.in_(("cancelled", "rejected")), 1), else_=0)),
               func.coalesce(func.sum(case((Order.status == "delivered", Order.subtotal), else_=0)), 0),
               func.max(Order.created_at)).where(Order.store_id.in_(ids)).group_by(Order.store_id))).all():
        out[sid].update(orders=tot, delivered=int(dl or 0), cancelled=int(cx or 0), sales=_f(sales), last_order_at=last.isoformat() if last else None)
    avail = Product.stock_quantity - Product.reserved_quantity
    for sid, n, act, low, oos in (await db.execute(
        select(Product.store_id, func.count(), func.sum(case((Product.is_active == True, 1), else_=0)),  # noqa: E712
               func.sum(case((avail <= Product.low_stock_threshold, 1), else_=0)),
               func.sum(case((avail <= 0, 1), else_=0))).where(Product.store_id.in_(ids)).group_by(Product.store_id))).all():
        out[sid].update(products=n, active_products=int(act or 0), low_stock=int(low or 0), out_of_stock=int(oos or 0))
    return out


@router.get("")
async def list_stores(state: str = Query("all", pattern="^(all|pending|verified|inactive|rejected)$"), search: Optional[str] = None,
                      page: int = Query(1, ge=1), page_size: int = Query(30, ge=1, le=100),
                      db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin"))):
    q = select(User, StoreProfile).join(StoreProfile, StoreProfile.user_id == User.id).where(User.role == "store")
    if state == "pending":
        q = q.where(User.status == "pending_approval")
    elif state == "verified":
        q = q.where(User.status == "active")
    elif state == "inactive":
        q = q.where(User.status == "suspended")
    elif state == "rejected":
        q = q.where(User.status == "rejected")
    if search:
        like = f"%{search.strip()}%"
        q = q.where(or_(StoreProfile.store_name.ilike(like), StoreProfile.owner_name.ilike(like), StoreProfile.city.ilike(like), User.phone.ilike(like)))
    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
    rows = (await db.execute(q.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size))).all()
    stats = await _stats(db, [u.id for u, _ in rows])
    st = await fin.get_settings(db)
    bal = await fin.party_balances(db, st)
    counts = {s: (await db.execute(select(func.count()).select_from(User).where(User.role == "store", User.status == s))).scalar() or 0
              for s in ("pending_approval", "active", "suspended", "rejected")}
    return {"stores": [_row(u, sp, stats[u.id], bal.get(u.id)) for u, sp in rows], "total": total, "page": page, "page_size": page_size, "counts": counts}


async def _load(db: AsyncSession, user_id: UUID):
    row = (await db.execute(select(User, StoreProfile).join(StoreProfile, StoreProfile.user_id == User.id).where(User.id == user_id, User.role == "store"))).first()
    if not row:
        raise HTTPException(404, "Store not found")
    return row


@router.get("/{user_id}")
async def store_detail(user_id: UUID, db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin"))):
    u, sp = await _load(db, user_id)
    stats = (await _stats(db, [u.id]))[u.id]
    st = await fin.get_settings(db)
    bal = (await fin.party_balances(db, st)).get(u.id)
    recent = (await db.execute(select(Order).where(Order.store_id == u.id).order_by(Order.created_at.desc()).limit(10))).scalars().all()
    low = (await db.execute(select(Product).where(Product.store_id == u.id, (Product.stock_quantity - Product.reserved_quantity) <= Product.low_stock_threshold).order_by(Product.stock_quantity).limit(10))).scalars().all()
    return {**_row(u, sp, stats, bal),
            "recent_orders": [{"order_number": o.order_number, "status": str(o.status), "total_amount": _f(o.total_amount), "payment_method": str(o.payment_method), "at": o.created_at.isoformat()} for o in recent],
            "low_stock_items": [{"name": p.name, "free": p.stock_quantity - p.reserved_quantity, "threshold": p.low_stock_threshold} for p in low]}


class StorePatch(BaseModel):
    is_open: Optional[bool] = None
    delivery_radius_km: Optional[float] = Field(None, ge=0.5, le=30)


@router.patch("/{user_id}")
async def patch_store(user_id: UUID, body: StorePatch, db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin"))):
    u, sp = await _load(db, user_id)
    if body.is_open is not None:
        sp.is_open = body.is_open
    if body.delivery_radius_km is not None:
        sp.delivery_radius_km = body.delivery_radius_km
    await db.commit()
    return {"ok": True, "is_open": sp.is_open, "delivery_radius_km": sp.delivery_radius_km}


@router.post("/{user_id}/{action}")
async def store_action(user_id: UUID, action: str, db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin"))):
    """verify (approve) · reject · suspend (also closes the store) · reactivate."""
    if action not in ("verify", "reject", "suspend", "reactivate"):
        raise HTTPException(404, "Unknown action")
    u, sp = await _load(db, user_id)
    if action in ("verify", "reactivate"):
        missing = [c["label"] for c in _checks(sp) if c["required"] and not c["ok"]]
        if missing and action == "verify":
            raise HTTPException(409, "Cannot approve yet — missing: " + ", ".join(missing))
        u.status = "active"
        sp.approved_by = admin.id
    elif action == "reject":
        u.status = "rejected"
        sp.is_open = False
    else:
        u.status = "suspended"
        sp.is_open = False
    await db.commit()
    return {"ok": True, "account_status": u.status, "is_open": sp.is_open}
