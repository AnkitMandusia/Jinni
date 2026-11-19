# Jinni — Food Module Deep Verification (code-level, same rigor as grocery)

## Checkout (verified in code: CheckoutScreen.tsx, food module)
Same quality tier and pattern as grocery checkout: real saved-address selection,
COD/UPI(Paytm) with server-side reconciliation (never trusts client SDK alone), coupon
via the SAME shared `/coupons/validate` endpoint (differentiated by `order_type: 'food'`
vs grocery's implicit type) — confirms coupons are a genuinely shared backend system
across verticals, not duplicated per-module. Bill breakdown adds a food-specific
`packaging_fee` line grocery doesn't have. Defensive UUID validation on restaurant/item/
option IDs with specific inline comments referencing real past bugs (a 422 "Input should
be a valid UUID" error) — this is evidence of real debugging history, not speculative
code. Same gaps as grocery: serviceability is pincode-length-only, no group ordering, no
scheduled delivery.

## MAJOR CORRECTION: "Order with Jinni" AI ordering assistant is REAL, not a stub

Initial read of `OrderWithJinniButton.tsx` (food module) suggested this was UI-only, per
its own code comment: "functional food pre-load (search_food / add_items_to_cart tools)
is backend work tracked separately; this wires the UI entry point and context hint only."

Opening `useJinniSession.ts` and `interpretService.ts` (jinni module) shows this comment
is STALE — the feature is substantially built and functioning end-to-end:

- **Voice session lifecycle**: open -> listening -> submitWish -> thinking -> results ->
  confirmAddToCart -> success, with server-tracked sessions (startSession/cancelSession/
  completeSession) and a rate-limited "wishes" quota (server-enforced via HTTP 429, with
  a client-side `isExhausted` check as a fast-path, refreshed from server state) — the
  genie/"Chirag" persona theme is carried through a named phrase system and TTS.
- **Real backend intent interpretation**: `interpretService.ts`'s own comment confirms
  hardcoded demo catalogs were explicitly REMOVED from the production path. All results
  come from `/jinni/interpret`, which the comment says reads from live `products`/
  `menu_items` tables (superapp-backend/app/modules/jinni/search_service.py — referenced
  but not independently opened in this pass, so treat the backend claim as INFERRED from
  a specific, detailed frontend comment rather than OBSERVED directly).
- **Local-first UX, server-authoritative data**: a local keyword matcher
  (`JinniIntentFinder`) gives instant UI feedback and a confidence hint sent to the
  backend, but is explicitly never trusted as a source of truth — on backend failure, the
  code deliberately surfaces a clarification message rather than fabricating items from
  the local match. This is a notably careful anti-hallucination design choice.
- **Real cart integration**: `confirmAddToCart` builds real cart lines and reuses the
  exact same cross-source conflict pattern (`addItem` / `forceAddItem`) documented in
  jinni-technical-architecture.md for the shared cart store — this isn't a parallel path,
  it feeds the same cart everything else uses.
- **TTS safety rule** (explicit in code comment): the app is only ever allowed to SPEAK
  pre-scripted phrases, never dynamic AI-generated text, product names, prices, or order
  details out loud — a deliberate guard against reading untrusted/hallucinated content
  aloud. Good practice worth preserving as this feature grows.

## Why this matters for the gap analysis
Neither Zepto nor Zomato showed evidence of anything like this. Zepto has a single
`i_chat_bot_add_to_cart_clicked` event (a support-chat-bot-can-add-to-cart feature, much
narrower). Zomato has a more developed chat SDK (1,709 classes) with AI bot + voice
input, but evidence doesn't show it driving a full voice-to-cart wish-granting flow with
its own quota/persona system. If this works as the code suggests, it's a genuine
differentiator already built, not a gap to close — the gap analysis should REMOVE any
assumption that Jinni needs to catch up here, and instead flag this as something worth
featuring prominently rather than hiding as an experimental side feature.

## Caveat — RESOLVED
The backend endpoint was independently verified (superapp-backend/app/modules/jinni/
search_service.py opened directly). The claim is now OBSERVED, not just inferred from a
frontend comment: real async SQLAlchemy queries against live `Product`, `MenuItem`, and
`Restaurant` tables, genuine stock/availability checks (grocery: `stock_quantity -
reserved_quantity > 0`; food: `item.is_available AND restaurant.is_open AND
restaurant.is_accepting_orders`), and a deliberately engineered two-tier search strategy:
full-phrase ILIKE match tried first, loose single-keyword match only as fallback — with
the module docstring explicitly documenting a real disambiguation bug this was built to
fix ("paneer butter masala" misrouting to grocery because "butter" overlaps both
domains; the fallback now tries the OTHER module's full phrase before giving up). This
is production-quality, bug-driven engineering, not a prototype. The "Order with Jinni"
feature is confirmed end-to-end: frontend voice session -> backend intent search against
real inventory -> cart integration. Treat this as one of Jinni's most mature subsystems,
not a gap or a stub.

## Grocery product listing (ProductListScreen.tsx) — additional verification
Confirms consistent quality: discount-percent badges (price vs MRP), inline quantity
stepper reusing the shared cart store, proper out-of-stock blocking (item is shown but
the ADD button is replaced with an "Out of Stock" label — consistent with earlier
finding that OOS substitution exists only as a checkout-notes workaround, not a
structured swap-suggestion UI at the listing level), a floating cart button with a live
item-count badge, and explicit pull-to-refresh/error-retry states. A code comment
literally says "Blinkit-style" card design — confirms the UI pattern was deliberately
modeled on a known reference, consistent with this whole research project's premise.

## Overall assessment of this deep-verification pass
Across checkout (both verticals), cart, and product listing: Jinni's core commerce code
is consistently well-engineered — real defensive validation, genuine bug-driven design
decisions documented in comments, and no evidence of placeholder/mock logic in the paths
checked. The AI ordering assistant is a confirmed, working, differentiated feature. The
gaps that remain (serviceability pre-check, structured OOS substitution, group ordering,
scheduled delivery) are genuine and worth prioritizing, but they are gaps in an otherwise
solid foundation, not signs of an unfinished app.


