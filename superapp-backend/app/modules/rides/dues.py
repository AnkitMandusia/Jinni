"""Ride cancellation fees owed by a customer ("dues").

Uber/Rapido-style handling: the fee is not charged on the spot; it is carried and added to the customer's NEXT
ride or order, and is visible in their profile. Each fee row is settled by exactly one later ride/order
(`fee_settled_ref`), and is released again if that ride/order is itself cancelled/failed — so a fee is never lost
and never charged twice.
"""
from decimal import Decimal
from typing import Optional
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.rides.models import Ride, RideStatus


def _open_filter(customer_id: UUID):
    return (
        Ride.customer_id == customer_id,
        Ride.status == RideStatus.CANCELLED,
        Ride.cancellation_fee > 0,
        Ride.fee_waived == False,  # noqa: E712
        Ride.fee_settled_ref.is_(None),
    )


async def outstanding(db: AsyncSession, customer_id: UUID) -> list[Ride]:
    return list((await db.execute(
        select(Ride).where(*_open_filter(customer_id)).order_by(Ride.cancelled_at.asc()))).scalars().all())


async def total_due(db: AsyncSession, customer_id: UUID) -> Decimal:
    return sum((Decimal(r.cancellation_fee) for r in await outstanding(db, customer_id)), Decimal("0.00"))


async def apply_to(db: AsyncSession, customer_id: UUID, ref: str) -> Decimal:
    """Attach all open fees to `ref` ("ride:<id>" / "order:<id>") and return the amount. Caller commits.
    Rows are locked so two simultaneous bookings can't both absorb the same fee."""
    rows = list((await db.execute(
        select(Ride).where(*_open_filter(customer_id)).with_for_update())).scalars().all())
    total = Decimal("0.00")
    for r in rows:
        r.fee_settled_ref = ref
        total += Decimal(r.cancellation_fee)
    return total


async def release(db: AsyncSession, ref: str) -> None:
    """The ride/order that absorbed the fees failed — make them due again."""
    await db.execute(update(Ride).where(Ride.fee_settled_ref == ref).values(fee_settled_ref=None))


def cancel_fee_now(ride: Ride, settings, now=None) -> tuple[Decimal, str]:
    """(fee, reason) the customer would pay if they cancelled right now.

    Free: before a rider accepts, within the grace period after acceptance, or when fee is 0.
    Charged: rider already accepted and grace passed, or rider already arrived (waiting at pickup)."""
    from datetime import datetime
    now = now or datetime.utcnow()
    fee = Decimal(settings.cancel_fee)
    if fee <= 0 or ride.status not in (RideStatus.ACCEPTED, RideStatus.ARRIVED):
        return Decimal("0.00"), ""
    if ride.status == RideStatus.ARRIVED:
        return fee, "Your rider is already at the pickup point."
    waited = (now - ride.accepted_at).total_seconds() if ride.accepted_at else 0
    if waited <= int(settings.cancel_grace_seconds):
        return Decimal("0.00"), ""
    return fee, "Your rider was already on the way."


# Reasons the customer can pick. `rider_fault` reasons waive the fee automatically.
CANCEL_REASONS = [
    {"code": "changed_plan", "label": "Changed my plan", "rider_fault": False},
    {"code": "booked_by_mistake", "label": "Booked by mistake", "rider_fault": False},
    {"code": "found_other_ride", "label": "Found another ride", "rider_fault": False},
    {"code": "rider_too_slow", "label": "Rider is taking too long", "rider_fault": True},
    {"code": "rider_asked_cancel", "label": "Rider asked me to cancel", "rider_fault": True},
    {"code": "rider_wrong_vehicle", "label": "Rider/vehicle doesn't match the app", "rider_fault": True},
    {"code": "other", "label": "Other", "rider_fault": False},
]
REASON_BY_CODE = {r["code"]: r for r in CANCEL_REASONS}
