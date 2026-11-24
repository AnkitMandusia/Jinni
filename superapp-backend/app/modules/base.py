"""Service-module contract (architecture plan: "BaseServiceModule" + registry).

Adding a service (salon, parcel, ...):
  1. create app/modules/<name>/ with models, schemas, service, router
  2. add an Alembic migration for its tables
  3. append a ServiceModule(...) to REGISTRY below and `app.include_router(...)` in app/main.py
  4. mobile: add src/modules/<name>/ and read GET /api/v1/modules to decide whether to show the tile
Orders-like modules reuse: users/auth, delivery partners (DeliveryAgentProfile), payments, wallet/dues, finance snapshots.
"""
from dataclasses import dataclass, field


@dataclass(frozen=True)
class ServiceModule:
    module_type: str            # stable id used by the apps
    title: str
    status: str                 # live | beta | planned
    description: str = ""
    router_prefix: str = ""     # where its API lives under /api/v1
    partner_roles: tuple = field(default_factory=tuple)
    money: str = "commission"   # how finance treats it: commission | fare_commission | none


REGISTRY: tuple[ServiceModule, ...] = (
    ServiceModule("food", "Food", "live", "Restaurants, menus, cart, scheduled delivery", "/food", ("restaurant", "delivery"), "commission"),
    ServiceModule("grocery", "Mart", "live", "Platform catalogue + local stores", "/grocery", ("store", "delivery"), "commission"),
    ServiceModule("rides", "Rides (Jinni Carpet)", "live", "Bike / auto / cab on existing delivery partners", "/rides", ("delivery",), "fare_commission"),
    ServiceModule("salon", "Salon", "planned", "Slot booking, stylists", "/salon", ("salon",), "commission"),
)
