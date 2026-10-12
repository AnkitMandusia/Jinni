"""Super-admin restaurant management: review, verify, edit, activate/deactivate."""
from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel, Field
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_role
from app.modules.food.models import Restaurant
from app.modules.food import schemas
from app.modules.users.models import User, RestaurantProfile

router = APIRouter(prefix="/restaurants", tags=["admin-restaurants"])


class AdminRestaurantResponse(BaseModel):
    id: UUID
    owner_id: UUID
    owner_name: Optional[str] = None
    owner_phone: str
    name: str
    slug: str
    description: Optional[str] = None
    cuisines: list[str] = []
    tags: list[str] = []
    logo_url: Optional[str] = None
    cover_image_url: Optional[str] = None
    gallery: list[str] = []
    address_line1: str
    address_line2: Optional[str] = None
    city: str
    state: str
    pincode: str
    pure_veg: bool
    fssai_license: Optional[str] = None
    gstin: Optional[str] = None
    is_open: bool
    is_accepting_orders: bool
    is_active: bool
    is_verified: bool
    owner_status: str
    created_at: str
    updated_at: str


class AdminRestaurantsResponse(BaseModel):
    restaurants: list[AdminRestaurantResponse]
    total: int
    page: int
    page_size: int


def _response(r: Restaurant, owner: User) -> AdminRestaurantResponse:
    return AdminRestaurantResponse(
        id=r.id, owner_id=r.owner_id, owner_name=owner.name, owner_phone=owner.phone,
        name=r.name, slug=r.slug, description=r.description,
        cuisines=r.cuisines or [], tags=r.tags or [], logo_url=r.logo_url,
        cover_image_url=r.cover_image_url, gallery=r.gallery or [],
        address_line1=r.address_line1, address_line2=r.address_line2,
        city=r.city, state=r.state, pincode=r.pincode, pure_veg=r.pure_veg,
        fssai_license=r.fssai_license, gstin=r.gstin, is_open=r.is_open,
        is_accepting_orders=r.is_accepting_orders, is_active=r.is_active,
        is_verified=r.is_verified, owner_status=owner.status,
        created_at=r.created_at.isoformat(), updated_at=r.updated_at.isoformat(),
    )


@router.get("", response_model=AdminRestaurantsResponse)
async def list_restaurants(
    state: str = Query("all", pattern="^(all|pending|verified|rejected|inactive)$"),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    admin: User = Depends(require_role("admin")),
):
    q = select(Restaurant, User).join(User, User.id == Restaurant.owner_id)
    if state == "pending":
        q = q.where(Restaurant.is_verified == False, User.status != "rejected")
    elif state == "verified":
        q = q.where(User.status == "active", Restaurant.is_verified == True, Restaurant.is_active == True)
    elif state == "rejected":
        q = q.where(User.status == "rejected")
    elif state == "inactive":
        q = q.where((Restaurant.is_active == False) | (User.status == "suspended"))
    if search:
        like = f"%{search.strip()}%"
        q = q.where((Restaurant.name.ilike(like)) | (Restaurant.city.ilike(like)) | (User.phone.ilike(like)))

    total = (await db.execute(select(func.count()).select_from(q.subquery()))).scalar() or 0
    rows = (await db.execute(q.order_by(Restaurant.created_at.desc())
                             .offset((page - 1) * page_size).limit(page_size))).all()
    return AdminRestaurantsResponse(
        restaurants=[_response(r, u) for r, u in rows], total=total, page=page, page_size=page_size
    )


@router.get("/{restaurant_id}", response_model=AdminRestaurantResponse)
async def get_restaurant(restaurant_id: UUID, db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin"))):
    row = (await db.execute(select(Restaurant, User).join(User, User.id == Restaurant.owner_id)
                           .where(Restaurant.id == restaurant_id))).first()
    if not row:
        raise HTTPException(404, "Restaurant not found")
    return _response(*row)


@router.patch("/{restaurant_id}", response_model=AdminRestaurantResponse)
async def update_restaurant(restaurant_id: UUID, body: schemas.RestaurantUpdate,
                            db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin"))):
    r = (await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))).scalar_one_or_none()
    if not r:
        raise HTTPException(404, "Restaurant not found")
    for key, value in body.model_dump(exclude_unset=True).items():
        if key in {"is_verified", "is_active"}:
            continue
        setattr(r, key, value)
    r.updated_at = datetime.utcnow()
    await db.commit()
    owner = (await db.execute(select(User).where(User.id == r.owner_id))).scalar_one()
    return _response(r, owner)


@router.post("/{restaurant_id}/verify", response_model=AdminRestaurantResponse)
async def verify_restaurant(restaurant_id: UUID, db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin"))):
    r = (await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))).scalar_one_or_none()
    if not r: raise HTTPException(404, "Restaurant not found")
    owner = (await db.execute(select(User).where(User.id == r.owner_id))).scalar_one()
    r.is_verified = True
    r.is_active = True
    owner.status = "active"
    owner.updated_at = datetime.utcnow()
    profile = (await db.execute(select(RestaurantProfile).where(RestaurantProfile.user_id == owner.id))).scalar_one_or_none()
    if profile:
        profile.approved_by = admin.id
        profile.approved_at = datetime.utcnow()
    r.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(r)
    return _response(r, owner)


@router.post("/{restaurant_id}/reject", response_model=AdminRestaurantResponse)
async def reject_restaurant(restaurant_id: UUID, db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin"))):
    r = (await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))).scalar_one_or_none()
    if not r: raise HTTPException(404, "Restaurant not found")
    owner = (await db.execute(select(User).where(User.id == r.owner_id))).scalar_one()
    r.is_verified = False
    r.is_active = False
    owner.status = "rejected"
    owner.updated_at = datetime.utcnow()
    r.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(r)
    return _response(r, owner)


@router.post("/{restaurant_id}/activate", response_model=AdminRestaurantResponse)
async def activate_restaurant(restaurant_id: UUID, db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin"))):
    r = (await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))).scalar_one_or_none()
    if not r: raise HTTPException(404, "Restaurant not found")
    owner = (await db.execute(select(User).where(User.id == r.owner_id))).scalar_one()
    if not r.is_verified:
        raise HTTPException(400, "Restaurant must be verified before activation")
    r.is_active = True
    if owner.status == "suspended": owner.status = "active"
    r.updated_at = datetime.utcnow(); owner.updated_at = datetime.utcnow()
    await db.commit(); await db.refresh(r)
    return _response(r, owner)


@router.post("/{restaurant_id}/deactivate", response_model=AdminRestaurantResponse)
async def deactivate_restaurant(restaurant_id: UUID, db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin"))):
    r = (await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))).scalar_one_or_none()
    if not r: raise HTTPException(404, "Restaurant not found")
    owner = (await db.execute(select(User).where(User.id == r.owner_id))).scalar_one()
    r.is_active = False
    r.updated_at = datetime.utcnow()
    await db.commit(); await db.refresh(r)
    return _response(r, owner)


@router.post("/{restaurant_id}/upload-image")
async def upload_restaurant_image(restaurant_id: UUID, file: UploadFile = File(...),
                                  kind: str = Query("logo", pattern="^(logo|cover|gallery)$"),
                                  db: AsyncSession = Depends(get_db), admin: User = Depends(require_role("admin"))):
    r = (await db.execute(select(Restaurant).where(Restaurant.id == restaurant_id))).scalar_one_or_none()
    if not r: raise HTTPException(404, "Restaurant not found")
    from app.modules.grocery.image_service import upload_product_image
    url = await upload_product_image(file, folder=f"food/{kind}")
    if kind == "logo": r.logo_url = url
    elif kind == "cover": r.cover_image_url = url
    else: r.gallery = list(r.gallery or []) + [url]
    r.updated_at = datetime.utcnow()
    await db.commit(); await db.refresh(r)
    return {"image_url": url}
