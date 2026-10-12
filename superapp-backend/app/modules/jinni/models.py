"""
Jinni persistence — Prompt.txt section E.

Two small tables replace the in-memory dicts that used to back
app.modules.jinni.router:

- JinniDailyUsage:   one row per (user_id, usage_date). Source of truth
  for the "3 completed Jinni requests per user per day" quota.
- JinniMonthlyBudget: one row per calendar month (month_key = 'YYYY-MM').
  Source of truth for the persistent ₹500/month Gemini Flash-Lite budget.

Both are updated with `SELECT ... FOR UPDATE` row locks inside a single
transaction so concurrent requests (two tabs, retries, duplicate taps)
can't double-spend or double-count. See budget_service.py and
router.py for the atomic read-modify-write helpers.
"""
from datetime import date
from uuid import uuid4

from sqlalchemy import Column, String, Integer, BigInteger, Date, DateTime, Uuid, UniqueConstraint, func

from app.database import Base

# sqlalchemy.Uuid (generic, SQLAlchemy >= 2.0) instead of the Postgres-only
# dialect type: renders as native UUID on Postgres (production/dev) and as
# CHAR(32) on SQLite, so the same models work in the in-memory SQLite tests
# in tests/test_jinni.py without needing a live Postgres instance.
UUID = Uuid


class JinniDailyUsage(Base):
    """Completed Jinni wishes (voice + typed, combined) per user per day."""

    __tablename__ = "jinni_daily_usage"
    __table_args__ = (
        UniqueConstraint("user_id", "usage_date", name="uq_jinni_daily_usage_user_date"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    usage_date = Column(Date, nullable=False, default=date.today, index=True)
    completed_count = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class JinniMonthlyBudget(Base):
    """
    Persistent Gemini Flash-Lite spend tracker.

    Amounts are stored in paise (1 INR = 100 paise) to avoid floating
    point drift across many small increments.
    """

    __tablename__ = "jinni_monthly_budget"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    month_key = Column(String(7), nullable=False, unique=True, index=True)  # 'YYYY-MM'
    limit_paise = Column(BigInteger, nullable=False, default=50_000)  # ₹500.00
    spent_paise = Column(BigInteger, nullable=False, default=0)
    call_count = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class JinniSession(Base):
    """
    A single wish attempt (voice or typed). Mirrors the old in-memory
    _MEM_SESSIONS dict so cancel/complete/idempotency keeps working,
    but survives process restarts and is inspectable.
    """

    __tablename__ = "jinni_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    session_token = Column(String(64), nullable=False, unique=True, index=True)
    user_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    status = Column(String(16), nullable=False, default="reserved")  # reserved|completed|cancelled
    used_gemini = Column(Integer, nullable=False, default=0)  # 0/1 boolean (portable)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
