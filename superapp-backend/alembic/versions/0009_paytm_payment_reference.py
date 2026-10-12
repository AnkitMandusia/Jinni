"""Add gateway payment reference for Paytm retries and reconciliation.

Revision ID: 0009
Revises: 0008
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: Union[str, None] = "0008"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    exists = bind.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
        "WHERE table_schema='public' AND table_name='orders' AND column_name='payment_reference')"
    )).scalar()
    if not exists:
        op.add_column("orders", sa.Column("payment_reference", sa.String(length=100), nullable=True))
        op.create_index("ix_orders_payment_reference", "orders", ["payment_reference"], unique=True)
    coupon_exists = bind.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
        "WHERE table_schema='public' AND table_name='orders' AND column_name='coupon_code')"
    )).scalar()
    if not coupon_exists:
        op.add_column("orders", sa.Column("coupon_code", sa.String(length=40), nullable=True))


def downgrade() -> None:
    bind = op.get_bind()
    idx = bind.execute(sa.text(
        "SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='orders' AND indexname='ix_orders_payment_reference'"
    )).scalar()
    if idx:
        op.drop_index("ix_orders_payment_reference", table_name="orders")
    for column in ("payment_reference", "coupon_code"):
        exists = bind.execute(sa.text(
            "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
            "WHERE table_schema='public' AND table_name='orders' AND column_name=:c)"
        ), {"c": column}).scalar()
        if exists:
            op.drop_column("orders", column)
