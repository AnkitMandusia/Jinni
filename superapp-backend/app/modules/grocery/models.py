"""Grocery module models - Categories and Products."""
from uuid import uuid4
from datetime import datetime
from typing import List, Optional

from sqlalchemy import (
    Column, String, Text, Numeric, Integer, Boolean, DateTime,
    ForeignKey, Index, ARRAY, text
)
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship

from app.database import Base


class Category(Base):
    """Product category with hierarchical support."""
    __tablename__ = "product_categories"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String(100), nullable=False, index=True)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    
    # Icon/Emoji for mobile app
    icon = Column(String(10), nullable=True, default="🛒")
    
    # Image URL
    image_url = Column(Text, nullable=True)
    
    # Hierarchy
    parent_id = Column(UUID(as_uuid=True), ForeignKey("product_categories.id"), nullable=True)
    display_order = Column(Integer, default=0)
    
    # Status
    is_active = Column(Boolean, default=True)
    
    # Metadata
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    parent = relationship("Category", remote_side=[id], back_populates="children")
    children = relationship("Category", back_populates="parent")
    products = relationship("Product", back_populates="category")
    
    # Indexes
    __table_args__ = (
        Index('idx_category_active', 'is_active', 'display_order'),
    )
    
    def __repr__(self):
        return f"<Category(id={self.id}, name={self.name}, slug={self.slug})>"
    
    @property
    def product_count(self) -> int:
        """Get active product count for this category."""
        if self.products:
            return len([p for p in self.products if p.is_active])
        return 0


class Product(Base):
    """Grocery product - app-owned inventory (no external vendors)."""
    __tablename__ = "products"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    
    # Basic info
    name = Column(String(255), nullable=False, index=True)
    slug = Column(String(255), unique=True, nullable=False, index=True)
    description = Column(Text, nullable=True)
    
    # SKU for inventory management
    sku = Column(String(50), unique=True, nullable=True)
    
    # Pricing
    price = Column(Numeric(10, 2), nullable=False)  # Selling price
    mrp = Column(Numeric(10, 2), nullable=True)   # Maximum retail price (for showing discount)
    
    # Unit (e.g., "500g", "1 kg", "1 piece")
    unit = Column(String(50), nullable=False, default="piece")
    
    # Inventory
    stock_quantity = Column(Integer, nullable=False, default=0)
    reserved_quantity = Column(Integer, default=0)  # Items held in carts
    low_stock_threshold = Column(Integer, default=10)
    
    # Category
    category_id = Column(UUID(as_uuid=True), ForeignKey("product_categories.id"), nullable=False, index=True)
    
    # Images
    image_urls = Column(ARRAY(Text), default=list)
    primary_image_url = Column(Text, nullable=True)
    
    # Display
    display_order = Column(Integer, default=0)
    
    # Status
    is_active = Column(Boolean, default=True)
    is_featured = Column(Boolean, default=False)
    
    # Metadata
    tags = Column(ARRAY(String), default=list)  # e.g., ["organic", "fresh", "best-seller"]

    # Extended product info (Feature 3 — barcode scan)
    barcode = Column(String(20), nullable=True, index=True)  # EAN-13 / UPC-A / QR
    brand = Column(String(255), nullable=True)
    ingredients = Column(Text, nullable=True)
    nutrition = Column(JSONB, nullable=True)  # {energy_kcal, proteins_g, carbs_g, fat_g}

    # Ownership (Feature 4 — store vs platform product)
    owner_type = Column(String(20), nullable=False, default='platform')  # 'platform' | 'store'
    store_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True, index=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    category = relationship("Category", back_populates="products")

    # Indexes
    __table_args__ = (
        Index('idx_product_category_active', 'category_id', 'is_active', 'display_order'),
        Index('idx_product_search', text("name gin_trgm_ops"), postgresql_using='gin'),
        Index('idx_product_featured', 'is_featured', 'is_active'),
        Index('idx_product_barcode', 'barcode', unique=True,
              postgresql_where=text('barcode IS NOT NULL')),
        Index('idx_product_store', 'store_id', 'owner_type'),
    )
    
    def __repr__(self):
        return f"<Product(id={self.id}, name={self.name}, price={self.price})>"
    
    @property
    def available_stock(self) -> int:
        """Calculate available stock (total - reserved)."""
        return max(0, self.stock_quantity - self.reserved_quantity)
    
    @property
    def is_in_stock(self) -> bool:
        """Check if product is in stock."""
        return self.available_stock > 0
    
    @property
    def discount_percentage(self) -> Optional[int]:
        """Calculate discount percentage if MRP is set."""
        if self.mrp and self.mrp > self.price:
            return int(((self.mrp - self.price) / self.mrp) * 100)
        return None
    
    @property
    def is_low_stock(self) -> bool:
        """Check if stock is below threshold."""
        return self.available_stock <= self.low_stock_threshold


class ProductInventoryLog(Base):
    """Audit log for inventory changes."""
    __tablename__ = "product_inventory_logs"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True)
    
    # Change details
    previous_quantity = Column(Integer, nullable=False)
    new_quantity = Column(Integer, nullable=False)
    change_amount = Column(Integer, nullable=False)
    
    # Reason
    reason = Column(String(50), nullable=False)  # 'sale', 'restock', 'adjustment', 'cancellation'
    notes = Column(Text, nullable=True)
    
    # Who made the change
    changed_by = Column(String(100), nullable=True)  # 'system', 'admin', user_id
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    def __repr__(self):
        return f"<InventoryLog(product={self.product_id}, change={self.change_amount})>"
