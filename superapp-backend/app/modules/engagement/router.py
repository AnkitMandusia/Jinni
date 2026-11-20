"""Customer wallet, referrals and shopping lists."""
from decimal import Decimal
from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_active_user, require_role
from app.modules.engagement import service
from app.modules.engagement.models import (
    Referral, ShoppingList, ShoppingListItem, WalletTransaction,
)
from app.modules.grocery.models import Product
from app.modules.users.models import User

router = APIRouter(tags=["engagement"])

MAX_LISTS_PER_USER = 20
MAX_ITEMS_PER_LIST = 100


def _customer(user: User = Depends(get_current_active_user)) -> User:
    if user.role != "customer":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Customers only")
    return user


# ── wallet ───────────────────────────────────────────────────────────────────

@router.get("/wallet")
async def wallet(
    limit: int = Query(30, ge=1, le=100),
    user: User = Depends(_customer), db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(WalletTransaction).where(WalletTransaction.user_id == user.id)
        .order_by(WalletTransaction.created_at.desc()).limit(limit)
    )).scalars().all()
    return {
        "balance": float(await service.get_balance(db, user.id)),
        "transactions": [
            {"id": str(t.id), "amount": float(t.amount), "kind": t.kind,
             "order_id": str(t.order_id) if t.order_id else None,
             "created_at": t.created_at.isoformat() if t.created_at else None}
            for t in rows
        ],
    }


class AdminCredit(BaseModel):
    user_id: UUID
    amount: Decimal = Field(..., gt=0, le=Decimal("5000"))
    reason: str = Field(..., min_length=5, max_length=100)


@router.post("/admin/wallet/credit", status_code=201)
async def admin_credit(body: AdminCredit, admin: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    """Goodwill / manual credit (no idempotency key: each call is a deliberate grant)."""
    if not await db.get(User, body.user_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    await service.credit(db, body.user_id, body.amount, "admin_credit")
    await db.commit()
    return {"balance": float(await service.get_balance(db, body.user_id))}


# ── referrals ────────────────────────────────────────────────────────────────

@router.get("/referral")
async def my_referral(user: User = Depends(_customer), db: AsyncSession = Depends(get_db)):
    code = await service.get_or_create_code(db, user.id)
    await db.commit()
    counts = dict((await db.execute(
        select(Referral.status, func.count()).where(Referral.referrer_id == user.id).group_by(Referral.status)
    )).all())
    return {
        "code": code,
        "referrer_reward": float(service.REFERRER_REWARD),
        "referee_reward": float(service.REFEREE_REWARD),
        "pending": counts.get("pending", 0),
        "rewarded": counts.get("rewarded", 0),
        "rule": "Rewards are credited to both of you when your friend's first order is delivered.",
    }


class ApplyCode(BaseModel):
    code: str = Field(..., min_length=4, max_length=12)


@router.post("/referral/apply")
async def apply_referral(body: ApplyCode, user: User = Depends(_customer), db: AsyncSession = Depends(get_db)):
    await service.apply_code(db, user.id, body.code)
    await db.commit()
    return {"message": f"Applied. You'll get ₹{service.REFEREE_REWARD} after your first delivered order."}


# ── shopping lists ───────────────────────────────────────────────────────────

class ListCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)


class ListItemIn(BaseModel):
    product_id: UUID
    quantity: int = Field(1, ge=1, le=99)


def _list_out(lst: ShoppingList):
    return {"id": str(lst.id), "name": lst.name,
            "items": [{"product_id": str(i.product_id), "quantity": i.quantity} for i in lst.items]}


async def _own_list(db: AsyncSession, user: User, list_id: UUID) -> ShoppingList:
    lst = (await db.execute(
        select(ShoppingList).where(ShoppingList.id == list_id, ShoppingList.user_id == user.id)
    )).scalar_one_or_none()
    if not lst:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "List not found")
    return lst


@router.get("/shopping-lists")
async def list_lists(user: User = Depends(_customer), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(ShoppingList).where(ShoppingList.user_id == user.id)
                             .order_by(ShoppingList.created_at.desc()))).scalars().all()
    return [_list_out(l) for l in rows]


@router.post("/shopping-lists", status_code=201)
async def create_list(body: ListCreate, user: User = Depends(_customer), db: AsyncSession = Depends(get_db)):
    n = (await db.execute(select(func.count()).select_from(ShoppingList).where(ShoppingList.user_id == user.id))).scalar()
    if n >= MAX_LISTS_PER_USER:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"You can keep up to {MAX_LISTS_PER_USER} lists.")
    lst = ShoppingList(user_id=user.id, name=body.name.strip())
    db.add(lst)
    await db.commit()
    await db.refresh(lst)
    return _list_out(lst)


@router.delete("/shopping-lists/{list_id}", status_code=204)
async def delete_list(list_id: UUID, user: User = Depends(_customer), db: AsyncSession = Depends(get_db)):
    await db.delete(await _own_list(db, user, list_id))
    await db.commit()


@router.put("/shopping-lists/{list_id}/items")
async def upsert_item(list_id: UUID, body: ListItemIn, user: User = Depends(_customer), db: AsyncSession = Depends(get_db)):
    lst = await _own_list(db, user, list_id)
    if not await db.get(Product, body.product_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Product not found")
    existing = next((i for i in lst.items if i.product_id == body.product_id), None)
    if existing:
        existing.quantity = body.quantity
    else:
        if len(lst.items) >= MAX_ITEMS_PER_LIST:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, f"A list can hold {MAX_ITEMS_PER_LIST} items.")
        db.add(ShoppingListItem(list_id=lst.id, product_id=body.product_id, quantity=body.quantity))
    await db.commit()
    await db.refresh(lst)
    return _list_out(lst)


@router.delete("/shopping-lists/{list_id}/items/{product_id}", status_code=204)
async def remove_item(list_id: UUID, product_id: UUID, user: User = Depends(_customer), db: AsyncSession = Depends(get_db)):
    lst = await _own_list(db, user, list_id)
    for i in lst.items:
        if i.product_id == product_id:
            await db.delete(i)
    await db.commit()


@router.get("/shopping-lists/{list_id}/products")
async def list_with_products(list_id: UUID, user: User = Depends(_customer), db: AsyncSession = Depends(get_db)):
    """Items joined with live product data (price / stock) so the app can add them to the cart."""
    lst = await _own_list(db, user, list_id)
    out = []
    for i in lst.items:
        p = await db.get(Product, i.product_id)
        if not p:
            continue
        out.append({"product_id": str(p.id), "name": p.name, "unit": p.unit, "price": float(p.price),
                    "image_url": p.primary_image_url, "quantity": i.quantity,
                    "in_stock": bool(p.is_active and p.available_stock >= 1)})
    return {"id": str(lst.id), "name": lst.name, "items": out}


# ── campaigns (festival / offer banners) ─────────────────────────────────────
from datetime import datetime  # noqa: E402
from pydantic import model_validator  # noqa: E402
from app.modules.engagement.models import Campaign  # noqa: E402


def _campaign_out(c: Campaign):
    return {"id": str(c.id), "eyebrow": c.eyebrow, "title": c.title, "subtitle": c.subtitle,
            "image_url": c.image_url, "target": c.target, "coupon_code": c.coupon_code,
            "priority": c.priority, "starts_at": c.starts_at.isoformat(), "ends_at": c.ends_at.isoformat(),
            "is_active": c.is_active}


@router.get("/campaigns/active")
async def active_campaigns(db: AsyncSession = Depends(get_db)):
    """Public (shown before login too): banners whose window contains *now*."""
    now = datetime.utcnow()
    rows = (await db.execute(
        select(Campaign).where(Campaign.is_active == True, Campaign.starts_at <= now, Campaign.ends_at > now)  # noqa: E712
        .order_by(Campaign.priority.desc(), Campaign.starts_at.desc()).limit(5)
    )).scalars().all()
    return [_campaign_out(c) for c in rows]


class CampaignIn(BaseModel):
    eyebrow: str = Field("OFFER", max_length=40)
    title: str = Field(..., min_length=1, max_length=80)
    subtitle: Optional[str] = Field(None, max_length=120)
    image_url: Optional[str] = Field(None, max_length=500, pattern=r"^https://")
    target: str = Field("none", pattern="^(food|grocery|cab|salon|jinni|none)$")
    coupon_code: Optional[str] = Field(None, max_length=40)
    priority: int = Field(0, ge=0, le=100)
    starts_at: datetime
    ends_at: datetime

    @model_validator(mode="after")
    def _window(self):
        # Normalise tz-aware input to naive UTC, then require a sane window.
        from datetime import timezone
        for f in ("starts_at", "ends_at"):
            v = getattr(self, f)
            if v.tzinfo is not None:
                setattr(self, f, v.astimezone(timezone.utc).replace(tzinfo=None))
        if self.ends_at <= self.starts_at:
            raise ValueError("ends_at must be after starts_at")
        return self


@router.get("/admin/campaigns")
async def admin_list_campaigns(admin: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(Campaign).order_by(Campaign.starts_at.desc()))).scalars().all()
    return [_campaign_out(c) for c in rows]


@router.post("/admin/campaigns", status_code=201)
async def admin_create_campaign(body: CampaignIn, admin: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    c = Campaign(**body.model_dump())
    if c.coupon_code:
        c.coupon_code = c.coupon_code.strip().upper()
    db.add(c)
    await db.commit()
    await db.refresh(c)
    return _campaign_out(c)


@router.patch("/admin/campaigns/{campaign_id}/active")
async def admin_toggle_campaign(campaign_id: UUID, is_active: bool = Query(...),
                                admin: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    c = await db.get(Campaign, campaign_id)
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Campaign not found")
    c.is_active = is_active
    await db.commit()
    return _campaign_out(c)


@router.delete("/admin/campaigns/{campaign_id}", status_code=204)
async def admin_delete_campaign(campaign_id: UUID, admin: User = Depends(require_role("admin")), db: AsyncSession = Depends(get_db)):
    c = await db.get(Campaign, campaign_id)
    if c:
        await db.delete(c)
        await db.commit()
