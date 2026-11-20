"""Wallet / referral / scheduling rules (mocked AsyncSession, as in the other tests)."""
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from fastapi import HTTPException

from app.modules.engagement import service
from app.modules.engagement.models import Referral
from app.modules.orders.models import Order

NOW = datetime(2026, 1, 1, 12, 0, 0)


def test_schedule_none_is_asap():
    assert service.normalize_schedule(None, NOW) is None


def test_schedule_bounds():
    ok = NOW + timedelta(hours=2)
    assert service.normalize_schedule(ok, NOW) == ok
    for bad in (NOW + timedelta(minutes=10), NOW + timedelta(hours=49), NOW - timedelta(hours=1)):
        with pytest.raises(HTTPException) as e:
            service.normalize_schedule(bad, NOW)
        assert e.value.status_code == 400


def test_schedule_converts_aware_to_naive_utc():
    ist = timezone(timedelta(hours=5, minutes=30))
    v = datetime(2026, 1, 1, 19, 30, tzinfo=ist)  # == 14:00 UTC
    assert service.normalize_schedule(v, NOW) == datetime(2026, 1, 1, 14, 0)


def test_generated_codes_are_unambiguous():
    for _ in range(50):
        c = service.generate_code()
        assert c.startswith("JIN") and len(c) == 9
        assert not set(c[3:]) & set("01OI")


async def test_debit_rejects_when_conditional_update_matches_no_row():
    db = MagicMock()
    db.execute = AsyncMock(return_value=MagicMock(rowcount=0))
    with pytest.raises(HTTPException) as e:
        await service.debit(db, uuid4(), Decimal("100"), "order_payment")
    assert e.value.status_code == 400
    db.add.assert_not_called()  # no ledger row for a failed debit


async def test_credit_is_idempotent_on_ref():
    db = MagicMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar=MagicMock(return_value=1)))
    assert await service.credit(db, uuid4(), Decimal("50"), "referral_reward", ref="x") is False
    db.add.assert_not_called()


async def test_credit_rejects_non_positive():
    with pytest.raises(ValueError):
        await service.credit(MagicMock(), uuid4(), Decimal("0"), "admin_credit")


async def test_refund_only_for_paid_wallet_orders():
    o = Order(id=uuid4(), customer_id=uuid4(), payment_method="cod", payment_status="paid", total_amount=Decimal("10"))
    assert await service.refund_wallet_order(MagicMock(), o) is False
    o2 = Order(id=uuid4(), customer_id=uuid4(), payment_method="wallet", payment_status="pending", total_amount=Decimal("10"))
    assert await service.refund_wallet_order(MagicMock(), o2) is False


async def test_apply_code_blocks_self_referral():
    uid = uuid4()
    db = MagicMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=uid)))
    with pytest.raises(HTTPException) as e:
        await service.apply_code(db, uid, "JINABCDEF")
    assert "own" in e.value.detail


async def test_delivery_hook_no_referral_is_noop():
    db = MagicMock()
    db.execute = AsyncMock(return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)))
    db.add = MagicMock()
    await service.on_order_delivered(db, Order(id=uuid4(), customer_id=uuid4()))
    db.add.assert_not_called()


async def test_delivery_hook_rewards_both_once_and_marks_rewarded(monkeypatch):
    referrer, referee = uuid4(), uuid4()
    ref = Referral(id=uuid4(), referrer_id=referrer, referee_id=referee, status="pending")
    db = MagicMock()
    db.execute = AsyncMock(side_effect=[
        MagicMock(scalar_one_or_none=MagicMock(return_value=ref)),
        MagicMock(scalar=MagicMock(return_value=0)),
    ])
    credits = []
    async def fake_credit(db_, uid, amt, kind, **kw):
        credits.append((uid, amt, kw["ref"]))
        return True
    monkeypatch.setattr(service, "credit", fake_credit)
    await service.on_order_delivered(db, Order(id=uuid4(), customer_id=referee))
    assert {c[0] for c in credits} == {referrer, referee}
    assert ref.status == "rewarded" and ref.rewarded_at is not None
    assert len({c[2] for c in credits}) == 2  # distinct idempotency refs
