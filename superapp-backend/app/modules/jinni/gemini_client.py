"""
Gemini Flash-Lite fallback — Prompt.txt sections D/E.

Called ONLY when the deterministic matcher's confidence is below
CONFIDENCE_THRESHOLD and the monthly budget gate is open. Its one job
is to turn ambiguous free text into a short list of search keywords +
an intent label — a classification/extraction task, never a catalog
lookup. It never sees and never returns prices, stock, product IDs or
order data; those always come from the real database via
search_service.py after this step.

API key stays on the backend (app.config.settings). Bounded timeout +
retries; any failure degrades to "no suggestion" so the caller can
fall back to deterministic search or a clarification question.
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

GEMINI_TIMEOUT_SECONDS = 6.0
GEMINI_MAX_RETRIES = 2

# Flat per-call cost estimate used for budget accounting (Flash-Lite is
# priced per token; a short classification prompt/response is a few
# hundred tokens, so a conservative flat estimate keeps accounting
# simple and fails safe — i.e. it over-charges slightly rather than
# risking silent overspend). Tune once real token costs are measured.
ESTIMATED_COST_PAISE = 20  # ₹0.20 per fallback call


@dataclass
class GeminiSuggestion:
    intent: str  # 'food_search' | 'grocery_search' | 'order_status' | 'unknown'
    keywords: list[str]
    clarification: str | None = None


_SYSTEM_PROMPT = (
    "You are an intent classifier for an Indian food+grocery app voice assistant "
    "named Jinni. The user's utterance may be Hindi, Hinglish, English, or contain "
    "spelling mistakes or transliteration. Classify the intent and extract short "
    "search keywords (product/dish category words only, in English, lowercase). "
    "NEVER invent a product name, price, store name, or availability — only extract "
    "what the user actually said. If the utterance is unclear, set intent to "
    "'unknown' and write one short Hindi/Hinglish clarification question. "
    "Respond ONLY with compact JSON of the shape: "
    '{"intent": "food_search|grocery_search|order_status|unknown", '
    '"keywords": ["..."], "clarification": "..." or null}. '
    "No prose, no markdown fences."
)


async def classify(text: str, restaurant_name: str | None = None) -> GeminiSuggestion | None:
    api_key = getattr(settings, "GEMINI_API_KEY", "") or ""
    if not api_key:
        logger.info("Jinni: GEMINI_API_KEY not configured, skipping fallback")
        return None

    model = getattr(settings, "GEMINI_MODEL", "gemini-2.5-flash-lite")
    url = (
        f"https://generativelanguage.googleapis.com/v1beta/models/"
        f"{model}:generateContent?key={api_key}"
    )
    user_prompt = text if not restaurant_name else f"{text} (restaurant context: {restaurant_name})"
    payload = {
        "system_instruction": {"parts": [{"text": _SYSTEM_PROMPT}]},
        "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 200,
            "responseMimeType": "application/json",
        },
    }

    last_error: Exception | None = None
    for attempt in range(GEMINI_MAX_RETRIES + 1):
        try:
            async with httpx.AsyncClient(timeout=GEMINI_TIMEOUT_SECONDS) as client:
                resp = await client.post(url, json=payload)
            if resp.status_code != 200:
                last_error = RuntimeError(f"gemini http {resp.status_code}: {resp.text[:200]}")
                continue
            data = resp.json()
            raw_text = (
                data.get("candidates", [{}])[0]
                .get("content", {})
                .get("parts", [{}])[0]
                .get("text", "")
            )
            parsed = json.loads(raw_text)
            intent = parsed.get("intent") or "unknown"
            if intent not in ("food_search", "grocery_search", "order_status", "unknown"):
                intent = "unknown"
            keywords = [str(k).lower().strip() for k in (parsed.get("keywords") or []) if str(k).strip()]
            clarification = parsed.get("clarification") or None
            return GeminiSuggestion(intent=intent, keywords=keywords[:6], clarification=clarification)
        except Exception as e:  # noqa: BLE001 — any failure degrades gracefully
            last_error = e
            continue

    logger.warning("Jinni: Gemini fallback failed after retries: %s", last_error)
    return None
