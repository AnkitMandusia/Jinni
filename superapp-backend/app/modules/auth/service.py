"""
Auth service — OTP via Firebase Phone Auth REST API + JWT with role claims.

OTP flow (backend-proxy):
  1. POST /auth/send-otp  { phone }
       → call Firebase Identity Toolkit: accounts:sendVerificationCode
       → store sessionInfo in Redis (key: otp_session:{phone}, TTL: 10 min)
  2. POST /auth/verify-otp  { phone, otp }
       → retrieve sessionInfo from Redis
       → call Firebase Identity Toolkit: accounts:signInWithPhoneNumber
       → get Firebase UID (localId) as canonical phone identity
       → create / get User row in DB
       → issue JWT (access + refresh)

Firebase Admin SDK (firebase-admin Python lib) is used for:
  - FCM push notifications (see notifications/service.py)
  - Optional: verify_id_token() if mobile uses Firebase SDK directly

To switch to mobile-direct Firebase (more secure):
  - Mobile handles OTP with @react-native-firebase/auth
  - Mobile gets idToken → sends to POST /auth/verify-firebase-token
  - Backend: firebase_admin.auth.verify_id_token(id_token)
"""
import logging
import os
import random
import secrets
import string
from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
from uuid import UUID

import bcrypt as _bcrypt_lib
import httpx
from jose import JWTError, jwt
from redis.asyncio import Redis
from sqlalchemy import select, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.modules.users.models import (
    User, StoreProfile, RestaurantProfile, DeliveryAgentProfile
)
from app.modules.auth.schemas import (
    CompleteProfileRequest, UserResponse, TokenResponse
)

logger = logging.getLogger(__name__)


def _hash_pw(password: str) -> str:
    """Hash a password with bcrypt directly (avoids passlib/bcrypt 4.x compat bug)."""
    return _bcrypt_lib.hashpw(password.encode("utf-8"), _bcrypt_lib.gensalt()).decode("utf-8")


def _verify_pw(plain: str, hashed: str) -> bool:
    """Verify a bcrypt password hash."""
    try:
        return _bcrypt_lib.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False

# ── Redis key helpers ────────────────────────────────────────────────────────

def _otp_key(phone: str) -> str:
    return f"otp:{phone}"

def _otp_session_key(phone: str) -> str:
    return f"otp_session:{phone}"

def _refresh_key(user_id: str) -> str:
    return f"refresh:{user_id}"


# ── OTP: send ────────────────────────────────────────────────────────────────

async def send_otp(phone: str, redis: Redis) -> None:
    """
    Send OTP via Firebase Phone Auth REST API.
    Falls back to debug mode (console log) when OTP_DEBUG=true or FIREBASE_API_KEY is not set.
    """
    otp_code = _generate_otp()

    if settings.OTP_DEBUG or not settings.FIREBASE_API_KEY:
        # ── DEVELOPMENT MODE ──────────────────────────────────────────────────
        # Store OTP directly; skip Firebase SMS.
        await redis.setex(
            _otp_key(phone),
            settings.OTP_EXPIRE_MINUTES * 60,
            otp_code
        )
        logger.warning(
            f"[OTP DEBUG] Phone: {phone}  OTP: {otp_code}  "
            f"(Set OTP_DEBUG=false and FIREBASE_API_KEY to send real SMS)"
        )
        return

    # ── PRODUCTION MODE — Firebase Phone Auth REST API ────────────────────────
    # Requires FIREBASE_API_KEY from Firebase Console → Project Settings → General
    url = (
        "https://identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode"
        f"?key={settings.FIREBASE_API_KEY}"
    )
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(url, json={
            "phoneNumber": phone,
            "recaptchaToken": "noop",   # Backend-initiated — no browser reCAPTCHA
        })

    data = resp.json()
    if resp.status_code != 200:
        error_msg = data.get("error", {}).get("message", "Firebase error")
        logger.error(f"Firebase send-otp error: {error_msg}")
        raise ValueError(f"Failed to send OTP: {error_msg}")

    session_info = data["sessionInfo"]
    await redis.setex(
        _otp_session_key(phone),
        settings.OTP_EXPIRE_MINUTES * 60,
        session_info
    )


# ── OTP: verify ──────────────────────────────────────────────────────────────

async def verify_otp(phone: str, otp: str, redis: Redis) -> str:
    """
    Verify OTP. Returns Firebase UID (or phone as UID in debug mode).
    Raises ValueError on invalid/expired OTP.
    """
    if settings.OTP_DEBUG or not settings.FIREBASE_API_KEY:
        # ── DEVELOPMENT MODE ──────────────────────────────────────────────────
        stored = await redis.get(_otp_key(phone))
        if not stored:
            raise ValueError("OTP expired or not found")
        if stored.decode() != otp:
            raise ValueError("Invalid OTP")
        await redis.delete(_otp_key(phone))
        # Use phone as stable UID in debug mode
        return f"debug_uid_{phone}"

    # ── PRODUCTION MODE — Firebase verify ────────────────────────────────────
    session_info_bytes = await redis.get(_otp_session_key(phone))
    if not session_info_bytes:
        raise ValueError("OTP session expired. Request a new OTP.")

    session_info = session_info_bytes.decode()
    url = (
        "https://identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber"
        f"?key={settings.FIREBASE_API_KEY}"
    )
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.post(url, json={
            "sessionInfo": session_info,
            "code": otp,
        })

    data = resp.json()
    if resp.status_code != 200:
        error_msg = data.get("error", {}).get("message", "Verification failed")
        raise ValueError(f"OTP verification failed: {error_msg}")

    await redis.delete(_otp_session_key(phone))
    return data["localId"]  # Firebase UID


# ── Firebase ID Token verification (alternative mobile-direct flow) ──────────

async def verify_firebase_id_token(id_token: str) -> dict:
    """
    Verify a Firebase ID token issued by the mobile Firebase SDK.
    Used when mobile directly handles OTP with @react-native-firebase/auth.
    Requires FIREBASE_CREDENTIALS_PATH to be set.
    """
    try:
        import firebase_admin
        from firebase_admin import auth as firebase_auth, credentials

        if not firebase_admin._apps:
            cred_path = settings.FIREBASE_CREDENTIALS_PATH
            if os.path.exists(cred_path):
                cred = credentials.Certificate(cred_path)
                firebase_admin.initialize_app(cred)
            else:
                raise ValueError(
                    f"Firebase credentials not found at: {cred_path}\n"
                    "Download from: Firebase Console → Project Settings → "
                    "Service accounts → Generate new private key"
                )

        decoded = firebase_auth.verify_id_token(id_token)
        return {
            "uid": decoded["uid"],
            "phone": decoded.get("phone_number"),
        }
    except ImportError:
        raise RuntimeError("firebase-admin package not installed. Run: pip install firebase-admin")


# ── User creation / retrieval ─────────────────────────────────────────────────

async def get_or_create_user(phone: str, db: AsyncSession) -> Tuple[User, bool]:
    """
    Get existing user or create a new one.
    Returns (user, is_new_user).
    """
    result = await db.execute(select(User).where(User.phone == phone))
    user = result.scalar_one_or_none()

    if user:
        user.last_login = datetime.utcnow()
        await db.flush()
        return user, False

    # New user — starts with no role, pending_approval status
    user = User(
        phone=phone,
        status="pending_approval",
        profile_complete=False,
        is_verified=True,
        last_login=datetime.utcnow(),
    )
    db.add(user)
    await db.flush()
    return user, True


async def complete_profile(
    user: User,
    data: CompleteProfileRequest,
    db: AsyncSession
) -> User:
    """
    Create role-specific profile row and mark user as profile_complete.
    Customers become active immediately; partners go to pending_approval.
    """
    role = data.role
    user.role = role

    if role == "customer":
        name_parts = [p for p in [data.first_name, data.last_name] if p]
        user.name = " ".join(name_parts) if name_parts else user.phone
        user.email = data.email
        user.status = "active"   # Customers are active immediately
        user.profile_complete = True

    elif role == "store":
        if not data.store_name or not data.owner_name:
            raise ValueError("store_name and owner_name are required for store role")
        profile = StoreProfile(
            user_id=user.id,
            owner_name=data.owner_name,
            store_name=data.store_name,
            gstin=data.gstin,
            fssai=data.fssai,
            address=data.address,
            bank_account=data.bank_account,
            bank_ifsc=data.bank_ifsc,
        )
        db.add(profile)
        user.name = data.owner_name
        user.status = "pending_approval"
        user.profile_complete = True

    elif role == "restaurant":
        if not data.restaurant_name or not data.owner_name:
            raise ValueError("restaurant_name and owner_name are required for restaurant role")
        profile = RestaurantProfile(
            user_id=user.id,
            owner_name=data.owner_name,
            restaurant_name=data.restaurant_name,
            gstin=data.gstin,
            fssai=data.fssai,
            cuisine_type=data.cuisine_type,
            address=data.address,
            bank_ifsc=data.bank_ifsc,
        )
        db.add(profile)
        user.name = data.owner_name
        user.status = "pending_approval"
        user.profile_complete = True

    elif role == "delivery":
        if not data.name:
            raise ValueError("name is required for delivery role")
        profile = DeliveryAgentProfile(
            user_id=user.id,
            name=data.name,
            vehicle_type=data.vehicle_type,
            license_no=data.license_no,
            aadhaar=data.aadhaar,
            bank_account=data.bank_account,
            bank_ifsc=data.bank_ifsc,
        )
        db.add(profile)
        user.name = data.name
        user.status = "pending_approval"
        user.profile_complete = True

    else:
        raise ValueError(f"Unsupported role: {role}")

    # Set password hash if provided
    if data.password:
        if len(data.password) < 8:
            raise ValueError("Password must be at least 8 characters")
        user.password_hash = _hash_pw(data.password)

    await db.flush()
    return user


def hash_password(password: str) -> str:
    return _hash_pw(password)


def verify_password(plain: str, hashed: str) -> bool:
    return _verify_pw(plain, hashed)


async def login_with_password(
    identifier: str,
    password: str,
    db: AsyncSession,
) -> User:
    """
    Authenticate with phone-or-email + password.
    Raises ValueError with safe message on failure.
    """
    import re
    digits = re.sub(r"\D", "", identifier)
    if len(digits) == 10:
        identifier_normalized = f"+91{digits}"
    elif len(digits) == 12 and digits.startswith("91"):
        identifier_normalized = f"+{digits}"
    else:
        identifier_normalized = identifier.strip()

    result = await db.execute(
        select(User).where(
            or_(User.phone == identifier_normalized, User.email == identifier_normalized)
        )
    )
    user = result.scalar_one_or_none()

    if not user or not user.password_hash:
        raise ValueError("Invalid credentials")

    if not verify_password(password, user.password_hash):
        raise ValueError("Invalid credentials")

    if user.status == "suspended":
        raise ValueError("Account is suspended. Contact support.")

    user.last_login = datetime.utcnow()
    await db.flush()
    return user


async def get_profile_id(user: User, db: AsyncSession) -> Optional[str]:
    """Return the UUID of the role-specific profile row.

    Uses explicit async SELECTs instead of ORM relationship attributes to
    avoid SQLAlchemy MissingGreenlet errors from lazy-loading in async context.
    """
    if user.role == "store":
        row = await db.execute(
            select(StoreProfile.id).where(StoreProfile.user_id == user.id)
        )
        val = row.scalar_one_or_none()
        return str(val) if val else None

    if user.role == "restaurant":
        row = await db.execute(
            select(RestaurantProfile.id).where(RestaurantProfile.user_id == user.id)
        )
        val = row.scalar_one_or_none()
        return str(val) if val else None

    if user.role == "delivery":
        row = await db.execute(
            select(DeliveryAgentProfile.id).where(DeliveryAgentProfile.user_id == user.id)
        )
        val = row.scalar_one_or_none()
        return str(val) if val else None

    return None


# ── JWT ───────────────────────────────────────────────────────────────────────

def _build_permissions(role: Optional[str], status: str) -> list[str]:
    """Return permission strings for the given role (roadmap spec)."""
    if status != "active":
        return []
    perms: dict[str, list[str]] = {
        "customer":   ["order:read", "order:place", "profile:read", "profile:update"],
        "store":      ["order:read", "order:accept", "order:reject", "product:read",
                       "profile:read", "profile:update"],
        "restaurant": ["order:read", "order:accept", "order:reject", "menu:read",
                       "menu:update", "profile:read", "profile:update"],
        "delivery":   ["order:read", "delivery:accept", "delivery:update",
                       "location:update", "profile:read"],
        "admin":      ["*"],
    }
    return perms.get(role or "", [])


def create_access_token(user: User, profile_id: Optional[str] = None) -> str:
    """
    Create JWT access token with role-based claims (roadmap spec):
    { sub, role, profile_id, status, permissions, iat, exp }
    """
    now = datetime.now(timezone.utc)
    payload = {
        "sub":         str(user.id),
        "role":        user.role,
        "profile_id":  profile_id,
        "status":      user.status,
        "permissions": _build_permissions(user.role, user.status),
        "iat":         now,
        "exp":         now + timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    }
    return jwt.encode(payload, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


def create_refresh_token() -> str:
    return secrets.token_urlsafe(64)


async def store_refresh_token(user_id: str, token: str, redis: Redis) -> None:
    import hashlib
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    ttl = settings.REFRESH_TOKEN_EXPIRE_DAYS * 86400
    # Forward: user_id → token_hash (for validation)
    await redis.setex(_refresh_key(user_id), ttl, token_hash)
    # Reverse: token_hash → user_id (for refresh endpoint lookup by token)
    await redis.setex(f"refresh_lookup:{token_hash}", ttl, user_id)


async def validate_refresh_token(user_id: str, token: str, redis: Redis) -> bool:
    import hashlib
    stored = await redis.get(_refresh_key(user_id))
    if not stored:
        return False
    expected = hashlib.sha256(token.encode()).hexdigest()
    return stored.decode() == expected


async def revoke_refresh_token(user_id: str, redis: Redis) -> None:
    stored = await redis.get(_refresh_key(user_id))
    await redis.delete(_refresh_key(user_id))
    if stored:
        await redis.delete(f"refresh_lookup:{stored.decode()}")


# ── Helpers ───────────────────────────────────────────────────────────────────

def _generate_otp(length: int = 6) -> str:
    return "".join(random.choices(string.digits, k=length))


def build_user_response(user: User, profile_id: Optional[str] = None) -> UserResponse:
    return UserResponse(
        id=str(user.id),
        phone=user.phone,
        name=user.name,
        email=user.email,
        role=user.role,
        status=user.status,
        profile_complete=user.profile_complete,
        profile_id=profile_id,
    )
