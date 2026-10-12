"""Food module REST API — customer + restaurant partner."""
from typing import List, Optional
from uuid import UUID
from decimal import Decimal
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.dependencies import get_current_active_user, require_role
from app.modules.users.models import User
from app.modules.food import schemas
from app.modules.food.service import (
    restaurant_service, menu_service, cart_service, food_order_service,
    _restaurant_to_response, _item_to_response,
)

router = APIRouter(prefix="/food", tags=["food"])

@router.get("/restaurants", response_model=schemas.RestaurantListResponse)
async def list_restaurants(
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lng: Optional[float] = Query(None, ge=-180, le=180),
    pincode: Optional[str] = Query(None, min_length=6, max_length=6),
    city: Optional[str] = None, cuisine: Optional[str] = None,
    pure_veg: Optional[bool] = None, is_open: Optional[bool] = Query(True),
    search: Optional[str] = Query(None, max_length=100),
    min_rating: Optional[float] = Query(None, ge=0, le=5),
    sort_by: str = Query("relevance", pattern="^(relevance|rating|distance|delivery_time|cost_low|cost_high)$"),
    page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    rows, total, matched_dish_map = await restaurant_service.list_restaurants(
        db, lat=lat, lng=lng, pincode=pincode, city=city, cuisine=cuisine,
        pure_veg=pure_veg, is_open=is_open, search=search, min_rating=min_rating,
        sort_by=sort_by, page=page, page_size=page_size)
    return schemas.RestaurantListResponse(
        restaurants=[_restaurant_to_response(r, d, matched_dish_map.get(r.id)) for r, d in rows],
        total=total, page=page, page_size=page_size)

@router.get("/restaurants/{restaurant_id}", response_model=schemas.RestaurantResponse)
async def get_restaurant(restaurant_id: UUID, lat: Optional[float] = None, lng: Optional[float] = None, db: AsyncSession = Depends(get_db)):
    r = await restaurant_service.get_by_id(db, restaurant_id)
    if not r.is_active or not r.is_verified: raise HTTPException(status.HTTP_404_NOT_FOUND, "Restaurant not found")
    dist = None
    if lat is not None and lng is not None:
        from app.modules.food.service import _haversine_km
        dist = _haversine_km(lat, lng, r.latitude, r.longitude)
    return _restaurant_to_response(r, dist)

@router.get("/restaurants/{restaurant_id}/menu", response_model=schemas.RestaurantMenuResponse)
async def get_restaurant_menu(restaurant_id: UUID, veg_only: bool = False, search: Optional[str] = None, db: AsyncSession = Depends(get_db)):
    restaurant, categories = await restaurant_service.get_menu(db, restaurant_id, veg_only=veg_only, search=search)
    return schemas.RestaurantMenuResponse(
        restaurant=_restaurant_to_response(restaurant),
        categories=[schemas.MenuCategoryResponse(
            id=c.id, restaurant_id=c.restaurant_id, name=c.name, description=c.description,
            display_order=c.display_order, is_active=c.is_active,
            items=[_item_to_response(i) for i in c.items],
        ) for c in categories])

@router.get("/menu-items/{item_id}", response_model=schemas.MenuItemResponse)
async def get_menu_item(item_id: UUID, db: AsyncSession = Depends(get_db)):
    return _item_to_response(await menu_service.get_item(db, item_id))

@router.get("/cart", response_model=schemas.CartResponse)
async def get_cart(user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    return await cart_service.get_cart(db, user.id)

@router.post("/cart/items", response_model=schemas.CartResponse)
async def add_to_cart(body: schemas.CartItemAdd, force_replace: bool = Query(False),
    user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    return await cart_service.add_item(db, user.id, body, force_replace=force_replace)

@router.patch("/cart/items/{menu_item_id}", response_model=schemas.CartResponse)
async def update_cart_item_qty(menu_item_id: UUID, quantity: int = Query(..., ge=0, le=50),
    user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    return await cart_service.update_quantity(db, user.id, menu_item_id, quantity)

@router.delete("/cart", response_model=schemas.CartResponse)
async def clear_cart(user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    return await cart_service.clear_cart(db, user.id)

@router.post("/orders", response_model=schemas.FoodOrderResponse, status_code=201)
async def place_food_order(body: schemas.FoodOrderCreate, user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    order = await food_order_service.create_order(db, user, body)
    restaurant = await restaurant_service.get_by_id(db, body.restaurant_id)
    return schemas.FoodOrderResponse(
        id=order.id, order_number=order.order_number, order_type=order.order_type, status=order.status,
        restaurant_id=body.restaurant_id, restaurant_name=restaurant.name, customer_id=order.customer_id,
        subtotal=order.subtotal, delivery_fee=order.delivery_fee,
        packaging_fee=restaurant.packaging_fee or Decimal("0.00"), tax=order.tax,
        discount=order.discount or Decimal("0.00"), total_amount=order.total_amount,
        payment_method=order.payment_method, payment_status=order.payment_status,
        delivery_address=order.delivery_address,
        items=[schemas.FoodOrderItemResponse(name=i.product_name, quantity=i.quantity, unit_price=i.unit_price, line_total=i.subtotal) for i in order.items],
        # delivery_otp is never returned to any client — OTPs live only in Redis
        # (hashed) inside app.modules.delivery_otp and are verified server-side.
        notes=order.notes, created_at=order.created_at)

# Partner
@router.post("/partner/restaurant", response_model=schemas.RestaurantPartnerResponse, status_code=201)
async def create_my_restaurant(body: schemas.RestaurantCreate, user: User = Depends(require_role("restaurant")), db: AsyncSession = Depends(get_db)):
    return _restaurant_to_response(await restaurant_service.create_restaurant(db, user, body))

@router.get("/partner/restaurant", response_model=schemas.RestaurantPartnerResponse)
async def get_my_restaurant(user: User = Depends(require_role("restaurant")), db: AsyncSession = Depends(get_db)):
    return _restaurant_to_response(await restaurant_service.get_owned(db, user))

@router.patch("/partner/restaurant", response_model=schemas.RestaurantPartnerResponse)
async def update_my_restaurant(body: schemas.RestaurantUpdate, user: User = Depends(require_role("restaurant")), db: AsyncSession = Depends(get_db)):
    r = await restaurant_service.get_owned(db, user)
    return _restaurant_to_response(await restaurant_service.update_restaurant(db, r, body))

@router.get("/partner/dashboard", response_model=schemas.RestaurantDashboardStats)
async def partner_dashboard(user: User = Depends(require_role("restaurant")), db: AsyncSession = Depends(get_db)):
    return await food_order_service.dashboard_stats(db, user)

@router.post("/partner/toggle-open", response_model=schemas.RestaurantPartnerResponse)
async def toggle_open(is_open: bool = Query(...), user: User = Depends(require_role("restaurant")), db: AsyncSession = Depends(get_db)):
    r = await restaurant_service.get_owned(db, user)
    return _restaurant_to_response(await restaurant_service.update_restaurant(db, r, schemas.RestaurantUpdate(is_open=is_open)))

@router.post("/partner/toggle-accepting", response_model=schemas.RestaurantPartnerResponse)
async def toggle_accepting(is_accepting_orders: bool = Query(...), user: User = Depends(require_role("restaurant")), db: AsyncSession = Depends(get_db)):
    r = await restaurant_service.get_owned(db, user)
    return _restaurant_to_response(await restaurant_service.update_restaurant(db, r, schemas.RestaurantUpdate(is_accepting_orders=is_accepting_orders)))

@router.post("/partner/upload-image")
async def upload_restaurant_image(
    file: UploadFile = File(...),
    kind: str = Query("menu-item", pattern="^(logo|cover|menu-item|gallery)$"),
    user: User = Depends(require_role("restaurant")), db: AsyncSession = Depends(get_db),
):
    """[Restaurant partner] Upload a logo / cover / menu-item / gallery photo → CDN URL.

    Accepts JPEG / PNG / WebP, max 10 MB. Resized to 800x800 and re-encoded as WebP.
    """
    from app.modules.grocery.image_service import upload_product_image
    url = await upload_product_image(file, folder=f"food/{kind}")
    return {"image_url": url}

@router.post("/partner/categories", response_model=schemas.MenuCategoryResponse, status_code=201)
async def create_category(body: schemas.MenuCategoryCreate, user: User = Depends(require_role("restaurant")), db: AsyncSession = Depends(get_db)):
    r = await restaurant_service.get_owned(db, user)
    cat = await menu_service.create_category(db, r, body)
    return schemas.MenuCategoryResponse(id=cat.id, restaurant_id=cat.restaurant_id, name=cat.name, description=cat.description, display_order=cat.display_order, is_active=cat.is_active, items=[])

@router.patch("/partner/categories/{category_id}", response_model=schemas.MenuCategoryResponse)
async def update_category(category_id: UUID, body: schemas.MenuCategoryUpdate, user: User = Depends(require_role("restaurant")), db: AsyncSession = Depends(get_db)):
    r = await restaurant_service.get_owned(db, user)
    cat = await menu_service.update_category(db, await menu_service.get_category(db, category_id, r.id), body)
    return schemas.MenuCategoryResponse(id=cat.id, restaurant_id=cat.restaurant_id, name=cat.name, description=cat.description, display_order=cat.display_order, is_active=cat.is_active, items=[])

@router.get("/partner/categories", response_model=List[schemas.MenuCategoryResponse])
async def list_my_categories(user: User = Depends(require_role("restaurant")), db: AsyncSession = Depends(get_db)):
    r = await restaurant_service.get_owned(db, user)
    _, categories = await restaurant_service.get_menu(db, r.id)
    return [schemas.MenuCategoryResponse(id=c.id, restaurant_id=c.restaurant_id, name=c.name, description=c.description, display_order=c.display_order, is_active=c.is_active, items=[_item_to_response(i) for i in c.items]) for c in categories]

@router.post("/partner/menu-items", response_model=schemas.MenuItemResponse, status_code=201)
async def create_menu_item(body: schemas.MenuItemCreate, user: User = Depends(require_role("restaurant")), db: AsyncSession = Depends(get_db)):
    r = await restaurant_service.get_owned(db, user)
    return _item_to_response(await menu_service.create_item(db, r, body))

@router.patch("/partner/menu-items/{item_id}", response_model=schemas.MenuItemResponse)
async def update_menu_item(item_id: UUID, body: schemas.MenuItemUpdate, user: User = Depends(require_role("restaurant")), db: AsyncSession = Depends(get_db)):
    r = await restaurant_service.get_owned(db, user)
    item = await menu_service.get_item(db, item_id, r.id)
    return _item_to_response(await menu_service.update_item(db, item, body))

@router.delete("/partner/menu-items/{item_id}", status_code=204)
async def delete_menu_item(item_id: UUID, user: User = Depends(require_role("restaurant")), db: AsyncSession = Depends(get_db)):
    r = await restaurant_service.get_owned(db, user)
    await menu_service.soft_delete_item(db, await menu_service.get_item(db, item_id, r.id))

@router.post("/partner/menu-items/{item_id}/availability", response_model=schemas.MenuItemResponse)
async def toggle_item_availability(item_id: UUID, body: schemas.ToggleAvailability, user: User = Depends(require_role("restaurant")), db: AsyncSession = Depends(get_db)):
    r = await restaurant_service.get_owned(db, user)
    item = await menu_service.get_item(db, item_id, r.id)
    return _item_to_response(await menu_service.set_availability(db, item, body.is_available))

@router.post("/partner/menu-items/bulk-availability")
async def bulk_item_availability(body: schemas.BulkAvailabilityUpdate, user: User = Depends(require_role("restaurant")), db: AsyncSession = Depends(get_db)):
    r = await restaurant_service.get_owned(db, user)
    return {"updated": await menu_service.bulk_availability(db, r.id, body.item_ids, body.is_available)}

@router.get("/partner/orders")
async def list_partner_orders(status_filter: Optional[str] = Query(None, alias="status"), page: int = 1, page_size: int = 20,
    user: User = Depends(require_role("restaurant")), db: AsyncSession = Depends(get_db)):
    orders, total = await food_order_service.list_restaurant_orders(db, user, status_filter=status_filter, page=page, page_size=page_size)
    return {"orders": [{"id": str(o.id), "order_number": o.order_number, "status": o.status,
        "subtotal": str(o.subtotal), "delivery_fee": str(o.delivery_fee), "tax": str(o.tax),
        "total_amount": str(o.total_amount), "payment_method": o.payment_method, "payment_status": o.payment_status,
        "delivery_address": o.delivery_address,
        "items": [{"name": i.product_name, "quantity": i.quantity, "unit_price": str(i.unit_price), "subtotal": str(i.subtotal)} for i in o.items],
        "notes": o.notes, "created_at": o.created_at.isoformat() if o.created_at else None} for o in orders],
        "total": total, "page": page, "page_size": page_size}

@router.post("/partner/orders/{order_id}/status")
async def update_partner_order_status(order_id: UUID,
    new_status: str = Query(..., pattern="^(store_accepted|preparing|ready_for_pickup|rejected|cancelled)$"),
    user: User = Depends(require_role("restaurant")), db: AsyncSession = Depends(get_db)):
    order = await food_order_service.update_order_status(db, user, order_id, new_status)
    return {"id": str(order.id), "order_number": order.order_number, "status": order.status}
