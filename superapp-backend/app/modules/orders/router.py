"""Order API endpoints."""
import logging
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from redis.asyncio import Redis

from app.database import get_db
from app.dependencies import get_current_active_user, get_redis
from app.modules.users.models import User, StoreProfile
from app.modules.orders import schemas
from app.modules.orders.service import OrderService

logger = logging.getLogger(__name__)
from app.modules.orders.models import OrderStatus, Order

router = APIRouter(prefix="/orders", tags=["orders"])


@router.post("", response_model=schemas.OrderResponse, status_code=status.HTTP_201_CREATED)
async def create_order(
    order_data: schemas.OrderCreate,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    """[Customer] Create a new order."""
    if user.role != "customer":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only customers can place orders"
        )
    
    order = await OrderService.create_order(db, redis, user.id, order_data)

    # Eagerly load items to avoid lazy-load in async context
    await db.refresh(order, ['items'])

    return schemas.OrderResponse(
        id=order.id,
        order_number=order.order_number,
        order_type=str(order.order_type),
        status=str(order.status),
        customer_id=order.customer_id,
        store_id=order.store_id,
        delivery_agent_id=order.delivery_agent_id,
        subtotal=order.subtotal,
        delivery_fee=order.delivery_fee,
        tax=order.tax,
        discount=order.discount,
        total_amount=order.total_amount,
        payment_method=str(order.payment_method),
        payment_status=str(order.payment_status),
        delivery_address=order.delivery_address,
        delivery_pincode=order.delivery_pincode,
        items=[
            schemas.OrderItemResponse(
                id=item.id,
                product_id=item.product_id,
                product_name=item.product_name,
                product_sku=item.product_sku,
                unit_price=item.unit_price,
                quantity=item.quantity,
                subtotal=item.subtotal
            )
            for item in order.items
        ],
        created_at=order.created_at,
        accepted_at=order.accepted_at,
        delivered_at=order.delivered_at,
        notes=order.notes
    )


@router.get("/my-orders", response_model=schemas.OrderListResponse)
async def get_my_orders(
    status_filter: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get orders for current user."""
    orders, total = await OrderService.get_orders(
        db, user.id, user.role, status_filter, page, page_size
    )
    
    return schemas.OrderListResponse(
        items=[
            schemas.OrderResponse(
                id=order.id,
                order_number=order.order_number,
                order_type=str(order.order_type),
                status=str(order.status),
                customer_id=order.customer_id,
                store_id=order.store_id,
                delivery_agent_id=order.delivery_agent_id,
                subtotal=order.subtotal,
                delivery_fee=order.delivery_fee,
                tax=order.tax,
                discount=order.discount,
                total_amount=order.total_amount,
                payment_method=str(order.payment_method),
                payment_status=str(order.payment_status),
                delivery_address=order.delivery_address,
                delivery_pincode=order.delivery_pincode,
                items=[
                    schemas.OrderItemResponse(
                        id=item.id,
                        product_id=item.product_id,
                        product_name=item.product_name,
                        product_sku=item.product_sku,
                        unit_price=item.unit_price,
                        quantity=item.quantity,
                        subtotal=item.subtotal
                    )
                    for item in order.items
                ],
                created_at=order.created_at,
                accepted_at=order.accepted_at,
                delivered_at=order.delivered_at,
                notes=order.notes
            )
            for order in orders
        ],
        total=total,
        page=page,
        page_size=page_size
    )


@router.get("/pending", response_model=list[schemas.OrderResponse])
async def get_pending_orders(
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """[Store] Get pending orders in store's area."""
    if user.role != "store":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only stores can view pending orders"
        )
    
    # Explicitly load store profile to avoid lazy loading issues
    result = await db.execute(
        select(StoreProfile).where(StoreProfile.user_id == user.id)
    )
    store_profile = result.scalar_one_or_none()
    
    if not store_profile:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Store profile not found"
        )
    
    if not store_profile.pincode:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Store pincode not set. Please complete your store profile."
        )
    
    orders = await OrderService.get_pending_orders_for_store(
        db, store_profile.pincode
    )
    
    return [
        schemas.OrderResponse(
            id=order.id,
            order_number=order.order_number,
            order_type=str(order.order_type),
            status=str(order.status),
            customer_id=order.customer_id,
            store_id=order.store_id,
            delivery_agent_id=order.delivery_agent_id,
            subtotal=order.subtotal,
            delivery_fee=order.delivery_fee,
            tax=order.tax,
            discount=order.discount,
            total_amount=order.total_amount,
            payment_method=str(order.payment_method),
            payment_status=str(order.payment_status),
            delivery_address=order.delivery_address,
            delivery_pincode=order.delivery_pincode,
            items=[
                schemas.OrderItemResponse(
                    id=item.id,
                    product_id=item.product_id,
                    product_name=item.product_name,
                    product_sku=item.product_sku,
                    unit_price=item.unit_price,
                    quantity=item.quantity,
                    subtotal=item.subtotal
                )
                for item in order.items
            ],
            created_at=order.created_at,
            accepted_at=order.accepted_at,
            delivered_at=order.delivered_at,
            notes=order.notes
        )
        for order in orders
    ]


@router.post("/{order_id}/accept")
async def accept_order(
    order_id: UUID,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    """[Store] Accept an order - race-to-accept."""
    if user.role != "store":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only stores can accept orders"
        )
    
    order = await OrderService.accept_order_by_store(db, redis, order_id, user.id)
    
    return {
        "message": "Order accepted successfully",
        "order_id": str(order.id),
        "order_number": order.order_number,
        "status": str(order.status)
    }


@router.post("/{order_id}/decline")
async def decline_order(
    order_id: UUID,
    request: schemas.DeclineOrderRequest,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """[Store] Decline a pending_dispatch order with a customer-visible reason."""
    if user.role != "store":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only stores can decline orders"
        )

    from sqlalchemy.orm import selectinload
    from app.modules.notifications.service import send_push

    result = await db.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()

    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if str(order.status) != "pending_dispatch":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Can only decline pending orders (current: {order.status})"
        )

    order.status = "cancelled"
    order.notes = request.reason
    await db.commit()

    # Notify the customer
    customer = await db.get(User, order.customer_id)
    if customer and customer.fcm_token:
        try:
            await send_push(
                fcm_token=customer.fcm_token,
                title=f"Order #{order.order_number} Declined",
                body=request.reason,
                data={"type": "order_declined", "order_id": str(order.id)}
            )
        except Exception:
            pass

    return {
        "message": "Order declined",
        "order_id": str(order.id),
        "order_number": order.order_number,
        "reason": request.reason
    }


@router.post("/{order_id}/request-otp")
@router.post("/{order_id}/delivery-otp")
async def request_delivery_otp(
    order_id: UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """[Delivery] Initiate delivery verification — WhatsApp first, SMS fallback.

    Replaces the old WhatsApp-only flow. OTP is generated server-side only.
    """
    if user.role != "delivery":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only delivery agents can request an OTP",
        )

    from app.modules.delivery_otp import service as otp_svc

    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")

    if order.delivery_agent_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not your assigned order",
        )

    if str(order.status) not in ("picked_up", "in_transit"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot send OTP for order in status: {order.status}",
        )

    customer = await db.get(User, order.customer_id)
    if not customer or not customer.phone:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Customer phone not found",
        )

    status_payload = await otp_svc.initiate_delivery_otp(
        str(order_id), customer.phone, redis, force_resend=False
    )
    # Covers "WhatsApp accepted but webhook never confirms" (e.g. number isn't
    # on WhatsApp at all) — see schedule_fallback_timeout_check docstring.
    background_tasks.add_task(otp_svc.schedule_fallback_timeout_check, str(order_id), redis)
    return {
        "message": "Delivery verification initiated",
        **status_payload,
    }


@router.post("/{order_id}/delivery-otp/resend")
async def resend_delivery_otp(
    order_id: UUID,
    background_tasks: BackgroundTasks,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """[Delivery] Resend OTP with rate limits."""
    if user.role != "delivery":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only delivery agents")

    from app.modules.delivery_otp import service as otp_svc

    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if order.delivery_agent_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your assigned order")
    if str(order.status) not in ("picked_up", "in_transit"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Order not eligible")

    customer = await db.get(User, order.customer_id)
    if not customer or not customer.phone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Customer phone not found")

    status_payload = await otp_svc.initiate_delivery_otp(
        str(order_id), customer.phone, redis, force_resend=True
    )
    if status_payload.get("status") in ("resend_limit", "cooldown"):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=status_payload.get("message"))
    background_tasks.add_task(otp_svc.schedule_fallback_timeout_check, str(order_id), redis)
    return {"message": "OTP resent", **status_payload}


@router.get("/{order_id}/delivery-otp/status")
async def delivery_otp_status(
    order_id: UUID,
    user: User = Depends(get_current_active_user),
    redis: Redis = Depends(get_redis),
):
    """[Delivery/Admin] Current OTP channel status (no secrets)."""
    from app.modules.delivery_otp import service as otp_svc
    return await otp_svc.get_otp_status(str(order_id), redis)


@router.get("/{order_id}/delivery-otp/debug")
async def delivery_otp_debug(
    order_id: UUID,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """[Delivery/Admin, OTP_DEBUG only] Read back the plaintext OTP for local testing.

    WhatsApp/SMS are rarely configured in dev, so without this there's no way to
    complete a delivery end-to-end. 404s outright when OTP_DEBUG=false (production)
    so this never becomes a real leak — see app.modules.delivery_otp.service.
    """
    from app.config import settings
    from app.modules.delivery_otp import service as otp_svc

    if not getattr(settings, "OTP_DEBUG", True):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")

    if user.role not in ("delivery", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")

    if user.role == "delivery":
        order = await db.get(Order, order_id)
        if not order or order.delivery_agent_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your assigned order")

    otp = await otp_svc.get_debug_otp(str(order_id), redis)
    if otp is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active OTP for this order — tap Confirm Delivery first",
        )
    return {"otp": otp, "note": "OTP_DEBUG mode only — never available in production"}


@router.post("/{order_id}/verify-otp")
@router.post("/{order_id}/delivery-otp/verify")
async def verify_delivery_otp_endpoint(
    order_id: UUID,
    body: schemas.VerifyOTPRequest,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """[Delivery] Verify OTP entered by partner and mark order Delivered."""
    if user.role != "delivery":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only delivery agents can verify OTP",
        )

    from app.modules.delivery_otp import service as otp_svc

    result = await db.execute(select(Order).where(Order.id == order_id))
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if order.delivery_agent_id != user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your assigned order")
    if str(order.status) == "delivered":
        return {
            "message": "Order already delivered",
            "order_id": str(order.id),
            "order_number": order.order_number,
            "status": "delivered",
        }
    if str(order.status) not in ("picked_up", "in_transit"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Order is {order.status}, cannot confirm delivery",
        )

    verification = await otp_svc.verify_delivery_otp(str(order_id), body.otp, redis)

    if not verification.get("valid"):
        # No legacy fallback: the old plaintext order.delivery_otp comparison has
        # been removed. It never expired, was never rate-limited, and was returned
        # in plaintext by the order-details API — it defeated every security
        # property of the OTP system. Verification now goes only through the
        # hashed, attempt-limited, expiring Redis-backed flow above.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=verification.get("reason", "Invalid or expired OTP"),
        )

    order = await OrderService.update_order_status(db, order_id, "delivered", user.id)

    # Best-effort push to customer
    try:
        customer = await db.get(User, order.customer_id)
        if customer and getattr(customer, "fcm_token", None):
            from app.modules.notifications.service import send_push
            await send_push(
                fcm_token=customer.fcm_token,
                title="Order Delivered! ✅",
                body=f"Your order #{order.order_number} has been delivered. Enjoy!",
                data={"type": "delivered", "order_id": str(order.id), "completion_method": "otp"},
            )
    except Exception:
        pass

    # Realtime: push to customer, delivery agent (this same partner, for
    # multi-device consistency) and every connected Super Admin so all three
    # apps update without a manual refresh.
    try:
        from app.realtime.manager import emit_order_event_cluster_safe
        await emit_order_event_cluster_safe(
            redis,
            "order.delivery_status_updated",
            order_id=str(order.id),
            customer_id=order.customer_id,
            delivery_agent_id=order.delivery_agent_id,
            store_id=order.store_id,
            data={"status": "delivered", "completionMethod": "otp"},
        )
    except Exception:
        logger.exception("Realtime emit failed for order=%s", order.id)

    return {
        "message": "Delivery confirmed successfully",
        "order_id": str(order.id),
        "order_number": order.order_number,
        "status": str(order.status),
        "completion_method": verification.get("completion_method", "otp"),
    }


@router.patch("/{order_id}/status")
async def update_order_status(
    order_id: UUID,
    status_update: schemas.OrderStatusUpdate,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """[Store/Delivery] Update order status (never used to mark "delivered" —
    see OrderService.update_order_status for why that transition is blocked here)."""
    if user.role not in ["store", "delivery", "admin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Insufficient permissions"
        )

    # Ownership check: a delivery agent may only move orders assigned to them;
    # a store may only move its own orders. Admin is exempt. Previously this
    # endpoint trusted the caller's role alone and let any delivery/store user
    # update ANY order_id.
    if user.role in ("store", "delivery"):
        existing = await db.execute(select(Order).where(Order.id == order_id))
        existing_order = existing.scalar_one_or_none()
        if not existing_order:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
        if user.role == "delivery" and existing_order.delivery_agent_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your assigned order")
        if user.role == "store" and existing_order.store_id != user.id:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your order")

    order = await OrderService.update_order_status(
        db, order_id, status_update.status, user.id
    )

    # Realtime: lets the customer's live tracking screen (and admin order
    # list) move through store_accepted -> preparing -> ... -> in_transit
    # without polling alone. "delivered" is never reachable here (blocked in
    # OrderService.update_order_status), so this never duplicates the
    # order.delivery_status_updated event.
    try:
        from app.realtime.manager import emit_order_event_cluster_safe
        await emit_order_event_cluster_safe(
            redis,
            "order.status_updated",
            order_id=str(order.id),
            customer_id=order.customer_id,
            delivery_agent_id=order.delivery_agent_id,
            store_id=order.store_id,
            data={"status": str(order.status)},
        )
    except Exception:
        logger.exception("Realtime emit failed for order=%s", order.id)

    return {
        "message": "Order status updated",
        "order_id": str(order.id),
        "status": str(order.status)
    }


@router.post("/delivery/location")
async def update_delivery_location(
    location_data: schemas.DeliveryLocationUpdate,
    order_id: Optional[UUID] = None,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """[Delivery Agent] Update live location."""
    if user.role != "delivery":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only delivery agents can update location"
        )
    
    location = await OrderService.update_delivery_location(
        db, user.id, order_id, location_data
    )
    
    return {
        "message": "Location updated",
        "timestamp": location.timestamp
    }


@router.get("/{order_id}/tracking")
async def get_order_tracking(
    order_id: UUID,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Customer-safe live tracking snapshot. Returns the latest rider position for the order."""
    from sqlalchemy import desc
    from app.modules.orders.models import DeliveryLocation
    from app.modules.users.models import DeliveryAgentProfile

    result = await db.execute(
        select(Order).where(Order.id == order_id).options(selectinload(Order.items))
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if user.role not in ["admin", "delivery"] and order.customer_id != user.id:
        raise HTTPException(status_code=403, detail="Access denied")

    rider = None
    if order.delivery_agent_id:
        rider_user = await db.get(User, order.delivery_agent_id)
        profile = (await db.execute(
            select(DeliveryAgentProfile).where(DeliveryAgentProfile.user_id == order.delivery_agent_id)
        )).scalar_one_or_none()
        latest = (await db.execute(
            select(DeliveryLocation)
            .where(DeliveryLocation.order_id == order.id)
            .order_by(desc(DeliveryLocation.timestamp))
            .limit(1)
        )).scalar_one_or_none()
        lat = float(latest.latitude) if latest else (float(profile.current_lat) if profile and profile.current_lat is not None else None)
        lng = float(latest.longitude) if latest else (float(profile.current_lng) if profile and profile.current_lng is not None else None)
        rider = {
            "id": str(order.delivery_agent_id),
            "name": rider_user.name if rider_user else (profile.name if profile else "Delivery partner"),
            "phone": rider_user.phone if rider_user else None,
            "latitude": lat,
            "longitude": lng,
            "accuracy": float(latest.accuracy) if latest and latest.accuracy is not None else None,
            "speed": float(latest.speed) if latest and latest.speed is not None else None,
            "heading": float(latest.heading) if latest and latest.heading is not None else None,
            "updated_at": latest.timestamp.isoformat() if latest else (profile.last_location_at.isoformat() if profile and profile.last_location_at else None),
            "rating": float(profile.rating) if profile and profile.rating is not None else 4.8,
            "vehicle_type": profile.vehicle_type if profile else None,
        }

    destination = order.delivery_address or {}
    pickup = order.pickup_address or {}
    return {
        "order_id": str(order.id),
        "order_number": order.order_number,
        "status": str(order.status),
        "delivery_agent_id": str(order.delivery_agent_id) if order.delivery_agent_id else None,
        "pickup_address": order.pickup_address,
        "delivery_address": destination,
        "destination": {
            "latitude": float(order.delivery_lat) if order.delivery_lat is not None else destination.get("latitude"),
            "longitude": float(order.delivery_lng) if order.delivery_lng is not None else destination.get("longitude"),
        },
        "pickup": {
            "latitude": pickup.get("latitude"),
            "longitude": pickup.get("longitude"),
        },
        "rider": rider,
        "created_at": order.created_at.isoformat() if order.created_at else None,
        "accepted_at": order.accepted_at.isoformat() if order.accepted_at else None,
        "picked_up_at": order.picked_up_at.isoformat() if order.picked_up_at else None,
        "delivered_at": order.delivered_at.isoformat() if order.delivered_at else None,
        "items_count": len(order.items),
        "customer_rating": order.customer_rating,
    }


@router.post("/{order_id}/rating")
async def rate_order(
    order_id: UUID,
    body: schemas.RateOrderRequest,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """[Customer] Rate a delivered order — rolls into the store/restaurant's
    aggregate rating shown as a chip on the listing screens (Zomato/Blinkit
    style: hidden as a score until there are enough ratings, "NEW" until
    then — see RatingBadge on the frontend). One rating per order; re-submit
    is rejected rather than silently overwritten, since that would quietly
    double-count or skew the running average.
    """
    order = await db.get(Order, order_id)
    if not order or order.customer_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Order not found")
    if order.status != OrderStatus.DELIVERED.value:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Only delivered orders can be rated")
    if order.customer_rating is not None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This order has already been rated")

    order.customer_rating = body.rating
    order.customer_review = body.review

    if order.order_type == "food":
        from app.modules.food.models import Restaurant
        result = await db.execute(select(Restaurant).where(Restaurant.owner_id == order.store_id))
        target = result.scalar_one_or_none()
        if target:
            prev_avg = float(target.rating_avg or 0)
            prev_count = target.rating_count or 0
            new_count = prev_count + 1
            target.rating_avg = round((prev_avg * prev_count + body.rating) / new_count, 2)
            target.rating_count = new_count
    else:
        result = await db.execute(select(StoreProfile).where(StoreProfile.user_id == order.store_id))
        target = result.scalar_one_or_none()
        if target:
            prev_avg = float(target.rating or 0)
            prev_count = target.rating_count or 0
            new_count = prev_count + 1
            target.rating = round((prev_avg * prev_count + body.rating) / new_count, 2)
            target.rating_count = new_count

    await db.commit()
    return {"status": "ok", "rating": body.rating}


@router.get("/{order_id}", response_model=schemas.OrderResponse)
async def get_order_details(
    order_id: UUID,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get order details."""
    from sqlalchemy.orm import selectinload
    from sqlalchemy import select
    
    result = await db.execute(
        select(Order).options(selectinload(Order.items)).where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Order not found"
        )
    
    # Check permissions
    if user.role not in ["admin"] and order.customer_id != user.id and order.store_id != user.id and order.delivery_agent_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    return schemas.OrderResponse(
        id=order.id,
        order_number=order.order_number,
        order_type=str(order.order_type),
        status=str(order.status),
        customer_id=order.customer_id,
        store_id=order.store_id,
        delivery_agent_id=order.delivery_agent_id,
        subtotal=order.subtotal,
        delivery_fee=order.delivery_fee,
        tax=order.tax,
        discount=order.discount,
        total_amount=order.total_amount,
        payment_method=str(order.payment_method),
        payment_status=str(order.payment_status),
        delivery_address=order.delivery_address,
        delivery_pincode=order.delivery_pincode,
        items=[
            schemas.OrderItemResponse(
                id=item.id,
                product_id=item.product_id,
                product_name=item.product_name,
                product_sku=item.product_sku,
                unit_price=item.unit_price,
                quantity=item.quantity,
                subtotal=item.subtotal
            )
            for item in order.items
        ],
        created_at=order.created_at,
        accepted_at=order.accepted_at,
        delivered_at=order.delivered_at,
        notes=order.notes
    )
