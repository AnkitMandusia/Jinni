"""Food module models — restaurants, menu, customizations (Zomato/Swiggy parity)."""
from uuid import uuid4
from datetime import datetime, time
from decimal import Decimal
from sqlalchemy import (
    Column, String, Text, Numeric, Integer, Boolean, DateTime, Time,
    ForeignKey, Index, UniqueConstraint, CheckConstraint, Float,
)
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import relationship
from app.database import Base


class Restaurant(Base):
    __tablename__ = "restaurants"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    owner_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False, index=True)
    slug = Column(String(255), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    cuisines = Column(ARRAY(String), nullable=False, default=list)
    tags = Column(ARRAY(String), nullable=True, default=list)
    logo_url = Column(Text, nullable=True)
    cover_image_url = Column(Text, nullable=True)
    gallery = Column(ARRAY(Text), nullable=True, default=list)
    address_line1 = Column(String(255), nullable=False)
    address_line2 = Column(String(255), nullable=True)
    city = Column(String(100), nullable=False, index=True)
    state = Column(String(100), nullable=False)
    pincode = Column(String(10), nullable=False, index=True)
    latitude = Column(Float, nullable=False)
    longitude = Column(Float, nullable=False)
    is_open = Column(Boolean, default=True, nullable=False)
    is_accepting_orders = Column(Boolean, default=True, nullable=False)
    pure_veg = Column(Boolean, default=False, nullable=False)
    cost_for_two = Column(Integer, nullable=True)
    min_order_amount = Column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    delivery_fee = Column(Numeric(10, 2), default=Decimal("30.00"), nullable=False)
    free_delivery_above = Column(Numeric(10, 2), nullable=True)
    packaging_fee = Column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    avg_prep_minutes = Column(Integer, default=25, nullable=False)
    delivery_radius_km = Column(Numeric(5, 2), default=Decimal("8.00"), nullable=False)
    opens_at = Column(Time, default=time(9, 0), nullable=False)
    closes_at = Column(Time, default=time(23, 0), nullable=False)
    rating_avg = Column(Numeric(3, 2), default=Decimal("0.00"), nullable=False)
    rating_count = Column(Integer, default=0, nullable=False)
    fssai_license = Column(String(30), nullable=True)
    gstin = Column(String(20), nullable=True)
    bank_account = Column(String(30), nullable=True)
    bank_ifsc = Column(String(15), nullable=True)
    upi_id = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True, nullable=False)
    is_verified = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    categories = relationship("MenuCategory", back_populates="restaurant", cascade="all, delete-orphan", order_by="MenuCategory.display_order")
    menu_items = relationship("MenuItem", back_populates="restaurant", cascade="all, delete-orphan")
    __table_args__ = (
        Index("idx_restaurant_geo", "latitude", "longitude"),
        Index("idx_restaurant_open_active", "is_open", "is_active", "is_accepting_orders"),
        Index("idx_restaurant_city_pincode", "city", "pincode"),
    )


class MenuCategory(Base):
    __tablename__ = "menu_categories"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    restaurant_id = Column(UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    display_order = Column(Integer, default=0, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    restaurant = relationship("Restaurant", back_populates="categories")
    items = relationship("MenuItem", back_populates="category", cascade="all, delete-orphan", order_by="MenuItem.display_order")
    __table_args__ = (
        UniqueConstraint("restaurant_id", "name", name="uq_menu_category_name_per_restaurant"),
        Index("idx_menu_category_active", "restaurant_id", "is_active", "display_order"),
    )


class MenuItem(Base):
    __tablename__ = "menu_items"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    restaurant_id = Column(UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("menu_categories.id", ondelete="SET NULL"), nullable=True, index=True)
    name = Column(String(255), nullable=False, index=True)
    description = Column(Text, nullable=True)
    price = Column(Numeric(10, 2), nullable=False)
    discounted_price = Column(Numeric(10, 2), nullable=True)
    is_veg = Column(Boolean, default=True, nullable=False)
    is_egg = Column(Boolean, default=False, nullable=False)
    image_url = Column(Text, nullable=True)
    is_available = Column(Boolean, default=True, nullable=False)
    is_active = Column(Boolean, default=True, nullable=False)
    max_qty_per_order = Column(Integer, nullable=True)
    prep_time_minutes = Column(Integer, nullable=True)
    is_bestseller = Column(Boolean, default=False, nullable=False)
    is_recommended = Column(Boolean, default=False, nullable=False)
    display_order = Column(Integer, default=0, nullable=False)
    order_count = Column(Integer, default=0, nullable=False)
    hsn_code = Column(String(20), nullable=True)
    tax_percent = Column(Numeric(5, 2), default=Decimal("5.00"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    restaurant = relationship("Restaurant", back_populates="menu_items")
    category = relationship("MenuCategory", back_populates="items")
    option_groups = relationship("MenuItemOptionGroup", back_populates="menu_item", cascade="all, delete-orphan", order_by="MenuItemOptionGroup.display_order")
    __table_args__ = (
        CheckConstraint("price >= 0", name="ck_menu_item_price_nonneg"),
        CheckConstraint("discounted_price IS NULL OR discounted_price <= price", name="ck_menu_item_discount_lte_price"),
        Index("idx_menu_item_list", "restaurant_id", "is_active", "is_available", "display_order"),
        Index("idx_menu_item_veg", "restaurant_id", "is_veg", "is_available"),
    )
    @property
    def effective_price(self) -> Decimal:
        return self.discounted_price if self.discounted_price is not None else self.price


class MenuItemOptionGroup(Base):
    __tablename__ = "menu_item_option_groups"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    menu_item_id = Column(UUID(as_uuid=True), ForeignKey("menu_items.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    min_select = Column(Integer, default=0, nullable=False)
    max_select = Column(Integer, default=1, nullable=False)
    is_required = Column(Boolean, default=False, nullable=False)
    display_order = Column(Integer, default=0, nullable=False)
    menu_item = relationship("MenuItem", back_populates="option_groups")
    options = relationship("MenuItemOption", back_populates="group", cascade="all, delete-orphan", order_by="MenuItemOption.display_order")
    __table_args__ = (
        CheckConstraint("min_select >= 0", name="ck_option_group_min"),
        CheckConstraint("max_select >= min_select", name="ck_option_group_max"),
    )


class MenuItemOption(Base):
    __tablename__ = "menu_item_options"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    group_id = Column(UUID(as_uuid=True), ForeignKey("menu_item_option_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(100), nullable=False)
    price_delta = Column(Numeric(10, 2), default=Decimal("0.00"), nullable=False)
    is_default = Column(Boolean, default=False, nullable=False)
    is_available = Column(Boolean, default=True, nullable=False)
    is_veg = Column(Boolean, default=True, nullable=False)
    display_order = Column(Integer, default=0, nullable=False)
    group = relationship("MenuItemOptionGroup", back_populates="options")


class FoodCart(Base):
    __tablename__ = "food_carts"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    restaurant_id = Column(UUID(as_uuid=True), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=True, index=True)
    items = Column(JSONB, nullable=False, default=list)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
