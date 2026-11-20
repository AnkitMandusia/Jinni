# Research → Implementation (Zepto / Zomato findings applied to Jinni)

Source: `research/reverse-engineering/*` (gap analysis, deep verification, Zepto vs Zomato matrix).
Rule followed: **don't copy Zepto/Zomato feature-for-feature; fix real gaps in Jinni's own model**
(race-to-accept order broadcast, unified cart, one codebase for all roles).

## Implemented

| # | Research gap | What was built | Where |
|---|---|---|---|
| 1 | **Serviceability pre-check** (Zepto `UNSERVICEABLE_STORE`) — Jinni only checked pincode *length* | `GET /orders/serviceability` = "is any open store covering this pincode" (same predicate the broadcast uses, so the answer matches reality). `POST /orders` now rejects **before reserving stock** if no store covers the pincode. Checkout shows a live banner + disables Place Order. Check failure (offline) never blocks — backend re-checks. | `orders/router.py`, `orders/service.py`, `useServiceability.ts`, `GroceryCheckoutScreen.tsx` |
| 2 | **Structured OOS / substitution** (Zepto `PARTIAL_OOS` + `SWAP_AND_SAVE`, Zomato `CartOosRecommendation`) — was only a free-text note | `POST /grocery/cart/check`: per-line `ok / partial / out_of_stock`, live-price drift, up to 3 in-stock swaps (same category; same brand first, then closest price). Mobile bottom sheet: **Swap / Keep N / Remove**. Price drift is never silently charged: customer is told and re-confirms. | `grocery/service.py`, `grocery/router.py`, `CartIssuesSheet.tsx` |
| 3 | **Order cancellation + refund state** (Zepto cancel/refund flows) — customers had *no* way to cancel | `POST /orders/{id}/cancel` (customer, own order, only `pending_dispatch`/`store_accepted`; row-locked; idempotent; 404 for others' orders). Releases reserved stock. Paid online order → `payment_status = refund_pending` (never claims a refund it didn't make). Admin: `GET /admin/orders?payment_status=refund_pending`, `POST /admin/orders/{id}/mark-refunded`. Paytm can no longer charge a cancelled order; a payment captured mid-cancel becomes `refund_pending`. Cancel button on tracking screen. | `orders/*`, `payments_paytm.py`, `admin/endpoints/orders.py`, `OrderTrackingScreen.tsx` |
| 4 | **Rate & review** (Zepto `RNR`) — stars only, one mis-tap locked the rating | Stars now *select*; optional review text + explicit Submit (backend already accepted `review`). | `OrderTrackingScreen.tsx` |
| 5 | Housekeeping from architecture doc: `console.log` in `createPersistedStore` | Gated behind `__DEV__`. | `shared/store/useStore.ts` |

## Bugs found while verifying the research (research said "works, don't rebuild")

1. **Grocery coupons were cosmetic.** Checkout sent `coupon_code`, but `OrderCreate` had no such field, so
   Pydantic dropped it: UI showed a discount, server (and Paytm) charged the full amount, and no
   redemption was recorded. Fixed — coupon is now validated server-side against the server-computed subtotal.
   Validation logic was copy-pasted in 2 places (`/coupons/validate`, food orders); extracted to
   `coupons/service.py` and reused by all three paths.
2. **Reserved stock leaked** when a store declined an order or no store was available — `reserved_quantity`
   only ever went up, slowly making products look out-of-stock. Fixed in decline / no-store / cancel via one
   helper (`OrderService.release_reserved_stock`).
3. Orders with no covering store were created (stock reserved) and *then* marked `no_store_available`. Now rejected up-front.

## Second pass — remaining research items (now implemented)

| Research item | Built | Where |
|---|---|---|
| **Wallet** (Zepto Cash) — ONE currency, per the research warning about Zomato's Money+Credits | Append-only ledger + cached balance. Debit is a conditional `UPDATE ... WHERE balance >= amount` (no overdraw under concurrency); every credit has a unique idempotency `ref` (no double payout). Pay for food/grocery with `payment_method=wallet` (debited atomically with order creation); refunded instantly to wallet on cancel / store decline / restaurant reject / no-store. `GET /wallet`, admin `POST /admin/wallet/credit`. | `engagement/*`, `orders/service.py`, `food/service.py` |
| **Referrals** (Zepto referrals page) | Per-user code; apply only before first order, once, not self. Both sides rewarded (₹50/₹50) when the referee's **first order is delivered** (OTP or admin-manual path), capped at 20 rewarded referrals per referrer. | `engagement/*`, `WalletScreen.tsx` |
| **Scheduled delivery** (Zepto `pickupTimeSelector`, Zomato `OrderSchedulingSelector`) | `scheduled_for` on orders (30 min – 48 h, tz-aware input normalised to UTC, validated server-side). Checkout chips: ASAP / 1 h / 3 h / tomorrow 9 AM. | `engagement/service.py`, `CheckoutExtras.tsx` |
| **Shopping lists** (Zepto `SHOPPING_LIST_PAGE`) | CRUD with per-user ownership checks and limits; "save current cart", "add all to cart" (skips out-of-stock). | `engagement/router.py`, `ShoppingListsScreen.tsx` |

Migration: `0016_wallet_referral_lists_schedule.py` (**run `alembic upgrade head`**).

### Another pre-existing bug fixed
`OrderService.update_order_status` hard-blocked `"delivered"`, but the OTP-verified delivery endpoint called it with `"delivered"` — so a *successful* OTP always returned HTTP 400. The OTP endpoint now passes `otp_verified=True` (only set after the hashed-OTP check passes); the generic status endpoint still cannot mark delivered.

### Known limitation
Scheduled orders are still broadcast to stores immediately (the push says "Scheduled order · for <time>"); there is no delay-until-due dispatcher yet — that needs a Celery/cron job. Wallet top-up via Paytm is also not built (wallet is funded by rewards/refunds/admin credit only).

## Deliberately NOT done

- **Group ordering, gift cards, EMI/BNPL, scratch cards** — large separate products; research ranks them P2/"table stakes only for some". Say the word and each gets its own PR.
- **Pharmacy, trade-in, festival campaigns, alcohol/train/highway** — research explicitly says don't replicate.
- **Food serviceability banner** — food already hard-checks distance/pincode *per restaurant* with a clear 400.
- **Real Paytm refund API call** — cancel marks `refund_pending` for ops; needs merchant credentials to test.
- Raw APK / DEX / bundle dumps in `research/jinni_plan/` were analysis inputs only; nothing was executed, copied or committed from them.

## Verification

- Backend: `tests/test_order_cancel_and_cart_check.py` (13 tests: cancel state rules, ownership, idempotency,
  stock release floor, refund flag, OOS verdicts, substitute ranking, coupon math). `tests/test_engagement.py` adds 11 more (schedule bounds/tz, code alphabet, debit/credit rules, idempotency, referral rewards). Full suite: 42 passed, 4 skipped.
- Not run: live Postgres/Redis end-to-end, and the mobile app on a device (see summary notes).
- First pass needed no migration; second pass adds migration 0016 (not run against a live DB here).
