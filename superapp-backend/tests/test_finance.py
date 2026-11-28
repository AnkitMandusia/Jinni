"""Settlement maths: commission split, rider position, platform revenue (see FINANCE.md)."""
from datetime import datetime
from decimal import Decimal
from types import SimpleNamespace as NS
from uuid import uuid4

from app.modules.finance import service as fin

ST = NS(food_commission_pct=Decimal("15"), grocery_commission_pct=Decimal("8"), rider_delivery_share_pct=Decimal("100"), ride_commission_pct=Decimal("10"))


def order(kind="food", subtotal="1000", fee="40", total="1100", method="cod", store=True, rider=True, tax="50", discount="0", dues="0", **snap):
    return NS(order_type=kind, subtotal=Decimal(subtotal), delivery_fee=Decimal(fee), total_amount=Decimal(total), payment_method=method,
              store_id=uuid4() if store else None, delivery_agent_id=uuid4() if rider else None, tax=Decimal(tax), discount=Decimal(discount),
              platform_dues=Decimal(dues), commission_amount=snap.get("c"), seller_amount=snap.get("s"), rider_amount=snap.get("r"))


def test_food_and_grocery_commission_split():
    c, s, r = fin.order_split(order("food"), ST)
    assert (c, s, r) == (Decimal("150.00"), Decimal("850.00"), Decimal("40.00"))
    c, s, r = fin.order_split(order("grocery"), ST)
    assert (c, s) == (Decimal("80.00"), Decimal("920.00"))


def test_rider_share_and_no_seller_or_rider():
    st = NS(**{**ST.__dict__, "rider_delivery_share_pct": Decimal("80")})
    assert fin.order_split(order(), st)[2] == Decimal("32.00")
    c, s, r = fin.order_split(order(store=False, rider=False), ST)
    assert (c, s, r) == (Decimal("0.00"), Decimal("0.00"), Decimal("0.00"))


def test_ride_split():
    ride = NS(fare=Decimal("90"))
    assert fin.ride_split(ride, ST) == (Decimal("9.00"), Decimal("81.00"))


def test_frozen_snapshot_wins_over_current_rates():
    o = order(c=Decimal("1.00"), s=Decimal("2.00"), r=Decimal("3.00"))
    assert fin.effective_order_split(o, ST) == (Decimal("1.00"), Decimal("2.00"), Decimal("3.00"))


def test_platform_revenue_composition():
    o = order("food", subtotal="1000", fee="40", total="1090", discount="50", tax="50")
    ride = NS(fare=Decimal("100"), dues_amount=Decimal("20"), payment_method="cash", commission_amount=None, rider_amount=None)
    t = fin.platform_totals([o], [ride], ST)
    # commission 150 + delivery margin 0 + ride commission 10 + fees 20 - promos 50
    assert t["revenue"] == Decimal("130.00")
    assert t["tax_collected"] == Decimal("50.00")
    assert t["gmv"] == Decimal("1210.00")


def test_signed_entries():
    assert fin.signed_entry(NS(amount=Decimal("10"), direction="in")) == Decimal("10")
    assert fin.signed_entry(NS(amount=Decimal("10"), direction="out")) == Decimal("-10")


def test_module_registry_has_live_services():
    from app.modules.base import REGISTRY
    live = {m.module_type for m in REGISTRY if m.status == "live"}
    assert {"food", "grocery", "rides"} <= live


def test_app_and_admin_routers_import_cleanly():
    """Catches missing imports / bad route decorators in modules no other test touches."""
    import importlib
    for m in ("app.admin.router", "app.admin.endpoints.finance", "app.admin.endpoints.stores", "app.admin.endpoints.insights", "app.tasks", "app.modules.registry_router"):
        importlib.import_module(m)
