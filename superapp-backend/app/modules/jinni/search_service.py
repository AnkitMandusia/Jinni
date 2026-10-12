"""
Real backend search for Jinni wishes — Prompt.txt section D.

Every item returned to the mobile app here comes straight from the
live `products` / `menu_items` tables via the same models the rest of
the app uses (grocery/food). Intent keywords (from the deterministic
matcher or the Gemini fallback) are only ever used as search terms —
never as a source of product data themselves.

Two lessons from real usage (see JINNI_IMPLEMENTATION_NOTES.md
"Third pass") drive the shape of this module now:

1. A small hand-written keyword dictionary will never cover every
   grocery item or dish name ("paneer" alone, or a full dish name like
   "paneer butter masala" not in the dictionary at all). So every
   search ALWAYS also tries the user's full raw phrase as a literal
   ILIKE match first — not just the recognized keyword(s) — before
   ever falling back to loose single-keyword matching. A full-phrase
   hit is near-certain to be the right product/dish; a loose
   single-keyword hit (e.g. "butter" alone) is just a guess and should
   never be preferred over an exact phrase match.

2. The matcher's grocery-vs-food guess is a hint, not a hard gate. If
   the hinted module finds nothing with the full phrase, we also try
   the OTHER module's full phrase before resorting to loose keyword
   search in the originally-hinted module — otherwise a dish name that
   happens to contain a grocery-sounding word (e.g. "paneer butter
   masala" contains "butter") gets misrouted to grocery and returns
   irrelevant loose matches ("Amul Butter", a cookie with butter in
   the name) instead of ever trying the food menu, where the dish
   actually lives.

Mirrors the mobile `interpretService.ts` rule: one wish touches exactly
one restaurant OR one store, never a mix.
"""
from __future__ import annotations

from typing import Optional
from uuid import UUID

from sqlalchemy import select, or_, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.food.models import Restaurant, MenuItem
from app.modules.grocery.models import Product

MAX_ITEMS = 6
MIN_PHRASE_LEN = 3  # below this, a full-phrase ILIKE is too noisy to trust


def _word_conditions(column, terms: list[str]):
    conds = []
    for term in terms:
        term = term.strip()
        if len(term) < 2:
            continue
        conds.append(column.ilike(f"%{term}%"))
    return conds


def _product_to_item(p: Product) -> dict:
    available = p.is_active and (p.stock_quantity - (p.reserved_quantity or 0)) > 0
    return {
        "id": f"groc_{p.id}",
        "product_id": str(p.id),
        "name": p.name,
        "price": float(p.price),
        "unit": p.unit,
        "image_url": p.primary_image_url,
        "available": bool(available),
        "unavailable_reason": None if available else "out_of_stock",
        "module_type": "grocery",
        "restaurant_id": str(p.store_id) if p.store_id else "platform",
        "restaurant_name": None,
    }


def _menu_item_to_item(item: MenuItem, restaurant: Restaurant) -> dict:
    available = bool(item.is_available) and restaurant.is_open and restaurant.is_accepting_orders
    reason = None
    if not available:
        reason = "item_unavailable" if not item.is_available else "restaurant_closed"
    return {
        "id": f"food_{item.id}",
        "product_id": str(item.id),
        "name": item.name,
        "price": float(item.effective_price),
        "unit": "1 pc",
        "image_url": item.image_url,
        "available": available,
        "unavailable_reason": reason,
        "module_type": "food",
        "restaurant_id": str(restaurant.id),
        "restaurant_name": restaurant.name,
    }


async def _grocery_by_terms(db: AsyncSession, terms: list[str]) -> list[dict]:
    conds = _word_conditions(Product.name, terms)
    if not conds:
        return []
    stmt = (
        select(Product)
        .where(Product.is_active == True, or_(*conds))  # noqa: E712
        .order_by(Product.display_order.asc())
        .limit(MAX_ITEMS)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_product_to_item(p) for p in rows]


async def search_grocery(db: AsyncSession, keywords: list[str], query_text: str) -> list[dict]:
    """Full-phrase tier first, loose-keyword tier as fallback — see module docstring."""
    full = query_text.strip()
    if len(full) >= MIN_PHRASE_LEN:
        items = await _grocery_by_terms(db, [full])
        if items:
            return items
    return await _grocery_by_terms(db, keywords or [query_text])


async def _resolve_restaurant_for_terms(
    db: AsyncSession, terms: list[str], restaurant_id: Optional[UUID]
) -> Optional[UUID]:
    if restaurant_id is not None:
        return restaurant_id
    conds = _word_conditions(MenuItem.name, terms)
    if not conds:
        return None
    best = (
        await db.execute(
            select(MenuItem.restaurant_id, func.count(MenuItem.id).label("hits"))
            .join(Restaurant, Restaurant.id == MenuItem.restaurant_id)
            .where(
                MenuItem.is_active == True,  # noqa: E712
                Restaurant.is_active == True,  # noqa: E712
                or_(*conds),
            )
            .group_by(MenuItem.restaurant_id)
            .order_by(func.count(MenuItem.id).desc())
            .limit(1)
        )
    ).first()
    return best[0] if best else None


async def _food_by_terms(
    db: AsyncSession, terms: list[str], fixed_restaurant_id: Optional[UUID]
) -> list[dict]:
    restaurant_id = await _resolve_restaurant_for_terms(db, terms, fixed_restaurant_id)
    if restaurant_id is None:
        return []
    restaurant = (await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))).scalar_one_or_none()
    if not restaurant:
        return []
    conds = _word_conditions(MenuItem.name, terms)
    if not conds:
        return []
    stmt = (
        select(MenuItem)
        .where(MenuItem.restaurant_id == restaurant_id, MenuItem.is_active == True, or_(*conds))  # noqa: E712
        .order_by(MenuItem.display_order.asc())
        .limit(MAX_ITEMS)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_menu_item_to_item(item, restaurant) for item in rows]


async def search_food(
    db: AsyncSession, keywords: list[str], query_text: str, restaurant_name: Optional[str] = None
) -> list[dict]:
    """Full-phrase tier first, loose-keyword tier as fallback — see module docstring."""
    fixed_restaurant_id: Optional[UUID] = None
    if restaurant_name:
        fixed_restaurant_id = (
            await db.execute(
                select(Restaurant.id).where(
                    Restaurant.is_active == True,  # noqa: E712
                    Restaurant.name.ilike(f"%{restaurant_name}%"),
                )
            )
        ).scalar_one_or_none()

    full = query_text.strip()
    if len(full) >= MIN_PHRASE_LEN:
        items = await _food_by_terms(db, [full], fixed_restaurant_id)
        if items:
            return items
    return await _food_by_terms(db, keywords or [query_text], fixed_restaurant_id)


async def search_both(
    db: AsyncSession,
    hinted_intent: str,
    keywords: list[str],
    query_text: str,
    restaurant_name: Optional[str] = None,
) -> tuple[str, list[dict]]:
    """
    Tries the hinted module first (full-phrase, then loose keywords);
    if that finds nothing, tries the OTHER module too before giving up.
    This is what stops a dish name that happens to contain a grocery
    word (e.g. "paneer butter masala") from only ever being searched
    as a loose grocery keyword match.

    Returns (module_type_used, items). items == [] means truly nothing
    matched in either module — caller should show a clarification.
    """
    order = ["grocery_search", "food_search"]
    if hinted_intent == "food_search":
        order = ["food_search", "grocery_search"]

    for module in order:
        if module == "grocery_search":
            items = await search_grocery(db, keywords, query_text)
        else:
            items = await search_food(db, keywords, query_text, restaurant_name)
        if items:
            return module, items

    return hinted_intent, []
