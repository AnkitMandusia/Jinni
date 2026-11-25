"""Money model (see FINANCE.md).

* FinanceSettings  - singleton row of commission / payout knobs the super admin edits.
* FinanceEntry     - append-only ledger of MANUAL money movements: payouts to restaurants/stores/riders,
                     cash deposits from riders, and +/- adjustments. Nothing here is ever edited or deleted
                     (a mistake is fixed with a reversing adjustment), so the books always reconcile.
Per-order / per-ride amounts are stored on orders / rides (commission_amount, seller_amount, rider_amount)
at the moment the job completes, so later rate changes never rewrite history.
"""
from datetime import datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import Column, DateTime, ForeignKey, Integer, Numeric, String, Text, Index
from sqlalchemy.dialects.postgresql import UUID

from app.database import Base


class FinanceSettings(Base):
    __tablename__ = "finance_settings"

    id = Column(Integer, primary_key=True, default=1)
    food_commission_pct = Column(Numeric(5, 2), nullable=False, default=Decimal("15.00"))     # of food item subtotal
    grocery_commission_pct = Column(Numeric(5, 2), nullable=False, default=Decimal("8.00"))   # of grocery item subtotal
    rider_delivery_share_pct = Column(Numeric(5, 2), nullable=False, default=Decimal("100.00"))  # of the delivery fee
    ride_commission_pct = Column(Numeric(5, 2), nullable=False, default=Decimal("10.00"))     # of the ride fare
    min_payout = Column(Numeric(8, 2), nullable=False, default=Decimal("100.00"))
    payout_cycle_days = Column(Integer, nullable=False, default=7)
    platform_upi_id = Column(String(100), nullable=True)   # where riders deposit COD cash
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class FinanceEntry(Base):
    __tablename__ = "finance_entries"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    party_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    party_role = Column(String(20), nullable=False)          # restaurant | store | delivery
    kind = Column(String(12), nullable=False)                # payout | deposit | adjustment
    amount = Column(Numeric(12, 2), nullable=False)          # always positive; adjustment uses `direction`
    direction = Column(String(8), nullable=False, default="out")  # out = platform pays party, in = party pays platform
    method = Column(String(10), nullable=False, default="upi")    # upi | bank | cash
    reference = Column(String(100), nullable=True)           # UTR / txn id / receipt no.
    note = Column(Text, nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    __table_args__ = (Index("idx_fin_party_time", "party_user_id", "created_at"),)
