"""Add jinni_daily_usage, jinni_monthly_budget, jinni_sessions tables.

Replaces the in-memory dicts previously used by app.modules.jinni.router
(_MEM_USAGE / _MEM_SESSIONS) with persistent, lockable tables so the
daily per-user quota and the monthly Gemini budget survive restarts and
stay correct under concurrent requests. See
app/modules/jinni/models.py and app/modules/jinni/budget_service.py.

Revision ID: 0012
Revises: 0011
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012"
down_revision: Union[str, None] = "0011"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "jinni_daily_usage",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("usage_date", sa.Date(), nullable=False, index=True),
        sa.Column("completed_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("user_id", "usage_date", name="uq_jinni_daily_usage_user_date"),
    )

    op.create_table(
        "jinni_monthly_budget",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("month_key", sa.String(length=7), nullable=False, unique=True, index=True),
        sa.Column("limit_paise", sa.BigInteger(), nullable=False, server_default="50000"),
        sa.Column("spent_paise", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("call_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "jinni_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("session_token", sa.String(length=64), nullable=False, unique=True, index=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False, index=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="reserved"),
        sa.Column("used_gemini", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("jinni_sessions")
    op.drop_table("jinni_monthly_budget")
    op.drop_table("jinni_daily_usage")
