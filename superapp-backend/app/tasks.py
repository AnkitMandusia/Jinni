"""Lightweight background jobs (the architecture plan's "Celery + Redis" tier, sized for one city).

One asyncio loop per worker; a Redis lock (`bg:tasks:lock`, 55 s) makes sure only ONE worker runs a tick, so adding
API workers never duplicates work. Each job is idempotent and wrapped so one failure never stops the others.
To move to Celery later, keep these functions and call them from Celery beat instead of `run_forever`.
"""
import asyncio
import logging
from datetime import datetime, timedelta

from sqlalchemy import func, select, update

from app.database import AsyncSessionLocal
from app.modules.coupons.router import Coupon
from app.modules.grocery.models import Product
from app.modules.notifications.service import send_push_multicast
from app.modules.orders.models import Order
from app.modules.users.models import StoreProfile, User

logger = logging.getLogger(__name__)
TICK_SECONDS = 60
SCHEDULE_LEAD_MIN = 45     # a scheduled order is shown/pushed to sellers this long before it is due
STUCK_MIN = 10             # an order nobody accepted for this long alerts the admins


async def expire_coupons(db, redis) -> int:
    res = await db.execute(update(Coupon).where(Coupon.is_active == True, Coupon.expires_at.isnot(None),  # noqa: E712
                                                Coupon.expires_at < datetime.utcnow()).values(is_active=False))
    await db.commit()
    return res.rowcount or 0


async def _admin_tokens(db) -> list[str]:
    return [t for (t,) in (await db.execute(select(User.fcm_token).where(User.role == "admin", User.fcm_token.isnot(None)))).all() if t]


async def alert_stuck_orders(db, redis) -> int:
    """Admin push once per order that has waited STUCK_MIN+ minutes without a seller."""
    cutoff = datetime.utcnow() - timedelta(minutes=STUCK_MIN)
    rows = (await db.execute(select(Order).where(Order.status.in_(("pending_dispatch", "no_store_available")), Order.created_at < cutoff,
                                                 (Order.scheduled_for.is_(None)) | (Order.scheduled_for <= datetime.utcnow() + timedelta(minutes=SCHEDULE_LEAD_MIN))))).scalars().all()
    n = 0
    tokens = None
    for o in rows:
        if not await redis.set(f"bg:stuck:{o.id}", 1, nx=True, ex=6 * 3600):
            continue
        tokens = tokens if tokens is not None else await _admin_tokens(db)
        if tokens:
            await send_push_multicast(tokens, "Order waiting for a seller", f"#{o.order_number} has been waiting {STUCK_MIN}+ min", {"type": "stuck_order", "order_id": str(o.id)})
        n += 1
    return n


async def dispatch_due_scheduled(db, redis) -> int:
    """Scheduled orders are accepted into the queue immediately but sellers are only nudged when the slot is near."""
    horizon = datetime.utcnow() + timedelta(minutes=SCHEDULE_LEAD_MIN)
    rows = (await db.execute(select(Order).where(Order.status == "pending_dispatch", Order.scheduled_for.isnot(None), Order.scheduled_for <= horizon))).scalars().all()
    n = 0
    for o in rows:
        if not await redis.set(f"bg:sched:{o.id}", 1, nx=True, ex=24 * 3600):
            continue
        if o.store_id:   # food: a specific restaurant
            tokens = [t for (t,) in (await db.execute(select(User.fcm_token).where(User.id == o.store_id, User.fcm_token.isnot(None)))).all()]
        else:            # grocery: every open store covering the pincode
            tokens = [t for (t,) in (await db.execute(select(User.fcm_token).join(StoreProfile, StoreProfile.user_id == User.id).where(
                User.status == "active", StoreProfile.is_open == True, StoreProfile.pincode == o.delivery_pincode, User.fcm_token.isnot(None)))).all()]  # noqa: E712
        if tokens:
            await send_push_multicast(tokens, "🕒 Scheduled order is due soon", f"#{o.order_number} · ₹{o.total_amount}", {"type": "new_order", "order_id": str(o.id), "order_number": o.order_number})
        n += 1
    return n


async def low_stock_digest(db, redis) -> int:
    """Once a day: tell admins how many products are low / out of stock."""
    key = f"bg:lowstock:{datetime.utcnow():%Y-%m-%d}"
    if not await redis.set(key, 1, nx=True, ex=26 * 3600):
        return 0
    free = Product.stock_quantity - Product.reserved_quantity
    n = (await db.execute(select(func.count()).select_from(Product).where(Product.is_active == True, free <= Product.low_stock_threshold))).scalar() or 0  # noqa: E712
    if n:
        tokens = await _admin_tokens(db)
        if tokens:
            await send_push_multicast(tokens, "Low stock", f"{n} products are low or out of stock", {"type": "low_stock"})
    return n


JOBS = (expire_coupons, dispatch_due_scheduled, alert_stuck_orders, low_stock_digest)


async def tick(redis) -> dict:
    out = {}
    for job in JOBS:
        try:
            async with AsyncSessionLocal() as db:
                out[job.__name__] = await job(db, redis)
        except Exception:  # noqa: BLE001 - one bad job must not stop the rest
            logger.exception("background job %s failed", job.__name__)
    return out


async def run_forever(redis) -> None:
    await asyncio.sleep(5)
    while True:
        try:
            if await redis.set("bg:tasks:lock", 1, nx=True, ex=TICK_SECONDS - 5):
                await tick(redis)
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001
            logger.exception("background tick failed")
        await asyncio.sleep(TICK_SECONDS)
