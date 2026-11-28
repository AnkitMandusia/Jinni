"""Finance: settings, manual ledger, per-order / per-ride settlement amounts, store payout fields.

Revision ID: 0021
Revises: 0020
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0021"
down_revision: Union[str, None] = "0020"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "finance_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("food_commission_pct", sa.Numeric(5, 2), nullable=False, server_default="15.00"),
        sa.Column("grocery_commission_pct", sa.Numeric(5, 2), nullable=False, server_default="8.00"),
        sa.Column("rider_delivery_share_pct", sa.Numeric(5, 2), nullable=False, server_default="100.00"),
        sa.Column("ride_commission_pct", sa.Numeric(5, 2), nullable=False, server_default="10.00"),
        sa.Column("min_payout", sa.Numeric(8, 2), nullable=False, server_default="100.00"),
        sa.Column("payout_cycle_days", sa.Integer(), nullable=False, server_default="7"),
        sa.Column("platform_upi_id", sa.String(100), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    op.execute("INSERT INTO finance_settings (id) VALUES (1)")
    op.create_table(
        "finance_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("party_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("party_role", sa.String(20), nullable=False),
        sa.Column("kind", sa.String(12), nullable=False),
        sa.Column("amount", sa.Numeric(12, 2), nullable=False),
        sa.Column("direction", sa.String(8), nullable=False, server_default="out"),
        sa.Column("method", sa.String(10), nullable=False, server_default="upi"),
        sa.Column("reference", sa.String(100), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True, index=True),
    )
    op.create_index("idx_fin_party_time", "finance_entries", ["party_user_id", "created_at"])
    for tbl in ("orders",):
        op.add_column(tbl, sa.Column("commission_amount", sa.Numeric(10, 2), nullable=True))
        op.add_column(tbl, sa.Column("seller_amount", sa.Numeric(10, 2), nullable=True))
        op.add_column(tbl, sa.Column("rider_amount", sa.Numeric(10, 2), nullable=True))
    op.add_column("rides", sa.Column("commission_amount", sa.Numeric(8, 2), nullable=True))
    op.add_column("rides", sa.Column("rider_amount", sa.Numeric(8, 2), nullable=True))


def downgrade() -> None:
    op.drop_column("rides", "rider_amount")
    op.drop_column("rides", "commission_amount")
    for c in ("rider_amount", "seller_amount", "commission_amount"):
        op.drop_column("orders", c)
    op.drop_index("idx_fin_party_time", table_name="finance_entries")
    op.drop_table("finance_entries")
    op.drop_table("finance_settings")
