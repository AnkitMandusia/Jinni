"""User saved addresses — rider uses these on delivery."""
from datetime import datetime
from typing import List, Optional
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import Column, String, Boolean, DateTime, Float, ForeignKey, select, update
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import Base, get_db
from app.dependencies import get_current_active_user
from app.modules.users.models import User

router = APIRouter(prefix="/users/addresses", tags=["addresses"])


class UserAddress(Base):
    __tablename__ = "user_addresses"
    id = Column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(PGUUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    label = Column(String(40), nullable=False, default="Home")
    line1 = Column(String(255), nullable=False)
    line2 = Column(String(255), nullable=True)
    city = Column(String(100), nullable=False)
    state = Column(String(100), nullable=False)
    pincode = Column(String(10), nullable=False)
    landmark = Column(String(255), nullable=True)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    is_default = Column(Boolean, default=False, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class AddressCreate(BaseModel):
    label: str = Field(default="Home", max_length=40)
    line1: str = Field(..., min_length=3, max_length=255)
    line2: Optional[str] = None
    city: str
    state: str
    pincode: str = Field(..., min_length=6, max_length=6)
    landmark: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_default: bool = False


class AddressResponse(BaseModel):
    id: UUID
    label: str
    line1: str
    line2: Optional[str] = None
    city: str
    state: str
    pincode: str
    landmark: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_default: bool

    class Config:
        from_attributes = True


@router.get("", response_model=List[AddressResponse])
async def list_addresses(user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(UserAddress).where(UserAddress.user_id == user.id).order_by(UserAddress.is_default.desc())
    )).scalars().all()
    return rows


@router.post("", response_model=AddressResponse, status_code=201)
async def create_address(body: AddressCreate, user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    if body.is_default:
        await db.execute(
            update(UserAddress).where(UserAddress.user_id == user.id).values(is_default=False)
        )
    row = UserAddress(id=uuid4(), user_id=user.id, **body.model_dump())
    db.add(row)
    await db.commit()
    await db.refresh(row)
    return row


class AddressUpdate(BaseModel):
    label: Optional[str] = Field(None, max_length=40)
    line1: Optional[str] = Field(None, min_length=3, max_length=255)
    line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = Field(None, min_length=6, max_length=6)
    landmark: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    is_default: Optional[bool] = None


@router.patch("/{address_id}", response_model=AddressResponse)
async def update_address(
    address_id: UUID,
    body: AddressUpdate,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    row = (await db.execute(
        select(UserAddress).where(UserAddress.id == address_id, UserAddress.user_id == user.id)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Address not found")

    changes = body.model_dump(exclude_unset=True)
    if changes.get("is_default"):
        await db.execute(
            update(UserAddress).where(UserAddress.user_id == user.id).values(is_default=False)
        )
    for field, value in changes.items():
        setattr(row, field, value)
    await db.commit()
    await db.refresh(row)
    return row


@router.delete("/{address_id}", status_code=204)
async def delete_address(address_id: UUID, user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    row = (await db.execute(
        select(UserAddress).where(UserAddress.id == address_id, UserAddress.user_id == user.id)
    )).scalar_one_or_none()
    if not row:
        raise HTTPException(404, "Address not found")
    await db.delete(row)
    await db.commit()
