# Jinni web console (admin · restaurant · grocery store)

Open **http://localhost:8080** (Docker `admin` container; nginx proxies `/api` to FastAPI — nothing else to configure).
Mobile app uses the same accounts (admin tabs: Home, Users, Orders, Products, Eateries, Stores, Finance). Dev password for all seeded accounts: **`Test@1234`**
(`docker compose exec api python scripts/seed_dev_all.py` creates them; safe to re-run).

| Role | Email | Opens |
|---|---|---|
| Super admin | `admin@test.com` · or `mandusiaankit.005@gmail.com` / `Superadmin@2024` | Overview, Orders, Payments, Restaurants, Grocery Products, Rides, Delivery Agents, Users |
| Grocery store | `store@test.com` | Store dashboard, Orders (accept/decline/prepare), Products & Stock, Business Profile |
| Restaurant | `restaurant1@test.com` (Spice Garden), `restaurant2@` (Green Bowl), `restaurant3@` (Burger House) | Dashboard, Orders, Menu & Categories, Business Profile |

Delivery partners / riders / customers use the **mobile app only** (no delivery dashboard in the browser).

## Super admin pages
- **Overview** – today's and period sales (food, grocery, rides), sales-per-day chart, how customers pay, orders by status, best sellers, top restaurants/stores, latest orders, and an "attention" strip (open SOS, partners awaiting approval, refunds to process, orders stuck 10+ min). Auto-refreshes every 30 s.
- **Orders** – full history with filters (type, status, payment, pay status, date range, order number); click a row for items, totals, coupon/dues, customer/seller/rider, address, payment id and timeline; actions: *Mark refund paid*, *Complete manually* (audited).
- **Payments** – one ledger for food, grocery and rides: collected / still to collect / refunds to pay / refunded, split by method (COD, online, wallet, cash, UPI, cancellation fees). COD orders become *paid* when the rider completes the OTP delivery (cash collected).
- **Finance** – revenue, what you owe restaurants/stores/riders, cash riders must deposit, payouts & deposits recorded with UTR, Paytm view, commission rates, "how money flows". See `FINANCE.md`.
- **Restaurants** – verify / reject / activate / deactivate.
- **Stores** – approve/reject/suspend grocery stores, readiness checklist (address, payout account, GSTIN/FSSAI), open/closed + radius, orders, sales, stock health, what you owe them.
- **Grocery Products** – price, MRP, stock (free vs reserved), owner (platform or a store), active switch, add/edit/delete, barcode auto-fill, **audited stock adjustment**, low-stock filter.
- **Rides** – bookings, ride partners (KYC review + approval), pricing & rules, Jinni Spots, SOS desk, payments. See `RIDES.md`.
- **Delivery Agents / Users & Partners** – approve, reject, suspend, reactivate.

## Deploying the console
`docker compose up -d --build admin` (same-origin; `VITE_API_SAME_ORIGIN=1` is set in the Dockerfile). On Vercel instead set `VITE_API_URL` to your API origin.
