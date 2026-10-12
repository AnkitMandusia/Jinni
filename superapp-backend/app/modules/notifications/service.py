"""
Firebase Cloud Messaging (FCM) notification service.

Uses firebase-admin Python SDK.
Requires FIREBASE_CREDENTIALS_PATH in .env pointing to the service account JSON.

Firebase Setup:
  1. Go to Firebase Console → https://console.firebase.google.com
  2. Create project (or use existing)
  3. Project Settings → Service accounts → Generate new private key
  4. Save JSON file as: superapp-backend/firebase-credentials.json
  5. Set FIREBASE_CREDENTIALS_PATH=firebase-credentials.json in .env
"""
import logging
import os
from typing import Optional

from app.config import settings

logger = logging.getLogger(__name__)

# ── Firebase Admin SDK initialization ────────────────────────────────────────

_firebase_initialized = False


def _init_firebase() -> bool:
    """Lazy initialize Firebase Admin SDK. Returns True if available."""
    global _firebase_initialized
    if _firebase_initialized:
        return True

    cred_path = settings.FIREBASE_CREDENTIALS_PATH
    if not cred_path or not os.path.exists(cred_path):
        logger.warning(
            f"Firebase credentials not found at '{cred_path}'. "
            "FCM push notifications are disabled. "
            "To enable: download service account JSON from Firebase Console → "
            "Project Settings → Service accounts → Generate new private key"
        )
        return False

    try:
        import firebase_admin
        from firebase_admin import credentials

        if not firebase_admin._apps:
            cred = credentials.Certificate(cred_path)
            firebase_admin.initialize_app(cred)
            logger.info("Firebase Admin SDK initialized successfully")

        _firebase_initialized = True
        return True
    except ImportError:
        logger.error("firebase-admin not installed. Run: pip install firebase-admin==6.3.0")
        return False
    except Exception as e:
        logger.error(f"Firebase init error: {e}")
        return False


# ── Send single notification ──────────────────────────────────────────────────

async def send_push(
    fcm_token: str,
    title: str,
    body: str,
    data: Optional[dict] = None,
    priority: str = "high",
) -> bool:
    """
    Send a push notification to a single device.
    Returns True on success, False if Firebase is not configured.
    """
    if not _init_firebase():
        logger.info(f"[FCM SKIPPED] {title}: {body} → token: {fcm_token[:20]}...")
        return False

    try:
        from firebase_admin import messaging

        message = messaging.Message(
            notification=messaging.Notification(title=title, body=body),
            data={k: str(v) for k, v in (data or {}).items()},
            token=fcm_token,
            android=messaging.AndroidConfig(priority=priority),
            apns=messaging.APNSConfig(
                headers={"apns-priority": "10" if priority == "high" else "5"}
            ),
        )
        response = messaging.send(message)
        logger.info(f"FCM sent: {response}")
        return True
    except Exception as e:
        logger.error(f"FCM send error: {e}")
        return False


async def send_push_multicast(
    fcm_tokens: list[str],
    title: str,
    body: str,
    data: Optional[dict] = None,
) -> int:
    """
    Send push notification to multiple devices (e.g., nearby stores).
    Returns count of successful sends.
    """
    if not fcm_tokens:
        return 0

    if not _init_firebase():
        logger.info(f"[FCM MULTICAST SKIPPED] {title} → {len(fcm_tokens)} tokens")
        return 0

    try:
        from firebase_admin import messaging

        message = messaging.MulticastMessage(
            notification=messaging.Notification(title=title, body=body),
            data={k: str(v) for k, v in (data or {}).items()},
            tokens=fcm_tokens[:500],  # FCM limit per multicast
            android=messaging.AndroidConfig(priority="high"),
        )
        response = messaging.send_each_for_multicast(message)
        success_count = response.success_count
        if response.failure_count > 0:
            logger.warning(f"FCM multicast: {response.failure_count} failures")
        return success_count
    except Exception as e:
        logger.error(f"FCM multicast error: {e}")
        return 0


# ── Typed notification helpers (roadmap events) ───────────────────────────────

async def notify_admin_new_partner(user: object) -> None:
    """Notify all admin users when a new partner registers (requires admin FCM tokens)."""
    from sqlalchemy import select
    from sqlalchemy.ext.asyncio import AsyncSession
    from app.modules.users.models import User

    # This is called from auth router — no DB session available here.
    # For production: use Celery task to query admin tokens and send.
    logger.info(
        f"[NOTIFY] New partner registered: {getattr(user, 'phone', '?')} "
        f"role={getattr(user, 'role', '?')} — "
        "Implement Celery task to push to admin FCM tokens"
    )


async def notify_admin_support_ticket(ticket: object, user: object) -> None:
    """Notify admins a customer filed a support ticket (Profile > Help & Support > Report)."""
    logger.info(
        f"[NOTIFY] New support ticket {getattr(ticket, 'id', '?')} "
        f"category={getattr(ticket, 'category', '?')}/{getattr(ticket, 'subcategory', '?')} "
        f"from user={getattr(user, 'phone', '?')} — "
        "Implement Celery task to push to admin FCM tokens / support dashboard"
    )


async def notify_partner_approved(fcm_token: Optional[str], role: str, name: str) -> None:
    """Notify a partner that their account has been approved."""
    if not fcm_token:
        return
    await send_push(
        fcm_token=fcm_token,
        title="Account Approved! 🎉",
        body=f"Congratulations {name}! Your {role} account is now active.",
        data={"type": "partner_approved", "role": role},
    )


async def notify_partner_rejected(fcm_token: Optional[str], role: str, reason: str) -> None:
    """Notify a partner that their account has been rejected."""
    if not fcm_token:
        return
    await send_push(
        fcm_token=fcm_token,
        title="Application Update",
        body=f"Your application could not be approved. Reason: {reason}",
        data={"type": "partner_rejected", "reason": reason},
    )


async def notify_order_incoming(store_tokens: list[str], order_id: str) -> None:
    """Broadcast incoming order to nearby stores (race-to-accept model)."""
    await send_push_multicast(
        fcm_tokens=store_tokens,
        title="New Order! ⚡",
        body="A new order is waiting — accept within 45 seconds",
        data={
            "type": "order_incoming",
            "order_id": order_id,
            "timeout_seconds": "45",
        },
    )


async def notify_order_status(fcm_token: str, order_id: str, status: str, message: str) -> None:
    """Notify customer/delivery about order status change."""
    await send_push(
        fcm_token=fcm_token,
        title=f"Order Update",
        body=message,
        data={"type": "order_status", "order_id": order_id, "status": status},
    )
