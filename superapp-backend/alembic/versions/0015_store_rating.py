"""Add rating/rating_count to store_profiles, for the Zomato/Blinkit-style
rating chip on the grocery store list. Restaurants already have
rating_avg/rating_count on app.modules.food.models.Restaurant (migration
0007) — this only covers the grocery side.

Revision ID: 0015
Revises: 0014
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: Union[str, None] = "0014"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("store_profiles")}
    if "rating" not in cols:
        # Nullable, no default — None means "not enough ratings yet" so the
        # frontend shows a "NEW" chip instead of a fabricated score.
        op.add_column("store_profiles", sa.Column("rating", sa.Float(), nullable=True))
    if "rating_count" not in cols:
        op.add_column(
            "store_profiles",
            sa.Column("rating_count", sa.Integer(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    op.drop_column("store_profiles", "rating_count")
    op.drop_column("store_profiles", "rating")
