"""Wallet ledger, referrals, shopping lists, scheduled delivery.

Revision ID: 0016
Revises: 0015
"""
from typing import Sequence, Union
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "0016"
down_revision: Union[str, None] = "0015"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.add_column("orders", sa.Column("scheduled_for", sa.DateTime(), nullable=True))

    op.create_table(
        "wallets",
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("balance", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime()),
        sa.CheckConstraint("balance >= 0", name="ck_wallet_balance_non_negative"),
    )
    op.create_table(
        "wallet_transactions",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("balance_after", sa.Numeric(10, 2), nullable=False),
        sa.Column("kind", sa.String(30), nullable=False),
        sa.Column("order_id", UUID, sa.ForeignKey("orders.id", ondelete="SET NULL"), nullable=True),
        sa.Column("ref", sa.String(100), nullable=True, unique=True),
        sa.Column("created_at", sa.DateTime(), index=True),
    )
    op.create_table(
        "referral_codes",
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("code", sa.String(12), nullable=False, unique=True, index=True),
    )
    op.create_table(
        "referrals",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("referrer_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("referee_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("created_at", sa.DateTime()),
        sa.Column("rewarded_at", sa.DateTime(), nullable=True),
    )
    op.create_table(
        "shopping_lists",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("user_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("created_at", sa.DateTime()),
    )
    op.create_table(
        "shopping_list_items",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("list_id", UUID, sa.ForeignKey("shopping_lists.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("product_id", UUID, sa.ForeignKey("products.id", ondelete="CASCADE"), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"),
        sa.UniqueConstraint("list_id", "product_id", name="uq_list_product"),
    )


def downgrade() -> None:
    for t in ("shopping_list_items", "shopping_lists", "referrals", "referral_codes", "wallet_transactions", "wallets"):
        op.drop_table(t)
    op.drop_column("orders", "scheduled_for")
