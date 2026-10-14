"""Add rider rating fields to delivery_agent_profiles, for the Zomato/Blinkit-style
rider card on the customer order detail screen.

Revision ID: 0014
Revises: 0013
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: Union[str, None] = "0013"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("delivery_agent_profiles")}
    if "rating" not in cols:
        op.add_column(
            "delivery_agent_profiles",
            sa.Column("rating", sa.Float(), nullable=False, server_default="4.8"),
        )
    if "rating_count" not in cols:
        op.add_column(
            "delivery_agent_profiles",
            sa.Column("rating_count", sa.Integer(), nullable=False, server_default="0"),
        )


def downgrade() -> None:
    op.drop_column("delivery_agent_profiles", "rating_count")
    op.drop_column("delivery_agent_profiles", "rating")
