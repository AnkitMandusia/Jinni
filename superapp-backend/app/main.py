"""FastAPI application main entry point."""
import asyncio
import logging
import sys
from contextlib import asynccontextmanager

logging.basicConfig(
    level=logging.WARNING,
    format="%(levelname)s  %(name)s: %(message)s",
    stream=sys.stdout,
)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from redis.asyncio import Redis

from app.config import settings
from app.modules.jinni.router import router as jinni_router
from app.database import close_db

# ── Routers ───────────────────────────────────────────────────────────────────
from app.modules.auth.router import router as auth_router
from app.modules.grocery.router import router as grocery_router
from app.modules.orders.router import router as orders_router
from app.modules.store.router import router as store_router
from app.modules.delivery.router import router as delivery_router
from app.modules.food.router import router as food_router
from app.modules.users.addresses_router import router as addresses_router
from app.modules.coupons.router import router as coupons_router
from app.modules.payments_paytm import router as paytm_router
from app.modules.support.router import router as support_router
from app.admin.router import router as admin_router
from app.modules.delivery_otp.webhooks import router as webhook_router
from app.realtime.router import router as realtime_router, redis_subscriber_loop

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup and shutdown."""
    logger.info(f"Starting {settings.APP_NAME}...")

    # Note: schema is managed by Alembic — run `alembic upgrade head` before starting

    # Redis — shared async client stored on app.state so dependencies can reach it
    app.state.redis = Redis.from_url(
        settings.REDIS_URL,
        encoding="utf-8",
        decode_responses=False,
    )
    await app.state.redis.ping()
    logger.info("Redis connected")

    # Realtime: one background task per worker process that fans Redis
    # pub/sub events out to this worker's locally-connected WebSockets.
    # Use a separate Redis connection for pub/sub (the pub/sub protocol
    # takes the connection over, so it must not be the shared app.state.redis
    # client used for normal get/set calls elsewhere).
    pubsub_redis = Redis.from_url(settings.REDIS_URL, encoding="utf-8", decode_responses=False)
    subscriber_task = asyncio.create_task(redis_subscriber_loop(pubsub_redis))

    yield

    # Shutdown
    subscriber_task.cancel()
    try:
        await subscriber_task
    except Exception:
        pass
    await pubsub_redis.aclose()
    await app.state.redis.aclose()
    logger.info("Redis closed")
    await close_db()
    logger.info("Database connections closed")


app = FastAPI(
    title=settings.APP_NAME,
    description=(
        "SuperApp API — multi-role platform: customer, store, restaurant, "
        "delivery, admin. Firebase OTP auth, role-based JWT, FCM notifications."
    ),
    version="1.0.0",
    lifespan=lifespan,
)

# ── Middleware ────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # Restrict to your domain in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routes ────────────────────────────────────────────────────────────────────
app.include_router(auth_router,    prefix="/api/v1")
app.include_router(grocery_router, prefix="/api/v1")
app.include_router(orders_router,  prefix="/api/v1")
app.include_router(store_router,    prefix="/api/v1")
app.include_router(delivery_router, prefix="/api/v1")
app.include_router(food_router, prefix="/api/v1")
app.include_router(addresses_router, prefix="/api/v1")
app.include_router(coupons_router, prefix="/api/v1")
app.include_router(paytm_router, prefix="/api/v1")
app.include_router(support_router, prefix="/api/v1")
app.include_router(admin_router,    prefix="/api/v1")
app.include_router(jinni_router, prefix="/api/v1")  # Jinni AI sessions
app.include_router(webhook_router, prefix="/api/v1")  # Meta WhatsApp + SMS webhooks
app.include_router(realtime_router, prefix="/api/v1")  # Order status WebSocket


@app.get("/health", tags=["system"])
async def health_check():
    return {"status": "healthy", "app": settings.APP_NAME}


@app.get("/", tags=["system"])
async def root():
    return {
        "app": settings.APP_NAME,
        "version": "1.0.0",
        "docs": "/docs",
        "health": "/health",
        "endpoints": {
            "auth":   "/api/v1/auth",
            "admin":  "/api/v1/admin",
            "grocery": "/api/v1/grocery",
            "store": "/api/v1/store",
            "orders": "/api/v1/orders",
            "delivery": "/api/v1/delivery",
            "food": "/api/v1/food",
        },
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=getattr(settings, "DEBUG", False),
    )
