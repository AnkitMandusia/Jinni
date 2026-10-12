"""Admin router — all endpoints under /api/v1/admin. Requires admin role."""
from fastapi import APIRouter

from app.admin.endpoints.users import router as users_router
from app.admin.endpoints.stats import router as stats_router
from app.admin.endpoints.orders import router as orders_router
from app.admin.endpoints.restaurants import router as restaurants_router

router = APIRouter(prefix="/admin")

router.include_router(stats_router)
router.include_router(users_router)
router.include_router(orders_router)
router.include_router(restaurants_router)
