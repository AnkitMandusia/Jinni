# Jinni — implementation status (living document)

Last updated after PR #12. Start/run instructions: **`RUNBOOK.md`**. Architecture: `ARCHITECTURE.md`. Money: `FINANCE.md`.
Rides: `RIDES.md`. Web console + logins: `ADMIN_WEB.md`. Deploy: `DEPLOY.md`. Research follow-ups: `RESEARCH_IMPLEMENTATION.md`.

## What exists (by area)
| Area | Built | Notes |
|---|---|---|
| Auth & roles | OTP + password login, refresh, roles (customer, restaurant, store, delivery, admin), partner KYC (delivery) | Firebase phone auth needs real credentials in prod |
| Food | restaurants, menus, cart, orders, scheduled delivery, restaurant dashboard (web + app) | |
| Grocery | catalogue (platform + store products), stock/reserved, OOS check + substitutes, store dashboard | |
| Orders | unified engine, race-to-accept, OTP delivery, cancel/refund flags, ratings, coupons, wallet, referrals, shopping lists, festival campaigns | |
| Rides (Jinni Carpet) | bike/auto/cab, fixed + dynamic pricing, boost, start code, SOS, rating, cancel fees → dues folded into later rides/orders, OSM spots (free), rider ETA, KYC + admin approval, ride-only auto/cab partners, nearby-rider availability | see RIDES.md |
| Partner app | one dashboard for deliveries + rides, job switches, earnings (net of commission) | |
| Payments | Paytm (online), COD (marked paid on delivery), wallet, ride cash/UPI | |
| Finance | commission split frozen per job, party balances, payouts/deposits ledger (UTR), Paytm view, rates | see FINANCE.md |
| Admin web (Jinni theme) | Overview + SLA, Orders (filters, detail, refund, manual complete), Payments, Finance, Restaurants, Stores, Grocery Products (stock audit, low stock), Rides, Delivery agents, Users | `localhost:8080` |
| Admin mobile | Home, Users, Orders, Products, Eateries, Stores, Finance | |
| Background jobs | coupon expiry, scheduled-order nudge, stuck-order + low-stock alerts (`app/tasks.py`) | one worker via Redis lock |
| Ops | Docker Compose (db, redis, migrate, api, admin), prod overlay with Caddy HTTPS + daily backups, offline rebuild script for dev | |

Migrations: 0001 … **0022** (`alembic upgrade head`, run automatically by compose).
Tests: backend **113 pass** (4 skipped), mobile jest 39 pass, admin type-checked build.

## Bugs found and fixed along the way
Admin web data layer (zeros/crash), users `pending` vs `pending_approval`, Docker same-origin API guard, OTP delivery HTTP 500
(async lazy-load), COD stayed `pending` after delivery, grocery stores saw/accepted food orders, grocery coupons were cosmetic,
reserved stock leaked on decline, OTP endpoint blocked "delivered", super-admin missing from the Docker DB, `fee_settled_ref` too short.

## Verified vs not verified
| Verified | Not verified yet |
|---|---|
| Docker stack + migrations; API flows via curl incl. money ledger and validations; web console pages in headless Chrome (admin, store, restaurant logins); emulator: customer booking UI, rider alert/accept/ride-code modal, rider dashboard, admin app tabs | Partner signup wizard on a device (OTP step spun forever on the emulator — undiagnosed); push notifications (no Firebase JSON); UPI app hand-off; OSM import *inside* Docker (VM has no internet — works on the host/VPS); iOS simulator; wireless phone run |

## Known limits / decisions (so nobody is surprised)
* Payouts to partners are **manual** (UPI/bank) and recorded with UTR; TDS 194-O / GST TCS not deducted (talk to your CA).
* Commission rates are global; per-partner overrides not built.
* Rider live location is foreground-only and phone-GPS based (free); no map tiles.
* Delivery of food/grocery is bike-only; auto/cab partners are ride-only by design.
* Scheduled orders reach sellers 45 min before the slot (queue filter + nudge), not at order time.

## Next (suggested order)
1. Diagnose the signup OTP spinner on emulator, then visually verify the partner wizard.
2. Partner-visible earnings & payout history (restaurant/store/rider).
3. Per-partner commission; TDS/TCS with CA; GST invoices.
4. CI (pytest + admin build + mobile typecheck); automatic payouts; salon module.

## PR map
#10 ride booking · #11 ride v2 (pricing, KYC, boost, SOS, dues) · #12 nearby availability + ride-only partners + web console (orders, payments, finance, stores) + architecture items. Earlier: research follow-ups, Docker/deploy, dev seed.
