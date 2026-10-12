"""
Seed mock restaurants + menu for local / staging food module.

Usage (from superapp-backend root, venv active):

    # Ensure migration applied first
    alembic upgrade head

    # Run seed
    python -m scripts.seed_food_restaurants
    # or:
    python scripts/seed_food_restaurants.py

Idempotent: skips if a restaurant with the same slug already exists.
Creates restaurant-role users if missing (OTP auth still works with phone).
"""
from __future__ import annotations

import asyncio
import sys
from datetime import time
from decimal import Decimal
from pathlib import Path
from uuid import uuid4

# Allow running as script from repo root or scripts/
ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import AsyncSessionLocal
from app.modules.users.models import User, RestaurantProfile
from app.modules.food.models import (
    Restaurant,
    MenuCategory,
    MenuItem,
    MenuItemOptionGroup,
    MenuItemOption,
)


# ── Mock data (Jaipur-ish coords for demo) ────────────────────────────────────

RESTAURANTS = [
    {
        "phone": "+919876500101",
        "owner_name": "Rahul Sharma",
        "name": "Spice Garden",
        "slug": "spice-garden",
        "description": "North Indian & Mughlai favourites. Family dining since 2012.",
        "cuisines": ["North Indian", "Mughlai"],
        "tags": ["Family", "Biryani"],
        "pure_veg": False,
        "cost_for_two": 600,
        "min_order_amount": Decimal("99"),
        "delivery_fee": Decimal("30"),
        "free_delivery_above": Decimal("399"),
        "packaging_fee": Decimal("10"),
        "avg_prep_minutes": 30,
        "rating_avg": Decimal("4.30"),
        "rating_count": 1280,
        "pincode": "302001",
        "city": "Jaipur",
        "state": "Rajasthan",
        "address_line1": "C-Scheme, Near Rajmandir",
        "latitude": 26.9124,
        "longitude": 75.7873,
        "fssai_license": "12219000000001",
        "categories": [
            {
                "name": "Starters",
                "items": [
                    {"name": "Paneer Tikka", "price": 220, "is_veg": True, "is_bestseller": True,
                     "description": "Cottage cheese marinated in spices, tandoor grilled"},
                    {"name": "Chicken Seekh Kebab", "price": 260, "is_veg": False,
                     "description": "Minced chicken skewers with mint chutney"},
                    {"name": "Veg Spring Roll", "price": 140, "is_veg": True,
                     "description": "Crispy rolls with mixed veggies"},
                ],
            },
            {
                "name": "Main Course",
                "items": [
                    {"name": "Butter Chicken", "price": 320, "is_veg": False, "is_bestseller": True,
                     "description": "Creamy tomato gravy with tender chicken",
                     "options": [
                         {"group": "Portion", "required": True, "choices": [
                             {"name": "Half", "delta": 0, "default": True},
                             {"name": "Full", "delta": 120},
                         ]},
                     ]},
                    {"name": "Dal Makhani", "price": 210, "is_veg": True,
                     "description": "Black lentils slow-cooked overnight"},
                    {"name": "Paneer Butter Masala", "price": 280, "is_veg": True, "is_recommended": True,
                     "description": "Soft paneer in rich makhani gravy"},
                    {"name": "Chicken Biryani", "price": 290, "is_veg": False, "is_bestseller": True,
                     "description": "Dum-cooked basmati with spices",
                     "options": [
                         {"group": "Spice level", "required": True, "choices": [
                             {"name": "Mild", "delta": 0, "default": True},
                             {"name": "Medium", "delta": 0},
                             {"name": "Extra spicy", "delta": 0},
                         ]},
                     ]},
                ],
            },
            {
                "name": "Breads & Rice",
                "items": [
                    {"name": "Butter Naan", "price": 50, "is_veg": True},
                    {"name": "Garlic Naan", "price": 60, "is_veg": True},
                    {"name": "Jeera Rice", "price": 120, "is_veg": True},
                ],
            },
        ],
    },
    {
        "phone": "+919876500102",
        "owner_name": "Priya Mehta",
        "name": "Green Bowl Cafe",
        "slug": "green-bowl-cafe",
        "description": "100% pure veg — salads, wraps, healthy bowls.",
        "cuisines": ["Healthy", "Continental"],
        "tags": ["Pure Veg", "Healthy"],
        "pure_veg": True,
        "cost_for_two": 450,
        "min_order_amount": Decimal("79"),
        "delivery_fee": Decimal("25"),
        "free_delivery_above": Decimal("299"),
        "packaging_fee": Decimal("5"),
        "avg_prep_minutes": 20,
        "rating_avg": Decimal("4.50"),
        "rating_count": 640,
        "pincode": "302001",
        "city": "Jaipur",
        "state": "Rajasthan",
        "address_line1": "Malviya Nagar, Main Market",
        "latitude": 26.8550,
        "longitude": 75.8200,
        "fssai_license": "12219000000002",
        "categories": [
            {
                "name": "Bowls",
                "items": [
                    {"name": "Quinoa Power Bowl", "price": 249, "is_veg": True, "is_bestseller": True,
                     "description": "Quinoa, chickpeas, avocado, tahini"},
                    {"name": "Mediterranean Bowl", "price": 229, "is_veg": True,
                     "description": "Hummus, falafel, couscous, salad"},
                ],
            },
            {
                "name": "Wraps",
                "items": [
                    {"name": "Paneer Tikka Wrap", "price": 179, "is_veg": True, "is_recommended": True},
                    {"name": "Falafel Wrap", "price": 159, "is_veg": True},
                ],
            },
            {
                "name": "Smoothies",
                "items": [
                    {"name": "Mango Lassi Smoothie", "price": 129, "is_veg": True},
                    {"name": "Berry Blast", "price": 149, "is_veg": True},
                ],
            },
        ],
    },
    {
        "phone": "+919876500103",
        "owner_name": "Amit Khan",
        "name": "Burger House",
        "slug": "burger-house",
        "description": "Smash burgers, loaded fries, shakes.",
        "cuisines": ["American", "Fast Food"],
        "tags": ["Burgers", "Late Night"],
        "pure_veg": False,
        "cost_for_two": 400,
        "min_order_amount": Decimal("99"),
        "delivery_fee": Decimal("35"),
        "free_delivery_above": Decimal("349"),
        "packaging_fee": Decimal("15"),
        "avg_prep_minutes": 22,
        "rating_avg": Decimal("4.10"),
        "rating_count": 2100,
        "pincode": "302001",
        "city": "Jaipur",
        "state": "Rajasthan",
        "address_line1": "Tonk Road, Near Airport Plaza",
        "latitude": 26.8280,
        "longitude": 75.8050,
        "fssai_license": "12219000000003",
        "categories": [
            {
                "name": "Burgers",
                "items": [
                    {"name": "Classic Chicken Burger", "price": 179, "is_veg": False, "is_bestseller": True,
                     "options": [
                         {"group": "Add-ons", "required": False, "max": 3, "choices": [
                             {"name": "Cheese slice", "delta": 30},
                             {"name": "Extra patty", "delta": 80},
                             {"name": "Jalapeños", "delta": 20},
                         ]},
                     ]},
                    {"name": "Veggie Supreme Burger", "price": 149, "is_veg": True},
                    {"name": "Double Smash Beef", "price": 249, "is_veg": False, "is_recommended": True},
                ],
            },
            {
                "name": "Sides",
                "items": [
                    {"name": "Loaded Fries", "price": 129, "is_veg": True},
                    {"name": "Onion Rings", "price": 99, "is_veg": True},
                ],
            },
            {
                "name": "Shakes",
                "items": [
                    {"name": "Chocolate Thick Shake", "price": 149, "is_veg": True, "is_egg": False},
                    {"name": "Oreo Shake", "price": 159, "is_veg": True},
                ],
            },
        ],
    },
]


async def get_or_create_owner(db: AsyncSession, phone: str, owner_name: str, restaurant_name: str) -> User:
    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalar_one_or_none()
    if user:
        return user

    user = User(
        id=uuid4(),
        phone=phone,
        role="restaurant",
        status="active",
        profile_complete=True,
    )
    # Optional fields if model has them
    if hasattr(user, "name"):
        user.name = owner_name  # type: ignore
    db.add(user)
    await db.flush()

    # restaurant_profiles KYC row (from 0001)
    profile = RestaurantProfile(
        id=uuid4(),
        user_id=user.id,
        owner_name=owner_name,
        restaurant_name=restaurant_name,
        is_open=True,
    )
    db.add(profile)
    await db.flush()
    return user


async def seed_one(db: AsyncSession, data: dict) -> str:
    existing = await db.execute(select(Restaurant).where(Restaurant.slug == data["slug"]))
    if existing.scalar_one_or_none():
        return f"SKIP  {data['name']} (slug exists)"

    owner = await get_or_create_owner(db, data["phone"], data["owner_name"], data["name"])

    rest = Restaurant(
        id=uuid4(),
        owner_id=owner.id,
        name=data["name"],
        slug=data["slug"],
        description=data.get("description"),
        cuisines=data["cuisines"],
        tags=data.get("tags") or [],
        address_line1=data["address_line1"],
        city=data["city"],
        state=data["state"],
        pincode=data["pincode"],
        latitude=data["latitude"],
        longitude=data["longitude"],
        pure_veg=data.get("pure_veg", False),
        cost_for_two=data.get("cost_for_two"),
        min_order_amount=data.get("min_order_amount", Decimal("0")),
        delivery_fee=data.get("delivery_fee", Decimal("30")),
        free_delivery_above=data.get("free_delivery_above"),
        packaging_fee=data.get("packaging_fee", Decimal("0")),
        avg_prep_minutes=data.get("avg_prep_minutes", 25),
        opens_at=time(9, 0),
        closes_at=time(23, 0),
        rating_avg=data.get("rating_avg", Decimal("0")),
        rating_count=data.get("rating_count", 0),
        fssai_license=data.get("fssai_license"),
        is_open=True,
        is_accepting_orders=True,
        is_active=True,
        is_verified=True,  # seed = already verified for demo
    )
    db.add(rest)
    await db.flush()

    for ci, cat_data in enumerate(data.get("categories") or []):
        cat = MenuCategory(
            id=uuid4(),
            restaurant_id=rest.id,
            name=cat_data["name"],
            display_order=ci,
            is_active=True,
        )
        db.add(cat)
        await db.flush()

        for ii, item_data in enumerate(cat_data.get("items") or []):
            item = MenuItem(
                id=uuid4(),
                restaurant_id=rest.id,
                category_id=cat.id,
                name=item_data["name"],
                description=item_data.get("description"),
                price=Decimal(str(item_data["price"])),
                is_veg=item_data.get("is_veg", True),
                is_egg=item_data.get("is_egg", False),
                is_bestseller=item_data.get("is_bestseller", False),
                is_recommended=item_data.get("is_recommended", False),
                is_available=True,
                is_active=True,
                display_order=ii,
            )
            db.add(item)
            await db.flush()

            for gi, opt_group in enumerate(item_data.get("options") or []):
                group = MenuItemOptionGroup(
                    id=uuid4(),
                    menu_item_id=item.id,
                    name=opt_group["group"],
                    min_select=1 if opt_group.get("required") else 0,
                    max_select=opt_group.get("max", 1),
                    is_required=bool(opt_group.get("required")),
                    display_order=gi,
                )
                db.add(group)
                await db.flush()
                for oi, choice in enumerate(opt_group.get("choices") or []):
                    db.add(
                        MenuItemOption(
                            id=uuid4(),
                            group_id=group.id,
                            name=choice["name"],
                            price_delta=Decimal(str(choice.get("delta", 0))),
                            is_default=bool(choice.get("default", False)),
                            is_available=True,
                            is_veg=True,
                            display_order=oi,
                        )
                    )

    return f"OK    {data['name']} ({data['slug']})"


async def main() -> None:
    async with AsyncSessionLocal() as db:
        print("Seeding food restaurants…")
        for data in RESTAURANTS:
            try:
                msg = await seed_one(db, data)
                print(" ", msg)
            except Exception as exc:
                await db.rollback()
                print(f"  FAIL  {data.get('name')}: {exc}")
                raise
        await db.commit()
        print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
