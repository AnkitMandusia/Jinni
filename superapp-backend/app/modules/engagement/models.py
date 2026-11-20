"""Wallet (single currency), referrals and shopping lists.

Design notes (from the Zepto/Zomato research): ONE internal currency — Zomato's
Money + Credits split was flagged as a complexity trap. The ledger is
append-only; `wallets.balance` is a cache that is only ever changed together
with a ledger row, inside one transaction.
"""
from datetime import datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import (
    CheckConstraint, Column, DateTime, ForeignKey, Index, Integer, Numeric, String, UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base


class Wallet(Base):
    __tablename__ = "wallets"
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    balance = Column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    __table_args__ = (CheckConstraint("balance >= 0", name="ck_wallet_balance_non_negative"),)


class WalletTransaction(Base):
    """Immutable ledger row. `amount` is signed (+credit / -debit)."""
    __tablename__ = "wallet_transactions"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Numeric(10, 2), nullable=False)
    balance_after = Column(Numeric(10, 2), nullable=False)
    kind = Column(String(30), nullable=False)  # referral_reward|order_payment|order_refund|admin_credit
    order_id = Column(UUID(as_uuid=True), ForeignKey("orders.id", ondelete="SET NULL"), nullable=True)
    # Idempotency key: the same logical event can never be applied twice
    # (e.g. "refund:<order>" or "referral:<referee>:referrer").
    ref = Column(String(100), nullable=True, unique=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)


class ReferralCode(Base):
    __tablename__ = "referral_codes"
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    code = Column(String(12), unique=True, nullable=False, index=True)


class Referral(Base):
    __tablename__ = "referrals"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    referrer_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    # unique: a user can be referred at most once
    referee_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True)
    status = Column(String(20), nullable=False, default="pending")  # pending|rewarded
    created_at = Column(DateTime, default=datetime.utcnow)
    rewarded_at = Column(DateTime, nullable=True)


class ShoppingList(Base):
    __tablename__ = "shopping_lists"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(80), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    items = relationship("ShoppingListItem", cascade="all, delete-orphan", lazy="selectin")


class ShoppingListItem(Base):
    __tablename__ = "shopping_list_items"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    list_id = Column(UUID(as_uuid=True), ForeignKey("shopping_lists.id", ondelete="CASCADE"), nullable=False, index=True)
    product_id = Column(UUID(as_uuid=True), ForeignKey("products.id", ondelete="CASCADE"), nullable=False)
    quantity = Column(Integer, nullable=False, default=1)
    __table_args__ = (UniqueConstraint("list_id", "product_id", name="uq_list_product"),)
