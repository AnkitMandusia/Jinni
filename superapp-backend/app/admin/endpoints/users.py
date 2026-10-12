"""Admin: user management endpoints (approve, reject, suspend, list)."""
import logging
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_role
from app.modules.users.models import User

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/users", tags=["admin-users"])


# ── Schemas ──────────────────────────────────────────────────────────────────

class AdminUserResponse(BaseModel):
    id: str
    phone: str
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    status: str
    profile_complete: bool
    created_at: str
    fcm_token: Optional[str] = None

    model_config = {"from_attributes": True}


class UsersListResponse(BaseModel):
    users: list[AdminUserResponse]
    total: int
    page: int
    page_size: int


class RejectRequest(BaseModel):
    reason: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=UsersListResponse)
async def list_users(
    status_filter: Optional[str] = Query(None, alias="status"),
    role: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    """List all users with optional status/role filters. Admin only."""
    query = select(User)

    if status_filter:
        query = query.where(User.status == status_filter)
    if role:
        query = query.where(User.role == role)

    # Total count
    count_query = select(func.count()).select_from(query.subquery())
    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    # Paginated results
    query = query.order_by(User.created_at.desc())
    query = query.offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    users = result.scalars().all()

    return UsersListResponse(
        users=[
            AdminUserResponse(
                id=str(u.id),
                phone=u.phone,
                name=u.name,
                email=u.email,
                role=u.role,
                status=u.status,
                profile_complete=u.profile_complete,
                created_at=u.created_at.isoformat() if u.created_at else "",
                fcm_token=u.fcm_token,
            )
            for u in users
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.post("/{user_id}/approve")
async def approve_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    """Approve a pending partner. Sends FCM notification to the partner."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.status == "active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User is already active")

    user.status = "active"
    user.updated_at = datetime.utcnow()

    # Keep the restaurant visibility state in sync with admin approval.
    if user.role == "restaurant":
        from app.modules.food.models import Restaurant
        restaurant_result = await db.execute(select(Restaurant).where(Restaurant.owner_id == user.id))
        restaurant = restaurant_result.scalar_one_or_none()
        if restaurant:
            restaurant.is_verified = True
            restaurant.is_active = True
            restaurant.updated_at = datetime.utcnow()

    # Update role-specific profile approved_by / approved_at
    await _set_approved(user, admin.id, db)
    await db.flush()

    # Send approval notification (non-blocking)
    try:
        from app.modules.notifications.service import notify_partner_approved
        await notify_partner_approved(user.fcm_token, user.role or "", user.name or user.phone)
    except Exception as e:
        logger.warning(f"Approval notification failed (non-fatal): {e}")

    return {"message": f"User {user.phone} approved successfully"}


@router.post("/{user_id}/reject")
async def reject_user(
    user_id: UUID,
    body: RejectRequest,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    """Reject a pending partner with a reason. Sends FCM notification."""
    if not body.reason or not body.reason.strip():
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                            detail="Rejection reason is required")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.status = "rejected"
    user.updated_at = datetime.utcnow()
    if user.role == "restaurant":
        from app.modules.food.models import Restaurant
        restaurant_result = await db.execute(select(Restaurant).where(Restaurant.owner_id == user.id))
        restaurant = restaurant_result.scalar_one_or_none()
        if restaurant:
            restaurant.is_verified = False
            restaurant.is_active = False
            restaurant.updated_at = datetime.utcnow()
    await db.flush()

    # Notify partner
    try:
        from app.modules.notifications.service import notify_partner_rejected
        await notify_partner_rejected(user.fcm_token, user.role or "", body.reason.strip())
    except Exception as e:
        logger.warning(f"Rejection notification failed (non-fatal): {e}")

    return {"message": f"User {user.phone} rejected"}


@router.post("/{user_id}/suspend")
async def suspend_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    """Suspend an active user account."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user.role == "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN,
                            detail="Cannot suspend another admin")

    user.status = "suspended"
    user.updated_at = datetime.utcnow()
    if user.role == "restaurant":
        from app.modules.food.models import Restaurant
        restaurant_result = await db.execute(select(Restaurant).where(Restaurant.owner_id == user.id))
        restaurant = restaurant_result.scalar_one_or_none()
        if restaurant:
            restaurant.is_active = False
            restaurant.updated_at = datetime.utcnow()
    await db.flush()

    return {"message": f"User {user.phone} suspended"}


@router.post("/{user_id}/reactivate")
async def reactivate_user(
    user_id: UUID,
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    """Reactivate a suspended user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()

    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    user.status = "active"
    user.updated_at = datetime.utcnow()
    if user.role == "restaurant":
        from app.modules.food.models import Restaurant
        restaurant_result = await db.execute(select(Restaurant).where(Restaurant.owner_id == user.id))
        restaurant = restaurant_result.scalar_one_or_none()
        if restaurant and restaurant.is_verified:
            restaurant.is_active = True
            restaurant.updated_at = datetime.utcnow()
    await db.flush()

    return {"message": f"User {user.phone} reactivated"}


# ── Helper ────────────────────────────────────────────────────────────────────

async def _set_approved(user: User, admin_id: UUID, db: AsyncSession) -> None:
    """Set approved_by / approved_at on the role-specific profile row.

    Uses explicit async SELECTs — avoids SQLAlchemy lazy-load MissingGreenlet error.
    """
    from app.modules.users.models import StoreProfile, RestaurantProfile, DeliveryAgentProfile
    now = datetime.utcnow()

    if user.role == "store":
        r = await db.execute(select(StoreProfile).where(StoreProfile.user_id == user.id))
        profile = r.scalar_one_or_none()
    elif user.role == "restaurant":
        r = await db.execute(select(RestaurantProfile).where(RestaurantProfile.user_id == user.id))
        profile = r.scalar_one_or_none()
    elif user.role == "delivery":
        r = await db.execute(select(DeliveryAgentProfile).where(DeliveryAgentProfile.user_id == user.id))
        profile = r.scalar_one_or_none()
    else:
        return

    if profile:
        profile.approved_by = admin_id
        profile.approved_at = now
