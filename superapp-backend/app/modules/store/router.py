"""Store dashboard and management endpoints."""
from typing import Optional
from uuid import UUID
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from sqlalchemy.orm import selectinload

from app.database import get_db
from app.dependencies import get_current_active_user
from app.modules.users.models import User, StoreProfile
from app.modules.orders.models import Order, OrderStatus
from app.modules.grocery.models import Product
from app.modules.grocery.inventory_models import StoreInventory

router = APIRouter(prefix="/store", tags=["store"])


@router.get("/dashboard")
async def get_store_dashboard(
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """[Store] Get dashboard stats."""
    if user.role != "store":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only stores can access dashboard"
        )
    
    # Explicitly load store profile to avoid lazy loading issues
    result = await db.execute(
        select(StoreProfile).where(StoreProfile.user_id == user.id)
    )
    store_profile = result.scalar_one_or_none()
    
    if not store_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Store profile not found"
        )
    
    # Calculate stats
    # Total orders
    total_orders_result = await db.execute(
        select(func.count(Order.id)).where(Order.store_id == user.id)
    )
    total_orders = total_orders_result.scalar() or 0
    
    # Pending orders (accepted but not delivered)
    pending_orders_result = await db.execute(
        select(func.count(Order.id)).where(
            and_(
                Order.store_id == user.id,
                Order.status.in_([
                    OrderStatus.STORE_ACCEPTED.value,
                    OrderStatus.PREPARING.value,
                    OrderStatus.READY_FOR_PICKUP.value,
                    OrderStatus.DELIVERY_ASSIGNED.value,
                    OrderStatus.PICKED_UP.value,
                    OrderStatus.IN_TRANSIT.value
                ])
            )
        )
    )
    pending_orders = pending_orders_result.scalar() or 0
    
    # Today's orders
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_orders_result = await db.execute(
        select(func.count(Order.id)).where(
            and_(
                Order.store_id == user.id,
                Order.created_at >= today_start
            )
        )
    )
    today_orders = today_orders_result.scalar() or 0
    
    # Total revenue
    revenue_result = await db.execute(
        select(func.sum(Order.total_amount)).where(
            and_(
                Order.store_id == user.id,
                Order.status == OrderStatus.DELIVERED.value
            )
        )
    )
    total_revenue = revenue_result.scalar() or 0
    
    # Product count
    product_count_result = await db.execute(
        select(func.count(StoreInventory.id)).where(
            and_(
                StoreInventory.store_id == user.id,
                StoreInventory.is_available == True
            )
        )
    )
    product_count = product_count_result.scalar() or 0
    
    return {
        "store_id": str(user.id),
        "store_name": store_profile.store_name,
        "owner_name": store_profile.owner_name,
        "is_open": store_profile.is_open,
        "pincode": store_profile.pincode,
        "address": store_profile.address,
        "gstin": store_profile.gstin,
        "fssai": store_profile.fssai,
        "total_orders": total_orders,
        "pending_orders": pending_orders,
        "today_orders": today_orders,
        "total_revenue": float(total_revenue),
        "product_count": product_count,
        "delivery_radius_km": store_profile.delivery_radius_km,
    }


@router.get("/profile")
async def get_store_profile(
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """[Store] Get full store profile."""
    if user.role != "store":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only stores can access profile"
        )
    
    # Explicitly load store profile to avoid lazy loading issues
    result = await db.execute(
        select(StoreProfile).where(StoreProfile.user_id == user.id)
    )
    store_profile = result.scalar_one_or_none()
    
    if not store_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Store profile not found"
        )
    
    return {
        "user_id": str(user.id),
        "email": user.email,
        "phone": user.phone,
        "store_name": store_profile.store_name,
        "owner_name": store_profile.owner_name,
        "gstin": store_profile.gstin,
        "fssai": store_profile.fssai,
        "address": store_profile.address,
        "pincode": store_profile.pincode,
        "city": store_profile.city,
        "state": store_profile.state,
        "latitude": store_profile.latitude,
        "longitude": store_profile.longitude,
        "is_open": store_profile.is_open,
        "delivery_radius_km": store_profile.delivery_radius_km,
        "bank_account": store_profile.bank_account,
        "bank_ifsc": store_profile.bank_ifsc,
        "upi_id": store_profile.upi_id,
        "created_at": store_profile.created_at.isoformat() if store_profile.created_at else None,
    }


from pydantic import BaseModel, Field

class StoreProfileUpdate(BaseModel):
    is_open: Optional[bool] = None
    delivery_radius_km: Optional[float] = None
    address: Optional[str] = None
    pincode: Optional[str] = Field(None, min_length=6, max_length=6, pattern=r"^\d{6}$")
    city: Optional[str] = None
    state: Optional[str] = None
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    gstin: Optional[str] = Field(None, max_length=20)
    fssai: Optional[str] = Field(None, max_length=30)
    bank_account: Optional[str] = Field(None, max_length=30)
    bank_ifsc: Optional[str] = Field(None, max_length=15)
    upi_id: Optional[str] = Field(None, max_length=100)

@router.patch("/profile")
async def update_store_profile(
    update_data: StoreProfileUpdate,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """[Store] Update store settings, location (pincode/address) and payout details."""
    if user.role != "store":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only stores can update profile"
        )
    
    # Explicitly load store profile to avoid lazy loading issues
    result = await db.execute(
        select(StoreProfile).where(StoreProfile.user_id == user.id)
    )
    store_profile = result.scalar_one_or_none()
    
    if not store_profile:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Store profile not found"
        )
    
    for field, value in update_data.model_dump(exclude_unset=True).items():
        setattr(store_profile, field, value)
    
    await db.commit()
    await db.refresh(store_profile)
    
    return {
        "message": "Profile updated",
        "is_open": store_profile.is_open,
        "delivery_radius_km": store_profile.delivery_radius_km,
        "address": store_profile.address,
        "pincode": store_profile.pincode,
        "city": store_profile.city,
        "state": store_profile.state,
        "gstin": store_profile.gstin,
        "fssai": store_profile.fssai,
        "bank_account": store_profile.bank_account,
        "bank_ifsc": store_profile.bank_ifsc,
        "upi_id": store_profile.upi_id,
    }
