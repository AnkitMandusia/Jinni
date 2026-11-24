"""Ride booking: settings, places, rides, rejections; delivery_agent_profiles.ride_enabled.

Revision ID: 0018
Revises: 0017
"""
from typing import Sequence, Union
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "0018"
down_revision: Union[str, None] = "0017"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None
UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    op.add_column("delivery_agent_profiles",
                  sa.Column("ride_enabled", sa.Boolean(), nullable=False, server_default=sa.true()))

    op.create_table(
        "ride_settings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("base_fare", sa.Numeric(8, 2), nullable=False, server_default="20"),
        sa.Column("per_km", sa.Numeric(8, 2), nullable=False, server_default="9"),
        sa.Column("min_fare", sa.Numeric(8, 2), nullable=False, server_default="30"),
        sa.Column("road_factor", sa.Numeric(4, 2), nullable=False, server_default="1.30"),
        sa.Column("max_distance_km", sa.Numeric(6, 2), nullable=False, server_default="25"),
        sa.Column("request_timeout_minutes", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("platform_upi_id", sa.String(100), nullable=True),
        sa.Column("updated_at", sa.DateTime()),
    )
    op.create_table(
        "ride_places",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("area", sa.String(80), nullable=True),
        sa.Column("icon", sa.String(8), nullable=True),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lng", sa.Float(), nullable=False),
        sa.Column("display_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.create_table(
        "rides",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("ride_number", sa.String(20), nullable=False, unique=True),
        sa.Column("customer_id", UUID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("rider_id", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("status", sa.String(20), nullable=False),
        sa.Column("pickup_text", sa.String(255), nullable=False),
        sa.Column("pickup_lat", sa.Float(), nullable=False),
        sa.Column("pickup_lng", sa.Float(), nullable=False),
        sa.Column("drop_text", sa.String(255), nullable=False),
        sa.Column("drop_lat", sa.Float(), nullable=False),
        sa.Column("drop_lng", sa.Float(), nullable=False),
        sa.Column("distance_km", sa.Numeric(6, 2), nullable=False),
        sa.Column("fare", sa.Numeric(8, 2), nullable=False),
        sa.Column("fare_adjusted_reason", sa.String(200), nullable=True),
        sa.Column("note", sa.String(200), nullable=True),
        sa.Column("payment_method", sa.String(10), nullable=False),
        sa.Column("payment_status", sa.String(10), nullable=False, server_default="pending"),
        sa.Column("payment_ref", sa.String(100), nullable=True),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("payment_confirmed_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("assigned_by_admin", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("requested_at", sa.DateTime()),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.Column("arrived_at", sa.DateTime(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column("cancelled_by", UUID, sa.ForeignKey("users.id"), nullable=True),
        sa.Column("cancel_reason", sa.String(200), nullable=True),
    )
    op.create_index("ix_rides_customer_id", "rides", ["customer_id"])
    op.create_index("ix_rides_rider_id", "rides", ["rider_id"])
    op.create_index("ix_rides_status", "rides", ["status"])
    op.create_index("ix_rides_requested_at", "rides", ["requested_at"])
    op.create_index("idx_ride_customer_status", "rides", ["customer_id", "status"])
    op.create_index("idx_ride_rider_status", "rides", ["rider_id", "status"])
    op.create_table(
        "ride_rejections",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("ride_id", UUID, sa.ForeignKey("rides.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("rider_id", UUID, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime()),
        sa.UniqueConstraint("ride_id", "rider_id", name="uq_ride_rider_rejection"),
    )


def downgrade() -> None:
    for t in ("ride_rejections", "rides", "ride_places", "ride_settings"):
        op.drop_table(t)
    op.drop_column("delivery_agent_profiles", "ride_enabled")
