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
    Boolean, Column, DateTime, Float, ForeignKey, Index, Integer, JSON, Numeric, String, Text, UniqueConstraint,
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

    # ── Pricing mode: "fixed" (default) uses each vehicle's own fares as-is; "dynamic" multiplies
    # them by a surge factor made of (manual override) x (peak-hour window) x (live demand/supply).
    pricing_mode = Column(String(10), nullable=False, default="fixed")
    manual_multiplier = Column(Numeric(4, 2), nullable=False, default=Decimal("1.00"))
    auto_surge_enabled = Column(Boolean, nullable=False, default=False)
    auto_surge_step = Column(Numeric(4, 2), nullable=False, default=Decimal("0.25"))  # +x per extra request per idle rider
    max_multiplier = Column(Numeric(4, 2), nullable=False, default=Decimal("2.00"))
    peak_windows = Column(JSON, nullable=False, default=list)  # [{label,start:"08:00",end:"10:00",multiplier:1.2}]

    # ── "No rider yet?" fare boost (customer adds a tip to attract riders)
    boost_options = Column(JSON, nullable=False, default=lambda: [10, 20, 30])
    max_boost = Column(Numeric(8, 2), nullable=False, default=Decimal("50.00"))

    # ── Cancellation: free until a rider is assigned, and for `cancel_grace_seconds` after; then a fee
    # which is added to the customer's next ride / order (never silently lost).
    cancel_grace_seconds = Column(Integer, nullable=False, default=120)
    cancel_fee = Column(Numeric(8, 2), nullable=False, default=Decimal("20.00"))

    avg_speed_kmph = Column(Integer, nullable=False, default=25)  # for the free distance->ETA estimate
    # Service area: bookings must start inside this circle (None = unrestricted).
    service_lat = Column(Float, nullable=True)
    service_lng = Column(Float, nullable=True)
    service_radius_km = Column(Numeric(6, 2), nullable=True)
    sos_helpline = Column(String(20), nullable=False, default="112")
    # A vehicle type is bookable only if an eligible, idle rider of that type has recently shared a location
    # within `nearby_radius_km` of the pickup. Turn the requirement off to allow booking with nobody around
    # (admin then assigns manually).
    nearby_radius_km = Column(Numeric(5, 1), nullable=False, default=Decimal("6.0"))
    require_nearby_rider = Column(Boolean, nullable=False, default=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class RideFare(Base):
    """Per-vehicle fare card. Admin edits these; they are the 'default' (fixed) prices."""
    __tablename__ = "ride_fares"
    vehicle_class = Column(String(10), primary_key=True)  # bike | auto | cab
    label = Column(String(30), nullable=False)
    base_fare = Column(Numeric(8, 2), nullable=False)
    per_km = Column(Numeric(8, 2), nullable=False)
    min_fare = Column(Numeric(8, 2), nullable=False)
    is_enabled = Column(Boolean, nullable=False, default=True)


VEHICLE_CLASSES = ("bike", "auto", "cab")
DEFAULT_FARES = {
    "bike": ("Bike", Decimal("20"), Decimal("9"), Decimal("30")),
    "auto": ("Auto", Decimal("30"), Decimal("13"), Decimal("50")),
    "cab": ("Cab", Decimal("50"), Decimal("16"), Decimal("80")),
}


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
    # Where the spot came from: typed in by admin, or imported from OpenStreetMap (see rides/osm.py).
    source = Column(String(10), nullable=False, default="manual")
    category = Column(String(30), nullable=True)
    osm_id = Column(String(24), nullable=True, unique=True)
    score = Column(Float, nullable=False, default=0)


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

    vehicle_class = Column(String(10), nullable=False, default="bike")
    surge_multiplier = Column(Numeric(4, 2), nullable=False, default=Decimal("1.00"))
    boost_amount = Column(Numeric(8, 2), nullable=False, default=Decimal("0.00"))
    # Earlier cancellation fees folded into this ride's payable (fare + dues_amount).
    dues_amount = Column(Numeric(8, 2), nullable=False, default=Decimal("0.00"))

    # 4-digit code shown only to the customer; the rider must type it to start the ride.
    start_code = Column(String(4), nullable=True)
    start_attempts = Column(Integer, nullable=False, default=0)

    cancellation_fee = Column(Numeric(8, 2), nullable=False, default=Decimal("0.00"))
    cancel_reason_code = Column(String(30), nullable=True)
    fee_settled_ref = Column(String(48), nullable=True, index=True)  # "ride:<id>" / "order:<id>" that absorbed the fee
    fee_waived = Column(Boolean, nullable=False, default=False)

    rating = Column(Integer, nullable=True)
    rating_comment = Column(String(300), nullable=True)
    rated_at = Column(DateTime, nullable=True)

    assigned_by_admin = Column(Boolean, nullable=False, default=False)
    requested_at = Column(DateTime, default=datetime.utcnow, index=True)
    accepted_at = Column(DateTime, nullable=True)
    arrived_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    commission_amount = Column(Numeric(8, 2), nullable=True)  # platform commission, frozen at completion
    rider_amount = Column(Numeric(8, 2), nullable=True)       # fare minus commission
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


class RideSOS(Base):
    """Emergency raised by the passenger or the rider during a live ride. Surfaces in the admin console."""
    __tablename__ = "ride_sos"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    ride_id = Column(UUID(as_uuid=True), ForeignKey("rides.id", ondelete="CASCADE"), nullable=False, index=True)
    raised_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    raised_by_role = Column(String(10), nullable=False)  # customer | rider
    lat = Column(Float, nullable=True)
    lng = Column(Float, nullable=True)
    note = Column(String(300), nullable=True)
    status = Column(String(12), nullable=False, default="open", index=True)  # open | resolved
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    resolved_at = Column(DateTime, nullable=True)
    resolved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    resolution = Column(String(300), nullable=True)
