"""Add upi_id to store/restaurant/delivery partner profiles, and bank+UPI fields on restaurants.

Store, restaurant and delivery partners previously had inconsistent payout fields
(store/delivery had bank_account+bank_ifsc, restaurant_profiles had only bank_ifsc,
and none of them had a UPI id). The live `restaurants` table used by the food
module also had no payout fields at all. This migration brings all four in line.

Revision ID: 0010
Revises: 0009
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0010"
down_revision: Union[str, None] = "0009"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_column_if_missing(bind, table: str, column: str, coltype: sa.types.TypeEngine) -> None:
    exists = bind.execute(sa.text(
        "SELECT EXISTS (SELECT 1 FROM information_schema.columns "
        "WHERE table_schema='public' AND table_name=:t AND column_name=:c)"
    ), {"t": table, "c": column}).scalar()
    if not exists:
        op.add_column(table, sa.Column(column, coltype, nullable=True))


def upgrade() -> None:
    bind = op.get_bind()

    # restaurants (live food-partner table) — had no payout fields at all
    _add_column_if_missing(bind, "restaurants", "bank_account", sa.String(length=30))
    _add_column_if_missing(bind, "restaurants", "bank_ifsc", sa.String(length=15))
    _add_column_if_missing(bind, "restaurants", "upi_id", sa.String(length=100))

    # store_profiles — had bank_account/bank_ifsc, missing upi_id
    _add_column_if_missing(bind, "store_profiles", "upi_id", sa.String(length=100))

    # restaurant_profiles (legacy/unused signup table) — missing bank_account + upi_id
    _add_column_if_missing(bind, "restaurant_profiles", "bank_account", sa.String(length=30))
    _add_column_if_missing(bind, "restaurant_profiles", "upi_id", sa.String(length=100))

    # delivery_agent_profiles — had bank_account/bank_ifsc, missing upi_id
    _add_column_if_missing(bind, "delivery_agent_profiles", "upi_id", sa.String(length=100))


def downgrade() -> None:
    op.drop_column("delivery_agent_profiles", "upi_id")
    op.drop_column("restaurant_profiles", "upi_id")
    op.drop_column("restaurant_profiles", "bank_account")
    op.drop_column("store_profiles", "upi_id")
    op.drop_column("restaurants", "upi_id")
    op.drop_column("restaurants", "bank_ifsc")
    op.drop_column("restaurants", "bank_account")
