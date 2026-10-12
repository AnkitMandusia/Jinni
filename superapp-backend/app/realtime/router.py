"""Realtime WebSocket endpoint + Redis pub/sub fan-out.

Client connects to:  wss://<host>/api/v1/realtime/ws?token=<JWT access token>

On connect, the server re-authenticates the same JWT used for REST calls
(no separate realtime auth system to keep in sync). Role is taken from the
authenticated user, same as REST.

Event the clients should listen for:
    order.delivery_status_updated
    {
      "event": "order.delivery_status_updated",
      "eventId": "...",
      "orderId": "...",
      "status": "delivered",
      "completionMethod": "otp" | "admin_manual",
      "updatedAt": "2026-10-10T12:34:56Z"
    }

Also emitted for earlier lifecycle transitions (store_accepted, preparing,
ready_for_pickup, picked_up, in_transit) as "order.status_updated" so the
customer app's tracking screen can update live too, not just at delivery.
"""
from __future__ import annotations

import asyncio
import json
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from jose import JWTError, jwt
from sqlalchemy import select

from app.config import settings
from app.database import AsyncSessionLocal
from app.modules.users.models import User
from app.realtime.manager import manager, REDIS_PUBSUB_CHANNEL

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/realtime", tags=["realtime"])


async def _authenticate_ws_token(token: str) -> User | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            return None
    except JWTError:
        return None

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(User).where(User.id == user_id))
        return result.scalar_one_or_none()


@router.websocket("/ws")
async def order_events_ws(websocket: WebSocket, token: str = Query(...)):
    user = await _authenticate_ws_token(token)
    if not user or getattr(user, "status", "active") != "active":
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(websocket, user.id, user.role)
    try:
        while True:
            # Clients don't need to send anything; we just need the recv()
            # loop to detect disconnects. Reply to pings if a client sends one.
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("WS error for user=%s", user.id)
    finally:
        manager.disconnect(websocket, user.id, user.role)


async def redis_subscriber_loop(redis) -> None:
    """Run for the lifetime of the app (started in main.py's lifespan).
    Subscribes once per worker process to the shared Redis channel and
    hands every message to this worker's local ConnectionManager, which
    delivers only to sockets actually connected to this worker."""
    pubsub = redis.pubsub()
    await pubsub.subscribe(REDIS_PUBSUB_CHANNEL)
    logger.info("Realtime: subscribed to %s", REDIS_PUBSUB_CHANNEL)
    try:
        async for message in pubsub.listen():
            if message.get("type") != "message":
                continue
            try:
                payload = json.loads(message["data"])
            except Exception:
                continue
            await manager.dispatch_local(payload)
    except asyncio.CancelledError:
        raise
    except Exception:
        logger.exception("Realtime subscriber loop crashed — realtime push disabled until restart")
    finally:
        await pubsub.unsubscribe(REDIS_PUBSUB_CHANNEL)
