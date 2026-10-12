"""Store inventory management service."""
from typing import List, Optional, Tuple
from uuid import UUID
from decimal import Decimal

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from sqlalchemy.orm import selectinload
from fastapi import HTTPException, status

from app.modules.grocery.models import Product, Category
from app.modules.grocery.inventory_models import StoreInventory, StoreCustomProduct


class StoreInventoryService:
    """Service for store inventory management."""
    
    @staticmethod
    async def get_store_products_by_category(
        db: AsyncSession,
        store_id: UUID,
        category_id: Optional[UUID] = None
    ) -> dict:
        """Get universal + custom products for a store, grouped by category."""
        # Get universal products with store inventory status
        query = select(Product, StoreInventory).outerjoin(
            StoreInventory,
            and_(
                StoreInventory.product_id == Product.id,
                StoreInventory.store_id == store_id
            )
        ).where(Product.is_active == True)
        
        if category_id:
            query = query.where(Product.category_id == category_id)
        
        result = await db.execute(query)
        universal_products = result.all()
        
        # Get custom products
        custom_query = select(StoreCustomProduct).where(
            StoreCustomProduct.store_id == store_id
        )
        if category_id:
            custom_query = custom_query.where(StoreCustomProduct.category_id == category_id)
        
        custom_result = await db.execute(custom_query)
        custom_products = custom_result.scalars().all()
        
        return {
            "universal": [
                {
                    "product_id": str(product.id),
                    "name": product.name,
                    "price": float(inventory.custom_price if inventory and inventory.custom_price else product.price),
                    "unit": product.unit,
                    "category_id": str(product.category_id),
                    "image_url": product.primary_image_url,
                    "is_available": inventory.is_available if inventory else False,
                    "stock_quantity": inventory.stock_quantity if inventory else 0,
                    "has_custom_price": bool(inventory and inventory.custom_price),
                }
                for product, inventory in universal_products
            ],
            "custom": [
                {
                    "id": str(p.id),
                    "name": p.name,
                    "description": p.description,
                    "price": float(p.price),
                    "unit": p.unit,
                    "category_id": str(p.category_id),
                    "image_url": p.image_url,
                    "is_available": p.is_available,
                    "stock_quantity": p.stock_quantity,
                }
                for p in custom_products
            ]
        }
    
    @staticmethod
    async def toggle_product_availability(
        db: AsyncSession,
        store_id: UUID,
        product_id: UUID,
        is_available: bool
    ) -> StoreInventory:
        """Toggle universal product availability for store."""
        # Check if inventory record exists
        result = await db.execute(
            select(StoreInventory).where(
                and_(
                    StoreInventory.store_id == store_id,
                    StoreInventory.product_id == product_id
                )
            )
        )
        inventory = result.scalar_one_or_none()
        
        if not inventory:
            # Create new inventory record
            inventory = StoreInventory(
                store_id=store_id,
                product_id=product_id,
                is_available=is_available,
                stock_quantity=0
            )
            db.add(inventory)
        else:
            inventory.is_available = is_available
        
        await db.commit()
        await db.refresh(inventory)
        return inventory
    
    @staticmethod
    async def update_custom_price(
        db: AsyncSession,
        store_id: UUID,
        product_id: UUID,
        custom_price: Optional[Decimal]
    ) -> StoreInventory:
        """Set custom price for universal product."""
        result = await db.execute(
            select(StoreInventory).where(
                and_(
                    StoreInventory.store_id == store_id,
                    StoreInventory.product_id == product_id
                )
            )
        )
        inventory = result.scalar_one_or_none()
        
        if not inventory:
            inventory = StoreInventory(
                store_id=store_id,
                product_id=product_id,
                custom_price=custom_price,
                is_available=True,
                stock_quantity=0
            )
            db.add(inventory)
        else:
            inventory.custom_price = custom_price
        
        await db.commit()
        await db.refresh(inventory)
        return inventory
    
    @staticmethod
    async def create_custom_product(
        db: AsyncSession,
        store_id: UUID,
        category_id: UUID,
        name: str,
        price: Decimal,
        unit: str = "piece",
        description: Optional[str] = None,
        image_url: Optional[str] = None,
        stock_quantity: int = 0
    ) -> StoreCustomProduct:
        """Create a custom product for store."""
        # Verify category exists
        category = await db.get(Category, category_id)
        if not category:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Category not found"
            )
        
        product = StoreCustomProduct(
            store_id=store_id,
            category_id=category_id,
            name=name,
            description=description,
            price=price,
            unit=unit,
            stock_quantity=stock_quantity,
            image_url=image_url,
            is_available=True
        )
        db.add(product)
        await db.commit()
        await db.refresh(product)
        return product
    
    @staticmethod
    async def update_custom_product(
        db: AsyncSession,
        store_id: UUID,
        product_id: UUID,
        **updates
    ) -> StoreCustomProduct:
        """Update custom product."""
        result = await db.execute(
            select(StoreCustomProduct).where(
                and_(
                    StoreCustomProduct.id == product_id,
                    StoreCustomProduct.store_id == store_id
                )
            )
        )
        product = result.scalar_one_or_none()
        
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Custom product not found"
            )
        
        for key, value in updates.items():
            if hasattr(product, key) and value is not None:
                setattr(product, key, value)
        
        await db.commit()
        await db.refresh(product)
        return product
    
    @staticmethod
    async def delete_custom_product(
        db: AsyncSession,
        store_id: UUID,
        product_id: UUID
    ) -> None:
        """Delete custom product (only store's own products)."""
        result = await db.execute(
            select(StoreCustomProduct).where(
                and_(
                    StoreCustomProduct.id == product_id,
                    StoreCustomProduct.store_id == store_id
                )
            )
        )
        product = result.scalar_one_or_none()
        
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Custom product not found or access denied"
            )
        
        await db.delete(product)
        await db.commit()
    
    @staticmethod
    async def get_products_by_pincode(
        db: AsyncSession,
        pincode: str,
        category_id: Optional[UUID] = None
    ) -> List[dict]:
        """Get products available in a pincode area (from all stores)."""
        # Find stores in pincode
        from app.modules.users.models import StoreProfile
        
        result = await db.execute(
            select(StoreProfile.user_id).where(
                and_(
                    StoreProfile.pincode == pincode,
                    StoreProfile.is_open == True
                )
            )
        )
        store_ids = [row[0] for row in result.all()]
        
        if not store_ids:
            return []
        
        # Get products available in at least one store
        query = select(Product, func.count(StoreInventory.id).label('store_count')).join(
            StoreInventory,
            and_(
                StoreInventory.product_id == Product.id,
                StoreInventory.store_id.in_(store_ids),
                StoreInventory.is_available == True
            )
        ).where(Product.is_active == True).group_by(Product.id)
        
        if category_id:
            query = query.where(Product.category_id == category_id)
        
        result = await db.execute(query)
        products = result.all()
        
        return [
            {
                "id": str(product.id),
                "name": product.name,
                "price": float(product.price),
                "unit": product.unit,
                "image_url": product.primary_image_url,
                "available_stores": store_count,
            }
            for product, store_count in products
        ]
