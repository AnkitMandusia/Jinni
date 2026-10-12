"""Lightweight realtime layer using FastAPI's native WebSocket support.

Why plain WebSocket instead of Socket.IO: the project already ships
`websockets` in requirements.txt and FastAPI/Starlette has first-class
WebSocket support, so this needed zero new dependencies and reuses the
existing JWT auth (`app.dependencies.get_current_user`) as-is.

Design:
  - One connection per (user_id, device). A user can have multiple devices
    connected at once (phone + tablet, etc).
  - Authorization is identity-based, not channel-based: we never ask a
    client "give me order X's updates" and trust it — the SERVER decides
    who receives an event, by only pushing to the order's customer_id,
    delivery_agent_id, store_id, and all connected admins. A client cannot
    subscribe to an order it has no business seeing.
  - Every event carries a UUID eventId so clients can dedupe if a websocket
    briefly reconnects and the server re-sends.
  - This is a best-effort push channel, not a source of truth. Clients
    MUST re-fetch the authoritative order state on reconnect, and the
    mobile apps keep their existing polling (e.g. OrderTrackingScreen's
    5s poll) as a safety net — see requirement 8's "never rely exclusively
    on local state or a socket event as proof of successful delivery".
"""
from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional
from uuid import UUID

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        # user_id (str) -> set of live websockets for that user
        self._connections: dict[str, set[WebSocket]] = {}
        # user_ids currently connected with role == "admin" (for broadcast)
        self._admin_user_ids: set[str] = set()

    async def connect(self, websocket: WebSocket, user_id: UUID, role: str) -> None:
        await websocket.accept()
        uid = str(user_id)
        self._connections.setdefault(uid, set()).add(websocket)
        if role == "admin":
            self._admin_user_ids.add(uid)
        logger.info("WS connected user=%s role=%s (total_conns=%d)", uid, role, self._count())

    def disconnect(self, websocket: WebSocket, user_id: UUID, role: str) -> None:
        uid = str(user_id)
        conns = self._connections.get(uid)
        if conns and websocket in conns:
            conns.discard(websocket)
            if not conns:
                self._connections.pop(uid, None)
                if role == "admin":
                    self._admin_user_ids.discard(uid)
        logger.info("WS disconnected user=%s role=%s (total_conns=%d)", uid, role, self._count())

    def _count(self) -> int:
        return sum(len(v) for v in self._connections.values())

    async def _send_to_user_id(self, user_id: str, payload: dict) -> None:
        conns = list(self._connections.get(user_id, ()))
        if not conns:
            return
        data = json.dumps(payload)
        dead: list[WebSocket] = []
        for ws in conns:
            try:
                await ws.send_text(data)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self._connections.get(user_id, set()).discard(ws)

    async def emit_order_event(
        self,
        event: str,
        *,
        order_id: str,
        customer_id: Optional[UUID] = None,
        delivery_agent_id: Optional[UUID] = None,
        store_id: Optional[UUID] = None,
        data: Optional[dict[str, Any]] = None,
    ) -> str:
        """Push `event` to exactly the people allowed to see this order:
        its customer, its assigned delivery agent, its store/restaurant
        owner, and every connected Super Admin. Returns the eventId.
        """
        event_id = str(uuid.uuid4())
        payload = {
            "event": event,
            "eventId": event_id,
            "orderId": order_id,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
            **(data or {}),
        }

        recipients: set[str] = set(self._admin_user_ids)
        for uid in (customer_id, delivery_agent_id, store_id):
            if uid:
                recipients.add(str(uid))

        for uid in recipients:
            await self._send_to_user_id(uid, payload)

        logger.info("WS emit event=%s order=%s recipients=%d", event, order_id, len(recipients))
        return event_id


    async def dispatch_local(self, payload: dict) -> None:
        """Deliver an already-built payload (received from Redis pub/sub)
        to whichever of its recipients are connected to *this* worker.
        Admins are resolved from this worker's own connected-admin set
        (not the publisher's), since each worker only knows who is
        actually connected to it."""
        recipients = set(payload.get("_recipients", [])) | self._admin_user_ids
        for uid in recipients:
            await self._send_to_user_id(uid, payload)


# Single shared instance for this process.
manager = ConnectionManager()

REDIS_PUBSUB_CHANNEL = "realtime:order_events"


async def emit_order_event_cluster_safe(
    redis,
    event: str,
    *,
    order_id: str,
    customer_id: Optional[UUID] = None,
    delivery_agent_id: Optional[UUID] = None,
    store_id: Optional[UUID] = None,
    data: Optional[dict[str, Any]] = None,
) -> str:
    """Use this (not manager.emit_order_event directly) from API routes.

    A single Uvicorn worker can deliver fine with manager.emit_order_event
    alone, but as soon as the app runs with >1 worker or >1 pod (which any
    Swiggy/Zomato/Blinkit-scale deployment will), the HTTP request that
    triggers the event and the recipient's open WebSocket can land on
    different processes. This publishes the event on a Redis pub/sub
    channel that every worker subscribes to at startup (see
    app.realtime.router.redis_subscriber_loop), so delivery works
    regardless of which worker holds the socket. In a single-worker dev
    setup this just adds one extra Redis round-trip.
    """
    event_id = str(uuid.uuid4())
    payload = {
        "event": event,
        "eventId": event_id,
        "orderId": order_id,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "_recipients": [str(uid) for uid in (customer_id, delivery_agent_id, store_id) if uid],
        **(data or {}),
    }
    try:
        await redis.publish(REDIS_PUBSUB_CHANNEL, json.dumps(payload))
    except Exception:
        logger.exception("Failed to publish realtime event order=%s event=%s", order_id, event)
    return event_id
