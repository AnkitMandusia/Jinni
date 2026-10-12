"""Pydantic schemas for the support/report-an-issue flow."""
from typing import Optional, List
from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, Field


class SupportSubcategory(BaseModel):
    id: str
    label: str


class SupportCategory(BaseModel):
    id: str
    label: str
    icon: str
    subcategories: List[SupportSubcategory]


class SupportTicketCreate(BaseModel):
    category: str = Field(..., max_length=60)
    subcategory: str = Field(..., max_length=80)
    reason: str = Field(..., min_length=3, max_length=120)
    description: str = Field(..., min_length=10, max_length=2000)
    order_id: Optional[UUID] = None
    contact_phone: Optional[str] = Field(None, max_length=20)


class SupportTicketResponse(BaseModel):
    id: UUID
    category: str
    subcategory: str
    reason: str
    description: str
    order_id: Optional[UUID] = None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}
