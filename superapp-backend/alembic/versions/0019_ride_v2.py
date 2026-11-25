"""Ride v2: vehicle classes + fare cards, dynamic pricing, boost, start code, SOS, rating, cancellation fees/dues,
partner KYC, OSM-sourced spots, order dues.

Revision ID: 0019
Revises: 0018
"""
from typing import Sequence, Union
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql
from alembic import op

revision: str = "0019"
down_revision: Union[str, None] = "0018"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None
UUID = postgresql.UUID(as_uuid=True)


def upgrade() -> None:
    # ── delivery partner: KYC + job preferences ──
    for name, col in [
        ("take_rides", sa.Column("take_rides", sa.Boolean(), nullable=False, server_default=sa.true())),
        ("take_deliveries", sa.Column("take_deliveries", sa.Boolean(), nullable=False, server_default=sa.true())),
        ("vehicle_class", sa.Column("vehicle_class", sa.String(10))),
        ("vehicle_number", sa.Column("vehicle_number", sa.String(15))),
        ("vehicle_make_model", sa.Column("vehicle_make_model", sa.String(80))),
        ("vehicle_color", sa.Column("vehicle_color", sa.String(30))),
        ("dob", sa.Column("dob", sa.Date())),
        ("dl_expiry", sa.Column("dl_expiry", sa.Date())),
        ("rc_expiry", sa.Column("rc_expiry", sa.Date())),
        ("insurance_expiry", sa.Column("insurance_expiry", sa.Date())),
        ("aadhaar_last4", sa.Column("aadhaar_last4", sa.String(4))),
        ("emergency_name", sa.Column("emergency_name", sa.String(80))),
        ("emergency_phone", sa.Column("emergency_phone", sa.String(20))),
        ("documents_verified", sa.Column("documents_verified", sa.Boolean(), nullable=False, server_default=sa.false())),
        ("documents_verified_at", sa.Column("documents_verified_at", sa.DateTime())),
        ("documents_verified_by", sa.Column("documents_verified_by", UUID, sa.ForeignKey("users.id"))),
    ]:
        op.add_column("delivery_agent_profiles", col)
    # Legacy free-text vehicle_type -> class (auto / cab / else bike)
    op.execute("""
        UPDATE delivery_agent_profiles SET vehicle_class = CASE
            WHEN lower(coalesce(vehicle_type,'')) LIKE '%auto%' OR lower(coalesce(vehicle_type,'')) LIKE '%rickshaw%' THEN 'auto'
            WHEN lower(coalesce(vehicle_type,'')) ~ '(cab|car|sedan|suv|hatch)' THEN 'cab'
            ELSE 'bike' END
    """)

    # ── fares per vehicle ──
    op.create_table(
        "ride_fares",
        sa.Column("vehicle_class", sa.String(10), primary_key=True),
        sa.Column("label", sa.String(30), nullable=False),
        sa.Column("base_fare", sa.Numeric(8, 2), nullable=False),
        sa.Column("per_km", sa.Numeric(8, 2), nullable=False),
        sa.Column("min_fare", sa.Numeric(8, 2), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    # Seed from the existing single fare card so live prices don't change for bikes.
    op.execute("""
        INSERT INTO ride_fares (vehicle_class, label, base_fare, per_km, min_fare, is_enabled)
        SELECT 'bike', 'Bike', coalesce((SELECT base_fare FROM ride_settings WHERE id=1),20),
               coalesce((SELECT per_km FROM ride_settings WHERE id=1),9),
               coalesce((SELECT min_fare FROM ride_settings WHERE id=1),30), true
    """)
    op.execute("""
        INSERT INTO ride_fares (vehicle_class, label, base_fare, per_km, min_fare, is_enabled) VALUES
        ('auto','Auto',30,13,50,true), ('cab','Cab',50,16,80,true)
    """)

    # ── settings ──
    for col in [
        sa.Column("pricing_mode", sa.String(10), nullable=False, server_default="fixed"),
        sa.Column("manual_multiplier", sa.Numeric(4, 2), nullable=False, server_default="1.00"),
        sa.Column("auto_surge_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("auto_surge_step", sa.Numeric(4, 2), nullable=False, server_default="0.25"),
        sa.Column("max_multiplier", sa.Numeric(4, 2), nullable=False, server_default="2.00"),
        sa.Column("peak_windows", sa.JSON(), nullable=False, server_default="[]"),
        sa.Column("boost_options", sa.JSON(), nullable=False, server_default="[10,20,30]"),
        sa.Column("max_boost", sa.Numeric(8, 2), nullable=False, server_default="50"),
        sa.Column("cancel_grace_seconds", sa.Integer(), nullable=False, server_default="120"),
        sa.Column("cancel_fee", sa.Numeric(8, 2), nullable=False, server_default="20"),
        sa.Column("avg_speed_kmph", sa.Integer(), nullable=False, server_default="25"),
        sa.Column("service_lat", sa.Float()),
        sa.Column("service_lng", sa.Float()),
        sa.Column("service_radius_km", sa.Numeric(6, 2)),
        sa.Column("sos_helpline", sa.String(20), nullable=False, server_default="112"),
    ]:
        op.add_column("ride_settings", col)

    # ── rides ──
    for col in [
        sa.Column("vehicle_class", sa.String(10), nullable=False, server_default="bike"),
        sa.Column("surge_multiplier", sa.Numeric(4, 2), nullable=False, server_default="1.00"),
        sa.Column("boost_amount", sa.Numeric(8, 2), nullable=False, server_default="0"),
        sa.Column("dues_amount", sa.Numeric(8, 2), nullable=False, server_default="0"),
        sa.Column("start_code", sa.String(4)),
        sa.Column("start_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("cancellation_fee", sa.Numeric(8, 2), nullable=False, server_default="0"),
        sa.Column("cancel_reason_code", sa.String(30)),
        sa.Column("fee_settled_ref", sa.String(48)),
        sa.Column("fee_waived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("rating", sa.Integer()),
        sa.Column("rating_comment", sa.String(300)),
        sa.Column("rated_at", sa.DateTime()),
    ]:
        op.add_column("rides", col)
    op.create_index("ix_rides_fee_settled_ref", "rides", ["fee_settled_ref"])

    op.create_table(
        "ride_sos",
        sa.Column("id", UUID, primary_key=True),
        sa.Column("ride_id", UUID, sa.ForeignKey("rides.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("raised_by", UUID, sa.ForeignKey("users.id"), nullable=False),
        sa.Column("raised_by_role", sa.String(10), nullable=False),
        sa.Column("lat", sa.Float()),
        sa.Column("lng", sa.Float()),
        sa.Column("note", sa.String(300)),
        sa.Column("status", sa.String(12), nullable=False, server_default="open", index=True),
        sa.Column("created_at", sa.DateTime(), index=True),
        sa.Column("resolved_at", sa.DateTime()),
        sa.Column("resolved_by", UUID, sa.ForeignKey("users.id")),
        sa.Column("resolution", sa.String(300)),
    )

    # ── places from OpenStreetMap ──
    op.add_column("ride_places", sa.Column("source", sa.String(10), nullable=False, server_default="manual"))
    op.add_column("ride_places", sa.Column("category", sa.String(30)))
    op.add_column("ride_places", sa.Column("osm_id", sa.String(24)))
    op.add_column("ride_places", sa.Column("score", sa.Float(), nullable=False, server_default="0"))
    op.create_unique_constraint("uq_ride_places_osm_id", "ride_places", ["osm_id"])

    # ── orders ──
    op.add_column("orders", sa.Column("platform_dues", sa.Numeric(10, 2), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("orders", "platform_dues")
    op.drop_constraint("uq_ride_places_osm_id", "ride_places", type_="unique")
    for c in ("score", "osm_id", "category", "source"):
        op.drop_column("ride_places", c)
    op.drop_table("ride_sos")
    op.drop_index("ix_rides_fee_settled_ref", table_name="rides")
    for c in ("rated_at", "rating_comment", "rating", "fee_waived", "fee_settled_ref", "cancel_reason_code",
              "cancellation_fee", "start_attempts", "start_code", "dues_amount", "boost_amount", "surge_multiplier",
              "vehicle_class"):
        op.drop_column("rides", c)
    for c in ("sos_helpline", "service_radius_km", "service_lng", "service_lat", "avg_speed_kmph", "cancel_fee",
              "cancel_grace_seconds", "max_boost", "boost_options", "peak_windows", "max_multiplier",
              "auto_surge_step", "auto_surge_enabled", "manual_multiplier", "pricing_mode"):
        op.drop_column("ride_settings", c)
    op.drop_table("ride_fares")
    for c in ("documents_verified_by", "documents_verified_at", "documents_verified", "emergency_phone",
              "emergency_name", "aadhaar_last4", "insurance_expiry", "rc_expiry", "dl_expiry", "dob", "vehicle_color",
              "vehicle_make_model", "vehicle_number", "vehicle_class", "take_deliveries", "take_rides"):
        op.drop_column("delivery_agent_profiles", c)
