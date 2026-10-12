"""Store inventory models - store-specific product availability."""
from uuid import uuid4
from datetime import datetime
from sqlalchemy import Column, String, Text, Numeric, Integer, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class StoreInventory(Base):
    """Store-specific availability for universal products."""
    __tablename__ = "store_inventory"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    store_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id"), nullable=False, index=True)
    
    # Store can toggle availability
    is_available = Column(Boolean, default=True)
    
    # Store can set custom price (optional override)
    custom_price = Column(Numeric(10, 2), nullable=True)
    
    # Store-specific stock
    stock_quantity = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    store = relationship("User", foreign_keys=[store_id])
    product = relationship("Product", foreign_keys=[product_id])
    
    __table_args__ = (
        UniqueConstraint('store_id', 'product_id', name='uq_store_product'),
    )
    
    def __repr__(self):
        return f"<StoreInventory(store={self.store_id}, product={self.product_id}, available={self.is_available})>"


class StoreCustomProduct(Base):
    """Store-added custom products (not in universal catalog)."""
    __tablename__ = "store_custom_products"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    store_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    category_id = Column(UUID(as_uuid=True), ForeignKey("product_categories.id"), nullable=False)
    
    name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    price = Column(Numeric(10, 2), nullable=False)
    unit = Column(String(50), default="piece")
    stock_quantity = Column(Integer, default=0)
    image_url = Column(Text, nullable=True)
    is_available = Column(Boolean, default=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    store = relationship("User", foreign_keys=[store_id])
    category = relationship("Category", foreign_keys=[category_id])
    
    def __repr__(self):
        return f"<StoreCustomProduct(store={self.store_id}, name={self.name})>"
