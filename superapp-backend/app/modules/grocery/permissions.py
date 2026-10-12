"""Product access-control dependency (Feature 4).

Usage in router:
    @router.put("/products/{product_id}")
    async def update_product(
        product_id: UUID,
        product: Product = Depends(require_product_access),
        ...
    ):
"""
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.dependencies import get_current_active_user
from app.modules.users.models import User
from app.modules.grocery.models import Product


async def require_product_access(
    product_id: UUID,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
) -> Product:
    """Return the product if the caller is authorised to modify it.

    Rules
    -----
    admin  → always allowed (platform + store products)
    store  → allowed only for products they own (owner_type='store', store_id=user.id)
             403 on platform products
    others → 403 always
    """
    if user.role not in ("admin", "store"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    result = await db.execute(select(Product).where(Product.id == product_id))
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Product not found",
        )

    if user.role == "admin":
        return product  # admins can touch anything

    # Store role
    if product.owner_type == "platform":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform products can only be modified by admins",
        )
    if str(product.store_id) != str(user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only modify your own products",
        )
    return product
