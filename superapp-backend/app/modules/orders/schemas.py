"""Order schemas for API requests/responses."""
from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Dict, Any
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict


class OrderItemCreate(BaseModel):
    """Schema for creating an order item."""
    product_id: UUID
    quantity: int = Field(..., ge=1)


class OrderItemResponse(BaseModel):
    """Order item response."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    product_id: Optional[UUID]
    product_name: str
    product_sku: Optional[str]
    unit_price: Decimal
    quantity: int
    subtotal: Decimal


class DeliveryAddressCreate(BaseModel):
    """Delivery address schema."""
    line1: str
    line2: Optional[str] = None
    city: str
    state: str
    pincode: str = Field(..., min_length=6, max_length=6)
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class OrderCreate(BaseModel):
    """Schema for creating an order."""
    order_type: str = Field(default="grocery", pattern="^(grocery|food|cab|salon)$")
    items: List[OrderItemCreate]
    delivery_address: DeliveryAddressCreate
    payment_method: str = Field(default="cod", pattern="^(cod|online|wallet)$")
    notes: Optional[str] = None


class OrderResponse(BaseModel):
    """Order response schema."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    order_number: str
    order_type: str
    status: str
    
    customer_id: UUID
    store_id: Optional[UUID]
    delivery_agent_id: Optional[UUID]
    
    subtotal: Decimal
    delivery_fee: Decimal
    tax: Decimal
    discount: Decimal
    total_amount: Decimal
    
    payment_method: str
    payment_status: str
    
    delivery_address: Dict[str, Any]
    delivery_pincode: str
    
    items: List[OrderItemResponse]
    
    created_at: datetime
    accepted_at: Optional[datetime]
    delivered_at: Optional[datetime]
    
    notes: Optional[str]
    customer_rating: Optional[int] = None


class OrderListResponse(BaseModel):
    """Order list response."""
    items: List[OrderResponse]
    total: int
    page: int
    page_size: int


class OrderAcceptRequest(BaseModel):
    """Schema for store accepting an order."""
    estimated_prep_time_minutes: Optional[int] = Field(default=30, ge=5, le=120)


class OrderStatusUpdate(BaseModel):
    """Schema for updating order status."""
    status: str
    notes: Optional[str] = None


class DeclineOrderRequest(BaseModel):
    """Schema for store declining a pending order with a reason."""
    reason: str = Field(..., min_length=1, max_length=500)


class VerifyOTPRequest(BaseModel):
    """Schema for delivery agent verifying WhatsApp OTP."""
    otp: str = Field(..., min_length=4, max_length=8)


class RateOrderRequest(BaseModel):
    """Customer rating a delivered order — feeds the store/restaurant's
    aggregate rating badge shown on the listing screens."""
    rating: int = Field(..., ge=1, le=5)
    review: Optional[str] = Field(None, max_length=500)


class DeliveryLocationUpdate(BaseModel):
    """Schema for delivery agent location update."""
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    accuracy: Optional[float] = None
    speed: Optional[float] = None
    heading: Optional[float] = None
