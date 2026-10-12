"""DEPRECATED — DO NOT WIRE THIS FILE INTO ANY ROUTER.

This is an earlier, unused implementation of WhatsApp delivery OTP (not
imported anywhere in the codebase — verified). It predates and duplicates
app.modules.delivery_otp, which is the single source of truth for OTP
generation, hashing, SMS fallback, webhook handling and verification.

Kept only for reference. Importing/calling send_delivery_otp or
verify_delivery_otp from here would recreate a second, parallel, inconsistent
OTP store and reintroduce the exact "disconnected system" problem this
codebase was audited to fix. If you need WhatsApp OTP sending, use
app.modules.delivery_otp.service._send_whatsapp instead.
"""
import random
import logging
from typing import Optional

import httpx
from redis.asyncio import Redis

from app.config import settings

logger = logging.getLogger(__name__)

_REDIS_PREFIX = "delivery_otp"
_OTP_TTL = 300  # seconds (5 minutes)
_WABA_URL = "https://graph.facebook.com/v19.0/{phone_id}/messages"


# ── OTP helpers ──────────────────────────────────────────────────────────────

def _redis_key(order_id: str) -> str:
    return f"{_REDIS_PREFIX}:{order_id}"


def _generate_otp() -> str:
    return f"{random.randint(0, 999999):06d}"


# ── Public API ────────────────────────────────────────────────────────────────

async def send_delivery_otp(
    order_id: str,
    customer_phone: str,
    redis: Redis,
) -> str:
    """Generate a 6-digit OTP, persist it in Redis, and send via WhatsApp.

    Returns the OTP string (useful for tests and the debug log).
    Silently skips the WhatsApp call if WABA credentials are not configured.
    """
    otp = _generate_otp()
    await redis.set(_redis_key(order_id), otp, ex=_OTP_TTL)

    if not settings.WABA_TOKEN or not settings.WABA_PHONE_ID:
        logger.info(
            "[WHATSAPP SKIPPED] OTP %s for order %s → phone %s...%s",
            otp, order_id, customer_phone[:3], customer_phone[-2:],
        )
        return otp

    phone = customer_phone.lstrip("+").replace(" ", "").replace("-", "")

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                _WABA_URL.format(phone_id=settings.WABA_PHONE_ID),
                headers={
                    "Authorization": f"Bearer {settings.WABA_TOKEN}",
                    "Content-Type": "application/json",
                },
                json={
                    "messaging_product": "whatsapp",
                    "to": phone,
                    "type": "template",
                    "template": {
                        "name": "delivery_otp",
                        "language": {"code": "en_US"},
                        "components": [
                            {
                                "type": "body",
                                "parameters": [
                                    {"type": "text", "text": otp},
                                    {"type": "text", "text": "5 minutes"},
                                ],
                            }
                        ],
                    },
                },
            )
            resp.raise_for_status()
            logger.info("WhatsApp OTP sent for order %s", order_id)
    except httpx.HTTPStatusError as exc:
        logger.error(
            "WhatsApp API HTTP error for order %s: %s — %s",
            order_id, exc.response.status_code, exc.response.text,
        )
    except httpx.RequestError as exc:
        logger.error("WhatsApp API network error for order %s: %s", order_id, exc)

    return otp


async def verify_delivery_otp(
    order_id: str,
    entered_otp: str,
    redis: Redis,
) -> bool:
    """Check the Redis-stored OTP.  Deletes it on a successful match.

    Returns True if the OTP matches and has not expired; False otherwise.
    """
    key = _redis_key(order_id)
    stored = await redis.get(key)
    if not stored:
        return False

    stored_str = stored.decode() if isinstance(stored, bytes) else str(stored)
    if stored_str == entered_otp.strip():
        await redis.delete(key)
        return True
    return False
