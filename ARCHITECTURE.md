# Jinni architecture — what exists, how it fits, how to extend it

Monorepo: `superapp-backend` (FastAPI) · `superapp-mobile` (Expo React Native) · `superapp-admin` (React + Ant Design) · Docker Compose.
Companion docs: `RIDES.md` (rides, pricing, safety), `FINANCE.md` (money), `ADMIN_WEB.md` (console + logins), `DEPLOY.md` (VPS).

## 1. Runtime map
```
Mobile app (customer / rider / restaurant / store / admin)      Web console (admin · restaurant · store)
        │  HTTPS /api/v1                                               │  same-origin /api → nginx
        └──────────────────────────────┬───────────────────────────────┘
                              FastAPI (async)  ── Redis (pub/sub realtime, locks, rate gates, bg-job locks)
                                   │
                              PostgreSQL 16 (SQLAlchemy async, Alembic 0001…0022)
   External: Paytm (online pay) · Firebase FCM (push) · R2 (images) · SMS · OpenStreetMap (spots, free)
```
One user table for every role (`customer, restaurant, store, delivery, admin, …`); a delivery partner is one account that can
carry food/grocery (bike only) and take rides (bike/auto/cab). Orders are unified (`orders.order_type = food|grocery`); rides have their own table.

## 2. Backend modules (`app/modules/…`)
| Module | Owns |
|---|---|
| `auth`, `users` | OTP + password login, JWT/refresh, profiles (customer, store, restaurant, delivery KYC) |
| `food`, `grocery` | restaurants/menus/cart; categories/products/stock (platform + store-owned) |
| `orders` | unified order engine: create, race-to-accept, status machine, OTP delivery, cancel, rating |
| `delivery`, `delivery_otp` | partner dashboard, availability, earnings, hashed expiring delivery OTP |
| `rides` | pricing engine (fixed/dynamic), booking, start code, SOS, rating, cancel fees → dues, OSM spots |
| `payments_paytm`, `coupons`, `engagement` | online payment, coupons, wallet/referral/schedule/lists, campaigns |
| `finance` | commission split, party balances, ledger (see FINANCE.md) |
| `notifications`, `realtime` | FCM push; WebSocket fan-out of order/ride events |
| `base.py` + `registry_router.py` | **service-module registry** → `GET /api/v1/modules` |
| `app/tasks.py` | background jobs (below) |
| `app/admin/endpoints/` | `users, orders, restaurants, stores, insights, finance, rides, stats` — admin only |

## 3. Background jobs (`app/tasks.py`) — "Celery tier" sized for one city
One asyncio loop per worker, one tick per minute, a Redis lock (`bg:tasks:lock`) so only one worker runs it:
expire coupons · nudge sellers 45 min before a **scheduled** order is due (scheduled grocery orders are hidden from store queues until then) ·
alert admins once for orders no seller accepted for 10 min · daily low-stock digest. Move to Celery beat later by calling the same functions.

## 4. Status of the original architecture plan
| Plan item | Status | Where / note |
|---|---|---|
| Food + grocery + unified order engine | ✅ done | `orders`, `food`, `grocery` |
| Auth JWT + OTP, refresh, logout | ✅ | `auth` |
| Payments: Razorpay + COD | ✅ Paytm + COD + wallet (Razorpay not used) | `payments_paytm`, `finance` |
| Firebase push | ✅ code; needs Firebase JSON in prod | `notifications` |
| Cab / ride booking (Google Maps) | ✅ done **without paid maps** (OSM + haversine) | `rides`, `RIDES.md` |
| Promo codes, scheduled delivery, loyalty/wallet, referrals | ✅ | `coupons`, `engagement` |
| Ratings (orders, rides, stores) | ✅ | `orders`, `rides`, store badge |
| Admin panel: dashboard, orders, users, restaurants, products | ✅ + **stores, finance, payments, rides** | web + mobile admin |
| Inventory: atomic stock, reserved qty, low-stock alerts | ✅ + **audited stock adjustment** (`PUT /admin/catalog/products/{id}/stock`), low-stock filter + daily digest | `insights.py`, `tasks.py` |
| Analytics dashboard | ✅ Overview (sales, payments mix, best sellers) + Finance | web |
| SLA monitoring | ✅ first version: accept time, order→delivery time, late %, cancel % + stuck-order alerts | Overview, `tasks.py` |
| Async task queue | ✅ lightweight loop (above); Celery only when volume needs it | `tasks.py` |
| Module framework (`BaseServiceModule`) | ✅ registry + contract (data-driven, not a class hierarchy — simpler for 4 modules) | `modules/base.py` |
| Docker + CI | ✅ Docker; ⬜ GitHub Actions (not added) | `docker-compose*.yml` |
| Salon module | ⬜ planned (registry entry only) | |
| Flash sales, subscription orders | ⬜ not needed at this stage | |
| Live driver tracking via WebSocket | ◐ rides use 15 s phone GPS → ETA (free); food tracking exists | |
| Partner SDK / webhooks | ⬜ later | |

## 5. How to add a new service (e.g. salon, parcel)
1. `app/modules/<name>/` → `models.py, schemas.py, service.py, router.py`; Alembic migration.
2. Append a `ServiceModule(...)` to `REGISTRY` in `app/modules/base.py`; `include_router` in `app/main.py`.
3. Money: snapshot the split on completion (see `finance.service.snapshot_order`) and add it to `party_balances`.
4. Admin: a page in `superapp-admin/src/pages/<name>/`, add route in `App.tsx` and menu item in `components/Layout.tsx`.
5. Mobile: `src/modules/<name>/`, show its tile only if `GET /modules` says `live`.
Tests: pure functions get unit tests; there is an import smoke test (`tests/test_finance.py`) that catches broken routers.

## 6. Conventions worth keeping
* Server is the source of truth for money (quotes, fees, splits) — clients only display; `expected_fare` style checks guard races.
* Money-critical writes are conditional/row-locked (accept, wallet debit, stock, payouts) and idempotent (unique refs).
* Everything append-only where money is involved (`finance_entries`, `stock_adjustments`).
* Free-first infrastructure: OSM for places, phone GPS for ETA, manual UPI payouts; add paid APIs only when volume justifies.
* Admin web talks to `/admin/*` only; partners use their own role endpoints.

## 7. Dev quick reference
```
docker compose up -d                       # db, redis, migrate (alembic upgrade head), api, admin (http://localhost:8080)
docker compose exec api python scripts/seed_dev_all.py   # test accounts (password Test@1234) + data
cd superapp-backend && pytest              # 113 tests
cd superapp-admin && npm run build         # type-checked web console
cd superapp-mobile && npx expo run:android # native dev build (see DEPLOY.md / README)
```
Known environment limits: Docker VM without internet cannot build images or run OSM import (see PR notes);
partner signup wizard visual check pending; push needs Firebase credentials.

## 8. Suggested next steps (in order)
1. Per-store / per-restaurant commission overrides and partner-visible earnings & payout history (mobile + web).
2. TDS/TCS handling with your CA, then GST invoices.
3. GitHub Actions: pytest + admin build + mobile typecheck.
4. Automatic payouts through Paytm/Razorpay payouts using the existing ledger.
5. Salon module via the registry.
