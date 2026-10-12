"""Admin: dashboard statistics endpoint."""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_role
from app.modules.users.models import User

router = APIRouter(prefix="/stats", tags=["admin-stats"])


class AdminStatsResponse(BaseModel):
    total_users: int
    pending_approvals: int
    active_partners: int
    suspended_users: int
    customers: int
    stores: int
    restaurants: int
    delivery_agents: int


@router.get("", response_model=AdminStatsResponse)
async def get_stats(
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    """Dashboard statistics — user counts by status and role. Admin only."""

    async def count(where_clause) -> int:
        result = await db.execute(
            select(func.count()).select_from(User).where(where_clause)
        )
        return result.scalar_one() or 0

    total_users      = await count(User.id.isnot(None))
    pending          = await count(User.status == "pending_approval")
    active_partners  = await count(
        (User.status == "active") & (User.role.in_(["store", "restaurant", "delivery"]))
    )
    suspended        = await count(User.status == "suspended")
    customers        = await count(User.role == "customer")
    stores           = await count(User.role == "store")
    restaurants      = await count(User.role == "restaurant")
    delivery_agents  = await count(User.role == "delivery")

    return AdminStatsResponse(
        total_users=total_users,
        pending_approvals=pending,
        active_partners=active_partners,
        suspended_users=suspended,
        customers=customers,
        stores=stores,
        restaurants=restaurants,
        delivery_agents=delivery_agents,
    )
