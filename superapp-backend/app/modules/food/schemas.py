"""Pydantic schemas for food module."""
from datetime import datetime, time
from decimal import Decimal
from typing import List, Optional, Dict, Any
from uuid import UUID
from pydantic import BaseModel, Field, ConfigDict, model_validator

class MenuItemOptionCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    price_delta: Decimal = Field(default=Decimal("0.00"), ge=0)
    is_default: bool = False
    is_available: bool = True
    is_veg: bool = True
    display_order: int = 0

class MenuItemOptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    price_delta: Decimal
    is_default: bool
    is_available: bool
    is_veg: bool
    display_order: int

class MenuItemOptionGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    min_select: int = Field(default=0, ge=0)
    max_select: int = Field(default=1, ge=1)
    is_required: bool = False
    display_order: int = 0
    options: List[MenuItemOptionCreate] = Field(default_factory=list)

class MenuItemOptionGroupResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    min_select: int
    max_select: int
    is_required: bool
    display_order: int
    options: List[MenuItemOptionResponse] = []

class MenuItemCreate(BaseModel):
    category_id: Optional[UUID] = None
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    price: Decimal = Field(..., ge=0)
    discounted_price: Optional[Decimal] = Field(None, ge=0)
    is_veg: bool = True
    is_egg: bool = False
    image_url: Optional[str] = None
    is_available: bool = True
    max_qty_per_order: Optional[int] = Field(None, ge=1)
    prep_time_minutes: Optional[int] = Field(None, ge=1)
    is_bestseller: bool = False
    is_recommended: bool = False
    display_order: int = 0
    hsn_code: Optional[str] = None
    tax_percent: Decimal = Field(default=Decimal("5.00"), ge=0, le=100)
    option_groups: List[MenuItemOptionGroupCreate] = Field(default_factory=list)
    @model_validator(mode="after")
    def check_discount(self):
        if self.discounted_price is not None and self.discounted_price > self.price:
            raise ValueError("discounted_price cannot exceed price")
        return self

class MenuItemUpdate(BaseModel):
    category_id: Optional[UUID] = None
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    price: Optional[Decimal] = Field(None, ge=0)
    discounted_price: Optional[Decimal] = Field(None, ge=0)
    is_veg: Optional[bool] = None
    is_egg: Optional[bool] = None
    image_url: Optional[str] = None
    is_available: Optional[bool] = None
    max_qty_per_order: Optional[int] = Field(None, ge=1)
    prep_time_minutes: Optional[int] = Field(None, ge=1)
    is_bestseller: Optional[bool] = None
    is_recommended: Optional[bool] = None
    display_order: Optional[int] = None
    hsn_code: Optional[str] = None
    tax_percent: Optional[Decimal] = Field(None, ge=0, le=100)
    is_active: Optional[bool] = None

class MenuItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    restaurant_id: UUID
    category_id: Optional[UUID] = None
    name: str
    description: Optional[str] = None
    price: Decimal
    discounted_price: Optional[Decimal] = None
    effective_price: Optional[Decimal] = None
    is_veg: bool
    is_egg: bool
    image_url: Optional[str] = None
    is_available: bool
    is_active: bool = True
    max_qty_per_order: Optional[int] = None
    prep_time_minutes: Optional[int] = None
    is_bestseller: bool
    is_recommended: bool
    display_order: int
    order_count: int = 0
    tax_percent: Decimal = Decimal("5.00")
    option_groups: List[MenuItemOptionGroupResponse] = []

class MenuCategoryCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    display_order: int = 0

class MenuCategoryUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None

class MenuCategoryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    restaurant_id: UUID
    name: str
    description: Optional[str] = None
    display_order: int
    is_active: bool
    items: List[MenuItemResponse] = []

class RestaurantCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=255)
    description: Optional[str] = None
    cuisines: List[str] = Field(..., min_length=1)
    tags: List[str] = Field(default_factory=list)
    logo_url: Optional[str] = None
    cover_image_url: Optional[str] = None
    address_line1: str = Field(..., min_length=3, max_length=255)
    address_line2: Optional[str] = None
    city: str = Field(..., min_length=2, max_length=100)
    state: str = Field(..., min_length=2, max_length=100)
    pincode: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    pure_veg: bool = False
    cost_for_two: Optional[int] = Field(None, ge=0)
    min_order_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    delivery_fee: Decimal = Field(default=Decimal("30.00"), ge=0)
    free_delivery_above: Optional[Decimal] = Field(None, ge=0)
    packaging_fee: Decimal = Field(default=Decimal("0.00"), ge=0)
    avg_prep_minutes: int = Field(default=25, ge=5, le=120)
    delivery_radius_km: Decimal = Field(default=Decimal("8.00"), ge=1, le=50)
    opens_at: time = time(9, 0)
    closes_at: time = time(23, 0)
    fssai_license: Optional[str] = None
    gstin: Optional[str] = None
    bank_account: Optional[str] = Field(None, max_length=30)
    bank_ifsc: Optional[str] = Field(None, max_length=15)
    upi_id: Optional[str] = Field(None, max_length=100)

class RestaurantUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=255)
    description: Optional[str] = None
    cuisines: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    logo_url: Optional[str] = None
    cover_image_url: Optional[str] = None
    gallery: Optional[List[str]] = None
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = Field(None, min_length=6, max_length=6, pattern=r"^\d{6}$")
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    pure_veg: Optional[bool] = None
    cost_for_two: Optional[int] = Field(None, ge=0)
    min_order_amount: Optional[Decimal] = Field(None, ge=0)
    delivery_fee: Optional[Decimal] = Field(None, ge=0)
    free_delivery_above: Optional[Decimal] = Field(None, ge=0)
    packaging_fee: Optional[Decimal] = Field(None, ge=0)
    avg_prep_minutes: Optional[int] = Field(None, ge=5, le=120)
    delivery_radius_km: Optional[Decimal] = Field(None, ge=1, le=50)
    opens_at: Optional[time] = None
    closes_at: Optional[time] = None
    fssai_license: Optional[str] = None
    gstin: Optional[str] = None
    bank_account: Optional[str] = Field(None, max_length=30)
    bank_ifsc: Optional[str] = Field(None, max_length=15)
    upi_id: Optional[str] = Field(None, max_length=100)
    is_open: Optional[bool] = None
    is_accepting_orders: Optional[bool] = None

class RestaurantResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    owner_id: UUID
    name: str
    slug: str
    description: Optional[str] = None
    cuisines: List[str] = []
    tags: List[str] = []
    logo_url: Optional[str] = None
    cover_image_url: Optional[str] = None
    gallery: List[str] = []
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    state: str
    pincode: str
    latitude: float
    longitude: float
    is_open: bool
    is_accepting_orders: bool
    pure_veg: bool
    cost_for_two: Optional[int] = None
    min_order_amount: Decimal
    delivery_fee: Decimal
    free_delivery_above: Optional[Decimal] = None
    packaging_fee: Decimal
    avg_prep_minutes: int
    delivery_radius_km: Decimal
    opens_at: Optional[time] = None
    closes_at: Optional[time] = None
    rating_avg: Decimal
    rating_count: int
    fssai_license: Optional[str] = None
    is_active: bool
    is_verified: bool
    distance_km: Optional[float] = None
    delivery_time_estimate: Optional[str] = None
    matched_dish: Optional[str] = None

class RestaurantPartnerResponse(RestaurantResponse):
    """Same as RestaurantResponse plus payout fields — partner-only, never used on public endpoints."""
    gstin: Optional[str] = None
    bank_account: Optional[str] = None
    bank_ifsc: Optional[str] = None
    upi_id: Optional[str] = None

class RestaurantListResponse(BaseModel):
    restaurants: List[RestaurantResponse]
    total: int
    page: int
    page_size: int

class RestaurantMenuResponse(BaseModel):
    restaurant: RestaurantResponse
    categories: List[MenuCategoryResponse]

class CartItemAdd(BaseModel):
    menu_item_id: UUID
    quantity: int = Field(..., ge=1, le=50)
    option_ids: List[UUID] = Field(default_factory=list)
    special_instructions: Optional[str] = Field(None, max_length=300)

class CartItemResponse(BaseModel):
    menu_item_id: UUID
    name: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    is_veg: bool
    image_url: Optional[str] = None
    option_ids: List[UUID] = []
    option_labels: List[str] = []
    special_instructions: Optional[str] = None

class CartResponse(BaseModel):
    restaurant_id: Optional[UUID] = None
    restaurant_name: Optional[str] = None
    items: List[CartItemResponse] = []
    item_count: int = 0
    subtotal: Decimal = Decimal("0.00")
    delivery_fee: Decimal = Decimal("0.00")
    packaging_fee: Decimal = Decimal("0.00")
    tax: Decimal = Decimal("0.00")
    total: Decimal = Decimal("0.00")
    min_order_amount: Decimal = Decimal("0.00")
    meets_min_order: bool = True

class FoodOrderItemCreate(BaseModel):
    menu_item_id: UUID
    quantity: int = Field(..., ge=1, le=50)
    option_ids: List[UUID] = Field(default_factory=list)
    special_instructions: Optional[str] = Field(None, max_length=300)

    @model_validator(mode="before")
    @classmethod
    def accept_qty_alias(cls, data):
        """Clients may send qty instead of quantity.

        Also drop empty/null option_ids entries so a stray "" never triggers
        the raw pydantic UUID parser error on the client.
        """
        if not isinstance(data, dict):
            return data
        data = dict(data)
        if "quantity" not in data and "qty" in data:
            data["quantity"] = data["qty"]
        if "option_ids" in data and isinstance(data["option_ids"], list):
            data["option_ids"] = [
                x for x in data["option_ids"]
                if x is not None and str(x).strip() != ""
            ]
        return data

class FoodDeliveryAddress(BaseModel):
    line1: str = Field(..., min_length=3)
    line2: Optional[str] = None
    city: str
    state: str
    pincode: str = Field(..., min_length=6, max_length=6, pattern=r"^\d{6}$")
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    landmark: Optional[str] = None

class FoodOrderCreate(BaseModel):
    restaurant_id: UUID
    items: List[FoodOrderItemCreate] = Field(..., min_length=1)
    delivery_address: FoodDeliveryAddress
    payment_method: str = Field(default="cod", pattern="^(cod|online|wallet)$")
    notes: Optional[str] = Field(None, max_length=500)
    coupon_code: Optional[str] = Field(None, max_length=40)
    force_clear_other_cart: bool = False

    @model_validator(mode="before")
    @classmethod
    def normalize_ids(cls, data):
        """Trim string UUIDs; reject empty restaurant_id before pydantic's opaque UUID error."""
        if not isinstance(data, dict):
            return data
        data = dict(data)
        rid = data.get("restaurant_id")
        if rid is not None:
            data["restaurant_id"] = str(rid).strip()
            if not data["restaurant_id"]:
                raise ValueError("restaurant_id is required and must be a valid UUID")
        return data

class FoodOrderItemResponse(BaseModel):
    menu_item_id: Optional[UUID] = None
    name: str
    quantity: int
    unit_price: Decimal
    line_total: Decimal
    is_veg: bool = True
    options: List[str] = []
    special_instructions: Optional[str] = None

class FoodOrderResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    order_number: str
    order_type: str = "food"
    status: str
    restaurant_id: Optional[UUID] = None
    restaurant_name: Optional[str] = None
    customer_id: UUID
    subtotal: Decimal
    delivery_fee: Decimal
    packaging_fee: Decimal = Decimal("0.00")
    tax: Decimal
    discount: Decimal = Decimal("0.00")
    total_amount: Decimal
    payment_method: str
    payment_status: str
    delivery_address: Dict[str, Any]
    items: List[FoodOrderItemResponse] = []
    # delivery_otp field removed — OTPs must never be serialized in API responses.
    notes: Optional[str] = None
    created_at: datetime
    estimated_delivery_at: Optional[datetime] = None

class RestaurantDashboardStats(BaseModel):
    today_orders: int
    today_revenue: Decimal
    pending_orders: int
    preparing_orders: int
    ready_orders: int
    is_open: bool
    is_accepting_orders: bool
    active_menu_items: int
    unavailable_items: int

class ToggleAvailability(BaseModel):
    is_available: bool

class BulkAvailabilityUpdate(BaseModel):
    item_ids: List[UUID] = Field(..., min_length=1)
    is_available: bool
