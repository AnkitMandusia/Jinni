# Jinni vs Zepto — Feature Gap Analysis (Grocery, Phase 7 excerpt)

Based on: Zepto static analysis (manifest + Hermes string-table evidence, see
zepto-js-bundle-findings.md and zepto-screen-inventory.md) vs Jinni's current
superapp-mobile/src/modules/{grocery,cart,orders,profile,home} structure (OBSERVED via
read-only directory listing on E:\work\super — not yet file-content-level review).

Confidence note: Jinni side is OBSERVED (real file listing). Zepto side is INFERRED from
bytecode string evidence (no code-level confirmation). Treat gaps below as directional,
not exhaustive — a deeper pass should open each Jinni screen file to confirm what's actually
implemented vs just scaffolded.

## Structural observation (OBSERVED, UPDATED after reading file content)
- CORRECTION: `GroceryCartScreen.tsx` and `UnifiedCartScreen.tsx` are NOT duplicates. Both
  read the same shared `cartStore`; `GroceryCartScreen` filters to `moduleType === 'grocery'`.
  This is an intentional unified-cart-across-verticals design (food module does the same
  filtering pattern, per an inline code comment). Not a gap or inconsistency.
- Jinni already has a module structure for cab, salon, delivery, food, grocery, admin —
  broader scope than "grocery + food delivery" alone. Worth confirming whether cab/salon
  are active priorities or dormant scaffolding, since it affects how much shared
  infrastructure (address, payments, cart) needs to serve non-commerce verticals too.
- ARCHITECTURAL DIFFERENCE from Zepto (OBSERVED in GroceryCheckoutScreen.tsx code comment):
  Jinni's grocery order model is "race-to-accept" — the order is placed generically via
  `POST /orders` and the backend broadcasts it to nearby stores to accept, with no store
  chosen at checkout. Zepto's model (INFERRED from Phase 1 manifest findings: single
  resolved-location-driven dark store via Haversine distance) pre-assigns a specific store
  before checkout. This is a deliberate, different design, not a gap — flagging for
  awareness since it changes what "store selection" even means in Jinni vs Zepto.

## Confirmed present in Jinni (OBSERVED, file-content-verified for checkout/cart)
- Store list, category browse, product list, product detail, cart, checkout (grocery module)
- Order history, order tracking (orders module)
- Saved addresses, profile, help/support, legal (profile module)
- Home with search bar, location header/prompt, hero carousel (home module)
- **Checkout (verified in code, not just file listing):** real saved-address selection with
  inline new-address entry, two payment methods (COD, UPI via Paytm with server-side
  payment verification/reconciliation — never trusts the client SDK result alone), coupon
  code entry that calls a real `/coupons/validate` backend endpoint, bill breakdown
  (subtotal, delivery fee with free-above-₹500 threshold, 5% GST, coupon discount, total),
  and a free-text notes field whose placeholder explicitly suggests "substitute if out of
  stock" — i.e. OOS substitution is handled as a manual note to the store, not a structured
  flow (see P0 table below, this downgrades that gap's severity).

## Gaps vs Zepto's observed feature surface (P0 = core commerce, P1 = conversion/retention, P2 = nice-to-have)

### P0 — core commerce, likely needed before launch
| Zepto evidence | Jinni status (CODE-VERIFIED) | Gap | Complexity |
|---|---|---|---|
| SCREEN_VIEWED_UNSERVICEABLE_STORE, ADDRESS_SERVICE_UNAVAILABLE | Checkout only validates pincode length (6 digits) and address line length — no check against actual store/delivery coverage before allowing order placement | Still a real gap: need an explicit "not serviceable at this address" check, ideally before checkout (at address-select or home) not just generic order-placement failure | Low-Medium |
| SCREEN_VIEWED_PARTIAL_OOS_BOTTOM_SHEET, SWAP_AND_SAVE | DOWNGRADED — handled only via a free-text "notes for store" field (placeholder literally suggests "substitute if out of stock"), not a structured flow. No programmatic OOS detection, no swap suggestion UI, no partial-fulfillment confirmation step | Real gap remains, but less severe than first assessed: a manual-notes workaround already exists; building a structured flow is an enhancement, not a from-scratch feature | Medium |
| JUSPAY_UPI_APPS_BOTTOMSHEET_VIEWED, PAY_COD_ZIC_BUTTON_CLICKED, PAY_ONLINE_ZIC_BUTTON_CLICKED | DOWNGRADED — Jinni DOES have a real payment method picker (COD vs UPI-via-Paytm) with server-side payment verification/reconciliation (doesn't trust client SDK alone). Single gateway (Paytm) vs Zepto's multi-provider (Juspay + Amazon Pay) stack | Smaller gap than first assessed: core UX pattern already exists; the gap is provider breadth (saved cards, multiple UPI intent apps shown individually, EMI) not the picker itself | Low-Medium |
| SCREEN_VIEWED_COUPON_BS, MANUAL_COUPON_BOTTOMSHEET_CTA_CLICKED | CORRECTED — coupon entry EXISTS and calls a real `/coupons/validate` backend endpoint with discount applied to the bill | No gap — already implemented. Removed from gap list. | N/A |

### P1 — conversion and retention features
| Zepto evidence | Jinni status | Gap | Complexity |
|---|---|---|---|
| ZCoins (loyalty currency), Zepto Cash (wallet) | No wallet/loyalty module or screens found anywhere in src/modules | Entire loyalty/wallet system absent — large scope item, needs its own module | High |
| SCREEN_VIEWED_REFERRALS_PAGE, referral program events | No referral screens found | Referral program absent | Medium |
| SHOW_ORDER_RATING_MODAL_V2, RNR_TOAST_VARIANT | No rate-and-review screen/component found for orders | Post-delivery rating flow absent | Low-Medium |
| SCREEN_VIEWED_PAY_WITH_EMI_BS, NO_COST_EMI | No EMI/BNPL option | Likely out of scope for MVP — flag only | Low priority to build |

### P2 — nice-to-have / platform maturity
| Zepto evidence | Jinni status | Gap | Complexity |
|---|---|---|---|
| Scheduled/future delivery (pickupTimeSelector) | No scheduling UI found | Delivery-time selection absent | Medium |
| Shopping lists (SCREEN_VIEWED_SHOPPING_LIST_PAGE) | Not found | Saved shopping lists absent | Low-Medium |
| PIP shoppable video | Not found | Not recommended for MVP scope | N/A |
| Gift cards / vouchers | Not found | Defer unless business requires it | Medium |

## Explicitly NOT recommended to replicate (per your original instruction to design
original architecture, not copy Zepto 1:1)
- Pharmacy vertical (prescription upload/consent) — out of grocery scope unless Jinni plans
  to sell regulated items
- Electronics exchange/trade-in flow — unrelated to grocery+food delivery
- Festival-specific campaign screens (Rakhi, IPL tie-ins) — seasonal marketing, not core architecture
