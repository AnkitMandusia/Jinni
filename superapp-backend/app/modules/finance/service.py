"""Finance engine: settlement split per order/ride, party balances, platform revenue. See FINANCE.md for the model.

Sign convention for a party's `payable` (what the PLATFORM owes them):
    payable = earned - holds - paid_out + received_in
  * restaurant / store : earned = seller_amount of delivered orders, holds = 0
  * rider              : earned = delivery share + (ride fare - commission),
                         holds  = cash/UPI the rider collected from customers (COD orders + ride fares)
  payable > 0  -> pay them (payout);  payable < 0 -> they hold platform money (record a deposit).
"""
from collections import defaultdict
from datetime import datetime
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.finance.models import FinanceEntry, FinanceSettings
from app.modules.orders.models import Order
from app.modules.rides.models import Ride

D0 = Decimal("0.00")


def q2(x) -> Decimal:
    return Decimal(x or 0).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


async def get_settings(db: AsyncSession) -> FinanceSettings:
    s = (await db.execute(select(FinanceSettings).where(FinanceSettings.id == 1))).scalar_one_or_none()
    if not s:
        s = FinanceSettings(id=1)
        db.add(s)
        await db.flush()
    return s


# ── pure maths (unit-tested) ────────────────────────────────────────────────

def order_split(order, st) -> tuple[Decimal, Decimal, Decimal]:
    """(commission, seller_amount, rider_amount) for one delivered order."""
    sub = Decimal(order.subtotal or 0)
    pct = Decimal(st.food_commission_pct if str(order.order_type) == "food" else st.grocery_commission_pct)
    commission = q2(sub * pct / 100) if order.store_id else D0
    seller = q2(sub - commission) if order.store_id else D0
    rider = q2(Decimal(order.delivery_fee or 0) * Decimal(st.rider_delivery_share_pct) / 100) if order.delivery_agent_id else D0
    return commission, seller, rider


def ride_split(ride, st) -> tuple[Decimal, Decimal]:
    """(commission, rider_amount) for one completed ride."""
    fare = Decimal(ride.fare or 0)
    commission = q2(fare * Decimal(st.ride_commission_pct) / 100)
    return commission, q2(fare - commission)


def effective_order_split(order, st) -> tuple[Decimal, Decimal, Decimal]:
    if order.commission_amount is not None and order.seller_amount is not None and order.rider_amount is not None:
        return Decimal(order.commission_amount), Decimal(order.seller_amount), Decimal(order.rider_amount)
    return order_split(order, st)


def effective_ride_split(ride, st) -> tuple[Decimal, Decimal]:
    if ride.commission_amount is not None and ride.rider_amount is not None:
        return Decimal(ride.commission_amount), Decimal(ride.rider_amount)
    return ride_split(ride, st)


def signed_entry(e) -> Decimal:
    """+ means the party paid the platform, - means the platform paid the party."""
    amt = Decimal(e.amount)
    return amt if e.direction == "in" else -amt


def revenue_of_order(order, st) -> dict:
    """Platform's own money on one delivered order (tax is a pass-through, shown separately)."""
    commission, _seller, rider = effective_order_split(order, st)
    fee = Decimal(order.delivery_fee or 0)
    return {
        "commission": commission,
        "delivery_margin": q2(fee - rider) if order.delivery_agent_id else D0,
        "fees": Decimal(order.platform_dues or 0),
        "promos": -Decimal(order.discount or 0),
        "tax": Decimal(order.tax or 0),
    }


# ── snapshots (called when a job completes) ──────────────────────────────────

async def snapshot_order(db: AsyncSession, order: Order) -> None:
    if order.commission_amount is not None:
        return
    st = await get_settings(db)
    order.commission_amount, order.seller_amount, order.rider_amount = order_split(order, st)


async def snapshot_ride(db: AsyncSession, ride: Ride) -> None:
    if ride.commission_amount is not None:
        return
    st = await get_settings(db)
    ride.commission_amount, ride.rider_amount = ride_split(ride, st)


# ── ledger ───────────────────────────────────────────────────────────────────

def _blank(role: str) -> dict:
    return {"role": role, "earned": D0, "holds": D0, "paid_out": D0, "received_in": D0, "jobs": 0, "last_entry_at": None}


async def party_balances(db: AsyncSession, st: FinanceSettings) -> dict:
    """{user_id: {...}} for every restaurant / store / rider that has earned, held or been paid anything."""
    parties: dict = {}

    def get(uid, role):
        if uid not in parties:
            parties[uid] = _blank(role)
        return parties[uid]

    orders = (await db.execute(select(Order).where(Order.status == "delivered"))).scalars().all()
    for o in orders:
        _c, seller, rider = effective_order_split(o, st)
        if o.store_id:
            p = get(o.store_id, "restaurant" if str(o.order_type) == "food" else "store")
            p["earned"] += seller
            p["jobs"] += 1
        if o.delivery_agent_id:
            p = get(o.delivery_agent_id, "delivery")
            p["earned"] += rider
            p["jobs"] += 1
            if str(o.payment_method) == "cod":
                p["holds"] += Decimal(o.total_amount or 0)
    rides = (await db.execute(select(Ride).where(Ride.status == "completed", Ride.rider_id.isnot(None)))).scalars().all()
    for r in rides:
        _c, rider = effective_ride_split(r, st)
        p = get(r.rider_id, "delivery")
        p["earned"] += rider
        p["holds"] += Decimal(r.fare or 0) + Decimal(r.dues_amount or 0)
        p["jobs"] += 1
    for e in (await db.execute(select(FinanceEntry))).scalars().all():
        p = get(e.party_user_id, e.party_role)
        if e.direction == "in":
            p["received_in"] += Decimal(e.amount)
        else:
            p["paid_out"] += Decimal(e.amount)
        if not p["last_entry_at"] or e.created_at > p["last_entry_at"]:
            p["last_entry_at"] = e.created_at
    for p in parties.values():
        p["payable"] = q2(p["earned"] - p["holds"] - p["paid_out"] + p["received_in"])
    return parties


def platform_totals(orders, rides, st) -> dict:
    """Revenue + money-flow totals for a set of DELIVERED orders and COMPLETED rides."""
    rev = defaultdict(lambda: D0)
    gmv_orders = gmv_rides = D0
    by_method: dict = defaultdict(lambda: D0)
    for o in orders:
        for k, v in revenue_of_order(o, st).items():
            rev[k] += v
        gmv_orders += Decimal(o.total_amount or 0)
        by_method[str(o.payment_method)] += Decimal(o.total_amount or 0)
    for r in rides:
        commission, _ = effective_ride_split(r, st)
        rev["ride_commission"] += commission
        rev["fees"] += Decimal(r.dues_amount or 0)
        gmv_rides += Decimal(r.fare or 0) + Decimal(r.dues_amount or 0)
        by_method[f"ride_{r.payment_method}"] += Decimal(r.fare or 0) + Decimal(r.dues_amount or 0)
    platform_revenue = rev["commission"] + rev["delivery_margin"] + rev["ride_commission"] + rev["fees"] + rev["promos"]
    return {
        "gmv": q2(gmv_orders + gmv_rides), "gmv_orders": q2(gmv_orders), "gmv_rides": q2(gmv_rides),
        "revenue": q2(platform_revenue),
        "commission": q2(rev["commission"]), "delivery_margin": q2(rev["delivery_margin"]),
        "ride_commission": q2(rev["ride_commission"]), "fees": q2(rev["fees"]), "promos": q2(rev["promos"]),
        "tax_collected": q2(rev["tax"]), "by_method": {k: q2(v) for k, v in by_method.items()},
    }
