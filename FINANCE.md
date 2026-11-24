# Jinni finance — how money moves, who gets paid, how it is recorded

Applies to: food, grocery and Jinni Carpet rides. Code: `superapp-backend/app/modules/finance/`,
admin APIs `app/admin/endpoints/finance.py`, web **Finance** page, mobile admin **Finance** tab.
Money maths is unit-tested (`tests/test_finance.py`).

## 1. The model in one paragraph
Jinni is a **marketplace**: the customer pays Jinni (online) or the rider on Jinni's behalf (COD), and Jinni then
pays each partner their share. Nothing is paid automatically; the super admin pays from their own UPI/bank and
**records the UTR** in the console. The books are an append-only ledger, so they always reconcile.

## 2. Who earns what (defaults, editable in Finance → Rates)
| Money | Rule | Default |
|---|---|---|
| Restaurant | food item subtotal − food commission | commission **15 %** |
| Grocery store | grocery item subtotal − grocery commission | commission **8 %** |
| Rider (delivery) | share of the delivery fee | **100 %** of fee |
| Rider (ride) | fare − ride commission | commission **10 %** |
| Platform revenue | seller commission + (delivery fee − rider share) + ride commission + cancellation fees − coupon discounts we fund | |
| GST on the bill | collected for the government, **not revenue** | shown separately |

Example (food, COD): items ₹1000, delivery ₹40, GST ₹50 → customer pays ₹1090.
Restaurant earns ₹850 (₹1000 − 15 %), rider earns ₹40, platform keeps ₹150. The rider is holding ₹1090 cash.

Rates apply only to jobs completed **after** a change: the split is frozen on the order/ride when it completes
(`orders.commission_amount / seller_amount / rider_amount`, `rides.commission_amount / rider_amount`), so past
books never change.

## 3. Money coming in
| Customer pays | Who receives it | What you must do |
|---|---|---|
| **Online (Paytm)** | Paytm → your bank (T+1) | nothing; reconcile TXNID in Finance → Paytm / online against the Paytm dashboard |
| **COD** | the rider, in cash, at the door | rider hands it over; you record a **deposit** |
| **Wallet** | internal balance (already funded by refunds/rewards) | nothing |
| **Ride – cash** | the rider | rider keeps their share, owes you the commission |
| **Ride – UPI** | the rider's own UPI id (platform id as fallback) | same as cash |

COD orders become `payment_status = paid` when the rider completes the OTP delivery (cash collected).

## 4. Money going out — the per-person balance
For every restaurant, store and rider the console keeps one number:

`payable = earned − collected − paid_out + deposits_received`

* **payable > 0** → the platform owes them → **Record payout** (restaurants, stores, riders who earned more than they collected).
* **payable < 0** → they hold platform money → **Record deposit** (riders with COD/ride cash).
* Netting means a rider who earned ₹800 and collected ₹1,500 COD only deposits the ₹700 difference.

### Weekly routine for the admin (small city, ~5 minutes)
1. Finance → **Payouts & cash**. Riders first: ask each "Collect ₹X" rider to deposit (cash hand-over or UPI to your platform id) → *Record deposit*.
2. For each "Pay ₹X" row (≥ minimum payout): open your UPI/bank app, send to the shown UPI / bank account.
3. Click **Record payout**, paste the **UTR**. The system refuses a payout larger than what is owed and refuses duplicate UTRs.
4. Wrong entry? Add a reversing **adjustment** with a reason; entries are never edited or deleted.
5. Once a month: compare *Collected online* with the Paytm settlement report.

Partners must save a payout account (UPI or bank) in their profile; rows without one show "no account".

## 5. Data model
* `finance_settings` (single row id=1): commission %, rider share %, ride commission %, min payout, cycle days, platform UPI.
* `finance_entries` (append-only): `party_user_id, party_role, kind (payout|deposit|adjustment), direction (out|in), amount, method (upi|bank|cash), reference, note, created_by, created_at`.
* Frozen split columns on `orders` and `rides` (above). Old orders without a frozen split fall back to the current rates.
* Balances/revenue are computed on read (`finance/service.py: party_balances, platform_totals`). Fine for thousands of orders;
  when volume grows, move the aggregation into SQL or a nightly summary table without changing the API.

## 6. APIs (admin only, `/api/v1/admin/finance/…`)
`GET overview?days` · `GET parties?role&only_due` · `GET parties/{id}/statement` · `POST entries` · `GET entries?days&kind` ·
`GET|PUT settings` · `GET online?days` (Paytm view). Stores: `GET /admin/stores`, `GET|PATCH /admin/stores/{id}`, `POST /admin/stores/{id}/{verify|reject|suspend|reactivate}`.

## 7. What is deliberately NOT built yet (decide with your CA)
* **TDS u/s 194-O** (1 % on sellers' gross sales above the threshold) and **GST TCS** for e-commerce operators — not deducted.
* GST on the platform commission and invoices to partners.
* Automatic payouts (Paytm/Razorpay payouts API) — the ledger is ready for it: replace "admin pays manually" by an API call and write the same `finance_entries` row.
* Per-restaurant / per-store custom commission (only global rates today). Add a nullable `commission_pct` on `restaurants` / `store_profiles` and read it in `order_split`.
* Customer refund payouts via Paytm API (refunds are flagged `refund_pending` and marked paid by the admin).
* Rider incentives / bonuses → use an `adjustment` entry (direction out) with a note.

## 8. Where to change things
| Want to… | Edit |
|---|---|
| change a commission rule or add a fee | `finance/service.py` (`order_split`, `ride_split`, `revenue_of_order`) + test in `tests/test_finance.py` |
| add a new service (e.g. salon) to the books | snapshot its split on completion (like `snapshot_order`) and include it in `party_balances` |
| change who sees what | `app/admin/endpoints/finance.py`, web `pages/finance/FinancePage.tsx`, mobile `modules/admin/screens/AdminFinanceScreen.tsx` |
