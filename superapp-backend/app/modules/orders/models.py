"""Order models - unified for grocery, food, cab, salon services."""
from uuid import uuid4
from datetime import datetime
from decimal import Decimal
from typing import Optional

from sqlalchemy import (
    Column, String, Text, Numeric, Integer, Boolean, DateTime,
    ForeignKey, Index, Enum as SQLEnum, JSON
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
import enum

from app.database import Base


class OrderType(str, enum.Enum):
    """Order type enum."""
    GROCERY = "grocery"
    FOOD = "food"
    CAB = "cab"
    SALON = "salon"


class OrderStatus(str, enum.Enum):
    """Order status lifecycle."""
    # Initial
    PENDING_DISPATCH = "pending_dispatch"  # Waiting for store/partner to accept
    
    # Store/Partner accepted
    STORE_ACCEPTED = "store_accepted"
    PREPARING = "preparing"
    READY_FOR_PICKUP = "ready_for_pickup"
    
    # Delivery assigned
    DELIVERY_ASSIGNED = "delivery_assigned"
    PICKED_UP = "picked_up"
    IN_TRANSIT = "in_transit"
    
    # Completed
    DELIVERED = "delivered"
    COMPLETED = "completed"
    
    # Failed states
    CANCELLED = "cancelled"
    NO_STORE_AVAILABLE = "no_store_available"
    REJECTED = "rejected"


class PaymentMethod(str, enum.Enum):
    """Payment method."""
    COD = "cod"
    ONLINE = "online"
    WALLET = "wallet"


class PaymentStatus(str, enum.Enum):
    """Payment status."""
    PENDING = "pending"
    PAID = "paid"
    FAILED = "failed"
    REFUNDED = "refunded"


class Order(Base):
    """Unified order model for all service types."""
    __tablename__ = "orders"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    order_number = Column(String(20), unique=True, nullable=False, index=True)
    
    # Order type
    order_type = Column(String(20), nullable=False, default=OrderType.GROCERY.value, index=True)
    
    # Customer
    customer_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    
    # Store/Restaurant/Partner (assigned after accept)
    store_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    
    # Delivery agent (assigned separately)
    delivery_agent_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)
    
    # Status (using String to match migration - VARCHAR)
    status = Column(String(50), nullable=False, default=OrderStatus.PENDING_DISPATCH.value, index=True)
    
    # Pricing
    subtotal = Column(Numeric(10, 2), nullable=False)
    delivery_fee = Column(Numeric(10, 2), default=Decimal("0.00"))
    tax = Column(Numeric(10, 2), default=Decimal("0.00"))
    discount = Column(Numeric(10, 2), default=Decimal("0.00"))
    total_amount = Column(Numeric(10, 2), nullable=False)
    
    # Payment (using String to match migration - VARCHAR)
    payment_method = Column(String(20), nullable=False, default=PaymentMethod.COD.value)
    payment_status = Column(String(20), nullable=False, default=PaymentStatus.PENDING.value)
    payment_id = Column(String(100), nullable=True)  # Gateway transaction ID (e.g. Paytm TXNID)
    payment_reference = Column(String(100), nullable=True, unique=True, index=True)  # Gateway order/reference ID
    coupon_code = Column(String(40), nullable=True)
    
    # Addresses
    delivery_address = Column(JSON, nullable=False)  # {line1, line2, city, state, pincode, lat, lng}
    pickup_address = Column(JSON, nullable=True)  # Store/restaurant address
    
    # Location (for radius-based dispatch)
    delivery_pincode = Column(String(10), nullable=False, index=True)
    delivery_lat = Column(Numeric(10, 7), nullable=True)
    delivery_lng = Column(Numeric(10, 7), nullable=True)
    
    # Dispatch metadata
    broadcast_radius_km = Column(Integer, default=5)  # Current search radius
    broadcast_attempt = Column(Integer, default=0)  # How many times we expanded radius
    accept_timeout_seconds = Column(Integer, default=45)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    accepted_at = Column(DateTime, nullable=True)
    preparing_at = Column(DateTime, nullable=True)
    ready_at = Column(DateTime, nullable=True)
    picked_up_at = Column(DateTime, nullable=True)
    delivered_at = Column(DateTime, nullable=True)
    cancelled_at = Column(DateTime, nullable=True)
    
    # Cancellation
    cancellation_reason = Column(Text, nullable=True)
    cancelled_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    
    # Delivery proof
    delivery_otp = Column(String(6), nullable=True)
    delivery_photo_url = Column(Text, nullable=True)
    
    # Rating
    customer_rating = Column(Integer, nullable=True)  # 1-5
    customer_review = Column(Text, nullable=True)
    
    # Special instructions
    notes = Column(Text, nullable=True)
    
    # Relationships
    customer = relationship("User", foreign_keys=[customer_id], backref="customer_orders")
    store = relationship("User", foreign_keys=[store_id], backref="store_orders")
    delivery_agent = relationship("User", foreign_keys=[delivery_agent_id], backref="delivery_orders")
    items = relationship("OrderItem", back_populates="order", cascade="all, delete-orphan")
    
    # Indexes
    __table_args__ = (
        Index('idx_order_customer_status', 'customer_id', 'status'),
        Index('idx_order_store_status', 'store_id', 'status'),
        Index('idx_order_delivery_status', 'delivery_agent_id', 'status'),
        Index('idx_order_pincode_status', 'delivery_pincode', 'status'),
        Index('idx_order_created', 'created_at'),
    )
    
    def __repr__(self):
        return f"<Order(number={self.order_number}, type={self.order_type}, status={self.status})>"


class OrderItem(Base):
    """Order line items - products or services."""
    __tablename__ = "order_items"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False, index=True)
    
    # Product reference (for grocery/food)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=True)
    
    # Snapshot at time of order (prices may change later)
    product_name = Column(String(255), nullable=False)
    product_sku = Column(String(50), nullable=True)
    unit_price = Column(Numeric(10, 2), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    subtotal = Column(Numeric(10, 2), nullable=False)
    
    # Custom item metadata (for services like salon/cab)
    item_metadata = Column(JSON, nullable=True)  # {service_type, duration, etc.}
    
    # Relationship
    order = relationship("Order", back_populates="items")
    product = relationship("Product", foreign_keys=[product_id])
    
    def __repr__(self):
        return f"<OrderItem(order={self.order_id}, product={self.product_name}, qty={self.quantity})>"


class DeliveryLocation(Base):
    """Real-time delivery agent location tracking."""
    __tablename__ = "delivery_locations"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    delivery_agent_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=True, index=True)
    
    latitude = Column(Numeric(10, 7), nullable=False)
    longitude = Column(Numeric(10, 7), nullable=False)
    accuracy = Column(Numeric(10, 2), nullable=True)  # meters
    
    # Speed and heading (optional)
    speed = Column(Numeric(10, 2), nullable=True)  # km/h
    heading = Column(Numeric(5, 2), nullable=True)  # degrees
    
    timestamp = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Relationships
    delivery_agent = relationship("User", foreign_keys=[delivery_agent_id])
    order = relationship("Order", foreign_keys=[order_id])
    
    __table_args__ = (
        Index('idx_delivery_location_agent_time', 'delivery_agent_id', 'timestamp'),
        Index('idx_delivery_location_order', 'order_id', 'timestamp'),
    )
    
    def __repr__(self):
        return f"<DeliveryLocation(agent={self.delivery_agent_id}, lat={self.latitude}, lng={self.longitude})>"


class DeliveryAuditLog(Base):
    """Immutable record of Super Admin manual delivery completions.

    INSERT + SELECT only — nothing in the codebase ever UPDATEs or DELETEs a
    row here. See alembic/versions/0011_delivery_audit_log.py for the
    matching DB-level REVOKE. Replaces the old Redis-list audit trail, which
    was not durable (lost on Redis restart/eviction) and not actually
    immutable (freely editable via redis-cli).
    """
    __tablename__ = "delivery_audit_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id"), nullable=False, index=True)
    order_number = Column(String(20), nullable=False)
    admin_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    admin_phone = Column(String(20), nullable=True)
    previous_status = Column(String(50), nullable=False)
    new_status = Column(String(50), nullable=False)
    reason = Column(Text, nullable=False)
    completion_method = Column(String(30), nullable=False, default="admin_manual")
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    order = relationship("Order", foreign_keys=[order_id])
    admin = relationship("User", foreign_keys=[admin_id])

    def __repr__(self):
        return f"<DeliveryAuditLog(order={self.order_id}, admin={self.admin_id}, at={self.created_at})>"
