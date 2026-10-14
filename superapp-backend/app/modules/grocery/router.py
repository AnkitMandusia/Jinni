"""Grocery module REST API router."""
from typing import List, Optional
from uuid import UUID
from decimal import Decimal

from pydantic import BaseModel
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_optional_user, get_current_active_user
from app.modules.users.models import User
from app.modules.grocery import schemas
from app.modules.grocery.service import (
    category_service,
    product_service,
    cart_service
)
from app.modules.grocery.store_service import StoreInventoryService

router = APIRouter(prefix="/grocery", tags=["grocery"])


# ============== Category Endpoints ==============

@router.get("/categories", response_model=schemas.CategoryListResponse)
async def list_categories(
    parent_id: Optional[UUID] = Query(None, description="Filter by parent category"),
    include_inactive: bool = Query(False, description="Include inactive categories"),
    store_id: Optional[UUID] = Query(None, description="Filter categories available in this store"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get all grocery categories.
    
    - Use parent_id to get subcategories
    - Use store_id to get only categories with products available in that store
    - Returns categories sorted by display_order
    """
    from sqlalchemy import select, and_, distinct, func
    from app.modules.grocery.inventory_models import StoreInventory, StoreCustomProduct
    from app.modules.grocery.models import Product

    categories = await category_service.get_categories(
        db, parent_id=parent_id, include_inactive=include_inactive
    )

    # Per-category product count map (populated differently for store vs global)
    store_cat_counts: dict = {}

    # If store_id provided, only keep categories that have products in that store
    if store_id:
        # category ids + counts for available universal products in this store
        inv_result = await db.execute(
            select(Product.category_id, func.count(StoreInventory.id).label("cnt"))
            .join(
                StoreInventory,
                and_(
                    StoreInventory.product_id == Product.id,
                    StoreInventory.store_id == store_id,
                    StoreInventory.is_available == True,
                )
            )
            .where(Product.is_active == True)
            .group_by(Product.category_id)
        )
        for row in inv_result.all():
            store_cat_counts[row[0]] = store_cat_counts.get(row[0], 0) + row[1]

        # category ids + counts for available custom products in this store
        custom_result = await db.execute(
            select(StoreCustomProduct.category_id, func.count(StoreCustomProduct.id).label("cnt"))
            .where(
                and_(
                    StoreCustomProduct.store_id == store_id,
                    StoreCustomProduct.is_available == True,
                )
            )
            .group_by(StoreCustomProduct.category_id)
        )
        for row in custom_result.all():
            store_cat_counts[row[0]] = store_cat_counts.get(row[0], 0) + row[1]

        # Only keep categories that have at least one product in this store
        categories = [c for c in categories if c.id in store_cat_counts]

    # Calculate product count for each category
    response_items = []
    for cat in categories:
        if store_id:
            product_count = store_cat_counts.get(cat.id, 0)
        else:
            product_count = len([p for p in cat.products if p.is_active])
        cat_dict = {
            "id": cat.id,
            "name": cat.name,
            "slug": cat.slug,
            "description": cat.description,
            "icon": cat.icon,
            "image_url": cat.image_url,
            "display_order": cat.display_order,
            "is_active": cat.is_active,
            "parent_id": cat.parent_id,
            "product_count": product_count,
            "created_at": cat.created_at,
            "updated_at": cat.updated_at,
        }
        response_items.append(schemas.CategoryResponse.model_validate(cat_dict))
    
    return schemas.CategoryListResponse(
        items=response_items,
        total=len(response_items)
    )


@router.get("/categories/{category_id}", response_model=schemas.CategoryResponse)
async def get_category(
    category_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get a single category by ID."""
    category = await category_service.get_category_by_id(db, category_id)
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found"
        )
    
    cat_dict = {
        "id": category.id,
        "name": category.name,
        "slug": category.slug,
        "description": category.description,
        "icon": category.icon,
        "image_url": category.image_url,
        "display_order": category.display_order,
        "is_active": category.is_active,
        "parent_id": category.parent_id,
        "product_count": len([p for p in category.products if p.is_active]),
        "created_at": category.created_at,
        "updated_at": category.updated_at,
    }
    return schemas.CategoryResponse.model_validate(cat_dict)


# ============== Product Endpoints ==============

@router.get("/products", response_model=schemas.ProductListResponse)
async def list_products(
    category_id: Optional[UUID] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search by name"),
    in_stock_only: bool = Query(False, description="Only in-stock products"),
    featured_only: bool = Query(False, description="Only featured products"),
    min_price: Optional[Decimal] = Query(None, description="Minimum price"),
    max_price: Optional[Decimal] = Query(None, description="Maximum price"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(20, ge=1, le=100, description="Items per page"),
    sort_by: str = Query("display_order", pattern="^(name|price|created_at|display_order)$"),
    sort_order: str = Query("asc", pattern="^(asc|desc)$"),
    store_id: Optional[UUID] = Query(None, description="Filter products available in this store"),
    db: AsyncSession = Depends(get_db)
):
    """
    Get grocery products with filtering and pagination.
    
    Query parameters:
    - category_id: Filter by category UUID
    - search: Search term for product name
    - in_stock_only: Only show products with available stock
    - featured_only: Only show featured products
    - min_price/max_price: Price range filter
    - page/page_size: Pagination
    - sort_by: Sort field (name, price, created_at, display_order)
    - sort_order: asc or desc
    """
    # If store_id provided, return products available at that specific store
    if store_id:
        store_data = await StoreInventoryService.get_store_products_by_category(
            db, store_id, category_id
        )
        combined: list[dict] = []
        for p in store_data["universal"]:
            if not p["is_available"]:
                continue
            combined.append({
                "id": p["product_id"],
                "name": p["name"],
                "price": p["price"],
                "mrp": None,
                "unit": p["unit"],
                "primary_image_url": p["image_url"],
                "is_in_stock": p["stock_quantity"] > 0 or p["is_available"],
                "discount_percentage": None,
                "category_id": p["category_id"],
                "category_name": None,
            })
        for p in store_data["custom"]:
            if not p["is_available"]:
                continue
            combined.append({
                "id": p["id"],
                "name": p["name"],
                "price": p["price"],
                "mrp": None,
                "unit": p["unit"],
                "primary_image_url": p["image_url"],
                "is_in_stock": p["stock_quantity"] > 0 or p["is_available"],
                "discount_percentage": None,
                "category_id": p["category_id"],
                "category_name": None,
            })
        if search:
            combined = [p for p in combined if search.lower() in p["name"].lower()]
        total = len(combined)
        start = (page - 1) * page_size
        paged = combined[start: start + page_size]
        return schemas.ProductListResponse(
            items=[schemas.ProductListItem.model_validate(p) for p in paged],
            total=total,
            page=page,
            page_size=page_size,
            total_pages=(total + page_size - 1) // page_size,
        )

    filters = schemas.ProductFilterParams(
        category_id=category_id,
        search=search,
        in_stock_only=in_stock_only,
        featured_only=featured_only,
        min_price=min_price,
        max_price=max_price,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order
    )
    
    products, total = await product_service.get_products(db, filters)
    
    # Build response
    items = []
    for product in products:
        items.append(schemas.ProductListItem.model_validate({
            "id": product.id,
            "name": product.name,
            "price": product.price,
            "mrp": product.mrp,
            "unit": product.unit,
            "primary_image_url": product.primary_image_url,
            "is_in_stock": product.is_in_stock,
            "discount_percentage": product.discount_percentage,
            "category_id": product.category_id,
            "category_name": product.category.name if product.category else None,
        }))
    
    total_pages = (total + page_size - 1) // page_size
    
    return schemas.ProductListResponse(
        items=items,
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages
    )


@router.get("/products/featured", response_model=List[schemas.ProductListItem])
async def get_featured_products(
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db)
):
    """Get featured products for home screen."""
    products = await product_service.get_featured_products(db, limit)
    
    return [
        schemas.ProductListItem.model_validate({
            "id": p.id,
            "name": p.name,
            "price": p.price,
            "mrp": p.mrp,
            "unit": p.unit,
            "primary_image_url": p.primary_image_url,
            "is_in_stock": p.is_in_stock,
            "discount_percentage": p.discount_percentage,
            "category_id": p.category_id,
            "category_name": p.category.name if p.category else None,
        })
        for p in products
    ]


@router.get("/products/{product_id}", response_model=schemas.ProductResponse)
async def get_product(
    product_id: UUID,
    db: AsyncSession = Depends(get_db)
):
    """Get detailed product information by ID."""
    product = await product_service.get_product_by_id(db, product_id)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found"
        )
    
    return schemas.ProductResponse.model_validate({
        "id": product.id,
        "name": product.name,
        "slug": product.slug,
        "description": product.description,
        "price": product.price,
        "mrp": product.mrp,
        "unit": product.unit,
        "category_id": product.category_id,
        "image_urls": product.image_urls,
        "primary_image_url": product.primary_image_url,
        "display_order": product.display_order,
        "is_active": product.is_active,
        "is_featured": product.is_featured,
        "tags": product.tags,
        "sku": product.sku,
        "stock_quantity": product.stock_quantity,
        "available_stock": product.available_stock,
        "is_in_stock": product.is_in_stock,
        "is_low_stock": product.is_low_stock,
        "discount_percentage": product.discount_percentage,
        "category_name": product.category.name if product.category else None,
        "created_at": product.created_at,
        "updated_at": product.updated_at,
    })


@router.get("/categories/{category_id}/products", response_model=List[schemas.ProductListItem])
async def get_products_by_category(
    category_id: UUID,
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    """Get products for a specific category."""
    # Verify category exists
    category = await category_service.get_category_by_id(db, category_id)
    if not category:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Category not found"
        )
    
    products = await product_service.get_products_by_category(db, category_id, limit)
    
    return [
        schemas.ProductListItem.model_validate({
            "id": p.id,
            "name": p.name,
            "price": p.price,
            "mrp": p.mrp,
            "unit": p.unit,
            "primary_image_url": p.primary_image_url,
            "is_in_stock": p.is_in_stock,
            "discount_percentage": p.discount_percentage,
            "category_id": p.category_id,
            "category_name": p.category.name if p.category else None,
        })
        for p in products
    ]


# ============== Search Endpoints ==============

@router.get("/search/suggestions")
async def search_suggestions(
    q: str = Query(..., min_length=2, description="Search query"),
    limit: int = Query(10, ge=1, le=20),
    db: AsyncSession = Depends(get_db)
):
    """Get search suggestions for autocomplete."""
    results = await product_service.search_suggestions(db, q, limit)
    return results


# ============== Cart Validation Endpoint ==============

@router.post("/cart/validate", response_model=schemas.CartValidationResponse)
async def validate_cart(
    items: List[schemas.CartItem],
    db: AsyncSession = Depends(get_db)
):
    """
    Validate cart items against current stock.
    
    Use this before checkout to ensure all items are available.
    """
    return await cart_service.validate_cart(db, items)


# ============== Admin Endpoints (Require Authentication) ==============

@router.post("/admin/categories", response_model=schemas.CategoryResponse, status_code=status.HTTP_201_CREATED)
async def admin_create_category(
    category_data: schemas.CategoryCreate,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """[Admin] Create a new category."""
    # Check for duplicate slug
    existing = await category_service.get_category_by_slug(db, category_data.slug)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category with this slug already exists"
        )
    
    category = await category_service.create_category(db, category_data)
    
    return schemas.CategoryResponse.model_validate({
        "id": category.id,
        "name": category.name,
        "slug": category.slug,
        "description": category.description,
        "icon": category.icon,
        "image_url": category.image_url,
        "display_order": category.display_order,
        "is_active": category.is_active,
        "parent_id": category.parent_id,
        "product_count": 0,
        "created_at": category.created_at,
        "updated_at": category.updated_at,
    })


@router.post("/admin/products", response_model=schemas.ProductResponse, status_code=status.HTTP_201_CREATED)
async def admin_create_product(
    product_data: schemas.ProductCreate,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """[Admin] Create a new product."""
    # Verify category exists
    category = await category_service.get_category_by_id(db, product_data.category_id)
    if not category:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Category not found"
        )
    
    # Check for duplicate slug
    existing = await product_service.get_product_by_slug(db, product_data.slug)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Product with this slug already exists"
        )
    
    product = await product_service.create_product(db, product_data)
    # Platform products are always created by admin
    if not product.owner_type:
        product.owner_type = 'platform'
        await db.commit()
        await db.refresh(product)

    return schemas.ProductResponse.model_validate({
        "id": product.id,
        "name": product.name,
        "slug": product.slug,
        "description": product.description,
        "price": product.price,
        "mrp": product.mrp,
        "unit": product.unit,
        "category_id": product.category_id,
        "image_urls": product.image_urls,
        "primary_image_url": product.primary_image_url,
        "display_order": product.display_order,
        "is_active": product.is_active,
        "is_featured": product.is_featured,
        "tags": product.tags,
        "sku": product.sku,
        "barcode": product.barcode,
        "brand": product.brand,
        "ingredients": product.ingredients,
        "nutrition": product.nutrition,
        "owner_type": product.owner_type or 'platform',
        "store_id": product.store_id,
        "stock_quantity": product.stock_quantity,
        "available_stock": product.available_stock,
        "is_in_stock": product.is_in_stock,
        "is_low_stock": product.is_low_stock,
        "discount_percentage": product.discount_percentage,
        "category_name": category.name,
        "created_at": product.created_at,
        "updated_at": product.updated_at,
    })


@router.put("/admin/products/{product_id}/stock")
async def admin_update_stock(
    product_id: UUID,
    stock_update: schemas.ProductStockUpdate,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """[Admin] Update product stock quantity."""
    product = await product_service.get_product_by_id(db, product_id)
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found"
        )
    
    updated_product = await product_service.update_stock(
        db,
        product,
        stock_update.quantity,
        stock_update.reason,
        changed_by=str(user.id),
        notes=stock_update.notes
    )
    
    return {
        "id": updated_product.id,
        "name": updated_product.name,
        "previous_stock": updated_product.stock_quantity - (stock_update.quantity - product.stock_quantity) if product.stock_quantity else stock_update.quantity,
        "new_stock": updated_product.stock_quantity,
        "message": "Stock updated successfully"
    }


# ============== Store Inventory Endpoints ==============

@router.get("/store/products")
async def get_store_products(
    category_id: Optional[UUID] = None,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """[Store] Get universal + custom products by category."""
    if user.role != "store":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only stores can access this endpoint"
        )
    
    products = await StoreInventoryService.get_store_products_by_category(
        db, user.id, category_id
    )
    return products


class ToggleAvailabilityRequest(BaseModel):
    is_available: bool

@router.post("/store/products/{product_id}/toggle")
async def toggle_product_availability(
    product_id: UUID,
    data: ToggleAvailabilityRequest,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """[Store] Toggle universal product availability."""
    if user.role != "store":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only stores can manage inventory"
        )
    
    inventory = await StoreInventoryService.toggle_product_availability(
        db, user.id, product_id, data.is_available
    )
    return {"message": "Availability updated", "is_available": inventory.is_available}


class CustomProductCreate(BaseModel):
    name: str
    price: float
    category_id: str
    unit: str = "piece"
    description: Optional[str] = None
    image_url: Optional[str] = None
    stock_quantity: int = 0

@router.post("/store/custom-products")
async def create_custom_product(
    data: CustomProductCreate,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """[Store] Add custom product."""
    if user.role != "store":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only stores can add custom products"
        )
    
    from uuid import UUID
    product = await StoreInventoryService.create_custom_product(
        db, user.id, UUID(data.category_id), data.name, Decimal(str(data.price)), 
        data.unit, data.description, data.image_url, data.stock_quantity
    )
    return {
        "id": str(product.id),
        "name": product.name,
        "price": float(product.price),
        "message": "Custom product created"
    }


@router.post("/store/custom-products/{product_id}/toggle")
async def toggle_custom_product_availability(
    product_id: UUID,
    data: ToggleAvailabilityRequest,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """[Store] Toggle custom product availability."""
    if user.role != "store":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only stores can manage inventory"
        )
    
    product = await StoreInventoryService.update_custom_product(
        db, user.id, product_id, is_available=data.is_available
    )
    return {"message": "Availability updated", "is_available": product.is_available}


@router.delete("/store/custom-products/{product_id}")
async def delete_custom_product(
    product_id: UUID,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """[Store] Delete custom product."""
    if user.role != "store":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only stores can delete custom products"
        )
    
    await StoreInventoryService.delete_custom_product(db, user.id, product_id)
    return {"message": "Custom product deleted"}


@router.get("/products/by-pincode/{pincode}")
async def get_products_by_pincode(
    pincode: str,
    category_id: Optional[UUID] = None,
    db: AsyncSession = Depends(get_db)
):
    """[Customer] Get products available in a pincode area."""
    products = await StoreInventoryService.get_products_by_pincode(db, pincode, category_id)
    return {"products": products, "pincode": pincode}


# ============== Barcode Lookup (Feature 3) ==============

@router.get("/barcode/{barcode}", response_model=schemas.BarcodeResponse)
async def lookup_barcode(barcode: str):
    """[Store/Admin] Look up product info from Open Food Facts by barcode.

    Barcode formats: EAN-13, EAN-8, UPC-A, UPC-E.
    Returns `found=False` gracefully when no match is found.
    """
    import httpx

    url = f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, headers={"User-Agent": "SuperApp/1.0"})
    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Barcode lookup service unavailable",
        ) from exc

    if resp.status_code == 404 or resp.json().get("status") == 0:
        return schemas.BarcodeResponse(found=False, barcode=barcode)

    try:
        product = resp.json().get("product", {})
        nutriments = product.get("nutriments", {})
        nutrition = schemas.NutritionInfo(
            energy_kcal=nutriments.get("energy-kcal_100g"),
            proteins_g=nutriments.get("proteins_100g"),
            carbs_g=nutriments.get("carbohydrates_100g"),
            fat_g=nutriments.get("fat_100g"),
        )
        return schemas.BarcodeResponse(
            found=True,
            name=product.get("product_name") or product.get("product_name_en"),
            brand=product.get("brands"),
            weight=product.get("quantity"),
            barcode=barcode,
            category=product.get("categories_tags", [None])[0],
            image_url=product.get("image_front_url"),
            ingredients=product.get("ingredients_text_en") or product.get("ingredients_text"),
            nutrition=nutrition,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Could not parse barcode response",
        ) from exc


# ============== Image Upload (Feature 2) ==============

@router.post("/products/upload-image", response_model=schemas.ImageUploadResponse)
async def upload_product_image_endpoint(
    file: UploadFile = File(...),
    user: User = Depends(get_current_active_user),
):
    """[Store/Admin] Upload a product image → returns CDN URL.

    Accepts JPEG / PNG / WebP, max 10 MB.
    Image is resized to 800×800 and re-encoded as WebP (quality 85).
    """
    from app.modules.grocery.image_service import upload_product_image

    if user.role not in ("store", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only stores and admins can upload product images",
        )
    url = await upload_product_image(file)
    return schemas.ImageUploadResponse(image_url=url)


# ============== Permission-guarded Product CRUD (Feature 4) ==============

@router.put("/products/{product_id}", response_model=schemas.ProductResponse)
async def update_product(
    product_id: UUID,
    product_data: schemas.ProductUpdate,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """[Store/Admin] Update a product. Stores can only edit their own products."""
    from app.modules.grocery.permissions import require_product_access

    checked = await require_product_access(product_id, user, db)

    for field, value in product_data.model_dump(exclude_unset=True).items():
        setattr(checked, field, value)
    await db.commit()
    await db.refresh(checked)

    category = await category_service.get_category_by_id(db, checked.category_id)
    return schemas.ProductResponse.model_validate({
        "id": checked.id,
        "name": checked.name,
        "slug": checked.slug,
        "description": checked.description,
        "price": checked.price,
        "mrp": checked.mrp,
        "unit": checked.unit,
        "category_id": checked.category_id,
        "image_urls": checked.image_urls,
        "primary_image_url": checked.primary_image_url,
        "display_order": checked.display_order,
        "is_active": checked.is_active,
        "is_featured": checked.is_featured,
        "tags": checked.tags,
        "sku": checked.sku,
        "barcode": checked.barcode,
        "brand": checked.brand,
        "ingredients": checked.ingredients,
        "nutrition": checked.nutrition,
        "owner_type": checked.owner_type,
        "store_id": checked.store_id,
        "stock_quantity": checked.stock_quantity,
        "available_stock": checked.available_stock,
        "is_in_stock": checked.is_in_stock,
        "is_low_stock": checked.is_low_stock,
        "discount_percentage": checked.discount_percentage,
        "category_name": category.name if category else None,
        "created_at": checked.created_at,
        "updated_at": checked.updated_at,
    })


@router.delete("/products/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_product(
    product_id: UUID,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """[Store/Admin] Delete a product. Stores can only delete their own products."""
    from app.modules.grocery.permissions import require_product_access

    checked = await require_product_access(product_id, user, db)
    await db.delete(checked)
    await db.commit()


@router.get("/stores")
async def list_stores_by_pincode(
    pincode: str = Query(..., description="Customer delivery pincode"),
    db: AsyncSession = Depends(get_db),
):
    """[Customer] List open grocery stores serving a given pincode."""
    from sqlalchemy import select, and_
    from app.modules.users.models import User, StoreProfile

    result = await db.execute(
        select(User, StoreProfile)
        .join(StoreProfile, User.id == StoreProfile.user_id)
        .where(
            and_(
                User.role == "store",
                User.status == "active",
                StoreProfile.pincode == pincode,
                StoreProfile.is_open == True,
            )
        )
    )
    rows = result.all()

    return {
        "stores": [
            {
                "id": str(user.id),
                "store_name": profile.store_name,
                "owner_name": profile.owner_name,
                "address": profile.address,
                "pincode": profile.pincode,
                "city": profile.city,
                "is_open": profile.is_open,
                "delivery_radius_km": float(profile.delivery_radius_km or 5),
                "latitude": float(profile.latitude) if profile.latitude else None,
                "longitude": float(profile.longitude) if profile.longitude else None,
                # None / 0 means "not enough ratings yet" — frontend shows a
                # "NEW" chip instead of a star score in that case, same
                # convention as the restaurant list.
                "rating": float(profile.rating) if profile.rating is not None else None,
                "rating_count": profile.rating_count or 0,
            }
            for user, profile in rows
        ],
        "pincode": pincode,
        "total": len(rows),
    }
