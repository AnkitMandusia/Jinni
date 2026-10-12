"""Food module business logic."""
from __future__ import annotations
import math, random, re, logging
from datetime import datetime
from decimal import Decimal
from typing import List, Optional, Tuple, Dict, Any
from uuid import UUID
from fastapi import HTTPException, status
from sqlalchemy import select, func, or_, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.modules.food.models import (
    Restaurant, MenuCategory, MenuItem, MenuItemOptionGroup, MenuItemOption, FoodCart,
)
from app.modules.food import schemas
from app.modules.coupons.router import Coupon, CouponRedemption
from app.modules.orders.models import (
    Order, OrderItem, OrderType, OrderStatus, PaymentMethod, PaymentStatus,
)
from app.modules.users.models import User

logger = logging.getLogger(__name__)

def _slugify(text: str) -> str:
    s = re.sub(r"[^\w\s-]", "", text.lower().strip())
    s = re.sub(r"[\s_-]+", "-", s).strip("-")
    return (s[:200] or "restaurant")

def _haversine_km(lat1, lon1, lat2, lon2) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi, dlambda = math.radians(lat2 - lat1), math.radians(lon2 - lon1)
    a = math.sin(dphi/2)**2 + math.cos(phi1)*math.cos(phi2)*math.sin(dlambda/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

def _assert_deliverable(restaurant: Restaurant, delivery_address) -> None:
    """Block checkout if the delivery address is outside the restaurant's serviceable area.

    Prefers an actual distance check (lat/lng vs delivery_radius_km) since that's the
    real signal; falls back to an exact pincode match when either side is missing
    coordinates. If we have neither coordinates nor a pincode to compare, we can't
    validate and let the order through rather than block legitimate orders on
    incomplete data.
    """
    addr_lat = getattr(delivery_address, "latitude", None)
    addr_lng = getattr(delivery_address, "longitude", None)
    addr_pincode = getattr(delivery_address, "pincode", None)

    if restaurant.latitude is not None and restaurant.longitude is not None and addr_lat is not None and addr_lng is not None:
        dist = _haversine_km(restaurant.latitude, restaurant.longitude, addr_lat, addr_lng)
        if dist > float(restaurant.delivery_radius_km):
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"This delivery address is outside {restaurant.name}'s delivery area "
                f"({dist:.1f} km away, serves up to {restaurant.delivery_radius_km} km)."
            )
        return

    if restaurant.pincode and addr_pincode:
        if restaurant.pincode != addr_pincode:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"{restaurant.name} does not deliver to pincode {addr_pincode}."
            )
        return
    # Neither coordinates nor pincodes available on both sides — can't validate, allow it.

def _estimate_delivery_time(prep_min: int, distance_km: Optional[float]) -> str:
    travel = int((distance_km or 3) * 4)
    low = prep_min + max(8, travel - 5)
    high = prep_min + max(12, travel + 8)
    return f"{low}-{high} min"

def _generate_order_number() -> str:
    return f"FD{datetime.utcnow().strftime('%y%m%d')}{random.randint(10000,99999)}"

def _item_to_response(item: MenuItem) -> schemas.MenuItemResponse:
    groups = []
    for g in (item.option_groups or []):
        opts = [schemas.MenuItemOptionResponse.model_validate(o) for o in (g.options or [])]
        groups.append(schemas.MenuItemOptionGroupResponse(
            id=g.id, name=g.name, min_select=g.min_select, max_select=g.max_select,
            is_required=g.is_required, display_order=g.display_order, options=opts,
        ))
    return schemas.MenuItemResponse(
        id=item.id, restaurant_id=item.restaurant_id, category_id=item.category_id,
        name=item.name, description=item.description, price=item.price,
        discounted_price=item.discounted_price, effective_price=item.effective_price,
        is_veg=item.is_veg, is_egg=item.is_egg, image_url=item.image_url,
        is_available=item.is_available, is_active=item.is_active,
        max_qty_per_order=item.max_qty_per_order, prep_time_minutes=item.prep_time_minutes,
        is_bestseller=item.is_bestseller, is_recommended=item.is_recommended,
        display_order=item.display_order, order_count=item.order_count,
        tax_percent=item.tax_percent, option_groups=groups,
    )

def _restaurant_to_response(r: Restaurant, distance_km: Optional[float] = None, matched_dish: Optional[str] = None) -> schemas.RestaurantResponse:
    data = schemas.RestaurantResponse.model_validate(r)
    data.distance_km = round(distance_km, 2) if distance_km is not None else None
    data.delivery_time_estimate = _estimate_delivery_time(r.avg_prep_minutes, distance_km)
    data.matched_dish = matched_dish
    return data

class RestaurantService:
    async def create_restaurant(self, db: AsyncSession, owner: User, data: schemas.RestaurantCreate) -> Restaurant:
        if owner.role != "restaurant":
            raise HTTPException(status.HTTP_403_FORBIDDEN, "Only restaurant accounts can create a restaurant")
        existing = await db.execute(select(Restaurant).where(Restaurant.owner_id == owner.id))
        if existing.scalar_one_or_none():
            raise HTTPException(status.HTTP_409_CONFLICT, "You already have a restaurant profile")
        base_slug = _slugify(data.name)
        slug, n = base_slug, 1
        while True:
            check = await db.execute(select(Restaurant.id).where(Restaurant.slug == slug))
            if not check.scalar_one_or_none():
                break
            n += 1
            slug = f"{base_slug}-{n}"
        restaurant = Restaurant(
            owner_id=owner.id, name=data.name, slug=slug, description=data.description,
            cuisines=data.cuisines, tags=data.tags or [], logo_url=data.logo_url,
            cover_image_url=data.cover_image_url, address_line1=data.address_line1,
            address_line2=data.address_line2, city=data.city, state=data.state,
            pincode=data.pincode, latitude=data.latitude, longitude=data.longitude,
            pure_veg=data.pure_veg, cost_for_two=data.cost_for_two,
            min_order_amount=data.min_order_amount, delivery_fee=data.delivery_fee,
            free_delivery_above=data.free_delivery_above, packaging_fee=data.packaging_fee,
            avg_prep_minutes=data.avg_prep_minutes, delivery_radius_km=data.delivery_radius_km,
            opens_at=data.opens_at, closes_at=data.closes_at,
            fssai_license=data.fssai_license, gstin=data.gstin, is_verified=False, is_active=True,
        )
        db.add(restaurant)
        await db.commit()
        await db.refresh(restaurant)
        return restaurant

    async def get_by_id(self, db: AsyncSession, restaurant_id: UUID) -> Restaurant:
        r = (await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))).scalar_one_or_none()
        if not r:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Restaurant not found")
        return r

    async def get_owned(self, db: AsyncSession, owner: User) -> Restaurant:
        r = (await db.execute(select(Restaurant).where(Restaurant.owner_id == owner.id))).scalar_one_or_none()
        if not r:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Restaurant not found for this account")
        return r

    async def update_restaurant(self, db: AsyncSession, restaurant: Restaurant, data: schemas.RestaurantUpdate) -> Restaurant:
        for k, v in data.model_dump(exclude_unset=True).items():
            setattr(restaurant, k, v)
        restaurant.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(restaurant)
        return restaurant

    async def list_restaurants(self, db, *, lat=None, lng=None, pincode=None, city=None, cuisine=None,
                               pure_veg=None, is_open=None, search=None, min_rating=None,
                               sort_by="relevance", page=1, page_size=20):
        q = select(Restaurant).where(Restaurant.is_active == True, Restaurant.is_verified == True)  # noqa: E712
        if pincode: q = q.where(Restaurant.pincode == pincode)
        if city: q = q.where(func.lower(Restaurant.city) == city.lower())
        if pure_veg is True: q = q.where(Restaurant.pure_veg == True)  # noqa: E712
        if is_open is True:
            q = q.where(Restaurant.is_open == True, Restaurant.is_accepting_orders == True)  # noqa: E712
        if cuisine: q = q.where(Restaurant.cuisines.any(cuisine))
        if min_rating is not None: q = q.where(Restaurant.rating_avg >= Decimal(str(min_rating)))
        matched_dish_map: Dict[UUID, str] = {}
        if search:
            raw = search.strip()
            like = f"%{raw}%"
            # Split into words so "chkn burgr" / "veg biryani" style multi-word or
            # partial queries still match individual words (Swiggy/Zomato-style
            # loose matching), not just one exact full-string match.
            words = [w for w in re.split(r"\s+", raw) if len(w) >= 2]
            word_likes = [f"%{w}%" for w in words] or [like]

            name_desc_cond = or_(
                Restaurant.name.ilike(like),
                Restaurant.description.ilike(like),
                *[Restaurant.name.ilike(w) for w in word_likes],
            )
            # cuisines is a list column — match any cuisine tag containing a query word
            cuisine_word_conds = []
            for w in words or [raw]:
                cuisine_word_conds.append(
                    func.exists(
                        select(1).where(
                            func.lower(func.unnest(Restaurant.cuisines)).like(f"%{w.lower()}%")
                        ).correlate(Restaurant)
                    )
                )

            # Dish/menu-item level search — if the query matches a menu item name
            # (e.g. "burger", "pizza") surface the restaurant that serves it, the
            # same way Swiggy/Zomato show "restaurants with <dish>" results.
            dish_subq = (
                select(MenuItem.name, MenuCategory.restaurant_id)
                .join(MenuCategory, MenuItem.category_id == MenuCategory.id)
                .where(
                    MenuItem.is_active == True,  # noqa: E712
                    or_(*[MenuItem.name.ilike(w) for w in word_likes]),
                )
            )
            dish_rows = (await db.execute(dish_subq)).all()
            dish_restaurant_ids = set()
            for dish_name, rest_id in dish_rows:
                dish_restaurant_ids.add(rest_id)
                if rest_id not in matched_dish_map:
                    matched_dish_map[rest_id] = dish_name

            conds = [name_desc_cond, *cuisine_word_conds]
            if dish_restaurant_ids:
                conds.append(Restaurant.id.in_(dish_restaurant_ids))
            q = q.where(or_(*conds))
        total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
        if sort_by == "rating":
            q = q.order_by(Restaurant.rating_avg.desc(), Restaurant.rating_count.desc())
        elif sort_by == "delivery_time":
            q = q.order_by(Restaurant.avg_prep_minutes.asc())
        elif sort_by == "cost_low":
            q = q.order_by(Restaurant.cost_for_two.asc().nullslast())
        elif sort_by == "cost_high":
            q = q.order_by(Restaurant.cost_for_two.desc().nullslast())
        else:
            q = q.order_by(Restaurant.rating_avg.desc(), Restaurant.is_open.desc())
        rows = (await db.execute(q.offset((page-1)*page_size).limit(page_size))).scalars().all()
        results = []
        for r in rows:
            dist = None
            if lat is not None and lng is not None:
                dist = _haversine_km(lat, lng, r.latitude, r.longitude)
                if dist > float(r.delivery_radius_km):
                    continue
            results.append((r, dist))
        if sort_by == "distance" and lat is not None:
            results.sort(key=lambda x: x[1] if x[1] is not None else 9999)
        return results, total, matched_dish_map

    async def get_menu(self, db, restaurant_id, *, veg_only=False, search=None):
        result = await db.execute(
            select(Restaurant).where(Restaurant.id == restaurant_id, Restaurant.is_active == True)  # noqa: E712
            .options(selectinload(Restaurant.categories).selectinload(MenuCategory.items)
                     .selectinload(MenuItem.option_groups).selectinload(MenuItemOptionGroup.options))
        )
        restaurant = result.scalar_one_or_none()
        if not restaurant:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Restaurant not found")
        categories = []
        for cat in restaurant.categories:
            if not cat.is_active:
                continue
            items = []
            for item in cat.items:
                if not item.is_active: continue
                if veg_only and not item.is_veg: continue
                if search and search.lower() not in item.name.lower(): continue
                items.append(item)
            cat.items = items
            if items or not search:
                categories.append(cat)
        return restaurant, categories

restaurant_service = RestaurantService()

class MenuService:
    async def create_category(self, db, restaurant, data):
        exists = await db.execute(select(MenuCategory).where(
            MenuCategory.restaurant_id == restaurant.id, func.lower(MenuCategory.name) == data.name.lower()))
        if exists.scalar_one_or_none():
            raise HTTPException(status.HTTP_409_CONFLICT, f"Category '{data.name}' already exists")
        cat = MenuCategory(restaurant_id=restaurant.id, name=data.name, description=data.description, display_order=data.display_order)
        db.add(cat); await db.commit(); await db.refresh(cat); return cat

    async def update_category(self, db, category, data):
        for k, v in data.model_dump(exclude_unset=True).items(): setattr(category, k, v)
        category.updated_at = datetime.utcnow(); await db.commit(); await db.refresh(category); return category

    async def get_category(self, db, category_id, restaurant_id):
        cat = (await db.execute(select(MenuCategory).where(MenuCategory.id == category_id, MenuCategory.restaurant_id == restaurant_id))).scalar_one_or_none()
        if not cat: raise HTTPException(status.HTTP_404_NOT_FOUND, "Category not found")
        return cat

    async def create_item(self, db, restaurant, data):
        if data.category_id: await self.get_category(db, data.category_id, restaurant.id)
        item = MenuItem(
            restaurant_id=restaurant.id, category_id=data.category_id, name=data.name,
            description=data.description, price=data.price, discounted_price=data.discounted_price,
            is_veg=data.is_veg, is_egg=data.is_egg, image_url=data.image_url, is_available=data.is_available,
            max_qty_per_order=data.max_qty_per_order, prep_time_minutes=data.prep_time_minutes,
            is_bestseller=data.is_bestseller, is_recommended=data.is_recommended,
            display_order=data.display_order, hsn_code=data.hsn_code, tax_percent=data.tax_percent,
        )
        db.add(item); await db.flush()
        for g_data in data.option_groups:
            group = MenuItemOptionGroup(menu_item_id=item.id, name=g_data.name, min_select=g_data.min_select,
                max_select=g_data.max_select, is_required=g_data.is_required, display_order=g_data.display_order)
            db.add(group); await db.flush()
            for o_data in g_data.options:
                db.add(MenuItemOption(group_id=group.id, name=o_data.name, price_delta=o_data.price_delta,
                    is_default=o_data.is_default, is_available=o_data.is_available, is_veg=o_data.is_veg,
                    display_order=o_data.display_order))
        await db.commit()
        return await self.get_item(db, item.id, restaurant.id)

    async def get_item(self, db, item_id, restaurant_id=None):
        q = select(MenuItem).where(MenuItem.id == item_id).options(
            selectinload(MenuItem.option_groups).selectinload(MenuItemOptionGroup.options))
        if restaurant_id: q = q.where(MenuItem.restaurant_id == restaurant_id)
        item = (await db.execute(q)).scalar_one_or_none()
        if not item or not item.is_active:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Menu item not found")
        return item

    async def update_item(self, db, item, data):
        payload = data.model_dump(exclude_unset=True)
        if payload.get("category_id"): await self.get_category(db, payload["category_id"], item.restaurant_id)
        for k, v in payload.items(): setattr(item, k, v)
        item.updated_at = datetime.utcnow(); await db.commit()
        return await self.get_item(db, item.id, item.restaurant_id)

    async def soft_delete_item(self, db, item):
        item.is_active = False; item.is_available = False; item.updated_at = datetime.utcnow(); await db.commit()

    async def set_availability(self, db, item, is_available):
        item.is_available = is_available; item.updated_at = datetime.utcnow(); await db.commit(); await db.refresh(item); return item

    async def bulk_availability(self, db, restaurant_id, item_ids, is_available):
        result = await db.execute(update(MenuItem).where(
            MenuItem.restaurant_id == restaurant_id, MenuItem.id.in_(item_ids), MenuItem.is_active == True  # noqa: E712
        ).values(is_available=is_available, updated_at=datetime.utcnow()))
        await db.commit(); return result.rowcount or 0

menu_service = MenuService()

class CartService:
    async def get_or_create_cart(self, db, user_id):
        cart = (await db.execute(select(FoodCart).where(FoodCart.user_id == user_id))).scalar_one_or_none()
        if not cart:
            cart = FoodCart(user_id=user_id, items=[]); db.add(cart); await db.commit(); await db.refresh(cart)
        return cart

    async def _build_response(self, db, cart):
        if not cart.items or not cart.restaurant_id:
            return schemas.CartResponse()
        restaurant = await restaurant_service.get_by_id(db, cart.restaurant_id)
        items_out, subtotal = [], Decimal("0.00")
        for raw in cart.items:
            item = await menu_service.get_item(db, UUID(raw["menu_item_id"]))
            qty = int(raw["quantity"])
            unit = Decimal(str(raw.get("unit_price", item.effective_price)))
            line = unit * qty; subtotal += line
            items_out.append(schemas.CartItemResponse(
                menu_item_id=item.id, name=item.name, quantity=qty, unit_price=unit, line_total=line,
                is_veg=item.is_veg, image_url=item.image_url,
                option_ids=[UUID(x) for x in raw.get("option_ids", [])],
                option_labels=raw.get("option_labels", []), special_instructions=raw.get("special_instructions"),
            ))
        delivery_fee = restaurant.delivery_fee
        if restaurant.free_delivery_above and subtotal >= restaurant.free_delivery_above:
            delivery_fee = Decimal("0.00")
        packaging = restaurant.packaging_fee or Decimal("0.00")
        tax = (subtotal * Decimal("0.05")).quantize(Decimal("0.01"))
        total = subtotal + delivery_fee + packaging + tax
        min_order = restaurant.min_order_amount or Decimal("0.00")
        return schemas.CartResponse(
            restaurant_id=restaurant.id, restaurant_name=restaurant.name, items=items_out,
            item_count=sum(i.quantity for i in items_out), subtotal=subtotal, delivery_fee=delivery_fee,
            packaging_fee=packaging, tax=tax, total=total, min_order_amount=min_order,
            meets_min_order=subtotal >= min_order,
        )

    async def get_cart(self, db, user_id):
        return await self._build_response(db, await self.get_or_create_cart(db, user_id))

    async def add_item(self, db, user_id, data, *, force_replace=False):
        item = await menu_service.get_item(db, data.menu_item_id)
        if not item.is_available:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"'{item.name}' is currently unavailable")
        restaurant = await restaurant_service.get_by_id(db, item.restaurant_id)
        if not restaurant.is_open or not restaurant.is_accepting_orders:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Restaurant is not accepting orders right now")
        option_labels, price_delta, valid_option_ids = [], Decimal("0.00"), set()
        for g in item.option_groups or []:
            for o in g.options or []:
                valid_option_ids.add(o.id)
                if o.id in data.option_ids:
                    if not o.is_available:
                        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Option '{o.name}' unavailable")
                    price_delta += o.price_delta; option_labels.append(o.name)
        for oid in data.option_ids:
            if oid not in valid_option_ids:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Invalid option id: {oid}")
        for g in item.option_groups or []:
            selected = sum(1 for o in (g.options or []) if o.id in data.option_ids)
            if g.is_required and selected < g.min_select:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Please select at least {g.min_select} option(s) for '{g.name}'")
            if selected > g.max_select:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"You can select at most {g.max_select} option(s) for '{g.name}'")
        unit_price = item.effective_price + price_delta
        cart = await self.get_or_create_cart(db, user_id)
        if cart.restaurant_id and cart.restaurant_id != item.restaurant_id and cart.items:
            if not force_replace:
                current = await restaurant_service.get_by_id(db, cart.restaurant_id)
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail={
                    "code": "CART_RESTAURANT_MISMATCH",
                    "message": f"Your cart contains items from {current.name}. Clear the cart to add items from {restaurant.name}?",
                    "current_restaurant_id": str(current.id), "current_restaurant_name": current.name,
                    "new_restaurant_id": str(restaurant.id), "new_restaurant_name": restaurant.name,
                })
            cart.items = []; cart.restaurant_id = item.restaurant_id
        cart.restaurant_id = item.restaurant_id
        items = list(cart.items or [])
        opt_key = sorted(str(x) for x in data.option_ids)
        merged = False
        for raw in items:
            if raw["menu_item_id"] == str(item.id) and sorted(raw.get("option_ids", [])) == opt_key:
                raw["quantity"] = int(raw["quantity"]) + data.quantity
                if item.max_qty_per_order and raw["quantity"] > item.max_qty_per_order:
                    raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Max {item.max_qty_per_order} of '{item.name}' per order")
                merged = True; break
        if not merged:
            if item.max_qty_per_order and data.quantity > item.max_qty_per_order:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Max {item.max_qty_per_order} of '{item.name}' per order")
            items.append({"menu_item_id": str(item.id), "quantity": data.quantity,
                "option_ids": [str(x) for x in data.option_ids], "option_labels": option_labels,
                "special_instructions": data.special_instructions, "unit_price": str(unit_price)})
        cart.items = items; cart.updated_at = datetime.utcnow(); await db.commit(); await db.refresh(cart)
        return await self._build_response(db, cart)

    async def update_quantity(self, db, user_id, menu_item_id, quantity, option_ids=None):
        cart = await self.get_or_create_cart(db, user_id)
        opt_key = sorted(str(x) for x in (option_ids or []))
        new_items = []
        for raw in list(cart.items or []):
            match = raw["menu_item_id"] == str(menu_item_id) and sorted(raw.get("option_ids", [])) == opt_key
            if match:
                if quantity <= 0: continue
                raw["quantity"] = quantity
            new_items.append(raw)
        cart.items = new_items
        if not new_items: cart.restaurant_id = None
        cart.updated_at = datetime.utcnow(); await db.commit()
        return await self._build_response(db, cart)

    async def clear_cart(self, db, user_id):
        cart = await self.get_or_create_cart(db, user_id)
        cart.items = []; cart.restaurant_id = None; cart.updated_at = datetime.utcnow(); await db.commit()
        return schemas.CartResponse()

cart_service = CartService()

class FoodOrderService:
    async def create_order(self, db, customer, data):
        restaurant = await restaurant_service.get_by_id(db, data.restaurant_id)
        if not restaurant.is_active:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Restaurant is not available")
        if not restaurant.is_open or not restaurant.is_accepting_orders:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Restaurant is not accepting orders")
        _assert_deliverable(restaurant, data.delivery_address)
        subtotal = Decimal("0.00")
        order_items_data = []
        for line in data.items:
            item = await menu_service.get_item(db, line.menu_item_id)
            if item.restaurant_id != restaurant.id:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Item '{item.name}' does not belong to this restaurant")
            if not item.is_available:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"'{item.name}' is unavailable")
            price_delta, option_labels = Decimal("0.00"), []
            for g in item.option_groups or []:
                for o in g.options or []:
                    if o.id in line.option_ids:
                        price_delta += o.price_delta; option_labels.append(o.name)
            unit = item.effective_price + price_delta
            line_total = unit * line.quantity; subtotal += line_total
            order_items_data.append({
                "product_name": item.name + (f" ({', '.join(option_labels)})" if option_labels else ""),
                "unit_price": unit, "quantity": line.quantity, "subtotal": line_total,
            })
            item.order_count = (item.order_count or 0) + line.quantity
        if subtotal < (restaurant.min_order_amount or Decimal("0")):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Minimum order amount is ₹{restaurant.min_order_amount}")
        delivery_fee = restaurant.delivery_fee
        if restaurant.free_delivery_above and subtotal >= restaurant.free_delivery_above:
            delivery_fee = Decimal("0.00")
        packaging = restaurant.packaging_fee or Decimal("0.00")
        tax = (subtotal * Decimal("0.05")).quantize(Decimal("0.01"))

        # Validate coupon server-side so the amount sent to Paytm is exactly the
        # amount shown to the customer. Redemption is committed immediately for COD
        # and after successful Paytm verification for online orders.
        coupon_discount = Decimal("0.00")
        coupon_code = (data.coupon_code or "").strip().upper() or None
        coupon = None
        if coupon_code:
            coupon = (await db.execute(select(Coupon).where(Coupon.code == coupon_code))).scalar_one_or_none()
            if not coupon or not coupon.is_active:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid coupon")
            now = datetime.utcnow()
            if coupon.starts_at and now < coupon.starts_at:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Coupon not started yet")
            if coupon.expires_at and now > coupon.expires_at:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Coupon expired")
            if coupon.applies_to not in ("all", "food"):
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Coupon not valid for food orders")
            if subtotal < coupon.min_order_amount:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Minimum order ₹{coupon.min_order_amount}")
            if coupon.max_uses_total is not None and coupon.used_count >= coupon.max_uses_total:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "Coupon fully redeemed")
            user_uses = (await db.execute(select(func.count()).select_from(CouponRedemption).where(
                CouponRedemption.coupon_id == coupon.id, CouponRedemption.user_id == customer.id
            ))).scalar() or 0
            if user_uses >= coupon.max_uses_per_user:
                raise HTTPException(status.HTTP_400_BAD_REQUEST, "You already used this coupon")
            if coupon.coupon_kind == "first_order":
                prior = (await db.execute(select(func.count()).select_from(Order).where(Order.customer_id == customer.id))).scalar() or 0
                if prior > 0:
                    raise HTTPException(status.HTTP_400_BAD_REQUEST, "First-order coupon only")
            if coupon.discount_type == "percent":
                coupon_discount = (subtotal * coupon.discount_value / Decimal("100")).quantize(Decimal("0.01"))
                if coupon.max_discount is not None:
                    coupon_discount = min(coupon_discount, coupon.max_discount)
            else:
                coupon_discount = min(coupon.discount_value, subtotal)
            coupon_discount = max(Decimal("0.00"), coupon_discount)

        total = max(Decimal("0.00"), subtotal + delivery_fee + packaging + tax - coupon_discount)
        order = Order(
            order_number=_generate_order_number(), order_type=OrderType.FOOD.value,
            customer_id=customer.id, store_id=restaurant.owner_id,
            status=OrderStatus.PENDING_DISPATCH.value,
            # delivery_otp intentionally not set — see delivery_otp module; the old
            # random.randint plaintext OTP was not cryptographically secure and was
            # being leaked back in the order-details API response.
            subtotal=subtotal, delivery_fee=delivery_fee, tax=tax, discount=coupon_discount,
            total_amount=total, payment_method=PaymentMethod(data.payment_method).value,
            coupon_code=coupon_code,
            payment_status=PaymentStatus.PENDING.value,
            delivery_address=data.delivery_address.model_dump(),
            delivery_pincode=data.delivery_address.pincode,
            delivery_lat=data.delivery_address.latitude, delivery_lng=data.delivery_address.longitude,
            notes=data.notes,
        )
        db.add(order); await db.flush()
        for oi in order_items_data:
            db.add(OrderItem(order_id=order.id, product_id=None, product_name=oi["product_name"],
                product_sku=None, unit_price=oi["unit_price"], quantity=oi["quantity"], subtotal=oi["subtotal"]))
        cart = await cart_service.get_or_create_cart(db, customer.id)
        cart.items = []; cart.restaurant_id = None
        if coupon and coupon_discount > 0 and order.payment_method == PaymentMethod.COD.value:
            db.add(CouponRedemption(coupon_id=coupon.id, user_id=customer.id, order_id=order.id, discount_amount=coupon_discount))
            coupon.used_count = (coupon.used_count or 0) + 1
        await db.commit(); await db.refresh(order)
        result = await db.execute(select(Order).where(Order.id == order.id).options(selectinload(Order.items)))
        return result.scalar_one()

    async def list_restaurant_orders(self, db, owner, *, status_filter=None, page=1, page_size=20):
        q = select(Order).where(
            Order.store_id == owner.id,
            Order.order_type == OrderType.FOOD.value,
            # COD orders are immediately visible; online orders become visible only after Paytm confirms payment.
            or_(Order.payment_method != PaymentMethod.ONLINE.value, Order.payment_status == PaymentStatus.PAID.value),
        )
        if status_filter: q = q.where(Order.status == status_filter)
        total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
        rows = (await db.execute(q.options(selectinload(Order.items)).order_by(Order.created_at.desc())
            .offset((page-1)*page_size).limit(page_size))).scalars().all()
        return list(rows), total

    async def update_order_status(self, db, owner, order_id, new_status):
        order = (await db.execute(select(Order).where(
            Order.id == order_id, Order.store_id == owner.id, Order.order_type == OrderType.FOOD.value
        ).options(selectinload(Order.items)))).scalar_one_or_none()
        if not order: raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")
        if order.payment_method == PaymentMethod.ONLINE.value and order.payment_status != PaymentStatus.PAID.value:
            raise HTTPException(status.HTTP_402_PAYMENT_REQUIRED, "Online payment is not confirmed yet")
        allowed = {
            OrderStatus.PENDING_DISPATCH.value: [OrderStatus.STORE_ACCEPTED.value, OrderStatus.REJECTED.value],
            OrderStatus.STORE_ACCEPTED.value: [OrderStatus.PREPARING.value, OrderStatus.CANCELLED.value],
            OrderStatus.PREPARING.value: [OrderStatus.READY_FOR_PICKUP.value, OrderStatus.CANCELLED.value],
            OrderStatus.READY_FOR_PICKUP.value: [OrderStatus.DELIVERY_ASSIGNED.value],
        }
        if new_status not in allowed.get(order.status, []):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Cannot transition from '{order.status}' to '{new_status}'")
        order.status = new_status
        if new_status == OrderStatus.STORE_ACCEPTED.value: order.accepted_at = datetime.utcnow()
        await db.commit(); await db.refresh(order); return order

    async def dashboard_stats(self, db, owner):
        restaurant = await restaurant_service.get_owned(db, owner)
        today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        today_orders = (await db.execute(select(func.count(Order.id)).where(
            Order.store_id == owner.id, Order.order_type == OrderType.FOOD.value,
            Order.created_at >= today_start,
            Order.status.notin_([OrderStatus.CANCELLED.value, OrderStatus.REJECTED.value]),
        ))).scalar() or 0
        today_revenue = (await db.execute(select(func.coalesce(func.sum(Order.total_amount), 0)).where(
            Order.store_id == owner.id, Order.order_type == OrderType.FOOD.value,
            Order.created_at >= today_start,
            Order.status.notin_([OrderStatus.CANCELLED.value, OrderStatus.REJECTED.value]),
        ))).scalar() or Decimal("0.00")
        async def count_status(*statuses):
            return (await db.execute(select(func.count(Order.id)).where(
                Order.store_id == owner.id, Order.order_type == OrderType.FOOD.value, Order.status.in_(list(statuses))
            ))).scalar() or 0
        active_items = (await db.execute(select(func.count(MenuItem.id)).where(
            MenuItem.restaurant_id == restaurant.id, MenuItem.is_active == True, MenuItem.is_available == True  # noqa: E712
        ))).scalar() or 0
        unavailable = (await db.execute(select(func.count(MenuItem.id)).where(
            MenuItem.restaurant_id == restaurant.id, MenuItem.is_active == True, MenuItem.is_available == False  # noqa: E712
        ))).scalar() or 0
        return schemas.RestaurantDashboardStats(
            today_orders=today_orders, today_revenue=Decimal(str(today_revenue)),
            pending_orders=await count_status(OrderStatus.PENDING_DISPATCH.value),
            preparing_orders=await count_status(OrderStatus.STORE_ACCEPTED.value, OrderStatus.PREPARING.value),
            ready_orders=await count_status(OrderStatus.READY_FOR_PICKUP.value),
            is_open=restaurant.is_open, is_accepting_orders=restaurant.is_accepting_orders,
            active_menu_items=active_items, unavailable_items=unavailable,
        )

food_order_service = FoodOrderService()
