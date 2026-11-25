"""Admin: financial dashboard, party balances, payouts / cash deposits ledger, commission settings, Paytm view."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings as app_settings
from app.database import get_db
from app.dependencies import require_role
from app.modules.finance import service as fin
from app.modules.finance.models import FinanceEntry, FinanceSettings
from app.modules.food.models import Restaurant
from app.modules.orders.models import Order
from app.modules.rides.models import Ride
from app.modules.users.models import StoreProfile, User

router = APIRouter(prefix="/finance", tags=["admin-finance"])
IST = timezone(timedelta(hours=5, minutes=30))


def _f(x) -> float:
    return float(x or 0)


def _day_start(days_ago: int) -> datetime:
    d = (datetime.now(IST) - timedelta(days=days_ago)).replace(hour=0, minute=0, second=0, microsecond=0)
    return d.astimezone(timezone.utc).replace(tzinfo=None)


async def _party_info(db: AsyncSession, ids: set) -> dict:
    """user_id -> {name, phone, upi, bank_account, bank_ifsc, role_name}"""
    if not ids:
        return {}
    out = {u.id: {"name": u.name or "—", "phone": u.phone, "upi": None, "bank_account": None, "bank_ifsc": None} for u in
           (await db.execute(select(User).where(User.id.in_(ids)))).scalars().all()}
    for r in (await db.execute(select(Restaurant).where(Restaurant.owner_id.in_(ids)))).scalars().all():
        out[r.owner_id].update(name=r.name, upi=getattr(r, "upi_id", None), bank_account=getattr(r, "bank_account", None), bank_ifsc=getattr(r, "bank_ifsc", None))
    for s in (await db.execute(select(StoreProfile).where(StoreProfile.user_id.in_(ids)))).scalars().all():
        out[s.user_id].update(name=s.store_name, upi=s.upi_id, bank_account=s.bank_account, bank_ifsc=s.bank_ifsc)
    from app.modules.users.models import DeliveryAgentProfile as DAP
    for d in (await db.execute(select(DAP).where(DAP.user_id.in_(ids)))).scalars().all():
        out[d.user_id].update(upi=d.upi_id, bank_account=d.bank_account, bank_ifsc=d.bank_ifsc)
    return out


def _party_row(uid, p, info) -> dict:
    i = info.get(uid, {})
    return {
        "user_id": str(uid), "role": p["role"], "name": i.get("name", "—"), "phone": i.get("phone"),
        "upi": i.get("upi"), "bank_account": ("••••" + i["bank_account"][-4:]) if i.get("bank_account") else None, "bank_ifsc": i.get("bank_ifsc"),
        "payout_ready": bool(i.get("upi") or i.get("bank_account")),
        "earned": _f(p["earned"]), "holds": _f(p["holds"]), "paid_out": _f(p["paid_out"]), "received_in": _f(p["received_in"]),
        "payable": _f(p["payable"]), "jobs": p["jobs"], "last_entry_at": p["last_entry_at"].isoformat() if p["last_entry_at"] else None,
    }


@router.get("/overview")
async def overview(days: int = Query(30, ge=1, le=365), db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin"))):
    st = await fin.get_settings(db)
    since = _day_start(days - 1)
    orders = (await db.execute(select(Order).where(Order.status == "delivered", Order.delivered_at >= since))).scalars().all()
    rides = (await db.execute(select(Ride).where(Ride.status == "completed", Ride.completed_at >= since))).scalars().all()
    tot = fin.platform_totals(orders, rides, st)

    # revenue per day (IST)
    series: dict = {}
    for i in range(days - 1, -1, -1):
        d = (datetime.now(IST) - timedelta(days=i)).date().isoformat()
        series[d] = {"date": d, "orders": [], "rides": []}
    for o in orders:
        d = (o.delivered_at.replace(tzinfo=timezone.utc).astimezone(IST)).date().isoformat()
        if d in series:
            series[d]["orders"].append(o)
    for r in rides:
        d = (r.completed_at.replace(tzinfo=timezone.utc).astimezone(IST)).date().isoformat()
        if d in series:
            series[d]["rides"].append(r)
    daily = []
    for d, v in series.items():
        t = fin.platform_totals(v["orders"], v["rides"], st)
        daily.append({"date": d, "gmv": _f(t["gmv"]), "revenue": _f(t["revenue"])})

    parties = await fin.party_balances(db, st)
    pay_sellers = sum(p["payable"] for p in parties.values() if p["role"] in ("restaurant", "store") and p["payable"] > 0)
    pay_riders = sum(p["payable"] for p in parties.values() if p["role"] == "delivery" and p["payable"] > 0)
    cash_riders = -sum(p["payable"] for p in parties.values() if p["role"] == "delivery" and p["payable"] < 0)

    online_q = select(func.coalesce(func.sum(Order.total_amount), 0)).where(Order.payment_method == "online", Order.payment_status == "paid", Order.created_at >= since)
    online_paid = (await db.execute(online_q)).scalar()
    wallet_used = (await db.execute(select(func.coalesce(func.sum(Order.total_amount), 0)).where(Order.payment_method == "wallet", Order.status != "cancelled", Order.created_at >= since))).scalar()
    refunds = (await db.execute(select(func.count(), func.coalesce(func.sum(Order.total_amount), 0)).where(Order.payment_status == "refund_pending"))).one()
    paid_out_period = (await db.execute(select(func.coalesce(func.sum(FinanceEntry.amount), 0)).where(FinanceEntry.direction == "out", FinanceEntry.created_at >= since))).scalar()
    deposits_period = (await db.execute(select(func.coalesce(func.sum(FinanceEntry.amount), 0)).where(FinanceEntry.direction == "in", FinanceEntry.created_at >= since))).scalar()

    return {
        "days": days,
        "gmv": _f(tot["gmv"]), "gmv_orders": _f(tot["gmv_orders"]), "gmv_rides": _f(tot["gmv_rides"]),
        "revenue": _f(tot["revenue"]),
        "revenue_breakdown": {"Seller commission": _f(tot["commission"]), "Delivery margin": _f(tot["delivery_margin"]),
                              "Ride commission": _f(tot["ride_commission"]), "Cancellation fees": _f(tot["fees"]), "Promos funded": _f(tot["promos"])},
        "tax_collected": _f(tot["tax_collected"]),
        "by_method": {k: _f(v) for k, v in tot["by_method"].items()},
        "daily": daily,
        "owed": {"to_sellers": _f(pay_sellers), "to_riders": _f(pay_riders), "cash_with_riders": _f(cash_riders)},
        "online_paid": _f(online_paid), "wallet_used": _f(wallet_used),
        "refunds_pending": {"count": refunds[0], "amount": _f(refunds[1])},
        "movements": {"paid_out": _f(paid_out_period), "deposits_received": _f(deposits_period)},
        "rates": {"food": _f(st.food_commission_pct), "grocery": _f(st.grocery_commission_pct), "rider_share": _f(st.rider_delivery_share_pct), "ride": _f(st.ride_commission_pct)},
        "counts": {"orders": len(orders), "rides": len(rides)},
        "min_payout": _f(st.min_payout),
    }


@router.get("/parties")
async def parties(role: Optional[str] = Query(None, pattern="^(restaurant|store|delivery)$"), only_due: bool = False,
                  db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin"))):
    st = await fin.get_settings(db)
    bal = await fin.party_balances(db, st)
    info = await _party_info(db, set(bal))
    rows = [_party_row(uid, p, info) for uid, p in bal.items() if (not role or p["role"] == role)]
    if only_due:
        rows = [r for r in rows if abs(r["payable"]) >= 1]
    rows.sort(key=lambda r: -abs(r["payable"]))
    return {"parties": rows, "min_payout": _f(st.min_payout)}


@router.get("/parties/{user_id}/statement")
async def statement(user_id: UUID, db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin"))):
    st = await fin.get_settings(db)
    bal = (await fin.party_balances(db, st)).get(user_id)
    info = await _party_info(db, {user_id})
    if not bal and user_id not in info:
        raise HTTPException(404, "Party not found")
    bal = bal or fin._blank("delivery") | {"payable": Decimal("0")}
    lines = []
    for o in (await db.execute(select(Order).where(Order.status == "delivered", (Order.store_id == user_id) | (Order.delivery_agent_id == user_id)).order_by(Order.delivered_at.desc()).limit(60))).scalars().all():
        _c, seller, rider = fin.effective_order_split(o, st)
        is_seller = o.store_id == user_id
        lines.append({"at": (o.delivered_at or o.created_at).isoformat(), "kind": str(o.order_type), "ref": o.order_number,
                      "earned": _f(seller if is_seller else rider),
                      "held": _f(o.total_amount) if (not is_seller and str(o.payment_method) == "cod") else 0, "note": f"{str(o.payment_method).upper()} · ₹{_f(o.total_amount):.0f}"})
    for r in (await db.execute(select(Ride).where(Ride.status == "completed", Ride.rider_id == user_id).order_by(Ride.completed_at.desc()).limit(60))).scalars().all():
        _c, rider = fin.effective_ride_split(r, st)
        lines.append({"at": (r.completed_at or r.requested_at).isoformat(), "kind": "ride", "ref": r.ride_number, "earned": _f(rider),
                      "held": _f(Decimal(r.fare) + Decimal(r.dues_amount or 0)), "note": f"{r.payment_method.upper()} · fare ₹{_f(r.fare):.0f}"})
    lines.sort(key=lambda x: x["at"], reverse=True)
    entries = (await db.execute(select(FinanceEntry).where(FinanceEntry.party_user_id == user_id).order_by(FinanceEntry.created_at.desc()).limit(60))).scalars().all()
    return {"party": _party_row(user_id, bal, info), "lines": lines[:80], "entries": [_entry(e) for e in entries]}


def _entry(e: FinanceEntry) -> dict:
    return {"id": str(e.id), "party_user_id": str(e.party_user_id), "party_role": e.party_role, "kind": e.kind, "amount": _f(e.amount),
            "direction": e.direction, "method": e.method, "reference": e.reference, "note": e.note, "created_at": e.created_at.isoformat()}


class EntryIn(BaseModel):
    party_user_id: UUID
    kind: str = Field(pattern="^(payout|deposit|adjustment)$")
    amount: Decimal = Field(gt=0, le=Decimal("10000000"))
    direction: Optional[str] = Field(None, pattern="^(in|out)$")      # only for adjustment
    method: str = Field("upi", pattern="^(upi|bank|cash)$")
    reference: Optional[str] = Field(None, max_length=100)
    note: Optional[str] = Field(None, max_length=500)

    @field_validator("amount")
    @classmethod
    def two_places(cls, v: Decimal) -> Decimal:
        return v.quantize(Decimal("0.01"))


@router.post("/entries", status_code=201)
async def create_entry(body: EntryIn, db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin"))):
    """Record money that actually moved. payout = we paid them; deposit = a rider handed us cash/UPI; adjustment = correction."""
    st = await fin.get_settings(db)
    bal = (await fin.party_balances(db, st)).get(body.party_user_id)
    if not bal:
        raise HTTPException(404, "This account has no earnings or cash yet")
    role = bal["role"]
    if body.kind == "deposit" and role != "delivery":
        raise HTTPException(400, "Only riders deposit cash")
    if body.kind == "adjustment":
        if not body.direction or not (body.note and len(body.note) >= 5):
            raise HTTPException(400, "An adjustment needs a direction and a reason (5+ characters)")
        direction = body.direction
    else:
        direction = "out" if body.kind == "payout" else "in"
    payable = bal["payable"]
    if body.kind == "payout" and body.amount > payable:
        raise HTTPException(409, f"Payout ₹{body.amount} is more than the ₹{payable} currently owed")
    if body.kind == "deposit" and body.amount > -payable:
        raise HTTPException(409, f"Deposit ₹{body.amount} is more than the ₹{-payable} the rider holds")
    if body.method in ("upi", "bank") and body.kind != "adjustment" and not (body.reference and len(body.reference.strip()) >= 6):
        raise HTTPException(400, "Enter the UTR / transaction id so the payment can be traced")
    if body.reference:
        dup = (await db.execute(select(FinanceEntry.id).where(FinanceEntry.party_user_id == body.party_user_id, FinanceEntry.reference == body.reference.strip()))).first()
        if dup:
            raise HTTPException(409, "That reference was already recorded for this account")
    e = FinanceEntry(party_user_id=body.party_user_id, party_role=role, kind=body.kind, amount=body.amount, direction=direction,
                     method=body.method, reference=body.reference.strip() if body.reference else None, note=body.note, created_by=admin.id)
    db.add(e)
    await db.commit()
    await db.refresh(e)
    return _entry(e)


@router.get("/entries")
async def entries(days: int = Query(30, ge=1, le=365), kind: Optional[str] = None, db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin"))):
    q = select(FinanceEntry).where(FinanceEntry.created_at >= _day_start(days - 1))
    if kind:
        q = q.where(FinanceEntry.kind == kind)
    rows = (await db.execute(q.order_by(FinanceEntry.created_at.desc()).limit(200))).scalars().all()
    info = await _party_info(db, {e.party_user_id for e in rows})
    return {"entries": [{**_entry(e), "party": info.get(e.party_user_id, {}).get("name", "—")} for e in rows]}


class SettingsIn(BaseModel):
    food_commission_pct: Decimal = Field(ge=0, le=60)
    grocery_commission_pct: Decimal = Field(ge=0, le=60)
    rider_delivery_share_pct: Decimal = Field(ge=0, le=100)
    ride_commission_pct: Decimal = Field(ge=0, le=60)
    min_payout: Decimal = Field(ge=0, le=100000)
    payout_cycle_days: int = Field(ge=1, le=31)
    platform_upi_id: Optional[str] = Field(None, pattern=r"^[\w.\-]{2,}@[\w.\-]{2,}$")


def _settings_dict(st: FinanceSettings) -> dict:
    return {"food_commission_pct": _f(st.food_commission_pct), "grocery_commission_pct": _f(st.grocery_commission_pct),
            "rider_delivery_share_pct": _f(st.rider_delivery_share_pct), "ride_commission_pct": _f(st.ride_commission_pct),
            "min_payout": _f(st.min_payout), "payout_cycle_days": st.payout_cycle_days, "platform_upi_id": st.platform_upi_id}


@router.get("/settings")
async def get_settings(db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin"))):
    st = await fin.get_settings(db)
    await db.commit()
    return _settings_dict(st)


@router.put("/settings")
async def put_settings(body: SettingsIn, db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin"))):
    """Rates apply to jobs that complete AFTER the change; completed jobs keep the split they were frozen with."""
    st = await fin.get_settings(db)
    for k, v in body.model_dump().items():
        setattr(st, k, v)
    await db.commit()
    return _settings_dict(st)


@router.get("/online")
async def online_payments(days: int = Query(30, ge=1, le=365), db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin"))):
    """Paytm (online) payments from our side; reconcile against the Paytm dashboard (TXNID column)."""
    since = _day_start(days - 1)
    rows = (await db.execute(select(Order).where(Order.payment_method == "online", Order.created_at >= since).order_by(Order.created_at.desc()).limit(200))).scalars().all()
    return {
        "gateway": {"name": "Paytm", "environment": app_settings.PAYTM_ENVIRONMENT, "configured": bool(app_settings.PAYTM_MERCHANT_ID and app_settings.PAYTM_MERCHANT_KEY),
                    "merchant_id": (app_settings.PAYTM_MERCHANT_ID[:4] + "••••") if app_settings.PAYTM_MERCHANT_ID else None},
        "paid": _f(sum(Decimal(o.total_amount) for o in rows if o.payment_status == "paid")),
        "refund_pending": _f(sum(Decimal(o.total_amount) for o in rows if o.payment_status == "refund_pending")),
        "transactions": [{"order_number": o.order_number, "amount": _f(o.total_amount), "status": str(o.payment_status), "order_status": str(o.status),
                          "txn_id": o.payment_id, "reference": o.payment_reference, "at": o.created_at.isoformat()} for o in rows],
    }
