# Jinni Carpet — bike-taxi rides

Riders are the **existing delivery partners**. A partner is busy with *one* job at a time
(a ride or a food/grocery delivery). No live GPS, no paid maps API.

## How it works
1. **Customer** (Home → Rides): picks pickup + drop from *GPS*, admin-curated **Jinni Spots**, saved
   addresses, or a typed address (resolved by the phone's free built-in geocoder). Server computes the
   fixed fare = `base + per_km × distance` (distance = straight line × road factor), min fare, rounded up
   to ₹5. Pays **Cash** (to rider) or **UPI** (after the ride, deep link to the rider's UPI id; falls back to
   a platform UPI id).
2. **Partner app** (existing delivery login): new **Rides** tab + full-screen request prompt. Accept
   (atomic race), *Navigate* buttons open **Google Maps**, Arrived → Start → Complete → confirm cash/UPI.
   "Hand back" returns the ride to the pool if they can't make it.
3. **Admin** (existing console → *Rides*): bookings board (assign / reassign / cancel / adjust fare / mark paid),
   ride partners (on/off switch, online, busy), fares & Jinni Spots, payment records (cash vs UPI).

## Rules worth knowing
- Unaccepted requests expire after `request_timeout_minutes` (lazy — no scheduler needed).
- Customer can cancel until boarded. One live ride per customer.
- A partner on a ride can't accept a delivery (and vice-versa).
- Payment status is only ever set by the rider/admin (never by the customer) and stores who/when/reference.
- Fare changes between estimate and booking → `409 fare_changed` so nobody is charged a number they didn't see.

## API (all under /api/v1)
Customer: `GET /rides/config` · `POST /rides/estimate` · `POST /rides` · `GET /rides/active` · `GET /rides/my` ·
`GET /rides/{id}` · `POST /rides/{id}/cancel`
Rider: `GET /rides/rider/{available,active,history}` · `POST /rides/rider/{id}/{accept,reject,release,arrived,start,complete,confirm-payment}`
Admin: `GET /admin/rides[/summary|/settings|/places|/partners]` · `POST /admin/rides/{id}/{assign,cancel,mark-paid}` ·
`PATCH /admin/rides/{id}/fare` · `PUT /admin/rides/settings` · places CRUD · `PATCH /admin/rides/partners/{id}`

Migration `0018` (run `alembic upgrade head`; the compose `migrate` service does it). Dev seed adds 9 Jaipur spots
and 3 riders (`delivery@`, `delivery2@`, `delivery3@test.com`, password `Test@1234`).

## Not included (on purpose)
Live GPS tracking, surge pricing, ratings, wallet/subscriptions, in-app UPI gateway (UPI goes straight to the
rider/platform VPA and is confirmed by the rider — no gateway fees). Scheduled dispatch/auto-assignment can be added later.
