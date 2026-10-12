"""
Unit tests for Jinni backend logic — Prompt.txt section F.

These cover the parts that don't need a live Postgres: the deterministic
intent matcher (confidence thresholds, transliteration/spelling
tolerance) directly, and the atomic budget/quota helpers against a
throwaway in-memory SQLite database via the app's own Base metadata.

Run with: pytest tests/test_jinni.py -v
(requires `aiosqlite` for the SQLite tests — add to requirements.txt
if not already present, or skip those via `-k "not sqlite"`.)
"""
import uuid

import pytest
import pytest_asyncio

from app.modules.jinni.intent_matcher import match_intent, CONFIDENCE_THRESHOLD


# ── Deterministic intent matcher ────────────────────────────────────────────

def test_exact_keyword_high_confidence():
    m = match_intent("doodh aur bread")
    assert m.intent == "grocery_search"
    assert m.confidence >= CONFIDENCE_THRESHOLD
    assert "milk" in m.keywords and "bread" in m.keywords


def test_food_keyword_detected():
    m = match_intent("ek pizza bhej do")
    assert m.intent == "food_search"
    assert "pizza" in m.keywords
    assert m.confidence >= CONFIDENCE_THRESHOLD
    assert m.quantity == 1


def test_single_fuzzy_spelling_mistake_stays_below_threshold():
    # "berger" (one substitution away from "burger", not itself a listed
    # transliteration) alone, with nothing else confirming it, should not
    # be confident enough to skip Gemini.
    m = match_intent("berger")
    assert m.keywords == ["burger"]  # still recognized via fuzzy match
    assert m.confidence < CONFIDENCE_THRESHOLD


def test_gibberish_is_low_confidence_unknown():
    m = match_intent("asdkj qwlek")
    assert m.intent == "unknown"
    assert m.confidence < CONFIDENCE_THRESHOLD
    assert m.keywords == []


def test_order_status_detected():
    m = match_intent("mera order kahan hai")
    assert m.intent == "order_status"
    assert m.confidence >= CONFIDENCE_THRESHOLD


def test_cart_command_detected():
    m = match_intent("cart se hatao")
    assert m.intent == "cart_command"


def test_paneer_alone_is_recognized():
    # Regression: "paneer" by itself used to be completely unrecognized
    # (not in the dictionary at all) and fall through to a clarification
    # question instead of being searched for. See
    # JINNI_IMPLEMENTATION_NOTES.md "Third pass".
    m = match_intent("paneer")
    assert "paneer" in m.keywords
    assert m.intent != "unknown"


def test_dish_name_with_grocery_sounding_word_still_extracts_all_terms():
    # "paneer butter masala" contains "butter" (a grocery hint) but is a
    # food dish — the matcher itself doesn't need to get the module
    # right here (search_both on the backend tries both), it just needs
    # to not silently drop "paneer"/"masala" from the keyword list.
    m = match_intent("paneer butter masala")
    assert set(m.keywords) >= {"paneer", "butter", "masala"}


def test_empty_text():
    m = match_intent("   ")
    assert m.intent == "unknown"
    assert m.confidence == 0.0


# ── Budget / daily quota (SQLite-backed, no network/Postgres needed) ───────

@pytest_asyncio.fixture
async def sqlite_session():
    aiosqlite = pytest.importorskip("aiosqlite")
    from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker
    from app.database import Base
    from app.modules.jinni import models  # noqa: F401 — register tables on Base

    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    # Create only the Jinni tables, not the full Base.metadata — if other
    # test modules in the same session have imported models with
    # Postgres-only FKs/types (e.g. test_jinni_search.py importing
    # Product/Restaurant), Base.metadata would include those too and
    # create_all would fail trying to resolve their foreign keys.
    jinni_tables = [
        models.JinniDailyUsage.__table__,
        models.JinniMonthlyBudget.__table__,
        models.JinniSession.__table__,
    ]
    async with engine.begin() as conn:
        await conn.run_sync(lambda sync_conn: Base.metadata.create_all(sync_conn, tables=jinni_tables))
    Session = async_sessionmaker(engine, expire_on_commit=False)
    async with Session() as session:
        yield session
    await engine.dispose()


@pytest.mark.asyncio
async def test_daily_quota_caps_at_limit(sqlite_session):
    from app.modules.jinni import budget_service

    user_id = uuid.uuid4()
    for _ in range(budget_service.DAILY_LIMIT):
        await budget_service.consume_daily_quota(sqlite_session, user_id)
    used = await budget_service.get_daily_usage(sqlite_session, user_id)
    assert used == budget_service.DAILY_LIMIT

    # A further completion must not push past the cap.
    await budget_service.consume_daily_quota(sqlite_session, user_id)
    used_after = await budget_service.get_daily_usage(sqlite_session, user_id)
    assert used_after == budget_service.DAILY_LIMIT


@pytest.mark.asyncio
async def test_daily_quota_is_per_user(sqlite_session):
    from app.modules.jinni import budget_service

    a, b = uuid.uuid4(), uuid.uuid4()
    await budget_service.consume_daily_quota(sqlite_session, a)
    used_a = await budget_service.get_daily_usage(sqlite_session, a)
    used_b = await budget_service.get_daily_usage(sqlite_session, b)
    assert used_a == 1
    assert used_b == 0


@pytest.mark.asyncio
async def test_budget_gate_blocks_once_exhausted(sqlite_session, monkeypatch):
    from app.config import settings
    from app.modules.jinni import budget_service

    monkeypatch.setattr(settings, "JINNI_MONTHLY_BUDGET_PAISE", 50)

    first = await budget_service.try_reserve_budget(sqlite_session, 20)
    second = await budget_service.try_reserve_budget(sqlite_session, 20)
    third = await budget_service.try_reserve_budget(sqlite_session, 20)  # would exceed 50
    assert first is True
    assert second is True
    assert third is False

    status_ = await budget_service.get_budget_status(sqlite_session)
    assert status_["spent_paise"] == 40


@pytest.mark.asyncio
async def test_budget_refund_reopens_gate(sqlite_session, monkeypatch):
    from app.config import settings
    from app.modules.jinni import budget_service

    monkeypatch.setattr(settings, "JINNI_MONTHLY_BUDGET_PAISE", 20)

    reserved = await budget_service.try_reserve_budget(sqlite_session, 20)
    assert reserved is True
    blocked = await budget_service.try_reserve_budget(sqlite_session, 20)
    assert blocked is False

    await budget_service.refund_budget(sqlite_session, 20)
    reopened = await budget_service.try_reserve_budget(sqlite_session, 20)
    assert reopened is True
