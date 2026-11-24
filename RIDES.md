# Jinni Carpet — rides on the existing delivery partners

Riders are the **same delivery partners** (same login, same app, same admin console). A partner does **one job at a
time** — a ride *or* a food/grocery delivery. No paid maps API anywhere.

## Customer flow
1. Home → **Rides**. Pickup defaults to current location (if permission already granted); pick pickup/drop from
   **Jinni Spots (nearest first)**, saved addresses, free address search, or GPS.
2. Choose **Bike / Auto / Cab** — each card shows the exact fare and how many carpets are free.
   The line under the headline adapts to any rider count (0 → "all busy, make your wish", 1, 2…9, "10+ awake").
3. **ⓘ** icons explain every extra amount (busy-time ×, earlier cancellation charge). Pay **Cash** or **UPI** after the ride.
4. After booking: live status, rider card (name, **vehicle number plate**, make/colour, rating, call button), a
   **4-digit ride code** (the rider must type it to start), live **distance & ETA**, **SOS**, **cancel with reason**.
5. No rider? After ~40 s the app offers **"+₹10 / +₹20 / +₹30"** (admin-set) — the request is re-sent to riders.
6. After the ride: **rate 1–5 ★ + comment**; pay by UPI deep link if chosen.

## Partner (rider) flow
- **Sign-up wizard** (Create account → Delivery): vehicle (Bike / Auto / Cab) → registration + RC & insurance validity →
  name, DOB, driving-licence no. + expiry, Aadhaar *last 4 only* → emergency contact, UPI, password.
  Validated by Indian formats on device **and** server (`delivery/kyc.py`): DL `SS RR YYYY NNNNNNN`, registration
  `RJ14AB1234` / Bharat series, expiries must be future, age ≥18 (bike) / ≥20 (auto, cab), duplicate vehicle/DL blocked.
- Account is **pending** until an admin verifies the *original* licence, RC and insurance in person
  (Rides → Ride partners → Review → "Mark documents verified" → Approve). Until then no rides.
- **Dashboard** is one place for both jobs: single Online switch, "What I'll take" switches (deliveries / rides),
  current job (ride or delivery), today's total = deliveries + rides, plus vehicle & document-expiry status in Profile
  (with in-app renewal of dates).
- New ride → full-screen alert (route, fare, boost/busy tags, 45 s). Accept → **Navigate** buttons open Google Maps,
  **Call customer**, "I've reached", **enter ride code → start**, complete, confirm cash/UPI. "Hand back" if they can't make it.
  SOS also available to the rider. While on a ride the phone shares GPS every 15 s (foreground) for the customer's ETA.

## Pricing — how admin controls it (Admin → Rides → **Pricing & rules**)
**1 · Fare cards (always there, the default).** Per vehicle: `base`, `per km`, `minimum`, on/off.
`fare = max(base + per_km × distance, minimum)`, rounded **up** to the next ₹5.
Distance = straight line × *road factor* (default 1.3) — no routing API.

**2 · Pricing mode.**
| Mode | What customers pay |
|---|---|
| **Fixed** (default) | Exactly the fare card. Everything in section 2 is ignored. |
| **Dynamic** | `fare card × multiplier`, capped by **Never exceed ×** |

`multiplier = Special pricing × Peak window × Live demand` (each ≥ 1; result clamped to 1…max)
- **Special pricing ×** — your manual dial (rain, festival, strike). 1.0 = off.
- **Peak-hour windows (IST)** — e.g. `08:00–10:00 ×1.2`, windows may cross midnight; overlapping windows use the highest.
- **Live demand surge** — when open requests outnumber idle riders of that vehicle: `+step` per extra request
  (step default 0.25; nobody online counts each request double).
The app shows the multiplier and a ⓘ explaining *why* before booking; the price is locked once booked (if it changes
between estimate and booking the app re-confirms). **Live price preview** in the console shows the current effect.

**3 · Cancellation, boost, safety.**
- *Free-cancel grace* after a rider accepts (default 120 s) and *cancellation fee* (default ₹20; 0 = off).
  Free before any rider accepts. Fee applies after grace, or once the rider has arrived — **unless** the customer's
  reason is the rider's fault ("rider too slow / asked me to cancel / wrong vehicle") → free.
- The fee is **not charged on the spot**: it becomes a *due*, shown in Profile → **Ride charges**, and is added to the
  customer's **next ride or order** (food/grocery totals include it, with a ⓘ). It is released again if that ride/order is
  cancelled, and admin can **Waive fee**. Each fee is settled exactly once.
- *Boost options / max total boost*, *request timeout*, *SOS helpline* (default 112).

**4 · Service area & basics.** Centre + radius (pickups outside are refused), max trip, average speed for ETA,
fallback UPI id, master on/off.

## Safety
- **Start code**: customer-only 4-digit code; rider needs it to start; 5 wrong tries lock the ride (admin reassigns).
- **SOS** (customer *and* rider, during a live ride): alerts the admin desk — push + red banner on every console page +
  SOS tab with ride, both phone numbers, vehicle, last GPS and a Google Maps link. Also: call 112, share trip details
  (native share sheet), call the other person. Admin resolves with a note.
- Rider phone number is shared only after acceptance; customer's phone only after acceptance; stranger access → 404.

## Hotspots for *any* city (free)
- **Admin → Jinni Spots → Import from OpenStreetMap**: one click per city (centre + radius). Pulls airport, railway/bus
  stations, hospitals, malls, attractions, forts, colleges, markets, ranks by importance (Wikipedia-linked places
  score higher), keeps a mix of categories, saves them **hidden** for review (or visible if you choose).
  Overpass is tried first (+mirrors); if busy, falls back to Nominatim category search. Imported once — customers read our DB.
- **Customers** get spots **nearest-first** (distance computed on our server from their phone's location) and
  free **address search** through our cached, rate-limited Nominatim proxy (1 req/s, 24 h cache, bounded to the
  service area), with the phone's built-in geocoder as fallback. For heavy traffic self-host Nominatim/Overpass and set
  `NOMINATIM_URL` / `OVERPASS_URL`.

## Live location — yes, free, and only for the customer
The rider's phone GPS (free) is sent every 15 s **only while on a ride**; the server keeps just the latest point and
shows the assigned customer *distance + ETA* and a carpet moving along a progress bar. No map tiles, no paid API.
Limitation: foreground only (rider must keep the app open) — background tracking would need an Android foreground service.

## Payments
Cash to rider, or UPI straight to the rider's UPI id (platform fallback id if none). The rider (or admin) confirms
receipt; the ride stores method, status, reference, who confirmed and when. Admin → Payments shows cash vs UPI totals.
Total payable = fare + any earlier cancellation dues.

## API (all under /api/v1)
Customer: `GET /rides/config?lat&lng` · `POST /rides/estimate` · `POST /rides` · `GET /rides/{active,my,dues,places/search}` ·
`GET /rides/{id}` · `POST /rides/{id}/{cancel,boost,rate,sos}`
Rider: `GET /rides/rider/{available,active,history}` · `POST /rides/rider/{id}/{accept,reject,release,arrived,start,complete,confirm-payment}` ·
`POST /rides/rider/location` · `PATCH /delivery/profile` (job switches, renewals)
Admin: `GET /admin/rides[/summary|/settings|/pricing/preview|/places|/partners|/sos|/sos-count]` ·
`POST /admin/rides/{id}/{assign,cancel,waive-fee,mark-paid}` · `PATCH /admin/rides/{id}/fare` · `PUT /admin/rides/settings` ·
`PUT /admin/rides/fares/{vehicle}` · places CRUD · `POST /admin/rides/places/{import-osm,bulk-active}` ·
`PATCH /admin/rides/partners/{id}` · `POST /admin/rides/sos/{id}/resolve` · approve/reject via `/admin/users/{id}/{approve,reject}`

Migrations `0018`, `0019` (run `alembic upgrade head`; compose does it). Dev seed (`scripts/seed_dev_all.py`): 9 Jaipur spots,
service area, 3 verified riders (`delivery@` bike, `delivery2@` auto, `delivery3@` cab) and `delivery4@` **pending** for the
approval flow; all `Test@1234`.

## Deliberately not included
Background tracking, a map view, ratings of customers by riders, in-app UPI gateway, wallet/subscription, document photo
upload (identity documents are verified in person — a public image bucket is the wrong place for them), auto-assignment scheduler.

## Assets note
`assets/chirag_carpet_arrived.png` has no alpha channel (checkerboard baked into the pixels). Ride screens never use it and
order tracking now uses the transparent idle art for the "arrived" stage. Re-export that PNG with real transparency if you
want a dedicated arrival pose.
