"""User addresses + coupons (admin-controlled).

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-08
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008"
down_revision: Union[str, None] = "0007"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _table_exists(conn, table_name: str) -> bool:
    result = conn.execute(
        sa.text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.tables "
            "WHERE table_schema='public' AND table_name=:t)"
        ),
        {"t": table_name},
    )
    return bool(result.scalar())


def upgrade() -> None:
    bind = op.get_bind()

    if not _table_exists(bind, "user_addresses"):
        op.create_table(
            "user_addresses",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("label", sa.String(40), nullable=False, server_default="Home"),
            sa.Column("line1", sa.String(255), nullable=False),
            sa.Column("line2", sa.String(255), nullable=True),
            sa.Column("city", sa.String(100), nullable=False),
            sa.Column("state", sa.String(100), nullable=False),
            sa.Column("pincode", sa.String(10), nullable=False),
            sa.Column("landmark", sa.String(255), nullable=True),
            sa.Column("latitude", sa.Float(), nullable=True),
            sa.Column("longitude", sa.Float(), nullable=True),
            sa.Column("is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )
        op.create_index("ix_user_addresses_user_id", "user_addresses", ["user_id"])

    if not _table_exists(bind, "coupons"):
        op.create_table(
            "coupons",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("code", sa.String(40), nullable=False, unique=True),
            sa.Column("title", sa.String(120), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            # percent | flat
            sa.Column("discount_type", sa.String(20), nullable=False, server_default="flat"),
            sa.Column("discount_value", sa.Numeric(10, 2), nullable=False),
            sa.Column("max_discount", sa.Numeric(10, 2), nullable=True),
            sa.Column("min_order_amount", sa.Numeric(10, 2), nullable=False, server_default="0"),
            # food | grocery | all
            sa.Column("applies_to", sa.String(20), nullable=False, server_default="all"),
            # first_order | one_time | repeat | timed
            sa.Column("coupon_kind", sa.String(20), nullable=False, server_default="one_time"),
            sa.Column("max_uses_total", sa.Integer(), nullable=True),
            sa.Column("max_uses_per_user", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("used_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("starts_at", sa.DateTime(), nullable=True),
            sa.Column("expires_at", sa.DateTime(), nullable=True),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )
        op.create_index("ix_coupons_code", "coupons", ["code"], unique=True)

    if not _table_exists(bind, "coupon_redemptions"):
        op.create_table(
            "coupon_redemptions",
            sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
            sa.Column("coupon_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("coupons.id", ondelete="CASCADE"), nullable=False),
            sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("order_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("orders.id", ondelete="SET NULL"), nullable=True),
            sa.Column("discount_amount", sa.Numeric(10, 2), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.text("CURRENT_TIMESTAMP")),
        )
        op.create_index("ix_coupon_redemptions_user", "coupon_redemptions", ["user_id", "coupon_id"])


def downgrade() -> None:
    op.drop_table("coupon_redemptions")
    op.drop_table("coupons")
    op.drop_table("user_addresses")
