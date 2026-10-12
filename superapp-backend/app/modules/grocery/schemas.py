"""Grocery module Pydantic schemas for API requests/responses."""
from datetime import datetime
from decimal import Decimal
from pydantic import condecimal
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict


# ============== Category Schemas ==============

class CategoryBase(BaseModel):
    """Base category schema."""
    name: str = Field(..., min_length=1, max_length=100)
    slug: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    icon: Optional[str] = "🛒"
    image_url: Optional[str] = None
    display_order: int = 0
    is_active: bool = True


class CategoryCreate(CategoryBase):
    """Schema for creating a category."""
    parent_id: Optional[UUID] = None


class CategoryUpdate(BaseModel):
    """Schema for updating a category."""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    icon: Optional[str] = None
    image_url: Optional[str] = None
    display_order: Optional[int] = None
    is_active: Optional[bool] = None
    parent_id: Optional[UUID] = None


class CategoryResponse(CategoryBase):
    """Category response schema."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    parent_id: Optional[UUID] = None
    product_count: int = 0
    created_at: datetime
    updated_at: datetime


class CategoryListResponse(BaseModel):
    """Response for category list endpoint."""
    items: List[CategoryResponse]
    total: int


# ============== Product Schemas ==============

class ProductBase(BaseModel):
    """Base product schema."""
    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None
    price: condecimal(max_digits=10, decimal_places=2) = Field(..., ge=0)
    mrp: Optional[condecimal(max_digits=10, decimal_places=2)] = Field(
    None,
    ge=0
)
    unit: str = Field(default="piece", max_length=50)
    category_id: UUID
    
    # Images
    image_urls: Optional[List[str]] = []
    primary_image_url: Optional[str] = None
    
    # Display
    display_order: int = 0
    is_active: bool = True
    is_featured: bool = False
    
    # Metadata
    tags: Optional[List[str]] = []
    sku: Optional[str] = None

    # Extended product info (barcode scan)
    barcode: Optional[str] = Field(None, max_length=20)
    brand: Optional[str] = Field(None, max_length=255)
    ingredients: Optional[str] = None
    nutrition: Optional[dict] = None  # {energy_kcal, proteins_g, carbs_g, fat_g}


class ProductCreate(ProductBase):
    """Schema for creating a product."""
    stock_quantity: int = Field(default=0, ge=0)
    low_stock_threshold: int = Field(default=10, ge=0)


class ProductUpdate(BaseModel):
    """Schema for updating a product."""
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    price: Optional[condecimal(max_digits=10, decimal_places=2)] = Field(
    None,
    ge=0
)
    mrp: Optional[condecimal(max_digits=10, decimal_places=2)] = Field(None,ge=0)
    unit: Optional[str] = Field(None, max_length=50)
    category_id: Optional[UUID] = None
    
    image_urls: Optional[List[str]] = None
    primary_image_url: Optional[str] = None
    
    display_order: Optional[int] = None
    is_active: Optional[bool] = None
    is_featured: Optional[bool] = None
    
    tags: Optional[List[str]] = None
    sku: Optional[str] = None
    stock_quantity: Optional[int] = Field(None, ge=0)
    low_stock_threshold: Optional[int] = Field(None, ge=0)
    barcode: Optional[str] = Field(None, max_length=20)
    brand: Optional[str] = Field(None, max_length=255)
    ingredients: Optional[str] = None
    nutrition: Optional[dict] = None


class ProductStockUpdate(BaseModel):
    """Schema for updating product stock."""
    quantity: int = Field(..., description="New stock quantity")
    reason: str = Field(default="adjustment", description="Reason for stock change")
    notes: Optional[str] = None


class ProductResponse(ProductBase):
    """Product response schema."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    
    # Stock info
    stock_quantity: int
    available_stock: int
    is_in_stock: bool
    is_low_stock: bool
    
    # Computed fields
    discount_percentage: Optional[int] = None

    # Category info (nested)
    category_name: Optional[str] = None

    # Ownership
    owner_type: str = 'platform'
    store_id: Optional[UUID] = None

    created_at: datetime
    updated_at: datetime


class ProductListItem(BaseModel):
    """Simplified product for list views."""
    model_config = ConfigDict(from_attributes=True)
    
    id: UUID
    name: str
    price: Decimal
    mrp: Optional[Decimal] = None
    unit: str
    primary_image_url: Optional[str] = None
    is_in_stock: bool
    discount_percentage: Optional[int] = None
    category_id: UUID
    category_name: Optional[str] = None


class ProductListResponse(BaseModel):
    """Response for product list endpoint."""
    items: List[ProductListItem]
    total: int
    page: int
    page_size: int
    total_pages: int


# ============== Filter/Query Schemas ==============

class ProductFilterParams(BaseModel):
    """Query parameters for product listing."""
    category_id: Optional[UUID] = None
    search: Optional[str] = None
    in_stock_only: bool = False
    featured_only: bool = False
    min_price: Optional[Decimal] = None
    max_price: Optional[Decimal] = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
    sort_by: str = Field(default="display_order", pattern="^(name|price|created_at|display_order)$")
    sort_order: str = Field(default="asc", pattern="^(asc|desc)$")


class CategoryFilterParams(BaseModel):
    """Query parameters for category listing."""
    parent_id: Optional[UUID] = None
    include_inactive: bool = False


# ============== Cart/Order Related Schemas ==============

class CartItem(BaseModel):
    """Item in shopping cart."""
    product_id: UUID
    quantity: int = Field(..., ge=1)
    

class CartValidationResponse(BaseModel):
    """Response for cart validation (stock check)."""
    valid: bool
    items: List[dict]
    errors: List[str] = []
    total: Decimal


# ============== Featured/Search Schemas ==============

class FeaturedProductsResponse(BaseModel):
    """Featured products grouped by category."""
    categories: List[dict]  # Each with category info + products list


class SearchSuggestionsResponse(BaseModel):
    """Search suggestions for autocomplete."""
    products: List[dict]  # id, name, category
    categories: List[dict]  # id, name


# ============== Barcode / Image Schemas ==============

class NutritionInfo(BaseModel):
    energy_kcal: Optional[float] = None
    proteins_g: Optional[float] = None
    carbs_g: Optional[float] = None
    fat_g: Optional[float] = None


class BarcodeResponse(BaseModel):
    """Response from GET /grocery/barcode/{barcode}."""
    found: bool
    name: Optional[str] = None
    brand: Optional[str] = None
    weight: Optional[str] = None
    barcode: Optional[str] = None
    category: Optional[str] = None
    image_url: Optional[str] = None
    ingredients: Optional[str] = None
    nutrition: Optional[NutritionInfo] = None


class ImageUploadResponse(BaseModel):
    """Response from POST /grocery/products/upload-image."""
    image_url: str
