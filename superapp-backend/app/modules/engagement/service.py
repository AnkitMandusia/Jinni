"""Wallet ledger, referral rewards, delivery scheduling rules.

Money rules:
  * every balance change writes exactly one ledger row in the same transaction;
  * debits are a conditional UPDATE (`balance >= amount`), so two concurrent
    orders can never overdraw the wallet;
  * every credit carries an idempotency `ref`, so retries/duplicate hooks
    (e.g. two delivery-complete paths) can never pay twice.
Callers own the commit.
"""
import secrets
from datetime import datetime, timedelta
from decimal import Decimal
from typing import Optional
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.engagement.models import Referral, ReferralCode, Wallet, WalletTransaction

REFERRER_REWARD = Decimal("50.00")
REFEREE_REWARD = Decimal("50.00")
MAX_REWARDED_REFERRALS_PER_USER = 20  # abuse cap

MIN_SCHEDULE_LEAD = timedelta(minutes=30)
MAX_SCHEDULE_AHEAD = timedelta(hours=48)

_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/I


def normalize_schedule(value: Optional[datetime], now: Optional[datetime] = None) -> Optional[datetime]:
    """Validate a requested delivery slot; return naive UTC (or None for ASAP)."""
    if value is None:
        return None
    now = now or datetime.utcnow()
    if value.tzinfo is not None:
        from datetime import timezone
        value = value.astimezone(timezone.utc).replace(tzinfo=None)
    if value < now + MIN_SCHEDULE_LEAD:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pick a delivery time at least 30 minutes from now.")
    if value > now + MAX_SCHEDULE_AHEAD:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can schedule up to 48 hours ahead.")
    return value


def generate_code() -> str:
    return "JIN" + "".join(secrets.choice(_CODE_ALPHABET) for _ in range(6))


# ── wallet ───────────────────────────────────────────────────────────────────

async def get_balance(db: AsyncSession, user_id: UUID) -> Decimal:
    bal = (await db.execute(select(Wallet.balance).where(Wallet.user_id == user_id))).scalar_one_or_none()
    return Decimal(bal) if bal is not None else Decimal("0.00")


async def _ref_exists(db: AsyncSession, ref: Optional[str]) -> bool:
    if not ref:
        return False
    return (await db.execute(
        select(func.count()).select_from(WalletTransaction).where(WalletTransaction.ref == ref)
    )).scalar() > 0


async def credit(
    db: AsyncSession, user_id: UUID, amount: Decimal, kind: str,
    *, order_id: Optional[UUID] = None, ref: Optional[str] = None,
) -> bool:
    """Add money. Returns False (no-op) if `ref` was already applied."""
    if amount <= 0:
        raise ValueError("credit amount must be positive")
    if await _ref_exists(db, ref):
        return False
    await db.execute(
        pg_insert(Wallet).values(user_id=user_id, balance=Decimal("0.00")).on_conflict_do_nothing()
    )
    await db.execute(update(Wallet).where(Wallet.user_id == user_id).values(balance=Wallet.balance + amount))
    new_bal = await get_balance(db, user_id)
    db.add(WalletTransaction(user_id=user_id, amount=amount, balance_after=new_bal,
                             kind=kind, order_id=order_id, ref=ref))
    return True


async def debit(
    db: AsyncSession, user_id: UUID, amount: Decimal, kind: str,
    *, order_id: Optional[UUID] = None, ref: Optional[str] = None,
) -> None:
    """Spend money; raises 400 if the balance is insufficient."""
    if amount <= 0:
        raise ValueError("debit amount must be positive")
    res = await db.execute(
        update(Wallet)
        .where(Wallet.user_id == user_id, Wallet.balance >= amount)
        .values(balance=Wallet.balance - amount)
    )
    if res.rowcount != 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Insufficient wallet balance.")
    new_bal = await get_balance(db, user_id)
    db.add(WalletTransaction(user_id=user_id, amount=-amount, balance_after=new_bal,
                             kind=kind, order_id=order_id, ref=ref))


async def refund_wallet_order(db: AsyncSession, order) -> bool:
    """Give the money back for a cancelled/declined wallet-paid order (once)."""
    if order.payment_method != "wallet" or order.payment_status != "paid":
        return False
    done = await credit(db, order.customer_id, Decimal(order.total_amount), "order_refund",
                        order_id=order.id, ref=f"refund:{order.id}")
    if done:
        order.payment_status = "refunded"
    return done


# ── referrals ────────────────────────────────────────────────────────────────

async def get_or_create_code(db: AsyncSession, user_id: UUID) -> str:
    existing = (await db.execute(select(ReferralCode.code).where(ReferralCode.user_id == user_id))).scalar_one_or_none()
    if existing:
        return existing
    for _ in range(5):
        code = generate_code()
        taken = (await db.execute(select(func.count()).select_from(ReferralCode).where(ReferralCode.code == code))).scalar()
        if not taken:
            db.add(ReferralCode(user_id=user_id, code=code))
            await db.flush()
            return code
    raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Could not generate a referral code, try again.")


async def apply_code(db: AsyncSession, referee_id: UUID, code: str) -> None:
    """Link a new customer to their referrer. Allowed only before their first order."""
    from app.modules.orders.models import Order
    code = (code or "").strip().upper()
    referrer_id = (await db.execute(select(ReferralCode.user_id).where(ReferralCode.code == code))).scalar_one_or_none()
    if not referrer_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid referral code.")
    if referrer_id == referee_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't use your own referral code.")
    if (await db.execute(select(func.count()).select_from(Referral).where(Referral.referee_id == referee_id))).scalar():
        raise HTTPException(status.HTTP_409_CONFLICT, "A referral code is already applied to your account.")
    if (await db.execute(select(func.count()).select_from(Order).where(Order.customer_id == referee_id))).scalar():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Referral codes can only be applied before your first order.")
    db.add(Referral(referrer_id=referrer_id, referee_id=referee_id))


async def on_order_delivered(db: AsyncSession, order) -> None:
    """Pay referral rewards when the referee's FIRST order is delivered.

    Idempotent (ledger refs) so both delivery-complete paths (OTP and admin
    manual) can call it. Caller commits."""
    referral = (await db.execute(
        select(Referral).where(Referral.referee_id == order.customer_id, Referral.status == "pending").with_for_update()
    )).scalar_one_or_none()
    if not referral:
        return
    rewarded = (await db.execute(
        select(func.count()).select_from(Referral).where(
            Referral.referrer_id == referral.referrer_id, Referral.status == "rewarded")
    )).scalar() or 0
    base = f"referral:{referral.id}"
    await credit(db, order.customer_id, REFEREE_REWARD, "referral_reward", order_id=order.id, ref=f"{base}:referee")
    if rewarded < MAX_REWARDED_REFERRALS_PER_USER:
        await credit(db, referral.referrer_id, REFERRER_REWARD, "referral_reward", order_id=order.id, ref=f"{base}:referrer")
    referral.status = "rewarded"
    referral.rewarded_at = datetime.utcnow()
