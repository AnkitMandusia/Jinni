"""Order service - business logic with race-to-accept."""
import uuid
import random
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Optional, Tuple
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_, func
from sqlalchemy.orm import selectinload
from redis.asyncio import Redis
from fastapi import HTTPException, status

from app.modules.orders.models import (
    Order, OrderItem, OrderStatus, OrderType, PaymentMethod, PaymentStatus,
    DeliveryLocation
)
from app.modules.orders import schemas
from app.modules.grocery.models import Product
from app.modules.users.models import User, StoreProfile, RestaurantProfile, DeliveryAgentProfile
from app.modules.notifications.service import send_push, send_push_multicast


class OrderService:
    """Service for order operations."""
    
    @staticmethod
    def _generate_order_number() -> str:
        """Generate unique order number."""
        timestamp = datetime.now().strftime("%y%m%d")
        random_part = random.randint(1000, 9999)
        return f"ORD{timestamp}{random_part}"
    
    @staticmethod
    async def create_order(
        db: AsyncSession,
        redis: Redis,
        customer_id: UUID,
        order_data: schemas.OrderCreate
    ) -> Order:
        """Create a new order and reserve inventory."""
        # Validate products and calculate totals
        subtotal = Decimal("0.00")
        order_items_data = []
        
        for item_data in order_data.items:
            product = await db.get(Product, item_data.product_id)
            if not product or not product.is_active:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Product {item_data.product_id} not found"
                )
            
            if product.available_stock < item_data.quantity:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Insufficient stock for {product.name}"
                )
            
            # Reserve stock
            product.reserved_quantity += item_data.quantity
            
            item_subtotal = product.price * item_data.quantity
            subtotal += item_subtotal
            
            order_items_data.append({
                "product_id": product.id,
                "product_name": product.name,
                "product_sku": product.sku,
                "unit_price": product.price,
                "quantity": item_data.quantity,
                "subtotal": item_subtotal,
            })
        
        # Calculate fees
        delivery_fee = Decimal("40.00") if subtotal < Decimal("500.00") else Decimal("0.00")
        tax = subtotal * Decimal("0.05")  # 5% tax
        total_amount = subtotal + delivery_fee + tax
        
        # Create order.
        # NOTE: delivery_otp is intentionally NOT set here anymore. The old flow
        # generated a plaintext 6-digit OTP with `random` (not cryptographically
        # secure) at order-creation time and leaked it back in API responses.
        # OTPs are now generated exclusively by app.modules.delivery_otp.service
        # at the moment the delivery partner taps "Confirm Delivery" — hashed,
        # scoped to a single attempt, and never serialized in any response.
        order = Order(
            order_number=OrderService._generate_order_number(),
            order_type=OrderType(order_data.order_type).value,
            customer_id=customer_id,
            status=OrderStatus.PENDING_DISPATCH.value,
            subtotal=subtotal,
            delivery_fee=delivery_fee,
            tax=tax,
            total_amount=total_amount,
            payment_method=PaymentMethod(order_data.payment_method).value,
            payment_status=PaymentStatus.PENDING.value,
            delivery_address=order_data.delivery_address.model_dump(),
            delivery_pincode=order_data.delivery_address.pincode,
            delivery_lat=order_data.delivery_address.latitude,
            delivery_lng=order_data.delivery_address.longitude,
            notes=order_data.notes,
        )
        db.add(order)
        await db.flush()
        
        # Create order items
        for item_data in order_items_data:
            item = OrderItem(order_id=order.id, **item_data)
            db.add(item)
        
        await db.commit()
        await db.refresh(order)
        
        # Broadcast to nearby stores
        await OrderService._broadcast_to_stores(db, redis, order)
        
        return order
    
    @staticmethod
    async def _broadcast_to_stores(
        db: AsyncSession,
        redis: Redis,
        order: Order
    ) -> None:
        """Broadcast order to stores within radius."""
        # Find stores in same pincode (simplified location matching)
        # In production, use PostGIS for radius-based search
        result = await db.execute(
            select(User, StoreProfile)
            .join(StoreProfile, User.id == StoreProfile.user_id)
            .where(
                and_(
                    User.role == "store",
                    User.status == "active",
                    StoreProfile.is_open == True,
                    StoreProfile.pincode == order.delivery_pincode
                )
            )
        )
        stores = result.all()
        
        if not stores:
            # No stores available - mark order
            order.status = OrderStatus.NO_STORE_AVAILABLE.value
            await db.commit()
            return
        
        # Send FCM notifications to all stores
        store_tokens = [user.fcm_token for user, _ in stores if user.fcm_token]
        if store_tokens:
            await send_push_multicast(
                fcm_tokens=store_tokens,
                title="🛒 New Order!",
                body=f"Order #{order.order_number} - ₹{order.total_amount}",
                data={
                    "type": "new_order",
                    "order_id": str(order.id),
                    "order_number": order.order_number,
                    "timeout": "45"
                }
            )
    
    @staticmethod
    async def accept_order_by_store(
        db: AsyncSession,
        redis: Redis,
        order_id: UUID,
        store_id: UUID
    ) -> Order:
        """Store accepts order - race condition handled with Redis lock."""
        lock_key = f"order_accept_lock:{order_id}"
        lock_value = str(uuid.uuid4())
        
        # Try to acquire lock (atomic SET NX EX)
        acquired = await redis.set(lock_key, lock_value, nx=True, ex=10)
        
        if not acquired:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Order already accepted by another store"
            )
        
        try:
            # Double-check in DB
            order = await db.get(Order, order_id, options=[selectinload(Order.items)])
            if not order:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Order not found"
                )
            
            if order.status != OrderStatus.PENDING_DISPATCH.value:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Order is {order.status}, cannot accept"
                )

            # Defense-in-depth: `get_pending_orders_for_store` already filters orders
            # shown to a store by pincode, but this endpoint is what actually assigns
            # the order, so it must not trust the client-supplied store_id blindly —
            # re-check serviceability here too.
            store_profile = (await db.execute(
                select(StoreProfile).where(StoreProfile.user_id == store_id)
            )).scalar_one_or_none()
            if not store_profile:
                raise HTTPException(status.HTTP_404_NOT_FOUND, "Store not found")
            if store_profile.pincode and order.delivery_pincode and store_profile.pincode != order.delivery_pincode:
                raise HTTPException(
                    status.HTTP_400_BAD_REQUEST,
                    f"This order is for pincode {order.delivery_pincode}, outside your store's serviceable pincode ({store_profile.pincode})."
                )

            # Assign store
            order.store_id = store_id
            order.status = OrderStatus.STORE_ACCEPTED.value
            order.accepted_at = datetime.utcnow()
            await db.commit()
            await db.refresh(order)
            
            # Notify customer
            customer = await db.get(User, order.customer_id)
            if customer and customer.fcm_token:
                await send_push(
                    fcm_token=customer.fcm_token,
                    title="Order Accepted! 🎉",
                    body=f"Your order #{order.order_number} has been accepted by the store.",
                    data={"type": "order_accepted", "order_id": str(order.id)}
                )
            
            # Cancel notifications for other stores
            await OrderService._cancel_other_stores(db, order_id, store_id)
            
            return order
            
        finally:
            # Release lock only if we own it
            current_value = await redis.get(lock_key)
            if current_value and current_value.decode() == lock_value:
                await redis.delete(lock_key)
    
    @staticmethod
    async def _cancel_other_stores(
        db: AsyncSession,
        order_id: UUID,
        accepted_store_id: UUID
    ) -> None:
        """Notify other stores that order was taken."""
        # Find other stores in same area
        order = await db.get(Order, order_id)
        result = await db.execute(
            select(User)
            .join(StoreProfile, User.id == StoreProfile.user_id)
            .where(
                and_(
                    User.role == "store",
                    User.id != accepted_store_id,
                    StoreProfile.pincode == order.delivery_pincode
                )
            )
        )
        other_stores = result.scalars().all()
        
        tokens = [s.fcm_token for s in other_stores if s.fcm_token]
        if tokens:
            await send_push_multicast(
                fcm_tokens=tokens,
                title="Order Taken",
                body=f"Order #{order.order_number} was accepted by another store",
                data={"type": "order_cancelled", "order_id": str(order_id)}
            )
    
    @staticmethod
    async def update_order_status(
        db: AsyncSession,
        order_id: UUID,
        new_status: str,
        user_id: UUID
    ) -> Order:
        """Update order status (accepts plain string values)."""
        order = await db.get(Order, order_id, options=[selectinload(Order.items)])
        if not order:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Order not found"
            )
        
        new_status_val = new_status.value if hasattr(new_status, 'value') else str(new_status)
        
        valid_transitions = {
            "store_accepted": ["preparing"],
            "preparing": ["ready_for_pickup"],
            "delivery_assigned": ["picked_up"],
            "picked_up": ["in_transit"],
            # "in_transit" -> "delivered" is intentionally NOT listed here.
            # Marking an order Delivered must only ever happen through
            # app.modules.delivery_otp.verify_delivery_otp (customer-verified OTP)
            # or the audited Super Admin manual-complete endpoint. This generic
            # status-update endpoint has no OTP check and, before this fix, no
            # ownership check either — any store/delivery/admin user could mark
            # ANY order "delivered" directly, bypassing the entire OTP system.
        }
        
        if new_status_val == "delivered":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Orders cannot be marked delivered through this endpoint. "
                    "Use OTP verification (/delivery-otp/verify) or Super Admin "
                    "manual completion."
                ),
            )

        if new_status_val not in valid_transitions.get(str(order.status), []):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot transition from {order.status} to {new_status_val}"
            )
        
        order.status = new_status_val
        
        # Update timestamps
        if new_status_val == "preparing":
            order.preparing_at = datetime.utcnow()
        elif new_status_val == "ready_for_pickup":
            order.ready_at = datetime.utcnow()
        elif new_status_val == "picked_up":
            order.picked_up_at = datetime.utcnow()
        elif new_status_val == "delivered":
            order.delivered_at = datetime.utcnow()
            for item in order.items:
                if item.product_id:
                    product = await db.get(Product, item.product_id)
                    if product:
                        product.stock_quantity -= item.quantity
                        product.reserved_quantity = max(0, product.reserved_quantity - item.quantity)
        
        await db.commit()
        await db.refresh(order)
        
        # Broadcast to delivery agents when ready for pickup
        if new_status_val == "ready_for_pickup":
            await OrderService._broadcast_to_delivery_agents(db, order)
        
        # Notify customer
        customer = await db.get(User, order.customer_id)
        if customer and customer.fcm_token:
            status_messages = {
                "preparing": "Your order is being prepared",
                "ready_for_pickup": "Your order is ready for pickup",
                "picked_up": "Your order has been picked up",
                "in_transit": "Your order is on the way",
                "delivered": "Your order has been delivered",
            }
            await send_push(
                fcm_token=customer.fcm_token,
                title=f"Order #{order.order_number}",
                body=status_messages.get(new_status_val, f"Status: {new_status_val}"),
                data={"type": "order_status", "order_id": str(order.id), "status": new_status_val}
            )
        
        return order
    
    @staticmethod
    async def _broadcast_to_delivery_agents(
        db: AsyncSession,
        order: Order
    ) -> None:
        """Broadcast ready order to available delivery agents."""
        result = await db.execute(
            select(User, DeliveryAgentProfile)
            .join(DeliveryAgentProfile, User.id == DeliveryAgentProfile.user_id)
            .where(
                and_(
                    User.role == "delivery",
                    User.status == "active",
                    DeliveryAgentProfile.is_available == True,
                )
            )
        )
        agents = result.all()
        tokens = [u.fcm_token for u, _ in agents if u.fcm_token]
        if tokens:
            await send_push_multicast(
                fcm_tokens=tokens,
                title="🚴 New Delivery Available!",
                body=f"Order #{order.order_number} · ₹{order.total_amount} · Ready for pickup",
                data={"type": "delivery_available", "order_id": str(order.id), "order_number": order.order_number}
            )
    
    @staticmethod
    async def get_orders(
        db: AsyncSession,
        user_id: UUID,
        role: str,
        status_filter: Optional[str] = None,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[Order], int]:
        """Get orders for a user based on their role."""
        query = select(Order).options(
            selectinload(Order.items),
            selectinload(Order.customer),
            selectinload(Order.store)
        )
        
        # Filter by role
        if role == "customer":
            query = query.where(Order.customer_id == user_id)
        elif role == "store":
            query = query.where(Order.store_id == user_id)
        elif role == "delivery":
            query = query.where(Order.delivery_agent_id == user_id)
        elif role == "admin":
            pass  # Admin sees all
        else:
            query = query.where(Order.customer_id == user_id)
        
        # Filter by status
        if status_filter:
            query = query.where(Order.status == status_filter)
        
        # Get total count
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar()
        
        # Pagination
        offset = (page - 1) * page_size
        query = query.order_by(Order.created_at.desc()).offset(offset).limit(page_size)
        
        result = await db.execute(query)
        orders = result.scalars().all()
        
        return orders, total
    
    @staticmethod
    async def get_pending_orders_for_store(
        db: AsyncSession,
        store_pincode: str
    ) -> List[Order]:
        """Get pending orders in store's area."""
        result = await db.execute(
            select(Order)
            .options(selectinload(Order.items))
            .where(
                and_(
                    Order.status == OrderStatus.PENDING_DISPATCH.value,
                    Order.delivery_pincode == store_pincode
                )
            )
            .order_by(Order.created_at.desc())
        )
        return result.scalars().all()
    
    @staticmethod
    async def update_delivery_location(
        db: AsyncSession,
        delivery_agent_id: UUID,
        order_id: Optional[UUID],
        location_data: schemas.DeliveryLocationUpdate
    ) -> DeliveryLocation:
        """Update delivery agent's live location."""
        location = DeliveryLocation(
            delivery_agent_id=delivery_agent_id,
            order_id=order_id,
            latitude=location_data.latitude,
            longitude=location_data.longitude,
            accuracy=location_data.accuracy,
            speed=location_data.speed,
            heading=location_data.heading,
        )
        db.add(location)
        await db.commit()
        await db.refresh(location)
        return location
