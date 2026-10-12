"""Auth endpoints."""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from redis.asyncio import Redis

from app.database import get_db
from app.dependencies import get_redis, get_current_active_user
from app.modules.users.models import User
from app.modules.auth import service as auth_svc
from app.modules.auth.schemas import (
    SendOTPRequest, SendOTPResponse,
    VerifyOTPRequest, TokenResponse,
    CompleteProfileRequest, LoginRequest, RefreshTokenRequest, RefreshResponse,
    UpdateFCMTokenRequest, UserResponse, UpdateMeRequest,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
async def login_with_password(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """Login with phone-or-email + password. Returns tokens same as verify-otp."""
    try:
        user = await auth_svc.login_with_password(body.identifier, body.password, db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))

    profile_id = await auth_svc.get_profile_id(user, db)
    access_token = auth_svc.create_access_token(user, profile_id)
    refresh_token = auth_svc.create_refresh_token()
    await auth_svc.store_refresh_token(str(user.id), refresh_token, redis)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=auth_svc.build_user_response(user, profile_id),
        is_new_user=False,
    )


@router.post("/firebase-login", response_model=TokenResponse)
async def firebase_login(
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """
    Verify a Firebase ID token issued by the mobile Firebase SDK (Phone Auth).
    Extracts the phone number, gets/creates the user, and issues our own JWT.
    Body: { "id_token": "<firebase_id_token>" }
    """
    body = await request.json()
    id_token = body.get("id_token", "").strip()
    if not id_token:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="id_token is required")
    try:
        firebase_data = await auth_svc.verify_firebase_id_token(id_token)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(e))

    phone = firebase_data.get("phone")
    if not phone:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                            detail="Firebase token does not contain a phone number")

    user, is_new = await auth_svc.get_or_create_user(phone, db)
    profile_id = await auth_svc.get_profile_id(user, db)
    access_token = auth_svc.create_access_token(user, profile_id)
    refresh_token = auth_svc.create_refresh_token()
    await auth_svc.store_refresh_token(str(user.id), refresh_token, redis)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=auth_svc.build_user_response(user, profile_id),
        is_new_user=is_new,
    )


@router.post("/send-otp", response_model=SendOTPResponse)
async def send_otp(
    body: SendOTPRequest,
    redis: Redis = Depends(get_redis),
):
    """Send OTP to phone number via Firebase Phone Auth (or console in debug mode)."""
    try:
        await auth_svc.send_otp(body.phone, redis)
        return SendOTPResponse(success=True, message="OTP sent successfully")
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"send_otp error: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail="Failed to send OTP")


@router.post("/verify-otp", response_model=TokenResponse)
async def verify_otp(
    body: VerifyOTPRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """Verify OTP. Returns JWT tokens and user info. is_new_user=True routes to role selection."""
    try:
        await auth_svc.verify_otp(body.phone, body.otp, redis)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    user, is_new = await auth_svc.get_or_create_user(body.phone, db)
    profile_id = await auth_svc.get_profile_id(user, db)

    access_token = auth_svc.create_access_token(user, profile_id)
    refresh_token = auth_svc.create_refresh_token()
    await auth_svc.store_refresh_token(str(user.id), refresh_token, redis)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=auth_svc.build_user_response(user, profile_id),
        is_new_user=is_new,
    )


@router.post("/complete-profile", response_model=TokenResponse)
async def complete_profile(
    body: CompleteProfileRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
    current_user: User = Depends(get_current_active_user),
):
    """Complete role-specific profile after OTP verification."""
    if current_user.profile_complete:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Profile already completed"
        )
    try:
        user = await auth_svc.complete_profile(current_user, body, db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))

    profile_id = await auth_svc.get_profile_id(user, db)

    # Issue new tokens with updated role/status claims
    access_token = auth_svc.create_access_token(user, profile_id)
    refresh_token = auth_svc.create_refresh_token()
    await auth_svc.store_refresh_token(str(user.id), refresh_token, redis)

    # Notify admin about new partner registration (non-blocking)
    if user.role in ("store", "restaurant", "delivery"):
        try:
            from app.modules.notifications.service import notify_admin_new_partner
            await notify_admin_new_partner(user)
        except Exception as e:
            logger.warning(f"Admin notification failed (non-fatal): {e}")

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        user=auth_svc.build_user_response(user, profile_id),
        is_new_user=False,
    )


@router.get("/me", response_model=UserResponse)
async def get_me(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Get current authenticated user's profile."""
    profile_id = await auth_svc.get_profile_id(current_user, db)
    return auth_svc.build_user_response(current_user, profile_id)


@router.patch("/me", response_model=UserResponse)
async def update_me(
    body: UpdateMeRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update the logged-in user's own name/email — used by the Profile > Edit Profile screen."""
    from sqlalchemy import select as _select

    changes = body.model_dump(exclude_unset=True, exclude_none=True)
    if "email" in changes:
        existing = (await db.execute(
            _select(User).where(User.email == changes["email"], User.id != current_user.id)
        )).scalar_one_or_none()
        if existing:
            raise HTTPException(status.HTTP_409_CONFLICT, "This email is already in use")
    for field, value in changes.items():
        setattr(current_user, field, value)
    await db.commit()
    await db.refresh(current_user)

    profile_id = await auth_svc.get_profile_id(current_user, db)
    return auth_svc.build_user_response(current_user, profile_id)


@router.post("/refresh", response_model=RefreshResponse)
async def refresh_token(
    body: RefreshTokenRequest,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis),
):
    """Exchange a valid refresh token for a new access token."""
    from jose import jwt as jose_jwt, JWTError
    from app.config import settings
    from sqlalchemy import select
    from uuid import UUID

    # We need user_id to look up the refresh token in Redis.
    # Decode without expiry check to get sub (access tokens expire, refresh don't).
    # The refresh token itself is validated against Redis.
    # Since we store user_id separately, the client must pass it OR we embed it.
    # Simple approach: client passes refresh_token, we scan Redis — but that's slow.
    # Better: embed user_id in refresh token as a simple JWT with very long expiry.
    # For now: use a lookup table approach — store refresh_token_hash → user_id in Redis.

    from app.config import settings
    import hashlib
    token_hash = hashlib.sha256(body.refresh_token.encode()).hexdigest()
    # Look up which user owns this refresh token
    user_id_bytes = await redis.get(f"refresh_lookup:{token_hash}")
    if not user_id_bytes:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Refresh token invalid or expired")

    user_id = user_id_bytes.decode()
    valid = await auth_svc.validate_refresh_token(user_id, body.refresh_token, redis)
    if not valid:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Refresh token invalid or expired")

    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")

    profile_id = await auth_svc.get_profile_id(user, db)
    access_token = auth_svc.create_access_token(user, profile_id)
    # Rotate refresh token
    new_refresh = auth_svc.create_refresh_token()
    await auth_svc.store_refresh_token(str(user.id), new_refresh, redis)
    return RefreshResponse(
        access_token=access_token,
        refresh_token=new_refresh,  # Return the new refresh token
        token_type="bearer"
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    redis: Redis = Depends(get_redis),
    current_user: User = Depends(get_current_active_user),
):
    """Revoke refresh token (blacklist). Mobile should also clear local storage."""
    await auth_svc.revoke_refresh_token(str(current_user.id), redis)


@router.get("/status")
async def get_status(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """
    Lightweight status check used by PendingApprovalScreen polling.
    Returns current account status without a full profile fetch.
    """
    return {
        "status": current_user.status,
        "role": current_user.role,
        "profile_complete": current_user.profile_complete,
    }


@router.patch("/fcm-token", status_code=status.HTTP_204_NO_CONTENT)
async def update_fcm_token(
    body: UpdateFCMTokenRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_active_user),
):
    """Update Firebase Cloud Messaging token for push notifications."""
    current_user.fcm_token = body.fcm_token
    await db.flush()
