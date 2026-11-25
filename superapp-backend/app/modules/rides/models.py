"""Ride booking ("Jinni Carpet") — separate from food/grocery orders on purpose.

Riders are the existing delivery partners (users.role == "delivery"); a rider is simply
busy with either one delivery or one ride at a time (enforced in rides.service.rider_is_busy
and in delivery accept). No live GPS is stored: pickup/drop coordinates are captured once at
booking, and navigation is handed off to Google Maps on the rider's phone.
"""
from datetime import datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import (
    Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class RideStatus:
    REQUESTED = "requested"
    ACCEPTED = "accepted"          # rider on the way to pickup
    ARRIVED = "arrived"            # rider reached pickup
    IN_PROGRESS = "in_progress"    # customer on board
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    EXPIRED = "expired"            # nobody accepted within the timeout

    ACTIVE = (REQUESTED, ACCEPTED, ARRIVED, IN_PROGRESS)
    RIDER_ACTIVE = (ACCEPTED, ARRIVED, IN_PROGRESS)
    CLOSED = (COMPLETED, CANCELLED, EXPIRED)


class RideSettings(Base):
    """Single-row fare / service configuration (id is always 1)."""
    __tablename__ = "ride_settings"
    id = Column(Integer, primary_key=True, default=1)
    is_enabled = Column(Boolean, nullable=False, default=True)
    base_fare = Column(Numeric(8, 2), nullable=False, default=Decimal("20.00"))
    per_km = Column(Numeric(8, 2), nullable=False, default=Decimal("9.00"))
    min_fare = Column(Numeric(8, 2), nullable=False, default=Decimal("30.00"))
    # Straight-line (haversine) distance x road_factor approximates road distance without
    # any paid routing API.
    road_factor = Column(Numeric(4, 2), nullable=False, default=Decimal("1.30"))
    max_distance_km = Column(Numeric(6, 2), nullable=False, default=Decimal("25.00"))
    request_timeout_minutes = Column(Integer, nullable=False, default=5)
    # UPI id used when the assigned rider has none of their own.
    platform_upi_id = Column(String(100), nullable=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RidePlace(Base):
    """Admin-curated well-known spots ("Jinni Spots"): bus stand, station, hospital, market…
    Gives instant pickup/drop choices with exact coordinates — no geocoding/Places API needed."""
    __tablename__ = "ride_places"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(80), nullable=False)
    area = Column(String(80), nullable=True)
    icon = Column(String(8), nullable=True)  # emoji
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    display_order = Column(Integer, nullable=False, default=0)
    is_active = Column(Boolean, nullable=False, default=True)


class Ride(Base):
    __tablename__ = "rides"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    ride_number = Column(String(20), unique=True, nullable=False, index=True)
    customer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    status = Column(String(20), nullable=False, default=RideStatus.REQUESTED, index=True)

    pickup_text = Column(String(255), nullable=False)
    pickup_lat = Column(Float, nullable=False)
    pickup_lng = Column(Float, nullable=False)
    drop_text = Column(String(255), nullable=False)
    drop_lat = Column(Float, nullable=False)
    drop_lng = Column(Float, nullable=False)
    distance_km = Column(Numeric(6, 2), nullable=False)
    fare = Column(Numeric(8, 2), nullable=False)          # what the customer pays
    fare_adjusted_reason = Column(String(200), nullable=True)
    note = Column(String(200), nullable=True)

    payment_method = Column(String(10), nullable=False)    # cash | upi
    payment_status = Column(String(10), nullable=False, default="pending")  # pending | paid
    payment_ref = Column(String(100), nullable=True)       # UPI txn / UTR, optional
    paid_at = Column(DateTime, nullable=True)
    payment_confirmed_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    assigned_by_admin = Column(Boolean, nullable=False, default=False)
    requested_at = Column(DateTime, default=datetime.utcnow, index=True)
    accepted_at = Column(DateTime, nullable=True)
    arrived_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    completed_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    cancelled_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    cancel_reason = Column(String(200), nullable=True)

    __table_args__ = (
        Index("idx_ride_customer_status", "customer_id", "status"),
        Index("idx_ride_rider_status", "rider_id", "status"),
    )


class RideRejection(Base):
    """A rider declined this request — don't show it to them again."""
    __tablename__ = "ride_rejections"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    ride_id = Column(UUID(as_uuid=True), ForeignKey("rides.id", ondelete="CASCADE"), nullable=False, index=True)
    rider_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    __table_args__ = (UniqueConstraint("ride_id", "rider_id", name="uq_ride_rider_rejection"),)
