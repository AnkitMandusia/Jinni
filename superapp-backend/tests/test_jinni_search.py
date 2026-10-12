"""
Unit tests for app/modules/jinni/search_service.py — Prompt.txt F
("real search", "missing audio" is covered on the mobile side, this
file covers "real search" + availability-flag correctness).

search_grocery/search_food build SQLAlchemy queries against the real
Product/MenuItem/Restaurant models, which use Postgres-only column
types (ARRAY, JSONB, dialect UUID) and so can't be exercised against
the in-memory SQLite used in test_jinni.py. Instead these tests mock
AsyncSession.execute() to return real ORM instances built in memory
(no DB round trip), which is enough to prove the availability/ordering
logic in search_service.py is correct without needing a live Postgres.
"""
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.modules.grocery.models import Product
from app.modules.food.models import Restaurant, MenuItem
from app.modules.jinni import search_service


def _scalars_result(items):
    result = MagicMock()
    result.scalars.return_value.all.return_value = items
    return result


def _scalar_one_result(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    return result


def _first_result(value):
    result = MagicMock()
    result.first.return_value = value
    return result


def _make_product(**kw) -> Product:
    # Declarative Base's default __init__ accepts mapped column kwargs —
    # unlike Model.__new__(Model), this properly initializes SQLAlchemy's
    # per-instance attribute state so plain attribute get/set works.
    defaults = dict(
        id=uuid4(), name="Amul Milk 500ml", price=Decimal("28.00"), unit="500ml",
        primary_image_url=None, is_active=True, stock_quantity=10,
        reserved_quantity=0, store_id=None,
    )
    defaults.update(kw)
    return Product(**defaults)


def _make_restaurant(**kw) -> Restaurant:
    defaults = dict(
        id=uuid4(), name="Test Dhaba", is_active=True, is_open=True, is_accepting_orders=True,
    )
    defaults.update(kw)
    return Restaurant(**defaults)


def _make_menu_item(**kw) -> MenuItem:
    defaults = dict(
        id=uuid4(), restaurant_id=uuid4(), name="Veg Pizza", price=Decimal("199.00"),
        discounted_price=None, image_url=None, is_active=True, is_available=True,
    )
    defaults.update(kw)
    return MenuItem(**defaults)


@pytest.mark.asyncio
async def test_search_grocery_marks_in_stock_items_available():
    product = _make_product(stock_quantity=5, reserved_quantity=0)
    db = AsyncMock()
    db.execute.return_value = _scalars_result([product])

    items = await search_service.search_grocery(db, ["milk"], "doodh")

    assert len(items) == 1
    assert items[0]["available"] is True
    assert items[0]["unavailable_reason"] is None
    assert items[0]["module_type"] == "grocery"


@pytest.mark.asyncio
async def test_search_grocery_marks_out_of_stock_items_unavailable():
    product = _make_product(stock_quantity=2, reserved_quantity=2)  # 0 sellable
    db = AsyncMock()
    db.execute.return_value = _scalars_result([product])

    items = await search_service.search_grocery(db, ["milk"], "doodh")

    assert items[0]["available"] is False
    assert items[0]["unavailable_reason"] == "out_of_stock"


@pytest.mark.asyncio
async def test_search_grocery_returns_empty_without_keywords_or_text():
    db = AsyncMock()
    items = await search_service.search_grocery(db, [], "")
    assert items == []
    db.execute.assert_not_called()


@pytest.mark.asyncio
async def test_search_food_marks_restaurant_closed():
    restaurant = _make_restaurant(is_open=False)
    menu_item = _make_menu_item(restaurant_id=restaurant.id, is_available=True)
    db = AsyncMock()
    # order of execute() calls inside search_food (no restaurant_name hint):
    # 1) best-matching restaurant_id aggregate query
    # 2) fetch the Restaurant row
    # 3) fetch matching MenuItem rows
    db.execute.side_effect = [
        _first_result((restaurant.id, 3)),
        _scalar_one_result(restaurant),
        _scalars_result([menu_item]),
    ]

    items = await search_service.search_food(db, ["pizza"], "pizza chahiye")

    assert items[0]["available"] is False
    assert items[0]["unavailable_reason"] == "restaurant_closed"
    assert items[0]["restaurant_name"] == "Test Dhaba"


@pytest.mark.asyncio
async def test_search_food_marks_item_unavailable_when_item_itself_is_off():
    restaurant = _make_restaurant(is_open=True, is_accepting_orders=True)
    menu_item = _make_menu_item(restaurant_id=restaurant.id, is_available=False)
    db = AsyncMock()
    db.execute.side_effect = [
        _first_result((restaurant.id, 1)),
        _scalar_one_result(restaurant),
        _scalars_result([menu_item]),
    ]

    items = await search_service.search_food(db, ["pizza"], "pizza")

    assert items[0]["available"] is False
    assert items[0]["unavailable_reason"] == "item_unavailable"


@pytest.mark.asyncio
async def test_search_food_scopes_to_single_restaurant_when_name_given():
    restaurant = _make_restaurant(name="Pizza Palace")
    menu_item = _make_menu_item(restaurant_id=restaurant.id)
    db = AsyncMock()
    # order with restaurant_name hint: 1) resolve restaurant id by name,
    # 2) fetch Restaurant row, 3) fetch matching MenuItem rows.
    db.execute.side_effect = [
        _scalar_one_result(restaurant.id),
        _scalar_one_result(restaurant),
        _scalars_result([menu_item]),
    ]

    items = await search_service.search_food(db, ["pizza"], "pizza", restaurant_name="Pizza Palace")

    assert len(items) == 1
    assert items[0]["restaurant_id"] == str(restaurant.id)


@pytest.mark.asyncio
async def test_search_food_returns_empty_when_no_restaurant_matches():
    db = AsyncMock()
    db.execute.return_value = _first_result(None)
    items = await search_service.search_food(db, ["nonexistent_dish_xyz"], "nonexistent_dish_xyz")
    assert items == []


@pytest.mark.asyncio
async def test_search_both_falls_back_to_other_module_when_hinted_one_is_empty():
    # Regression: "paneer butter masala" used to be classified
    # grocery_search (because "butter" is a grocery hint) and ONLY ever
    # searched there, returning irrelevant loose matches like "Amul
    # Butter" instead of ever trying the food menu where the actual
    # dish lives. search_both must try the other module too once the
    # hinted one comes back empty.
    db = AsyncMock()
    # Grocery (hinted module) full-phrase + keyword search both find
    # nothing real (simulate via empty scalars result every time).
    # Food (fallback module) full-phrase search succeeds immediately.
    restaurant = _make_restaurant(name="Punjabi Dhaba")
    menu_item = _make_menu_item(name="Paneer Butter Masala", restaurant_id=restaurant.id)

    grocery_empty = _scalars_result([])
    food_hit_sequence = [
        _first_result((restaurant.id, 1)),  # aggregate query for restaurant
        _scalar_one_result(restaurant),  # fetch restaurant row
        _scalars_result([menu_item]),  # fetch menu items
    ]
    # Grocery is tried first (2 calls: full-phrase, then keyword
    # fallback), both empty; then food is tried and succeeds.
    db.execute.side_effect = [grocery_empty, grocery_empty, *food_hit_sequence]

    module, items = await search_service.search_both(
        db, "grocery_search", ["paneer", "butter", "masala"], "paneer butter masala"
    )

    assert module == "food_search"
    assert len(items) == 1
    assert items[0]["name"] == "Paneer Butter Masala"
    assert items[0]["restaurant_name"] == "Punjabi Dhaba"


@pytest.mark.asyncio
async def test_search_both_prefers_hinted_module_when_it_has_results():
    db = AsyncMock()
    product = _make_product(name="Amul Fresh Milk 500ml")
    db.execute.return_value = _scalars_result([product])

    module, items = await search_service.search_both(db, "grocery_search", ["milk"], "doodh")

    assert module == "grocery_search"
    assert items[0]["name"] == "Amul Fresh Milk 500ml"
