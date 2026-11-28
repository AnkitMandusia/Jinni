"""Location-based availability: nearby radius + require-nearby-rider switch.

Revision ID: 0020
Revises: 0019
"""
from typing import Sequence, Union
import sqlalchemy as sa
from alembic import op

revision: str = "0020"
down_revision: Union[str, None] = "0019"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("ride_settings", sa.Column("nearby_radius_km", sa.Numeric(5, 1), nullable=False, server_default="6.0"))
    op.add_column("ride_settings", sa.Column("require_nearby_rider", sa.Boolean(), nullable=False, server_default=sa.true()))


def downgrade() -> None:
    op.drop_column("ride_settings", "require_nearby_rider")
    op.drop_column("ride_settings", "nearby_radius_km")
