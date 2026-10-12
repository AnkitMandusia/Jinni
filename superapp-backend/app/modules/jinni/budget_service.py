"""
Atomic quota + budget enforcement — Prompt.txt section E.

Two independent gates:

1. Daily per-user quota (3 completed Jinni requests/day, voice+typed combined).
2. Monthly server-side Gemini Flash-Lite budget (₹500), shared across all users.

Both use `SELECT ... FOR UPDATE` so concurrent requests (duplicate taps,
two devices, retried network calls) cannot bypass the limit. Neither
gate blocks local deterministic search — only the Gemini fallback call
is budget-gated, and only *completing* a wish consumes the daily quota.
"""
from datetime import date, datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.jinni.models import JinniDailyUsage, JinniMonthlyBudget

DAILY_LIMIT = 3


def _month_key(d: date | None = None) -> str:
    d = d or date.today()
    return f"{d.year:04d}-{d.month:02d}"


async def get_daily_usage(db: AsyncSession, user_id: UUID) -> int:
    row = (
        await db.execute(
            select(JinniDailyUsage).where(
                JinniDailyUsage.user_id == user_id,
                JinniDailyUsage.usage_date == date.today(),
            )
        )
    ).scalar_one_or_none()
    return row.completed_count if row else 0


async def check_daily_limit(db: AsyncSession, user_id: UUID) -> tuple[int, int]:
    """Returns (used, limit). Does not consume — call at session start."""
    used = await get_daily_usage(db, user_id)
    return used, DAILY_LIMIT


async def consume_daily_quota(db: AsyncSession, user_id: UUID) -> int:
    """
    Atomically increments today's completed-wish count, capped at
    DAILY_LIMIT. Locks the row (or inserts it) inside the caller's
    transaction so two concurrent "complete" calls can't both succeed
    past the cap. Returns the new used count.
    """
    row = (
        await db.execute(
            select(JinniDailyUsage)
            .where(
                JinniDailyUsage.user_id == user_id,
                JinniDailyUsage.usage_date == date.today(),
            )
            .with_for_update()
        )
    ).scalar_one_or_none()

    if row is None:
        row = JinniDailyUsage(user_id=user_id, usage_date=date.today(), completed_count=0)
        db.add(row)
        await db.flush()

    row.completed_count = min(row.completed_count + 1, DAILY_LIMIT)
    await db.flush()
    return row.completed_count


async def get_budget_status(db: AsyncSession) -> dict:
    key = _month_key()
    row = (
        await db.execute(select(JinniMonthlyBudget).where(JinniMonthlyBudget.month_key == key))
    ).scalar_one_or_none()
    limit_paise = int(getattr(settings, "JINNI_MONTHLY_BUDGET_PAISE", 50_000))
    if row is None:
        return {"month": key, "limit_paise": limit_paise, "spent_paise": 0, "call_count": 0}
    return {
        "month": key,
        "limit_paise": row.limit_paise,
        "spent_paise": row.spent_paise,
        "call_count": row.call_count,
    }


async def try_reserve_budget(db: AsyncSession, estimated_cost_paise: int) -> bool:
    """
    Atomically checks whether `estimated_cost_paise` more paise can be
    spent this month without exceeding the budget, and if so reserves
    it immediately (so the caller can still "give back" the delta
    after the real Gemini call with `record_actual_spend`, but a crash
    in between fails safe — closed, not open).

    Returns True if reserved, False if the gate is closed.
    """
    key = _month_key()
    row = (
        await db.execute(
            select(JinniMonthlyBudget).where(JinniMonthlyBudget.month_key == key).with_for_update()
        )
    ).scalar_one_or_none()

    limit_paise = int(getattr(settings, "JINNI_MONTHLY_BUDGET_PAISE", 50_000))

    if row is None:
        row = JinniMonthlyBudget(month_key=key, limit_paise=limit_paise, spent_paise=0, call_count=0)
        db.add(row)
        await db.flush()

    if row.spent_paise + estimated_cost_paise > row.limit_paise:
        return False

    row.spent_paise += estimated_cost_paise
    row.call_count += 1
    await db.flush()
    return True


async def refund_budget(db: AsyncSession, paise: int) -> None:
    """Give back an over-estimated reservation (e.g. call failed before billing)."""
    if paise <= 0:
        return
    key = _month_key()
    row = (
        await db.execute(
            select(JinniMonthlyBudget).where(JinniMonthlyBudget.month_key == key).with_for_update()
        )
    ).scalar_one_or_none()
    if row is None:
        return
    row.spent_paise = max(0, row.spent_paise - paise)
    row.call_count = max(0, row.call_count - 1)
    await db.flush()
