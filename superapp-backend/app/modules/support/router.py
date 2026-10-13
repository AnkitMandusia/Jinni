"""Help & Support — report-an-issue endpoints used by the Profile tab.

Mirrors the category > subcategory > reason > description shape used by
Zomato/Blinkit-style "Help" flows: the customer narrows down to a specific
sub-issue, writes a short description, and a ticket is filed for the support
team to follow up on. No live chat/bot here — just a clean, reliable report
path, per the task brief.
"""
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_active_user
from app.modules.users.models import User
from app.modules.orders.models import Order
from app.modules.support.models import SupportTicket
from app.modules.support.schemas import (
    SupportCategory, SupportSubcategory, SupportTicketCreate, SupportTicketResponse,
)

router = APIRouter(prefix="/support", tags=["support"])


# Static taxonomy — kept server-side (not hardcoded per-screen on the client)
# so categories can be tuned without an app release, same pattern Zomato/
# Blinkit use for their "Help" category trees.
CATEGORIES: List[SupportCategory] = [
    SupportCategory(id="order", label="Order issue", icon="receipt-outline", subcategories=[
        SupportSubcategory(id="missing_items", label="Item(s) missing from my order"),
        SupportSubcategory(id="wrong_item", label="Wrong item delivered"),
        SupportSubcategory(id="quality", label="Item quality issue"),
        SupportSubcategory(id="order_not_delivered", label="Order not delivered"),
        SupportSubcategory(id="order_late", label="Order delivered late"),
        SupportSubcategory(id="cancel_order", label="I want to cancel my order"),
    ]),
    SupportCategory(id="payment", label="Payment issue", icon="card-outline", subcategories=[
        SupportSubcategory(id="money_deducted", label="Money deducted but order failed"),
        SupportSubcategory(id="refund_delay", label="Refund not received"),
        SupportSubcategory(id="double_charge", label="Charged twice for one order"),
        SupportSubcategory(id="wrong_amount", label="Charged wrong amount"),
        SupportSubcategory(id="upi_failed", label="UPI / online payment failed"),
    ]),
    SupportCategory(id="delivery", label="Delivery issue", icon="bicycle-outline", subcategories=[
        SupportSubcategory(id="rider_behaviour", label="Delivery partner behaviour"),
        SupportSubcategory(id="rider_not_found", label="Could not locate delivery partner"),
        SupportSubcategory(id="address_issue", label="Delivery address issue"),
        SupportSubcategory(id="safety_concern", label="Safety concern"),
    ]),
    SupportCategory(id="account", label="Account issue", icon="person-outline", subcategories=[
        SupportSubcategory(id="login_issue", label="Unable to log in"),
        SupportSubcategory(id="otp_issue", label="Not receiving OTP"),
        SupportSubcategory(id="profile_update", label="Unable to update profile"),
        SupportSubcategory(id="delete_account", label="Request to delete my account"),
    ]),
    SupportCategory(id="app", label="App issue", icon="phone-portrait-outline", subcategories=[
        SupportSubcategory(id="app_crash", label="App crashes / freezes"),
        SupportSubcategory(id="display_bug", label="Something looks broken"),
        SupportSubcategory(id="slow_loading", label="App is slow to load"),
        SupportSubcategory(id="other_bug", label="Other bug"),
    ]),
    SupportCategory(id="other", label="Something else", icon="help-circle-outline", subcategories=[
        SupportSubcategory(id="feedback", label="Feedback / suggestion"),
        SupportSubcategory(id="partner_enquiry", label="Partner / business enquiry"),
        SupportSubcategory(id="other", label="Other"),
    ]),
]


@router.get("/categories", response_model=List[SupportCategory])
async def list_support_categories():
    """Powers the category > subcategory pickers on the report-an-issue sheet."""
    return CATEGORIES


@router.post("/tickets", response_model=SupportTicketResponse, status_code=status.HTTP_201_CREATED)
async def create_support_ticket(
    body: SupportTicketCreate,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    valid_category_ids = {c.id for c in CATEGORIES}
    if body.category not in valid_category_ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid category")
    category = next(c for c in CATEGORIES if c.id == body.category)
    if body.subcategory not in {s.id for s in category.subcategories}:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid subcategory for the selected category")

    if body.order_id:
        order = (await db.execute(
            select(Order).where(Order.id == body.order_id, Order.customer_id == user.id)
        )).scalar_one_or_none()
        if not order:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Order not found")

    ticket = SupportTicket(
        user_id=user.id,
        category=body.category,
        subcategory=body.subcategory,
        reason=body.reason.strip(),
        description=body.description.strip(),
        order_id=body.order_id,
        contact_phone=body.contact_phone or user.phone,
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)

    # Best-effort admin alert — a filed ticket must never be lost just because
    # the notification channel is down.
    try:
        from app.modules.notifications.service import notify_admin_support_ticket
        await notify_admin_support_ticket(ticket, user)
    except Exception:
        pass

    return ticket


@router.get("/tickets", response_model=List[SupportTicketResponse])
async def list_my_support_tickets(
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.execute(
        select(SupportTicket).where(SupportTicket.user_id == user.id).order_by(SupportTicket.created_at.desc())
    )).scalars().all()
    return rows
