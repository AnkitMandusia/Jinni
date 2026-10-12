"""
Jinni AI session + interpret APIs — Prompt.txt sections D, E, F.

Mobile never talks to Gemini directly and never sees the real search
query fan out before it goes through here. Two gates are enforced
server-side, atomically, regardless of what the client claims:

- Daily quota: 3 *completed* Jinni requests/user/day (budget_service).
- Monthly Gemini budget: Rs.500/month, shared (budget_service).

`/jinni/interpret` always re-runs the deterministic matcher itself
(the client's confidence is only a UX hint) and only ever calls Gemini
when that server-side confidence is below threshold AND the budget
gate is open. Either way, the actual items returned always come from
the live database (search_service), never from the client or Gemini.
"""
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_active_user
from app.modules.users.models import User
from app.modules.jinni.models import JinniSession
from app.modules.jinni import budget_service
from app.modules.jinni.intent_matcher import match_intent, CONFIDENCE_THRESHOLD
from app.modules.jinni.gemini_client import classify as gemini_classify, ESTIMATED_COST_PAISE
from app.modules.jinni.search_service import search_both, MIN_PHRASE_LEN

router = APIRouter(prefix="/jinni", tags=["jinni"])

DAILY_LIMIT = budget_service.DAILY_LIMIT


class WishStatusOut(BaseModel):
    used: int
    limit: int = DAILY_LIMIT
    resets_at: str | None = None
    remaining: int = 0


class SessionStartOut(BaseModel):
    session_id: str
    reserved: bool = True


class SessionBody(BaseModel):
    session_id: str


class SessionCompleteBody(BaseModel):
    session_id: str
    summary: str | None = None


@router.get("/status", response_model=WishStatusOut)
async def jinni_status(user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    used, limit = await budget_service.check_daily_limit(db, user.id)
    return WishStatusOut(used=used, limit=limit, remaining=max(limit - used, 0), resets_at=None)


@router.post("/session/start", response_model=SessionStartOut)
async def session_start(user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    used, limit = await budget_service.check_daily_limit(db, user.id)
    if used >= limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily Jinni wishes exhausted ({limit}/{limit}). Try again tomorrow.",
        )
    token = f"jinni_{uuid4().hex[:16]}"
    db.add(JinniSession(session_token=token, user_id=user.id, status="reserved"))
    await db.flush()
    return SessionStartOut(session_id=token, reserved=True)


@router.post("/session/complete")
async def session_complete(
    body: SessionCompleteBody,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    sess = (
        await db.execute(
            select(JinniSession)
            .where(JinniSession.session_token == body.session_id, JinniSession.user_id == user.id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if not sess:
        raise HTTPException(status_code=404, detail="Session not found")
    if sess.status == "completed":
        used = await budget_service.get_daily_usage(db, user.id)
        return {"ok": True, "idempotent": True, "used": used, "limit": DAILY_LIMIT}

    # Re-check the cap atomically at completion time too — start-time and
    # complete-time can race across concurrent sessions/tabs.
    used, limit = await budget_service.check_daily_limit(db, user.id)
    if used >= limit:
        sess.status = "cancelled"
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Daily Jinni wishes exhausted ({limit}/{limit}). Try again tomorrow.",
        )

    new_used = await budget_service.consume_daily_quota(db, user.id)
    sess.status = "completed"
    return {"ok": True, "used": new_used, "limit": DAILY_LIMIT}


@router.post("/session/cancel")
async def session_cancel(
    body: SessionBody, user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)
):
    sess = (
        await db.execute(
            select(JinniSession).where(
                JinniSession.session_token == body.session_id, JinniSession.user_id == user.id
            )
        )
    ).scalar_one_or_none()
    if sess and sess.status == "reserved":
        sess.status = "cancelled"
    return {"ok": True}


@router.get("/history")
async def jinni_history(user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    rows = (
        await db.execute(
            select(JinniSession)
            .where(JinniSession.user_id == user.id)
            .order_by(JinniSession.created_at.desc())
            .limit(20)
        )
    ).scalars().all()
    return {
        "items": [
            {"session_id": r.session_token, "status": r.status, "used_gemini": bool(r.used_gemini)}
            for r in rows
        ]
    }


class InterpretIn(BaseModel):
    text: str = Field(..., min_length=1, max_length=500)
    restaurant_name: str | None = None
    session_id: str | None = None
    # Hint only — server recomputes confidence independently before
    # deciding whether to spend Gemini budget.
    client_confidence: float | None = None


class InterpretOut(BaseModel):
    intent: str
    items: list[dict]
    message: str
    partial: bool
    empty: bool
    used_gemini: bool
    confidence: float
    quantity: int = 1


FOUND = "Yeh items mil gaye."
PARTIAL = "Kuch mil gaya, kuch nahi."
EMPTY = "Exact match nahi mila. Kuch aur try karo ya type karke bolo."
CLARIFY = "Thoda clearly bolo — kya chahiye?"


@router.post("/interpret", response_model=InterpretOut)
async def jinni_interpret(
    body: InterpretIn, user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)
):
    match = match_intent(body.text)
    used_gemini = False
    # Spoken/typed quantity ("do packet doodh", "3 pizza") applies to every
    # item the wish resolves to — e.g. "do bread aur butter" means 2 of
    # each, not 2 total split across items. Defaults to 1 when unspecified.
    quantity = match.quantity or 1

    if match.intent == "order_status":
        return InterpretOut(
            intent="order_status", items=[], message="Order track ke liye My Orders tab dekho.",
            partial=False, empty=True, used_gemini=False, confidence=match.confidence, quantity=quantity,
        )

    keywords = match.keywords
    intent = match.intent

    if match.confidence < CONFIDENCE_THRESHOLD:
        reserved = await budget_service.try_reserve_budget(db, ESTIMATED_COST_PAISE)
        if reserved:
            suggestion = await gemini_classify(body.text, body.restaurant_name)
            if suggestion is None:
                await budget_service.refund_budget(db, ESTIMATED_COST_PAISE)
            elif suggestion.intent == "unknown" and not suggestion.keywords:
                used_gemini = True
                return InterpretOut(
                    intent="unknown", items=[], message=suggestion.clarification or CLARIFY,
                    partial=False, empty=True, used_gemini=True, confidence=match.confidence, quantity=quantity,
                )
            else:
                used_gemini = True
                intent = suggestion.intent if suggestion.intent != "unknown" else intent
                keywords = suggestion.keywords or keywords
        # If budget is closed or Gemini failed: continue with whatever the
        # deterministic matcher found (possibly empty) rather than failing —
        # local search / a clarification question always stays available.

    # A short/empty keyword list from the local dictionary does NOT mean
    # "give up" — the dictionary is small and will never cover every
    # grocery item or dish name (e.g. "paneer" alone, with nothing else
    # said, used to dead-end here even though it's a perfectly normal
    # thing to search for). search_both always also tries body.text
    # itself as a literal phrase in both modules before truly giving up,
    # so we only clarify immediately when the raw text is too short to
    # search on at all (keywords empty AND the text itself is noise).
    if not keywords and len(body.text.strip()) < MIN_PHRASE_LEN:
        return InterpretOut(
            intent="unknown", items=[], message=CLARIFY, partial=False, empty=True,
            used_gemini=used_gemini, confidence=match.confidence, quantity=quantity,
        )

    if intent not in ("grocery_search", "food_search"):
        intent = "grocery_search"  # neutral default hint; search_both tries both anyway

    intent, items = await search_both(db, intent, keywords, body.text, body.restaurant_name)

    if not items:
        return InterpretOut(
            intent="unknown", items=[], message=CLARIFY, partial=False, empty=True,
            used_gemini=used_gemini, confidence=match.confidence, quantity=quantity,
        )

    source_id = items[0]["restaurant_id"]
    items = [i for i in items if i["restaurant_id"] == source_id]

    available = [i for i in items if i["available"]]
    empty = len(available) == 0
    partial = any(not i["available"] for i in items) and len(available) > 0

    if empty:
        message = EMPTY
    elif partial:
        message = PARTIAL
    elif items[0].get("restaurant_name"):
        message = f"{items[0]['restaurant_name']} se yeh items mile. Qty badlo, phir Add to Cart."
    else:
        message = FOUND

    if body.session_id and used_gemini:
        sess = (
            await db.execute(
                select(JinniSession).where(
                    JinniSession.session_token == body.session_id, JinniSession.user_id == user.id
                )
            )
        ).scalar_one_or_none()
        if sess:
            sess.used_gemini = 1

    return InterpretOut(
        intent=intent, items=items, message=message, partial=partial, empty=empty,
        used_gemini=used_gemini, confidence=match.confidence, quantity=quantity,
    )


@router.get("/budget")
async def jinni_budget(user: User = Depends(get_current_active_user), db: AsyncSession = Depends(get_db)):
    """Debug/ops visibility into the shared monthly Gemini budget."""
    return await budget_service.get_budget_status(db)
