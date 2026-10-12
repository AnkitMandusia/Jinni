"""
Deterministic Hindi/Hinglish/English intent matcher — Prompt.txt section C/D.

This is the server-side mirror of
`superapp-mobile/src/modules/jinni/services/intentFinder.ts`. It is the
*authoritative* confidence check: the client's confidence is a hint for
UX (e.g. don't flash a "thinking harder" state), but the server always
recomputes confidence itself before deciding whether to spend Gemini
budget, so a tampered or stale client value can never force a paid
call.

It does not know about real catalog data — that lives in the database
and is queried by search_service.py. This module only extracts intent
keywords and a confidence score from free text.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field

CONFIDENCE_THRESHOLD = 0.70

# Small, extensible transliteration / common-misspelling table. Keys are
# normalized (lowercase) variants; values are the canonical keyword used
# for DB search. This list only needs to be "good enough" to route
# confidently — the actual product match still happens against the
# real database in search_service.py.
_TRANSLITERATIONS: dict[str, str] = {
    "doodh": "milk", "dood": "milk", "milk": "milk",
    "pizaa": "pizza", "piza": "pizza", "pizza": "pizza",
    "burgar": "burger", "burger": "burger",
    "biriyani": "biryani", "briyani": "biryani", "biryani": "biryani",
    "chai": "tea", "chay": "tea", "tea": "tea",
    "aata": "atta", "flour": "atta", "atta": "atta",
    "makhan": "butter", "butter": "butter",
    "maggie": "maggi", "maggi": "maggi", "noodles": "maggi",
    "dawai": "medicine", "medicine": "medicine", "crocin": "paracetamol", "paracetamol": "paracetamol",
    "pav": "bread", "roti": "bread", "bread": "bread",
    # Common Indian grocery brand names (Prompt.txt C: "product brands").
    # Extensible — add a row here to recognize a new brand; it's picked up
    # by both the exact and 1-edit-distance fuzzy paths automatically.
    "amul": "amul", "britannia": "britannia", "britania": "britannia",
    "parle": "parle", "parleg": "parle", "lays": "lays", "leys": "lays",
    "pepsi": "pepsi", "cocacola": "coca-cola", "coke": "coca-cola",
    "nescafe": "nescafe", "dettol": "dettol", "colgate": "colgate",
    "surfexcel": "surf excel", "tide": "tide", "haldiram": "haldiram",
    "haldirams": "haldiram", "kissan": "kissan", "mdh": "mdh",
    # Common kitchen staples / dish-name building blocks that were
    # missing entirely before (e.g. "paneer" alone used to go
    # unrecognized and immediately ask for clarification instead of
    # just being searched for — see JINNI_IMPLEMENTATION_NOTES.md
    # "Third pass"). This list is still small and NOT meant to be
    # exhaustive — search_both() always also tries the full raw phrase
    # as a literal search term, so an item missing from this table can
    # still be found as long as it's typed/spoken close to its real
    # product/dish name.
    "paneer": "paneer", "panner": "paneer", "masala": "masala",
    "dahi": "curd", "curd": "curd", "anda": "egg", "egg": "egg",
    "chicken": "chicken", "mutton": "mutton", "sabzi": "sabzi",
    "aloo": "aloo", "pyaz": "onion", "onion": "onion",
    "tamatar": "tomato", "tomato": "tomato",
}

_GROCERY_HINTS = {
    "milk", "bread", "atta", "butter", "maggi", "medicine", "paracetamol",
    "sugar", "chini", "namak", "salt", "chawal", "rice", "dal", "oil", "tel",
    "amul", "britannia", "parle", "lays", "pepsi", "coca-cola", "nescafe",
    "dettol", "colgate", "surf excel", "tide", "haldiram", "kissan", "mdh",
    "paneer", "curd", "egg", "aloo", "onion", "tomato",
}
_FOOD_HINTS = {
    "pizza", "burger", "biryani", "tea", "fries", "momos", "noodles",
    "roll", "sandwich", "dosa", "thali", "paratha", "masala", "chicken",
    "mutton", "sabzi",
}

# Size/variant words (Prompt.txt C: "variants"). Not used for DB name
# search (a product named "Amul Butter" rarely contains "chota" in its
# title), but surfaced on the match so the backend/UI can eventually
# prefer a matching pack-size variant once products carry variant data.
_VARIANT_WORDS = {
    "chota": "small", "choti": "small", "small": "small",
    "bada": "large", "badi": "large", "large": "large", "big": "large",
    "medium": "medium", "family": "family_pack", "jumbo": "large",
}

_CART_WORDS = {"cart", "add", "hatao", "remove", "badlo", "quantity", "qty"}
_ORDER_STATUS_WORDS = {"order", "track", "kahan", "status", "kaha"}

_QTY_WORD_TO_NUM = {
    "ek": 1, "one": 1, "do": 2, "two": 2, "teen": 3, "three": 3,
    "char": 4, "four": 4, "paanch": 5, "panch": 5, "five": 5,
}


@dataclass
class IntentMatch:
    intent: str  # 'food_search' | 'grocery_search' | 'order_status' | 'cart_command' | 'unknown'
    confidence: float
    keywords: list[str] = field(default_factory=list)
    quantity: int | None = None
    variant: str | None = None  # 'small' | 'medium' | 'large' | 'family_pack' | None


def _normalize(text: str) -> str:
    text = text.lower().strip()
    text = re.sub(r"[^\w\s\u0900-\u097F]", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text


def _levenshtein_le1(a: str, b: str) -> bool:
    """True if edit distance between a and b is 0 or 1 (cheap spelling-mistake tolerance)."""
    if a == b:
        return True
    if abs(len(a) - len(b)) > 1:
        return False
    # Simple DP, fine for short tokens (product names).
    m, n = len(a), len(b)
    prev = list(range(n + 1))
    for i in range(1, m + 1):
        cur = [i] + [0] * n
        for j in range(1, n + 1):
            cost = 0 if a[i - 1] == b[j - 1] else 1
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
        prev = cur
    return prev[n] <= 1


def _extract_quantity(tokens: list[str]) -> int | None:
    for t in tokens:
        if t.isdigit():
            return max(1, min(int(t), 50))
        if t in _QTY_WORD_TO_NUM:
            return _QTY_WORD_TO_NUM[t]
    return None


def _extract_variant(tokens: list[str]) -> str | None:
    for t in tokens:
        if t in _VARIANT_WORDS:
            return _VARIANT_WORDS[t]
    return None


def match_intent(raw_text: str) -> IntentMatch:
    text = _normalize(raw_text)
    if not text:
        return IntentMatch(intent="unknown", confidence=0.0)

    tokens = text.split(" ")
    quantity = _extract_quantity(tokens)
    variant = _extract_variant(tokens)

    if any(w in text for w in _ORDER_STATUS_WORDS) and ("order" in text or "track" in text):
        return IntentMatch(intent="order_status", confidence=0.9, keywords=[], quantity=quantity, variant=variant)

    if any(w in tokens for w in _CART_WORDS):
        return IntentMatch(intent="cart_command", confidence=0.85, keywords=tokens, quantity=quantity, variant=variant)

    canonical_hits: list[str] = []
    exact = 0
    fuzzy = 0
    for tok in tokens:
        if tok in _TRANSLITERATIONS:
            canonical_hits.append(_TRANSLITERATIONS[tok])
            exact += 1
            continue
        # fuzzy: compare against known vocabulary for 1-char typo tolerance
        hit = None
        for key, canonical in _TRANSLITERATIONS.items():
            if abs(len(key) - len(tok)) <= 1 and _levenshtein_le1(key, tok):
                hit = canonical
                break
        if hit:
            canonical_hits.append(hit)
            fuzzy += 1

    canonical_hits = list(dict.fromkeys(canonical_hits))  # de-dupe, keep order

    if not canonical_hits:
        # Nothing recognized locally — low confidence, worth a Gemini
        # fallback if at least it looks like a real request (2+ words).
        conf = 0.35 if len(tokens) >= 2 else 0.15
        return IntentMatch(intent="unknown", confidence=conf, keywords=[], quantity=quantity, variant=variant)

    grocery_score = sum(1 for k in canonical_hits if k in _GROCERY_HINTS)
    food_score = sum(1 for k in canonical_hits if k in _FOOD_HINTS)
    intent = "grocery_search" if grocery_score >= food_score else "food_search"

    # Confidence: exact hits count full weight, fuzzy (spelling-corrected)
    # hits count slightly less since they're a best guess.
    base = (exact * 1.0 + fuzzy * 0.75) / max(1, exact + fuzzy)
    # Multiple consistent hits raise confidence; a single fuzzy hit alone
    # stays below threshold so it still gets a Gemini sanity check.
    coverage_bonus = min(0.15, 0.05 * (len(canonical_hits) - 1))
    confidence = min(0.99, base + coverage_bonus)
    if exact == 0 and fuzzy == 1:
        confidence = min(confidence, 0.6)

    return IntentMatch(
        intent=intent, confidence=round(confidence, 2), keywords=canonical_hits,
        quantity=quantity, variant=variant,
    )
