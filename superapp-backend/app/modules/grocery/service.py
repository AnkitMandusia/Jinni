"""Grocery module service layer - business logic."""
from typing import List, Optional
from uuid import UUID
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_, desc, asc
from sqlalchemy.orm import selectinload

from app.modules.grocery.models import Category, Product, ProductInventoryLog
from app.modules.grocery import schemas


class CategoryService:
    """Service for category operations."""
    
    @staticmethod
    async def get_categories(
        db: AsyncSession,
        parent_id: Optional[UUID] = None,
        include_inactive: bool = False
    ) -> List[Category]:
        """Get categories with optional filtering."""
        query = select(Category).options(
            selectinload(Category.children),
            selectinload(Category.products)
        )
        
        # Filter by parent
        if parent_id:
            query = query.where(Category.parent_id == parent_id)
        else:
            query = query.where(Category.parent_id.is_(None))
        
        # Filter active
        if not include_inactive:
            query = query.where(Category.is_active == True)
        
        # Order by display_order
        query = query.order_by(asc(Category.display_order), asc(Category.name))
        
        result = await db.execute(query)
        return result.scalars().all()
    
    @staticmethod
    async def get_category_by_id(db: AsyncSession, category_id: UUID) -> Optional[Category]:
        """Get category by ID."""
        result = await db.execute(
            select(Category).where(Category.id == category_id)
        )
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_category_by_slug(db: AsyncSession, slug: str) -> Optional[Category]:
        """Get category by slug."""
        result = await db.execute(
            select(Category).where(Category.slug == slug)
        )
        return result.scalar_one_or_none()
    
    @staticmethod
    async def create_category(db: AsyncSession, category_data: schemas.CategoryCreate) -> Category:
        """Create a new category."""
        category = Category(**category_data.model_dump())
        db.add(category)
        await db.flush()
        await db.refresh(category)
        return category
    
    @staticmethod
    async def update_category(
        db: AsyncSession,
        category: Category,
        update_data: schemas.CategoryUpdate
    ) -> Category:
        """Update a category."""
        update_dict = update_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(category, field, value)
        await db.flush()
        await db.refresh(category)
        return category
    
    @staticmethod
    async def delete_category(db: AsyncSession, category: Category) -> None:
        """Delete a category (soft delete by deactivating)."""
        category.is_active = False
        await db.flush()


class ProductService:
    """Service for product operations."""
    
    @staticmethod
    async def get_products(
        db: AsyncSession,
        filters: schemas.ProductFilterParams
    ) -> tuple[List[Product], int]:
        """Get products with filtering and pagination."""
        # Base query
        query = select(Product).options(selectinload(Product.category))
        
        # Apply filters
        conditions = []
        
        if filters.category_id:
            conditions.append(Product.category_id == filters.category_id)
        
        if filters.search:
            search_term = f"%{filters.search}%"
            conditions.append(
                or_(
                    Product.name.ilike(search_term),
                    Product.description.ilike(search_term),
                    Product.tags.contains([filters.search])
                )
            )
        
        if filters.in_stock_only:
            conditions.append(Product.stock_quantity > Product.reserved_quantity)
        
        if filters.featured_only:
            conditions.append(Product.is_featured == True)
        
        if filters.min_price is not None:
            conditions.append(Product.price >= filters.min_price)
        
        if filters.max_price is not None:
            conditions.append(Product.price <= filters.max_price)
        
        # Always filter active products for customer view
        conditions.append(Product.is_active == True)
        
        if conditions:
            query = query.where(and_(*conditions))
        
        # Get total count
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar()
        
        # Apply sorting
        sort_column = getattr(Product, filters.sort_by, Product.display_order)
        if filters.sort_order == "desc":
            query = query.order_by(desc(sort_column))
        else:
            query = query.order_by(asc(sort_column))
        
        # Apply pagination
        offset = (filters.page - 1) * filters.page_size
        query = query.offset(offset).limit(filters.page_size)
        
        result = await db.execute(query)
        products = result.scalars().all()
        
        return products, total
    
    @staticmethod
    async def get_product_by_id(db: AsyncSession, product_id: UUID) -> Optional[Product]:
        """Get product by ID with category info."""
        result = await db.execute(
            select(Product)
            .options(selectinload(Product.category))
            .where(Product.id == product_id)
        )
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_product_by_slug(db: AsyncSession, slug: str) -> Optional[Product]:
        """Get product by slug."""
        result = await db.execute(
            select(Product)
            .options(selectinload(Product.category))
            .where(Product.slug == slug)
        )
        return result.scalar_one_or_none()
    
    @staticmethod
    async def get_featured_products(
        db: AsyncSession,
        limit: int = 10
    ) -> List[Product]:
        """Get featured products."""
        result = await db.execute(
            select(Product)
            .options(selectinload(Product.category))
            .where(
                and_(
                    Product.is_featured == True,
                    Product.is_active == True,
                    Product.stock_quantity > 0
                )
            )
            .order_by(asc(Product.display_order))
            .limit(limit)
        )
        return result.scalars().all()
    
    @staticmethod
    async def get_products_by_category(
        db: AsyncSession,
        category_id: UUID,
        limit: int = 20
    ) -> List[Product]:
        """Get products by category."""
        result = await db.execute(
            select(Product)
            .options(selectinload(Product.category))
            .where(
                and_(
                    Product.category_id == category_id,
                    Product.is_active == True
                )
            )
            .order_by(asc(Product.display_order))
            .limit(limit)
        )
        return result.scalars().all()
    
    @staticmethod
    async def create_product(
        db: AsyncSession,
        product_data: schemas.ProductCreate
    ) -> Product:
        """Create a new product."""
        product = Product(**product_data.model_dump())
        db.add(product)
        await db.flush()
        await db.refresh(product)
        return product
    
    @staticmethod
    async def update_product(
        db: AsyncSession,
        product: Product,
        update_data: schemas.ProductUpdate
    ) -> Product:
        """Update a product."""
        update_dict = update_data.model_dump(exclude_unset=True)
        for field, value in update_dict.items():
            setattr(product, field, value)
        await db.flush()
        await db.refresh(product)
        return product
    
    @staticmethod
    async def update_stock(
        db: AsyncSession,
        product: Product,
        new_quantity: int,
        reason: str,
        changed_by: str = "system",
        notes: Optional[str] = None
    ) -> Product:
        """Update product stock with audit log."""
        old_quantity = product.stock_quantity
        change_amount = new_quantity - old_quantity
        
        # Update product stock
        product.stock_quantity = new_quantity
        
        # Create audit log
        log = ProductInventoryLog(
            product_id=product.id,
            previous_quantity=old_quantity,
            new_quantity=new_quantity,
            change_amount=change_amount,
            reason=reason,
            changed_by=changed_by,
            notes=notes
        )
        db.add(log)
        
        await db.flush()
        await db.refresh(product)
        return product
    
    @staticmethod
    async def reserve_stock(
        db: AsyncSession,
        product: Product,
        quantity: int
    ) -> bool:
        """Reserve stock for cart/checkout."""
        available = product.stock_quantity - product.reserved_quantity
        if available < quantity:
            return False
        
        product.reserved_quantity += quantity
        await db.flush()
        return True
    
    @staticmethod
    async def release_stock(
        db: AsyncSession,
        product: Product,
        quantity: int
    ) -> None:
        """Release reserved stock (on cart removal or order cancellation)."""
        product.reserved_quantity = max(0, product.reserved_quantity - quantity)
        await db.flush()
    
    @staticmethod
    async def confirm_stock_deduction(
        db: AsyncSession,
        product: Product,
        quantity: int
    ) -> None:
        """Confirm stock deduction after successful order."""
        product.stock_quantity -= quantity
        product.reserved_quantity = max(0, product.reserved_quantity - quantity)
        await db.flush()
    
    @staticmethod
    async def delete_product(db: AsyncSession, product: Product) -> None:
        """Soft delete product."""
        product.is_active = False
        await db.flush()
    
    @staticmethod
    async def search_suggestions(
        db: AsyncSession,
        query: str,
        limit: int = 10
    ) -> dict:
        """Get search suggestions for products and categories."""
        search_term = f"%{query}%"
        
        # Search products
        product_result = await db.execute(
            select(Product.id, Product.name, Category.name.label("category_name"))
            .join(Category)
            .where(
                and_(
                    Product.name.ilike(search_term),
                    Product.is_active == True
                )
            )
            .limit(limit)
        )
        products = [
            {
                "id": str(row.id),
                "name": row.name,
                "category": row.category_name
            }
            for row in product_result.all()
        ]
        
        # Search categories
        category_result = await db.execute(
            select(Category.id, Category.name)
            .where(
                and_(
                    Category.name.ilike(search_term),
                    Category.is_active == True
                )
            )
            .limit(limit)
        )
        categories = [
            {"id": str(row.id), "name": row.name}
            for row in category_result.all()
        ]
        
        return {"products": products, "categories": categories}


class CartService:
    """Service for cart validation and operations."""
    
    @staticmethod
    async def validate_cart(
        db: AsyncSession,
        items: List[schemas.CartItem]
    ) -> schemas.CartValidationResponse:
        """Validate cart items against stock."""
        errors = []
        valid_items = []
        total = Decimal("0")
        
        for item in items:
            product = await ProductService.get_product_by_id(db, item.product_id)
            
            if not product:
                errors.append(f"Product {item.product_id} not found")
                continue
            
            if not product.is_active:
                errors.append(f"{product.name} is no longer available")
                continue
            
            available = product.stock_quantity - product.reserved_quantity
            if available < item.quantity:
                errors.append(
                    f"Only {available} units of {product.name} available"
                )
                continue
            
            item_total = product.price * item.quantity
            total += item_total
            
            valid_items.append({
                "product_id": str(product.id),
                "name": product.name,
                "quantity": item.quantity,
                "price": float(product.price),
                "unit": product.unit,
                "total": float(item_total)
            })
        
        return schemas.CartValidationResponse(
            valid=len(errors) == 0,
            items=valid_items,
            errors=errors,
            total=total
        )


# Instantiate services
category_service = CategoryService()
product_service = ProductService()
cart_service = CartService()
