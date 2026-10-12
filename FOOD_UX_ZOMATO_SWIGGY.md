# Food module UX — Zomato / Swiggy patterns (production reference)

Research summary for SuperApp Food vertical. Implement against this, not a college mock.

## 1. Restaurant discovery (list / grid)

| Pattern | Swiggy | Zomato | Our choice |
|--------|--------|--------|------------|
| Card layout | Compact list or 2-col grid, photo-first | Richer cards, large image, rating chip | **2-column grid**, photo-first |
| Rating | Green chip `#48C479` left of ETA | Same idea, sometimes amber if lower | Green ≥4.0, amber &lt;4.0 |
| Meta row | ★ rating · ETA · distance · ₹ for two | Similar + offers strip | rating · ETA · cost for two |
| Filters | Veg toggle, sort chips, search | Similar + pure veg | Veg toggle, area / all, search |
| Closed | Grey overlay “Closed” | Same | Overlay + disabled press |

**Grid card anatomy (per cell):**
1. Cover image 16:10 (placeholder gradient if no URL)
2. Bottom scrim optional for offer text
3. Name (1 line, bold)
4. Cuisines (1 line, muted)
5. Rating chip + delivery time + delivery fee

## 2. Restaurant menu (detail)

| Pattern | Industry standard | Our implementation |
|--------|-------------------|---------------------|
| Header | Cover + name + rating + meta + pure veg badge | Sticky-ish header block under cover |
| Veg filter | Toggle pure veg items only | Switch “Veg only” |
| Menu structure | Category sections (Starters, Mains…) | SectionList by category |
| Dish row | Veg square + name + price + 2-line desc + image + **ADD** | Same |
| ADD → stepper | ADD morphs to `[ −  qty  + ]` on image | Local qty from cart store |
| Customizations | Bottom sheet (size, spice, add-ons) | Navigate MenuItemDetail if option_groups required |
| Sticky cart bar | Orange/red bar: “N items \| ₹X” + VIEW CART | Food primary `#FF6B6B`, above safe area |

**Dish row (Swiggy-style):**
- Leading: 14px veg/non-veg square (green border+dot / red)
- Middle: name, price, description, bestseller tag
- Trailing: 96×72 image, ADD button overlapping bottom (−12)

## 3. Cart rules (critical)

1. **Single-restaurant cart** (Swiggy uni-cart): items only from one restaurant.
2. Switch restaurant → Alert: clear previous cart? (not silent replace without confirm).
3. Sticky bar only when `moduleType === 'food'` and items.length &gt; 0.
4. Cart screen: line items, ± qty, bill breakdown (item total, delivery, packaging, GST), min-order gate, checkout CTA.

## 4. Ratings — real vs seed

| Source | When |
|--------|------|
| `rating_avg` / `rating_count` on `restaurants` | Denormalized; updated when reviews land |
| Seed values (4.1–4.5, hundreds of counts) | **Demo only** until review pipeline exists |
| Production | Post-delivery review → recompute restaurant aggregate (async job) |

Do not invent ratings on the client. Always show server fields; if `rating_count === 0`, show “New” instead of ★ 0.0.

## 5. Checkout

- Address (line1 required), pincode from location store
- Payment COD / online
- Notes
- Place order → `/food/orders` → clear cart → tracking

## 6. Colour / type tokens (this app)

- Food accent: `colors.food.primary` `#FF6B6B`
- Veg: `colors.success.DEFAULT` `#1D9E75`
- Non-veg: `colors.error.DEFAULT`
- Sticky cart: food primary, white text, elevation

## 7. Implementation checklist

- [x] Grid restaurant list (2 col)
- [x] Menu SectionList + ADD/stepper
- [x] Sticky view-cart bar
- [x] Cart with ± and bill
- [x] Restaurant switch confirm
- [ ] Review API → real rating updates (later)
- [ ] Customization bottom sheet (MenuItemDetail exists; polish later)
- [ ] Offer strips / coupons (later)


---

## 8. End-to-end order lifecycle (Zomato / Swiggy parity)

```
Customer places order (COD/UPI)
    → status: pending_dispatch
Restaurant app notification
    → Accept → store_accepted → Preparing → ready_for_pickup
Platform assigns nearby online rider (or restaurant marks ready)
    → delivery_assigned → rider notification
Rider arrives store → picked_up → in_transit (optional live location)
Customer OTP (6-digit on order) confirms handoff
    → delivered → completed
Payment: COD collected by rider / UPI marked paid at place or on delivery
```

### UI surfaces
| Actor | Screens |
|-------|---------|
| Customer | Cart → Checkout (address, coupon, COD/UPI) → Tracking timeline → OTP shown |
| Restaurant | Incoming orders → Accept/Reject → Preparing → Ready |
| Rider | Available jobs → Accept → Navigate → Enter OTP → Delivered |
| Super admin | Coupons CRUD, restaurant verify, dispute |

### Delivery fee
Shown **only on checkout / cart bill**, not on restaurant grid (matches Swiggy: fee can vary by distance/promo).

### Map / rider tracking
- Production: Google Maps / Mapbox billed per MAU — only enable if budget allows.
- Free option: OpenStreetMap + react-native-maps (no key for basic tiles on some builds) or polyline from rider lat/lng polling every 10–15s from `/delivery/location`.
- MVP: status timeline + ETA text is enough; live map phase-2.

### Coupons (admin-controlled)
| Kind | Behaviour |
|------|-----------|
| `first_order` | Only if user has 0 prior orders |
| `one_time` | max_uses_per_user = 1 |
| `repeat` | max_uses_per_user > 1 |
| `timed` | starts_at / expires_at window |
| Discount | `flat` ₹ or `percent` with optional max_discount |
| Scope | food / grocery / all; min_order_amount |

### Addresses
Multiple saved addresses per user (`user_addresses`); default used at checkout; full payload copied onto `orders.delivery_address` JSON for rider (immutable snapshot).

### Item availability
Restaurant toggles `menu_items.is_available`; list/menu APIs already filter or mark N/A; user cannot add unavailable items (backend rejects).

### Restaurant hours
`restaurants.opens_at` / `closes_at` (and later weekly slots). Account setup should collect these; listing can soft-close outside hours.

---

## 9. Task board (priority)

### P0 — Order path (do first)
- [x] Diagnose checkout: was sending `qty` + no address + invalid payment → fixed CheckoutScreen
- [x] Schema accepts `qty` alias → `quantity`
- [x] Delivery fee only on checkout bill
- [x] COD + UPI (online) selection; OTP message (WhatsApp bypass dev)
- [ ] Wire coupon discount into `create_order` total when code valid
- [ ] Restaurant partner order list + status buttons verified on device
- [ ] Rider receives job when status `ready_for_pickup` (existing delivery module)

### P1 — Addresses & coupons
- [x] Migration `0008_addresses_coupons.py`
- [x] `GET/POST /users/addresses`, `POST /coupons/validate`, admin create/list
- [ ] Profile → Manage addresses UI
- [ ] Admin panel coupon form

### P2 — Ops polish
- [ ] Enforce open hours on place order
- [ ] Hide fully unavailable categories
- [ ] Optional OSM map on tracking (no paid API)
- [ ] FCM push on status transitions

### P3 — Growth
- [ ] First-order auto-suggest coupon on checkout
- [ ] Multi-cart (Zomato) — deferred; keep Swiggy uni-cart

---

## 10. Files changed this pass

| File | Role |
|------|------|
| `CheckoutScreen.tsx` | Full checkout — address, COD/UPI, coupon, correct `/food/orders` body |
| `food/schemas.py` | `qty` alias, `coupon_code` |
| `0008_addresses_coupons.py` | DB tables |
| `backend_extras/addresses_router.py` | Saved addresses API |
| `backend_extras/coupons_router.py` | Validate + admin coupons |
| `main.py` | Include new routers |

### Deploy order
```bash
# Backend
cp 0008_addresses_coupons.py alembic/versions/
# copy addresses_router + coupons module
alembic upgrade head
# restart API

# Mobile
cp CheckoutScreen.tsx → src/modules/food/screens/
npx expo start -c
```

### Place-order payload (correct)
```json
{
  "restaurant_id": "uuid",
  "items": [{ "menu_item_id": "uuid", "quantity": 2, "option_ids": [] }],
  "delivery_address": {
    "line1": "12 MG Road",
    "city": "Jaipur",
    "state": "Rajasthan",
    "pincode": "302001"
  },
  "payment_method": "cod",
  "coupon_code": null
}
```
