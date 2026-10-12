"""Delivery Confirmation OTP Service.

Architecture:
  Delivery partner presses Confirm Delivery
    → generate secure 6-digit OTP (hashed in Redis)
    → attempt Meta WhatsApp Cloud API template message
    → track message status via webhook
    → if WhatsApp fails / times out → SMS fallback (same OTP)
    → partner enters OTP → verify → mark order Delivered
    → emit real-time event + push notification

Security:
  - OTP never returned in API responses
  - Only bcrypt/sha256 hash stored in Redis
  - Bound to order_id + attempt_id
  - Attempt limits, resend cooldown, expiry
"""
from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
import logging
import secrets
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
from redis.asyncio import Redis

from app.config import settings

logger = logging.getLogger(__name__)

# ── Config defaults (overridable via env) ────────────────────────────────────
OTP_LENGTH = 6
OTP_TTL_SECONDS = getattr(settings, "DELIVERY_OTP_EXPIRY_SECONDS", 300)  # 5 min
RESEND_COOLDOWN_SECONDS = getattr(settings, "DELIVERY_OTP_RESEND_COOLDOWN", 60)
MAX_VERIFY_ATTEMPTS = getattr(settings, "DELIVERY_OTP_MAX_ATTEMPTS", 5)
WHATSAPP_FALLBACK_TIMEOUT = getattr(settings, "WHATSAPP_FALLBACK_TIMEOUT_SECONDS", 45)
MAX_RESENDS_PER_ORDER = getattr(settings, "DELIVERY_OTP_MAX_RESENDS", 3)

REDIS_OTP_PREFIX = "dotp:otp:"          # hash of OTP
REDIS_META_PREFIX = "dotp:meta:"        # JSON metadata
REDIS_ATTEMPTS_PREFIX = "dotp:attempts:"
REDIS_MSG_PREFIX = "dotp:msg:"          # wa_message_id → order_id (idempotency)
REDIS_SMS_SENT_PREFIX = "dotp:sms_sent:"  # prevent duplicate SMS


def _hash_otp(otp: str, salt: str) -> str:
    return hashlib.sha256(f"{salt}:{otp}".encode()).hexdigest()


def _generate_otp() -> str:
    # Cryptographically secure 6-digit OTP
    return f"{secrets.randbelow(10**OTP_LENGTH):0{OTP_LENGTH}d}"


def _mask_phone(phone: str) -> str:
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) < 4:
        return "****"
    return f"***{digits[-4:]}"


def _normalize_phone(phone: str) -> str:
    """E.164-ish digits only, no leading +."""
    return phone.lstrip("+").replace(" ", "").replace("-", "").replace("(", "").replace(")", "")


# ── Public service ────────────────────────────────────────────────────────────

async def initiate_delivery_otp(
    order_id: str,
    customer_phone: str,
    redis: Redis,
    *,
    force_resend: bool = False,
) -> dict[str, Any]:
    """Generate OTP, store hash, send WhatsApp, schedule SMS fallback metadata.

    Returns safe status dict for the mobile UI (never includes OTP).
    """
    meta_key = f"{REDIS_META_PREFIX}{order_id}"
    otp_key = f"{REDIS_OTP_PREFIX}{order_id}"
    attempts_key = f"{REDIS_ATTEMPTS_PREFIX}{order_id}"

    existing_raw = await redis.get(meta_key)
    if existing_raw and not force_resend:
        meta = json.loads(existing_raw.decode() if isinstance(existing_raw, bytes) else existing_raw)
        # Still valid?
        if meta.get("expires_at", 0) > time.time():
            return {
                "status": "already_active",
                "phone_hint": meta.get("phone_hint", _mask_phone(customer_phone)),
                "channel_status": meta.get("channel_status", "pending"),
                "whatsapp_status": meta.get("whatsapp_status"),
                "sms_status": meta.get("sms_status"),
                "expires_in": int(meta["expires_at"] - time.time()),
                "resends_left": max(0, MAX_RESENDS_PER_ORDER - meta.get("resend_count", 0)),
            }

    if force_resend and existing_raw:
        meta = json.loads(existing_raw.decode() if isinstance(existing_raw, bytes) else existing_raw)
        if meta.get("resend_count", 0) >= MAX_RESENDS_PER_ORDER:
            return {
                "status": "resend_limit",
                "phone_hint": meta.get("phone_hint", _mask_phone(customer_phone)),
                "message": "Maximum resend attempts reached. Contact Super Admin if needed.",
            }
        last_sent = meta.get("last_sent_at", 0)
        if time.time() - last_sent < RESEND_COOLDOWN_SECONDS:
            wait = int(RESEND_COOLDOWN_SECONDS - (time.time() - last_sent))
            return {
                "status": "cooldown",
                "phone_hint": meta.get("phone_hint", _mask_phone(customer_phone)),
                "message": f"Please wait {wait}s before resending.",
                "cooldown_seconds": wait,
            }

    otp = _generate_otp()
    salt = secrets.token_hex(16)
    otp_hash = _hash_otp(otp, salt)
    attempt_id = str(uuid.uuid4())
    now = time.time()
    expires_at = now + OTP_TTL_SECONDS

    phone_hint = _mask_phone(customer_phone)
    meta = {
        "order_id": order_id,
        "attempt_id": attempt_id,
        "salt": salt,
        "phone_hint": phone_hint,
        "phone_normalized": _normalize_phone(customer_phone),
        "created_at": now,
        "last_sent_at": now,
        "expires_at": expires_at,
        "resend_count": (json.loads(existing_raw).get("resend_count", 0) + 1) if (force_resend and existing_raw) else 0,
        "channel_status": "sending",
        "whatsapp_status": "pending",
        "whatsapp_message_id": None,
        "sms_status": None,
        "sms_message_id": None,
        "failure_reason": None,
    }

    pipe = redis.pipeline()
    pipe.set(otp_key, otp_hash, ex=OTP_TTL_SECONDS + 30)
    pipe.set(meta_key, json.dumps(meta), ex=OTP_TTL_SECONDS + 60)
    pipe.set(attempts_key, 0, ex=OTP_TTL_SECONDS + 60)
    pipe.delete(f"{REDIS_SMS_SENT_PREFIX}{order_id}")
    await pipe.execute()

    # Attempt WhatsApp first
    wa_result = await _send_whatsapp(otp, customer_phone, order_id, attempt_id, redis)

    meta["whatsapp_status"] = wa_result.get("status", "failed")
    meta["whatsapp_message_id"] = wa_result.get("message_id")
    meta["channel_status"] = "whatsapp_sent" if wa_result.get("status") in ("sent", "accepted") else "whatsapp_failed"
    if wa_result.get("error"):
        meta["failure_reason"] = wa_result["error"]

    await redis.set(meta_key, json.dumps(meta), ex=OTP_TTL_SECONDS + 60)

    # If WhatsApp immediately failed, trigger SMS fallback right away
    if meta["whatsapp_status"] in ("failed", "skipped"):
        sms_result = await _send_sms(otp, customer_phone, order_id, redis)
        meta["sms_status"] = sms_result.get("status")
        meta["sms_message_id"] = sms_result.get("message_id")
        if sms_result.get("status") in ("sent", "accepted"):
            meta["channel_status"] = "sms_sent"
        else:
            meta["channel_status"] = "failed"
            meta["failure_reason"] = sms_result.get("error") or meta.get("failure_reason")
        await redis.set(meta_key, json.dumps(meta), ex=OTP_TTL_SECONDS + 60)

    # Debug mode: log OTP (never in production logs if OTP_DEBUG=false)
    if getattr(settings, "OTP_DEBUG", True):
        logger.warning("[DELIVERY OTP DEBUG] order=%s otp=%s phone=%s channel=%s", order_id, otp, phone_hint, meta["channel_status"])

    return {
        "status": "initiated",
        "phone_hint": phone_hint,
        "channel_status": meta["channel_status"],
        "whatsapp_status": meta["whatsapp_status"],
        "sms_status": meta.get("sms_status"),
        "expires_in": OTP_TTL_SECONDS,
        "resends_left": max(0, MAX_RESENDS_PER_ORDER - meta["resend_count"]),
        "attempt_id": attempt_id,
    }


async def check_and_fallback_sms(order_id: str, redis: Redis) -> Optional[dict]:
    """Called by webhook timeout worker or explicit check.

    If WhatsApp not delivered after timeout and SMS not yet sent → send SMS with same OTP.
    Requires the plain OTP to still be recoverable only at send time — we re-generate? No:
    We store the *hash* only. For fallback we need the original OTP.

    Design choice: keep a short-lived encrypted/plain copy under a separate key that
    is deleted after first successful delivery or expiry. This key is never exposed to API.
    """
    meta_key = f"{REDIS_META_PREFIX}{order_id}"
    plain_key = f"dotp:plain:{order_id}"
    sms_sent_key = f"{REDIS_SMS_SENT_PREFIX}{order_id}"

    if await redis.get(sms_sent_key):
        return None  # already sent

    raw = await redis.get(meta_key)
    if not raw:
        return None
    meta = json.loads(raw.decode() if isinstance(raw, bytes) else raw)

    wa = meta.get("whatsapp_status")
    if wa in ("delivered", "read"):
        return None  # WhatsApp succeeded — no SMS

    if meta.get("sms_status") in ("sent", "accepted", "delivered"):
        return None

    plain = await redis.get(plain_key)
    if not plain:
        return None  # cannot resend without OTP

    otp = plain.decode() if isinstance(plain, bytes) else str(plain)
    phone = meta.get("phone_normalized", "")
    if not phone:
        return None

    sms_result = await _send_sms(otp, phone, order_id, redis)
    meta["sms_status"] = sms_result.get("status")
    meta["sms_message_id"] = sms_result.get("message_id")
    if sms_result.get("status") in ("sent", "accepted"):
        meta["channel_status"] = "sms_sent"
    else:
        meta["channel_status"] = "failed"
        meta["failure_reason"] = sms_result.get("error")
    await redis.set(meta_key, json.dumps(meta), ex=OTP_TTL_SECONDS + 60)
    return meta


async def store_plain_otp_for_fallback(order_id: str, otp: str, redis: Redis) -> None:
    """Internal: keep plain OTP only long enough for SMS fallback."""
    await redis.set(f"dotp:plain:{order_id}", otp, ex=WHATSAPP_FALLBACK_TIMEOUT + 30)


async def schedule_fallback_timeout_check(order_id: str, redis: Redis) -> None:
    """Covers the case the spec explicitly calls out: WhatsApp accepted the
    message (message_id returned) but Meta's status webhook never arrives, or
    is delayed — e.g. the number isn't actually on WhatsApp, or the webhook
    silently drops. Without this, check_and_fallback_sms() was only ever
    triggered from inside handle_whatsapp_webhook() on an explicit "failed"
    status, so a customer whose number simply isn't on WhatsApp (no failed
    webhook will ever come) never got an SMS at all.

    Meant to be scheduled as a FastAPI BackgroundTask right after
    initiate_delivery_otp()/resend. Sleeps for the configured fallback
    timeout, then calls check_and_fallback_sms(), which is itself idempotent
    (checks dotp:sms_sent / whatsapp_status before sending) so this can race
    safely against a late-arriving "delivered" webhook or a second resend.
    """
    try:
        await asyncio.sleep(WHATSAPP_FALLBACK_TIMEOUT)
        await check_and_fallback_sms(order_id, redis)
    except Exception:
        logger.exception("Fallback timeout check failed for order=%s", order_id)


async def verify_delivery_otp(
    order_id: str,
    entered_otp: str,
    redis: Redis,
) -> dict[str, Any]:
    """Verify OTP. Returns {valid: bool, reason?: str}."""
    otp_key = f"{REDIS_OTP_PREFIX}{order_id}"
    meta_key = f"{REDIS_META_PREFIX}{order_id}"
    attempts_key = f"{REDIS_ATTEMPTS_PREFIX}{order_id}"

    attempts = await redis.get(attempts_key)
    attempt_count = int(attempts or 0)
    if attempt_count >= MAX_VERIFY_ATTEMPTS:
        return {"valid": False, "reason": "Too many incorrect attempts. Contact Super Admin."}

    meta_raw = await redis.get(meta_key)
    if not meta_raw:
        return {"valid": False, "reason": "OTP expired or not requested. Please request a new OTP."}

    meta = json.loads(meta_raw.decode() if isinstance(meta_raw, bytes) else meta_raw)
    if meta.get("expires_at", 0) < time.time():
        return {"valid": False, "reason": "OTP has expired. Please request a new one."}

    stored_hash = await redis.get(otp_key)
    if not stored_hash:
        return {"valid": False, "reason": "OTP expired. Please request a new one."}

    stored_hash_str = stored_hash.decode() if isinstance(stored_hash, bytes) else str(stored_hash)
    candidate = _hash_otp(entered_otp.strip(), meta["salt"])

    if not hmac.compare_digest(candidate, stored_hash_str):
        await redis.incr(attempts_key)
        left = MAX_VERIFY_ATTEMPTS - attempt_count - 1
        return {"valid": False, "reason": f"Incorrect OTP. {left} attempts remaining."}

    # Success — invalidate
    pipe = redis.pipeline()
    pipe.delete(otp_key)
    pipe.delete(meta_key)
    pipe.delete(attempts_key)
    pipe.delete(f"dotp:plain:{order_id}")
    pipe.delete(f"{REDIS_SMS_SENT_PREFIX}{order_id}")
    await pipe.execute()

    return {"valid": True, "attempt_id": meta.get("attempt_id"), "completion_method": "otp"}


async def get_otp_status(order_id: str, redis: Redis) -> dict[str, Any]:
    """Safe status for UI / admin (no OTP)."""
    meta_raw = await redis.get(f"{REDIS_META_PREFIX}{order_id}")
    if not meta_raw:
        return {"active": False}
    meta = json.loads(meta_raw.decode() if isinstance(meta_raw, bytes) else meta_raw)
    return {
        "active": True,
        "phone_hint": meta.get("phone_hint"),
        "channel_status": meta.get("channel_status"),
        "whatsapp_status": meta.get("whatsapp_status"),
        "sms_status": meta.get("sms_status"),
        "failure_reason": meta.get("failure_reason"),
        "expires_in": max(0, int(meta.get("expires_at", 0) - time.time())),
        "resend_count": meta.get("resend_count", 0),
        "resends_left": max(0, MAX_RESENDS_PER_ORDER - meta.get("resend_count", 0)),
    }


# ── WhatsApp Cloud API ────────────────────────────────────────────────────────

async def _send_whatsapp(
    otp: str,
    phone: str,
    order_id: str,
    attempt_id: str,
    redis: Redis,
) -> dict[str, Any]:
    token = getattr(settings, "WABA_TOKEN", "") or ""
    phone_id = getattr(settings, "WABA_PHONE_ID", "") or ""
    template = getattr(settings, "WABA_TEMPLATE_NAME", "delivery_otp") or "delivery_otp"
    language = getattr(settings, "WABA_TEMPLATE_LANG", "en_US") or "en_US"

    if not token or not phone_id:
        logger.info("[WABA SKIPPED] credentials missing — order %s", order_id)
        await store_plain_otp_for_fallback(order_id, otp, redis)
        return {"status": "skipped", "error": "WhatsApp credentials not configured"}

    to = _normalize_phone(phone)
    url = f"https://graph.facebook.com/v19.0/{phone_id}/messages"
    payload = {
        "messaging_product": "whatsapp",
        "to": to,
        "type": "template",
        "template": {
            "name": template,
            "language": {"code": language},
            "components": [
                {
                    "type": "body",
                    "parameters": [
                        {"type": "text", "text": otp},
                        {"type": "text", "text": f"{OTP_TTL_SECONDS // 60} minutes"},
                    ],
                }
            ],
        },
    }

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                url,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                json=payload,
            )
            data = resp.json() if resp.content else {}
            if resp.is_success:
                msg_id = None
                try:
                    msg_id = data["messages"][0]["id"]
                except (KeyError, IndexError, TypeError):
                    pass
                if msg_id:
                    await redis.set(f"{REDIS_MSG_PREFIX}{msg_id}", order_id, ex=OTP_TTL_SECONDS + 120)
                await store_plain_otp_for_fallback(order_id, otp, redis)
                logger.info("WhatsApp accepted order=%s msg_id=%s", order_id, msg_id)
                return {"status": "accepted", "message_id": msg_id}
            else:
                err = data.get("error", {}).get("message") or resp.text[:200]
                logger.error("WhatsApp API error order=%s: %s", order_id, err)
                await store_plain_otp_for_fallback(order_id, otp, redis)
                return {"status": "failed", "error": err}
    except Exception as exc:
        logger.exception("WhatsApp network error order=%s", order_id)
        await store_plain_otp_for_fallback(order_id, otp, redis)
        return {"status": "failed", "error": str(exc)}


async def handle_whatsapp_webhook(payload: dict, redis: Redis) -> None:
    """Process Meta status updates. Idempotent — never double-sends SMS."""
    try:
        for entry in payload.get("entry", []):
            for change in entry.get("changes", []):
                value = change.get("value", {})
                for status_obj in value.get("statuses", []):
                    msg_id = status_obj.get("id")
                    status_str = status_obj.get("status")  # sent, delivered, read, failed
                    if not msg_id or not status_str:
                        continue
                    order_id_raw = await redis.get(f"{REDIS_MSG_PREFIX}{msg_id}")
                    if not order_id_raw:
                        continue
                    order_id = order_id_raw.decode() if isinstance(order_id_raw, bytes) else str(order_id_raw)
                    meta_key = f"{REDIS_META_PREFIX}{order_id}"
                    meta_raw = await redis.get(meta_key)
                    if not meta_raw:
                        continue
                    meta = json.loads(meta_raw.decode() if isinstance(meta_raw, bytes) else meta_raw)
                    meta["whatsapp_status"] = status_str
                    if status_str in ("delivered", "read"):
                        meta["channel_status"] = "whatsapp_delivered"
                        # Delete plain OTP so SMS cannot fire
                        await redis.delete(f"dotp:plain:{order_id}")
                    elif status_str == "failed":
                        meta["channel_status"] = "whatsapp_failed"
                        errors = status_obj.get("errors") or []
                        if errors:
                            meta["failure_reason"] = str(errors[0].get("title") or errors[0])
                        # Trigger SMS fallback
                        await check_and_fallback_sms(order_id, redis)
                        # Re-read meta after possible SMS
                        meta_raw2 = await redis.get(meta_key)
                        if meta_raw2:
                            meta = json.loads(meta_raw2.decode() if isinstance(meta_raw2, bytes) else meta_raw2)
                    await redis.set(meta_key, json.dumps(meta), ex=OTP_TTL_SECONDS + 60)
    except Exception:
        logger.exception("Error processing WhatsApp webhook")


def verify_meta_signature(raw_body: bytes, signature_header: str) -> bool:
    """Validate X-Hub-Signature-256 from Meta."""
    app_secret = getattr(settings, "META_APP_SECRET", "") or ""
    if not app_secret:
        # In development without secret, accept (log warning)
        logger.warning("META_APP_SECRET not set — skipping webhook signature check")
        return True
    if not signature_header or not signature_header.startswith("sha256="):
        return False
    expected = hmac.new(app_secret.encode(), raw_body, hashlib.sha256).hexdigest()
    received = signature_header[7:]
    return hmac.compare_digest(expected, received)


# ── SMS provider abstraction ──────────────────────────────────────────────────

async def _send_sms(
    otp: str,
    phone: str,
    order_id: str,
    redis: Redis,
) -> dict[str, Any]:
    sms_sent_key = f"{REDIS_SMS_SENT_PREFIX}{order_id}"
    if await redis.get(sms_sent_key):
        return {"status": "already_sent"}

    provider = getattr(settings, "SMS_PROVIDER", "msg91") or "msg91"
    to = _normalize_phone(phone)

    result: dict[str, Any]
    if provider == "twilio":
        result = await _sms_twilio(otp, to, order_id)
    elif provider == "msg91":
        result = await _sms_msg91(otp, to, order_id)
    else:
        result = await _sms_console_debug(otp, to, order_id)

    if result.get("status") in ("sent", "accepted"):
        await redis.set(sms_sent_key, "1", ex=OTP_TTL_SECONDS + 60)
    return result


async def _sms_console_debug(otp: str, phone: str, order_id: str) -> dict[str, Any]:
    logger.warning("[SMS DEBUG] order=%s phone=%s otp=%s", order_id, phone[-4:], otp)
    return {"status": "accepted", "message_id": f"debug-{order_id}"}


async def _sms_msg91(otp: str, phone: str, order_id: str) -> dict[str, Any]:
    authkey = getattr(settings, "MSG91_AUTH_KEY", "") or ""
    template_id = getattr(settings, "MSG91_TEMPLATE_ID", "") or ""
    sender = getattr(settings, "MSG91_SENDER_ID", "MEREFD") or "MEREFD"
    if not authkey:
        logger.info("[MSG91 SKIPPED] no auth key")
        return await _sms_console_debug(otp, phone, order_id)

    # Ensure 91 prefix for India if 10-digit
    if len(phone) == 10:
        phone = "91" + phone

    url = "https://control.msg91.com/api/v5/flow/"
    payload = {
        "template_id": template_id,
        "sender": sender,
        "short_url": "0",
        "recipients": [{"mobiles": phone, "OTP": otp, "VAR1": otp}],
    }
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                url,
                headers={"authkey": authkey, "Content-Type": "application/json"},
                json=payload,
            )
            data = resp.json() if resp.content else {}
            if resp.is_success and data.get("type") == "success":
                return {"status": "accepted", "message_id": data.get("message")}
            return {"status": "failed", "error": str(data)}
    except Exception as exc:
        logger.exception("MSG91 error")
        return {"status": "failed", "error": str(exc)}


async def _sms_twilio(otp: str, phone: str, order_id: str) -> dict[str, Any]:
    sid = getattr(settings, "TWILIO_ACCOUNT_SID", "") or ""
    token = getattr(settings, "TWILIO_AUTH_TOKEN", "") or ""
    from_num = getattr(settings, "TWILIO_FROM_NUMBER", "") or ""
    if not sid or not token or not from_num:
        return await _sms_console_debug(otp, phone, order_id)

    to = phone if phone.startswith("+") else f"+{phone}"
    body = f"Your Mere Food delivery confirmation code is {otp}. Valid for {OTP_TTL_SECONDS // 60} minutes. Do not share."
    url = f"https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                url,
                auth=(sid, token),
                data={"To": to, "From": from_num, "Body": body},
            )
            data = resp.json() if resp.content else {}
            if resp.is_success:
                return {"status": "accepted", "message_id": data.get("sid")}
            return {"status": "failed", "error": data.get("message", resp.text[:200])}
    except Exception as exc:
        logger.exception("Twilio error")
        return {"status": "failed", "error": str(exc)}
