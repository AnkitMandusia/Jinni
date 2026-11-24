"""Admin: business overview, rich order search/detail, and payment records (food + grocery + rides)."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_role
from app.modules.food.models import Restaurant
from app.modules.grocery.models import Category, Product
from app.modules.orders.models import Order, OrderItem
from app.modules.rides.models import Ride, RideSOS
from app.modules.users.models import StoreProfile, User

router = APIRouter(tags=["admin-insights"])

IST = timezone(timedelta(hours=5, minutes=30))
DEAD = ("cancelled", "rejected", "no_store_available")


def _f(x) -> float:
    return float(x or 0)


def _ist_day_start(days_ago: int = 0) -> datetime:
    """Midnight IST `days_ago` days back, as naive UTC (the DB stores naive UTC)."""
    now = datetime.now(IST)
    d = (now - timedelta(days=days_ago)).replace(hour=0, minute=0, second=0, microsecond=0)
    return d.astimezone(timezone.utc).replace(tzinfo=None)


async def _names(db: AsyncSession, ids: set) -> dict:
    """user_id -> display name (restaurant / store name when the user runs one)."""
    ids = {i for i in ids if i}
    if not ids:
        return {}
    out: dict = {}
    for uid, name in (await db.execute(select(User.id, User.name).where(User.id.in_(ids)))).all():
        out[uid] = name or "—"
    for uid, name in (await db.execute(select(Restaurant.owner_id, Restaurant.name).where(Restaurant.owner_id.in_(ids)))).all():
        out[uid] = name
    for uid, name in (await db.execute(select(StoreProfile.user_id, StoreProfile.store_name).where(StoreProfile.user_id.in_(ids)))).all():
        out[uid] = name
    return out


@router.get("/insights/overview")
async def overview(days: int = Query(7, ge=1, le=60), db: AsyncSession = Depends(get_db),
                   admin: User = Depends(require_role("admin"))):
    since = _ist_day_start(days - 1)
    today = _ist_day_start(0)
    live = Order.status.notin_(DEAD)

    async def order_agg(start):
        r = (await db.execute(select(func.count(), func.coalesce(func.sum(Order.total_amount), 0))
                              .where(Order.created_at >= start, live))).one()
        return {"orders": r[0], "sales": _f(r[1])}

    async def ride_agg(start):
        r = (await db.execute(select(func.count(), func.coalesce(func.sum(Ride.fare), 0))
                              .where(Ride.requested_at >= start, Ride.status == "completed"))).one()
        return {"rides": r[0], "fares": _f(r[1])}

    # per-day series (IST day buckets)
    series = []
    day_expr_o = func.date(func.timezone("Asia/Kolkata", func.timezone("UTC", Order.created_at)))
    day_expr_r = func.date(func.timezone("Asia/Kolkata", func.timezone("UTC", Ride.requested_at)))
    o_rows = (await db.execute(select(day_expr_o, Order.order_type, func.count(), func.coalesce(func.sum(Order.total_amount), 0))
                               .where(Order.created_at >= since, live).group_by(day_expr_o, Order.order_type))).all()
    r_rows = (await db.execute(select(day_expr_r, func.count(), func.coalesce(func.sum(Ride.fare), 0))
                               .where(Ride.requested_at >= since, Ride.status == "completed").group_by(day_expr_r))).all()
    for i in range(days - 1, -1, -1):
        d = (datetime.now(IST) - timedelta(days=i)).date()
        row = {"date": d.isoformat(), "food": 0.0, "grocery": 0.0, "rides": 0.0, "food_orders": 0, "grocery_orders": 0, "ride_count": 0}
        for day, typ, cnt, amt in o_rows:
            if day == d:
                key = "food" if str(typ) == "food" else "grocery"
                row[key] += _f(amt); row[f"{key}_orders"] += cnt
        for day, cnt, amt in r_rows:
            if day == d:
                row["rides"] += _f(amt); row["ride_count"] = cnt
        series.append(row)

    by_status = {s: c for s, c in (await db.execute(select(Order.status, func.count()).where(Order.created_at >= since).group_by(Order.status))).all()}
    pay = (await db.execute(select(Order.payment_method, Order.payment_status, func.count(), func.coalesce(func.sum(Order.total_amount), 0))
                            .where(Order.created_at >= since, live).group_by(Order.payment_method, Order.payment_status))).all()
    ride_pay = (await db.execute(select(Ride.payment_method, Ride.payment_status, func.count(), func.coalesce(func.sum(Ride.fare), 0))
                                 .where(Ride.requested_at >= since, Ride.status == "completed").group_by(Ride.payment_method, Ride.payment_status))).all()

    top = (await db.execute(
        select(OrderItem.product_name, func.sum(OrderItem.quantity), func.coalesce(func.sum(OrderItem.unit_price * OrderItem.quantity), 0))
        .join(Order, Order.id == OrderItem.order_id).where(Order.created_at >= since, live)
        .group_by(OrderItem.product_name).order_by(func.sum(OrderItem.quantity).desc()).limit(6))).all()

    by_seller = (await db.execute(
        select(Order.store_id, func.count(), func.coalesce(func.sum(Order.total_amount), 0))
        .where(Order.created_at >= since, live, Order.store_id.isnot(None))
        .group_by(Order.store_id).order_by(func.sum(Order.total_amount).desc()).limit(6))).all()
    names = await _names(db, {s for s, _, _ in by_seller})

    recent = (await db.execute(select(Order).order_by(Order.created_at.desc()).limit(8))).scalars().all()
    rnames = await _names(db, {o.store_id for o in recent})

    users_total = (await db.execute(select(func.count()).select_from(User))).scalar() or 0
    pending_partners = (await db.execute(select(func.count()).select_from(User).where(User.status == "pending_approval"))).scalar() or 0
    refunds = (await db.execute(select(func.count()).select_from(Order).where(Order.payment_status == "refund_pending"))).scalar() or 0
    open_sos = (await db.execute(select(func.count()).select_from(RideSOS).where(RideSOS.status == "open"))).scalar() or 0
    stuck = (await db.execute(select(func.count()).select_from(Order).where(Order.status.in_(("pending_dispatch", "no_store_available")),
                                                                            Order.created_at < datetime.utcnow() - timedelta(minutes=10)))).scalar() or 0

    return {
        "days": days,
        "today": {**await order_agg(today), **await ride_agg(today)},
        "period": {**await order_agg(since), **await ride_agg(since)},
        "series": series,
        "orders_by_status": by_status,
        "payments": {
            "orders": [{"method": m, "status": s, "count": c, "amount": _f(a)} for m, s, c, a in pay],
            "rides": [{"method": m, "status": s, "count": c, "amount": _f(a)} for m, s, c, a in ride_pay],
        },
        "top_items": [{"name": n, "qty": int(q or 0), "amount": _f(a)} for n, q, a in top],
        "top_sellers": [{"id": str(i), "name": names.get(i, "—"), "orders": c, "sales": _f(a)} for i, c, a in by_seller],
        "recent_orders": [{"id": str(o.id), "order_number": o.order_number, "order_type": str(o.order_type), "status": str(o.status),
                           "total_amount": _f(o.total_amount), "payment_method": str(o.payment_method), "payment_status": str(o.payment_status),
                           "seller": rnames.get(o.store_id, "—"), "created_at": o.created_at.isoformat()} for o in recent],
        "attention": {"pending_partners": pending_partners, "refunds_pending": refunds, "open_sos": open_sos, "stuck_orders": stuck},
        "users_total": users_total,
    }


def _order_query(status, payment_status, order_type, payment_method, q, date_from, date_to):
    f = []
    if status:
        f.append(Order.status == status)
    if payment_status:
        f.append(Order.payment_status == payment_status)
    if order_type:
        f.append(Order.order_type == order_type)
    if payment_method:
        f.append(Order.payment_method == payment_method)
    if q:
        f.append(Order.order_number.ilike(f"%{q.strip()}%"))
    if date_from:
        f.append(Order.created_at >= date_from)
    if date_to:
        f.append(Order.created_at < date_to + timedelta(days=1))
    return f


@router.get("/orders/search")
async def search_orders(
    status: Optional[str] = None, payment_status: Optional[str] = None, order_type: Optional[str] = None,
    payment_method: Optional[str] = None, q: Optional[str] = None,
    date_from: Optional[datetime] = None, date_to: Optional[datetime] = None,
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin")),
):
    """Order history with filters + names (richer than GET /admin/orders)."""
    where = _order_query(status, payment_status, order_type, payment_method, q, date_from, date_to)
    base = select(Order).where(*where)
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    sums = (await db.execute(select(func.coalesce(func.sum(Order.total_amount), 0))
                             .where(*where, Order.status.notin_(DEAD)))).scalar()
    rows = (await db.execute(base.order_by(Order.created_at.desc()).offset((page - 1) * page_size).limit(page_size))).scalars().all()
    names = await _names(db, {o.customer_id for o in rows} | {o.store_id for o in rows} | {o.delivery_agent_id for o in rows})
    return {
        "total": total, "page": page, "page_size": page_size, "sales_total": _f(sums),
        "orders": [{
            "id": str(o.id), "order_number": o.order_number, "order_type": str(o.order_type), "status": str(o.status),
            "customer": names.get(o.customer_id, "—"), "seller": names.get(o.store_id, "—") if o.store_id else None,
            "agent": names.get(o.delivery_agent_id) if o.delivery_agent_id else None,
            "subtotal": _f(o.subtotal), "delivery_fee": _f(o.delivery_fee), "tax": _f(o.tax), "discount": _f(o.discount),
            "total_amount": _f(o.total_amount), "payment_method": str(o.payment_method), "payment_status": str(o.payment_status),
            "created_at": o.created_at.isoformat(), "delivered_at": o.delivered_at.isoformat() if o.delivered_at else None,
        } for o in rows],
    }


@router.get("/orders/{order_id}/detail")
async def order_detail(order_id: UUID, db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin"))):
    o = (await db.execute(select(Order).where(Order.id == order_id))).scalar_one_or_none()
    if not o:
        raise HTTPException(404, "Order not found")
    items = (await db.execute(select(OrderItem).where(OrderItem.order_id == o.id))).scalars().all()
    users = {u.id: u for u in (await db.execute(select(User).where(User.id.in_({o.customer_id, o.store_id, o.delivery_agent_id} - {None})))).scalars().all()}
    names = await _names(db, {o.customer_id, o.store_id, o.delivery_agent_id})
    person = lambda uid: ({"name": names.get(uid), "phone": users[uid].phone} if uid in users else None)
    stamps = [("Placed", o.created_at), ("Accepted", o.accepted_at), ("Preparing", o.preparing_at), ("Ready", o.ready_at),
              ("Picked up", o.picked_up_at), ("Delivered", o.delivered_at), ("Cancelled", o.cancelled_at)]
    return {
        "id": str(o.id), "order_number": o.order_number, "order_type": str(o.order_type), "status": str(o.status),
        "customer": person(o.customer_id), "seller": person(o.store_id), "agent": person(o.delivery_agent_id),
        "delivery_address": o.delivery_address, "pickup_address": o.pickup_address,
        "items": [{"name": i.product_name, "qty": i.quantity, "unit_price": _f(i.unit_price), "subtotal": _f(i.unit_price * i.quantity)} for i in items],
        "subtotal": _f(o.subtotal), "delivery_fee": _f(o.delivery_fee), "tax": _f(o.tax), "discount": _f(o.discount),
        "coupon_code": o.coupon_code, "platform_dues": _f(o.platform_dues), "total_amount": _f(o.total_amount),
        "payment_method": str(o.payment_method), "payment_status": str(o.payment_status), "payment_id": o.payment_id,
        "payment_reference": o.payment_reference, "cancellation_reason": getattr(o, "cancellation_reason", None),
        "timeline": [{"label": l, "at": t.isoformat()} for l, t in stamps if t],
    }


@router.get("/insights/payments")
async def payments(days: int = Query(30, ge=1, le=365), method: Optional[str] = None, kind: Optional[str] = None,
                   db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin"))):
    """One ledger across food, grocery and rides: what was collected, what is still to collect, what must be refunded."""
    since = _ist_day_start(days - 1)
    rows: list[dict] = []
    if kind in (None, "food", "grocery"):
        qs = select(Order).where(Order.created_at >= since, Order.status.notin_(("rejected", "no_store_available")))
        if kind:
            qs = qs.where(Order.order_type == kind)
        for o in (await db.execute(qs.order_by(Order.created_at.desc()).limit(300))).scalars().all():
            rows.append({"kind": str(o.order_type), "ref": o.order_number, "amount": _f(o.total_amount), "method": str(o.payment_method),
                         "status": str(o.payment_status), "order_status": str(o.status), "txn": o.payment_id, "at": o.created_at.isoformat()})
    if kind in (None, "ride"):
        for r in (await db.execute(select(Ride).where(Ride.requested_at >= since, Ride.status.in_(("completed", "cancelled")))
                                   .order_by(Ride.requested_at.desc()).limit(300))).scalars().all():
            amt = _f(r.fare) if r.status == "completed" else _f(getattr(r, "cancellation_fee", 0))
            if amt <= 0:
                continue
            rows.append({"kind": "ride", "ref": r.ride_number, "amount": amt, "method": r.payment_method if r.status == "completed" else "dues",
                         "status": r.payment_status if r.status == "completed" else "pending", "order_status": r.status,
                         "txn": getattr(r, "payment_ref", None), "at": (r.requested_at or datetime.utcnow()).isoformat()})
    if method:
        rows = [r for r in rows if r["method"] == method]
    rows.sort(key=lambda r: r["at"], reverse=True)

    def total(pred):
        return round(sum(r["amount"] for r in rows if pred(r)), 2)

    return {
        "days": days,
        "collected": total(lambda r: r["status"] == "paid"),
        "to_collect": total(lambda r: r["status"] in ("pending",) and r["order_status"] not in ("cancelled",)),
        "refund_pending": total(lambda r: r["status"] == "refund_pending"),
        "refunded": total(lambda r: r["status"] == "refunded"),
        "by_method": {m: total(lambda r, m=m: r["method"] == m and r["status"] == "paid") for m in sorted({r["method"] for r in rows})},
        "rows": rows[:200],
    }


@router.get("/catalog/products")
async def catalog_products(
    search: Optional[str] = None, category_id: Optional[UUID] = None, owner_type: Optional[str] = None,
    low_stock: bool = False, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin")),
):
    """Full grocery catalogue for admins: stock, cost fields, owner (platform vs a store), active flag."""
    where = []
    if search:
        like = f"%{search.strip()}%"
        where.append(or_(Product.name.ilike(like), Product.brand.ilike(like), Product.barcode == search.strip(), Product.sku.ilike(like)))
    if category_id:
        where.append(Product.category_id == category_id)
    if owner_type:
        where.append(Product.owner_type == owner_type)
    if low_stock:
        where.append(Product.stock_quantity - Product.reserved_quantity <= Product.low_stock_threshold)
    base = select(Product, Category.name).join(Category, Category.id == Product.category_id, isouter=True).where(*where)
    total = (await db.execute(select(func.count()).select_from(select(Product.id).where(*where).subquery()))).scalar() or 0
    rows = (await db.execute(base.order_by(Product.name).offset((page - 1) * page_size).limit(page_size))).all()
    owners = await _names(db, {p.store_id for p, _ in rows})
    out = []
    for p, cat in rows:
        out.append({
            "id": str(p.id), "name": p.name, "brand": p.brand, "barcode": p.barcode, "sku": p.sku, "unit": p.unit,
            "price": _f(p.price), "mrp": _f(p.mrp) if p.mrp is not None else None,
            "stock_quantity": p.stock_quantity, "reserved_quantity": p.reserved_quantity, "low_stock_threshold": p.low_stock_threshold,
            "is_active": p.is_active, "owner_type": p.owner_type or "platform", "owner": owners.get(p.store_id) if p.store_id else "Jinni",
            "category_id": str(p.category_id), "category_name": cat, "primary_image_url": p.primary_image_url, "description": p.description,
            "image_urls": p.image_urls or [],
        })
    return {"items": out, "total": total, "page": page, "page_size": page_size}
