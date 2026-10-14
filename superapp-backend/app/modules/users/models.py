"""User and role-specific profile models."""
from uuid import uuid4
from datetime import datetime

from sqlalchemy import Column, String, DateTime, Boolean, Text, Float, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class User(Base):
    """Core user model. One row per phone number regardless of role."""
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    phone = Column(String(20), unique=True, nullable=False, index=True)
    email = Column(String(255), unique=True, nullable=True)
    name = Column(String(255), nullable=True)

    # Role-based auth  (roadmap: customer|store|restaurant|delivery|cab_driver|salon|admin)
    role = Column(String(50), nullable=True, index=True)
    # Account lifecycle  (roadmap: pending_approval|active|suspended|rejected)
    status = Column(String(50), nullable=False, default="pending_approval")
    profile_complete = Column(Boolean, default=False)

    # Password-based login (optional — users without a password can only use OTP)
    password_hash = Column(String(255), nullable=True)

    # Firebase push token (refreshed by mobile on login)
    fcm_token = Column(String(500), nullable=True)
    avatar_url = Column(Text, nullable=True)

    is_active = Column(Boolean, default=True)
    is_verified = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    last_login = Column(DateTime, nullable=True)

    # Relationships (at most one per user)
    store_profile = relationship("StoreProfile", back_populates="user",
                                 uselist=False, foreign_keys="StoreProfile.user_id")
    restaurant_profile = relationship("RestaurantProfile", back_populates="user",
                                      uselist=False, foreign_keys="RestaurantProfile.user_id")
    delivery_profile = relationship("DeliveryAgentProfile", back_populates="user",
                                    uselist=False, foreign_keys="DeliveryAgentProfile.user_id")

    def __repr__(self):
        return f"<User(id={self.id}, phone={self.phone}, role={self.role}, status={self.status})>"


class StoreProfile(Base):
    """Grocery / general store owner profile."""
    __tablename__ = "store_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)

    owner_name = Column(String(255), nullable=False)
    store_name = Column(String(255), nullable=False)
    gstin = Column(String(20), nullable=True)
    fssai = Column(String(30), nullable=True)
    address = Column(Text, nullable=True)
    bank_account = Column(String(30), nullable=True)
    bank_ifsc = Column(String(15), nullable=True)
    upi_id = Column(String(100), nullable=True)

    # Location fields
    pincode = Column(String(10), nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    is_open = Column(Boolean, default=True)
    delivery_radius_km = Column(Float, default=5.0)

    # Customer-facing rating (Zomato/Blinkit style star badge on the store
    # card). rating_count starts at 0 — the badge is hidden on the frontend
    # until a store has enough real ratings; see StoreRatingBadge.
    rating = Column(Float, nullable=True)
    rating_count = Column(Integer, default=0, nullable=False)

    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="store_profile", foreign_keys=[user_id])

    def __repr__(self):
        return f"<StoreProfile(store_name={self.store_name})>"


class RestaurantProfile(Base):
    """Restaurant owner profile."""
    __tablename__ = "restaurant_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)

    owner_name = Column(String(255), nullable=False)
    restaurant_name = Column(String(255), nullable=False)
    gstin = Column(String(20), nullable=True)
    fssai = Column(String(30), nullable=True)
    cuisine_type = Column(String(100), nullable=True)
    address = Column(Text, nullable=True)
    bank_account = Column(String(30), nullable=True)
    bank_ifsc = Column(String(15), nullable=True)
    upi_id = Column(String(100), nullable=True)

    # Location fields
    pincode = Column(String(10), nullable=True)
    city = Column(String(100), nullable=True)
    state = Column(String(100), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)

    is_open = Column(Boolean, default=True)
    # Note: customer-facing rating lives on app.modules.food.models.Restaurant
    # (rating_avg/rating_count) — the actual catalog row shown/ordered from
    # in the Food module — not here. This profile is the owner's own
    # dashboard/KYC record, a different row keyed by the same user_id.

    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="restaurant_profile", foreign_keys=[user_id])

    def __repr__(self):
        return f"<RestaurantProfile(name={self.restaurant_name})>"


class DeliveryAgentProfile(Base):
    """Delivery agent profile."""
    __tablename__ = "delivery_agent_profiles"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False)

    name = Column(String(255), nullable=False)
    vehicle_type = Column(String(50), nullable=True)
    license_no = Column(String(30), nullable=True)
    aadhaar = Column(String(20), nullable=True)
    bank_account = Column(String(30), nullable=True)
    bank_ifsc = Column(String(15), nullable=True)
    upi_id = Column(String(100), nullable=True)

    pincode = Column(String(10), nullable=True)
    is_available = Column(Boolean, default=False)
    current_lat = Column(Float, nullable=True)
    current_lng = Column(Float, nullable=True)
    last_location_at = Column(DateTime, nullable=True)

    # Rider rating shown to customers on the order detail screen (Zomato/Blinkit
    # style rider card). Starts at a neutral 4.8 for new riders — same pattern
    # as most delivery platforms — and is meant to be nudged by a future
    # post-delivery rating flow; nothing currently writes to it besides that.
    rating = Column(Float, default=4.8, nullable=False)
    rating_count = Column(Integer, default=0, nullable=False)

    approved_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    approved_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", back_populates="delivery_profile", foreign_keys=[user_id])

    def __repr__(self):
        return f"<DeliveryAgentProfile(name={self.name}, vehicle={self.vehicle_type})>"

