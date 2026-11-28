"""
Tests for the Zepto/Zomato-research follow-ups:
  * customer order cancellation (state rules, stock release, refund flag)
  * structured OOS cart check (verdicts + substitute ranking)
  * shared coupon discount math

Same approach as test_jinni_search.py: the models use Postgres-only column
types, so AsyncSession is mocked and real ORM instances are built in memory.
"""
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.modules.coupons.router import Coupon
from app.modules.coupons.service import calc_discount
from app.modules.grocery.models import Product
from app.modules.grocery.service import classify_cart_line, rank_substitutes
from app.modules.orders.models import Order, OrderItem
from app.modules.orders.service import OrderService


# ── helpers ──────────────────────────────────────────────────────────────────

def _product(stock=10, reserved=0, price="50.00", brand=None, name="Milk", active=True):
    return Product(
        id=uuid4(), name=name, slug=name.lower(), price=Decimal(price), unit="1 L",
        stock_quantity=stock, reserved_quantity=reserved, category_id=uuid4(),
        is_active=active, brand=brand,
    )


def _order(customer_id, status="pending_dispatch", payment_method="cod", payment_status="pending"):
    return Order(
        id=uuid4(), order_number="ORD1", customer_id=customer_id, status=status,
        payment_method=payment_method, payment_status=payment_status,
        subtotal=Decimal("100"), total_amount=Decimal("105"),
    )


def _db_for_cancel(order, items=(), products=None):
    """db.execute() is called twice: lock-select the order, then load its items."""
    first = MagicMock(); first.scalar_one_or_none.return_value = order
    second = MagicMock(); second.scalars.return_value.all.return_value = list(items)
    db = MagicMock()
    third = MagicMock()  # ride_dues.release() UPDATE
    db.execute = AsyncMock(side_effect=[first, second, third, third])
    db.get = AsyncMock(side_effect=lambda model, pk: (products or {}).get(pk))
    db.commit = AsyncMock()
    db.refresh = AsyncMock()
    return db


# ── cancellation ─────────────────────────────────────────────────────────────

async def test_cancel_pending_cod_order_releases_stock_and_no_refund():
    cust = uuid4()
    product = _product(stock=10, reserved=3)
    order = _order(cust)
    item = OrderItem(order_id=order.id, product_id=product.id, product_name="Milk",
                     unit_price=Decimal("50"), quantity=2, subtotal=Decimal("100"))
    db = _db_for_cancel(order, [item], {product.id: product})

    result, refund = await OrderService.cancel_order_by_customer(db, order.id, cust, "changed mind")

    assert result.status == "cancelled"
    assert result.cancelled_by == cust
    assert result.cancellation_reason == "changed mind"
    assert product.reserved_quantity == 1  # 3 - 2 given back
    assert refund == "not_applicable"
    db.commit.assert_awaited_once()


async def test_cancel_paid_online_order_flags_refund_pending_not_refunded():
    cust = uuid4()
    order = _order(cust, status="store_accepted", payment_method="online", payment_status="paid")
    db = _db_for_cancel(order)

    result, refund = await OrderService.cancel_order_by_customer(db, order.id, cust)

    assert result.status == "cancelled"
    assert result.payment_status == "refund_pending"  # never claimed as refunded
    assert refund == "pending"


async def test_cancel_stock_release_never_goes_negative():
    cust = uuid4()
    product = _product(reserved=1)
    order = _order(cust)
    item = OrderItem(order_id=order.id, product_id=product.id, product_name="Milk",
                     unit_price=Decimal("50"), quantity=5, subtotal=Decimal("250"))
    db = _db_for_cancel(order, [item], {product.id: product})

    await OrderService.cancel_order_by_customer(db, order.id, cust)

    assert product.reserved_quantity == 0


@pytest.mark.parametrize("status", ["preparing", "ready_for_pickup", "picked_up", "in_transit", "delivered"])
async def test_cancel_rejected_once_preparation_started(status):
    cust = uuid4()
    order = _order(cust, status=status)
    db = _db_for_cancel(order)

    with pytest.raises(HTTPException) as exc:
        await OrderService.cancel_order_by_customer(db, order.id, cust)

    assert exc.value.status_code == 409
    assert order.status == status
    db.commit.assert_not_awaited()


async def test_cancel_someone_elses_order_is_404_not_403():
    order = _order(uuid4())
    db = _db_for_cancel(order)

    with pytest.raises(HTTPException) as exc:
        await OrderService.cancel_order_by_customer(db, order.id, uuid4())

    assert exc.value.status_code == 404
    assert order.status == "pending_dispatch"


async def test_cancel_is_idempotent():
    cust = uuid4()
    order = _order(cust, status="cancelled")
    db = _db_for_cancel(order)

    result, refund = await OrderService.cancel_order_by_customer(db, order.id, cust)

    assert result.status == "cancelled"
    assert refund == "not_applicable"
    db.commit.assert_not_awaited()


# ── OOS cart check ───────────────────────────────────────────────────────────

def test_classify_cart_line_verdicts():
    assert classify_cart_line(_product(stock=10), 3) == ("ok", 10)
    assert classify_cart_line(_product(stock=10, reserved=8), 5) == ("partial", 2)
    assert classify_cart_line(_product(stock=4, reserved=4), 1) == ("out_of_stock", 0)
    assert classify_cart_line(_product(active=False), 1) == ("out_of_stock", 0)
    assert classify_cart_line(None, 1) == ("out_of_stock", 0)


def test_rank_substitutes_prefers_same_brand_then_closest_price_and_caps_at_three():
    oos = _product(price="50.00", brand="Amul", name="Amul Milk")
    cands = [
        _product(price="49.00", brand="Mother Dairy", name="MD Milk"),
        _product(price="80.00", brand="Amul", name="Amul Gold"),
        _product(price="52.00", brand="Nestle", name="Nestle Milk"),
        _product(price="60.00", brand="Amul", name="Amul Taaza"),
        _product(price="51.00", brand="Other", name="Other Milk"),
    ]
    ranked = [c.name for c in rank_substitutes(oos, cands)]
    assert ranked == ["Amul Taaza", "Amul Gold", "MD Milk"]


# ── coupon math ──────────────────────────────────────────────────────────────

def _coupon(kind, value, max_discount=None):
    return Coupon(discount_type=kind, discount_value=Decimal(value),
                  max_discount=Decimal(max_discount) if max_discount else None)


def test_calc_discount_percent_flat_and_caps():
    assert calc_discount(_coupon("percent", "10"), Decimal("200")) == Decimal("20.00")
    assert calc_discount(_coupon("percent", "50", "30"), Decimal("200")) == Decimal("30")
    assert calc_discount(_coupon("flat", "50"), Decimal("200")) == Decimal("50")
    # flat discount can never exceed the subtotal (no negative bills)
    assert calc_discount(_coupon("flat", "500"), Decimal("120")) == Decimal("120")
