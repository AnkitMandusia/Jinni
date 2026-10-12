"""Webhooks for Meta WhatsApp and SMS delivery status."""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from redis.asyncio import Redis

from app.config import settings
from app.dependencies import get_redis
from app.modules.delivery_otp import service as otp_svc

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/webhooks", tags=["webhooks"])


@router.get("/meta/whatsapp")
async def meta_whatsapp_verify(
    hub_mode: str = Query(None, alias="hub.mode"),
    hub_verify_token: str = Query(None, alias="hub.verify_token"),
    hub_challenge: str = Query(None, alias="hub.challenge"),
):
    """Meta webhook verification challenge."""
    expected = getattr(settings, "META_WEBHOOK_VERIFY_TOKEN", "merefood_wa_verify")
    if hub_mode == "subscribe" and hub_verify_token == expected:
        return int(hub_challenge) if hub_challenge and hub_challenge.isdigit() else hub_challenge
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Verification failed")


@router.post("/meta/whatsapp")
async def meta_whatsapp_events(
    request: Request,
    redis: Redis = Depends(get_redis),
):
    """Receive Meta message status updates (sent / delivered / read / failed)."""
    raw = await request.body()
    sig = request.headers.get("X-Hub-Signature-256", "")
    if not otp_svc.verify_meta_signature(raw, sig):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Invalid signature")

    try:
        payload: dict[str, Any] = await request.json()
    except Exception:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid JSON")

    await otp_svc.handle_whatsapp_webhook(payload, redis)
    return {"ok": True}


@router.post("/sms")
async def sms_delivery_report(
    request: Request,
    redis: Redis = Depends(get_redis),
):
    """Optional SMS provider delivery reports (MSG91 / Twilio style)."""
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    logger.info("SMS webhook received: %s", str(payload)[:300])
    # Provider-specific mapping can be added here
    return {"ok": True}
