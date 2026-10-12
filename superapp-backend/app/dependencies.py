"""Dependency injection for authentication, Redis, and role-based access."""
import logging
from typing import Optional, Callable
from uuid import UUID

logger = logging.getLogger(__name__)

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.config import settings
from app.database import get_db
from app.modules.users.models import User

# Security scheme
security = HTTPBearer(auto_error=False)


# ── Redis ─────────────────────────────────────────────────────────────────────

async def get_redis(request: Request) -> Redis:
    """Return the shared Redis client stored on app state."""
    return request.app.state.redis


# ── JWT + User ────────────────────────────────────────────────────────────────

async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> Optional[User]:
    """Decode JWT and return the associated User, or None if no/invalid token."""
    if not credentials:
        logger.warning("AUTH: No Bearer token in request")
        return None

    try:
        payload = jwt.decode(
            credentials.credentials,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        user_id: str = payload.get("sub")
        if user_id is None:
            raise JWTError("Missing sub claim")
        logger.debug(f"AUTH: Token valid — user_id={user_id} role={payload.get('role')} status={payload.get('status')}")
    except JWTError as e:
        logger.warning(f"AUTH: JWT decode failed — {e} (token prefix: {credentials.credentials[:20]}...)")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(select(User).where(User.id == UUID(user_id)))
    user = result.scalar_one_or_none()

    if user is None:
        logger.warning(f"AUTH: User {user_id} not found in DB")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return user


async def get_current_active_user(
    user: Optional[User] = Depends(get_current_user),
) -> User:
    """Require an authenticated user (raises 401 if not logged in)."""
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user


async def get_current_optional_user(
    user: Optional[User] = Depends(get_current_user),
) -> Optional[User]:
    """Return current user or None — for optional-auth endpoints."""
    return user


# ── Role guard ────────────────────────────────────────────────────────────────

def require_role(*roles: str) -> Callable:
    """
    Dependency factory: require the authenticated user to have one of the given roles.

    Usage:
        @router.get("/admin/stats")
        async def stats(admin: User = Depends(require_role("admin"))):
            ...
    """
    async def _check(user: User = Depends(get_current_active_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required role(s): {', '.join(roles)}",
            )
        if user.status != "active":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is not active",
            )
        return user

    return _check
