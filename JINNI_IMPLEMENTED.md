# Jinni — Implemented (Working Flow & Services)

**Last updated:** 2026-10-09  
**Stack cost target:** ≈ ₹0 variable AI (free path)  
**Zip:** `artifacts/jinni-superapp-updated.zip`

---

## 1. What is live today

| Area | Status | Notes |
|------|--------|--------|
| Center tab lamp (not bulb) | ✅ | `MagicLampIcon` Aladdin SVG |
| Jinni AI full screen | ✅ | `ChiragOverlay` modal |
| 3 wishes / day quota | ✅ | Backend + local status |
| Wish labels pehli / dusri / aakhri | ✅ | `jinniPhrases` + header pill |
| Fixed Chirag text lines | ✅ | No paid LLM |
| Jinni **voice (TTS)** | ✅ | `expo-speech` hi-IN |
| User **type** wish | ✅ | Text input + chips |
| User **mic STT** | ✅ | `expo-speech-recognition` (free, on-device, hi-IN→en-IN fallback). Needs a dev build — not Expo Go. |
| Keyword interpret | ✅ | Local catalog, one store/restaurant |
| Proposed items UI | ✅ | Qty ±, remove, Add to Cart |
| Add to Cart | ✅ | Unified cart store |
| Unified tab cart (Food + Grocery) | ✅ | Food-style banners + dual proceed |
| Food checkout → order → track | ✅ | Existing Food stack wiring |
| Grocery checkout | ✅ | Existing Grocery stack |
| Orders tab rider/restaurant | ✅ | Unchanged tracking timeline |
| Home / Splash / Login logo | ✅ | `JinniLogo` shared |
| Inter fonts | ✅ | `@expo-google-fonts/inter` |
| Chirag PNG assets map | ✅ | `jinniAssets.ts` + vector fallback |

---

## 2. Working flow (end-to-end)

```
User taps center lamp
        │
        ▼
[Quota check] ── exhausted (3/3) ──► no open (lamp exhausted style)
        │ has remaining
        ▼
POST /api/v1/jinni/session/start  (or local session id fallback)
        │
        ▼
ChiragOverlay opens
  scene: tap → summoning → arriving → listening
        │
        ▼
Chirag greets (text + TTS)
  used=0 → "pehli wish…"
  used=1 → "dusri wish…"
  used=2 → "aakhri wish…"
        │
        ▼
User types wish OR taps quick chip
  (empty mic = no-op; no fake "burger")
        │
        ▼
scene: thinking + TTS "Main dhoondh kar laata hoon…"
        │
        ▼
interpretService.interpretWish(text)
  • keyword rules
  • ONE restaurant OR Jinni Mart only
  • demo catalog items
        │
        ▼
scene: results
  ProposedItemsPanel
  • name, price, store/restaurant
  • qty − / +
  • remove
  • total
  • Add to Cart
        │
        ▼
confirmAddToCart
  • cartStore.addItem / forceAddItem (same module new source → replace)
  • POST /api/v1/jinni/session/complete
  • used++
  • success phrase TTS (pehli/dusri/aakhri puri)
  • scene: success → dismissing → idle
        │
        ▼
Tab Cart
  Food section  → Proceed food  → Food Checkout → POST /food/orders → OrderTracking
  Grocery section → Proceed grocery → GroceryCheckout → POST /orders
        │
        ▼
Orders tab — history + rider / restaurant status (existing wiring)
```

**Cancel before Add to Cart:** `POST /session/cancel` — wish count **does not** increase.

---

## 3. Frontend services

### `modules/jinni/services/jinniService.ts`
API client for session lifecycle.

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `getStatus()` | `GET /api/v1/jinni/status` | `{ used, limit, resets_at }` |
| `startSession()` | `POST /api/v1/jinni/session/start` | Reserve wish → `session_id` |
| `completeSession(id)` | `POST /api/v1/jinni/session/complete` | Commit wish after cart add |
| `cancelSession(id)` | `POST /api/v1/jinni/session/cancel` | Drop reserved wish |

### `modules/jinni/services/interpretService.ts`
**Free** intent + catalog match (no LLM).

- Detect: `food_search` | `grocery_search` | `order_status` | `unknown`
- Food: pick **single restaurant** with most keyword hits (never mix Spice Hub + Oven Story)
- Grocery: all from **Jinni Mart** one store
- Returns `ProposedItem[]` + fixed message string

### `modules/jinni/services/jinniPhrases.ts`
Fixed Hindi lines for:

- `greeting_1` / `greeting_2` / `greeting_3`
- `listening`, `thinking`, `found_items`, `partial_items`, `empty_items`
- `success_1` / `success_2` / `success_3`
- `exhausted`, `cancel`, `error`
- Helpers: `greetingKey(used)`, `successKey(usedAfter)`, `wishLabel()`, `QUICK_CHIPS`

### `modules/jinni/services/speakPhrase.ts`
TTS via **expo-speech** (`language: hi-IN`, fallback `en-IN`).

Called on: greeting, thinking, results message, success.

---

## 4. Frontend state & hooks

### `store/jinniStore.ts` (Zustand)
| Field / action | Role |
|----------------|------|
| `scene` | Chirag scene machine |
| `context` | tabBar / foodOrderWithJinni / homeNudge |
| `transcript` | chat bubbles |
| `wishStatus` | used / limit / resetsAt |
| `proposedItems` | results list |
| `lastMessage` | current Chirag line |
| `openSession` / `closeSession` / `setScene` | lifecycle |
| `updateItemQty` / `removeProposedItem` | results edit |

### `hooks/useJinniSession.ts`
Orchestrates open → submitWish → interpret → results → confirmAddToCart → success; speaks phrases; talks to cart store.

### `hooks/useChiragAnimationState.ts`
Entrance auto: `tap → summoning → arriving → listening`.  
Exit auto: `success → dismissing → idle`.  
**Does not** auto-advance listening/results (waits for user).

### `hooks/useWishStatus.ts`
Loads / refreshes quota from backend.

---

## 5. Frontend UI components

| Component | Role |
|-----------|------|
| `MagicLampIcon` | Aladdin lamp SVG (tab + headers) |
| `JinniLampButton` | Center tab button + exhausted state |
| `ChiragOverlay` | Full Jinni AI screen (chat + results + input) |
| `ChiragAnimationStage` | Smoke / glow / Chirag PNG + vector fallback |
| `ChiragGenieFigure` | Vector Chirag when PNG weak |
| `ChiragSmokeLayer` | Entrance smoke |
| `ChiragWaveform` | Listening bars |
| `ProposedItemsPanel` | “Yeh items mil gaye” cards |
| `WishCounterBadge` | 1/3 style badge |
| `JinniLogo` | Shared brand (Home, Splash, Login) |

### Related outside module
| File | Role |
|------|------|
| `cart/store/cartStore.ts` | Unified items + `sourceId` / `sourceName` / `moduleType`; `clearModule`; replace restaurant |
| `cart/screens/UnifiedCartScreen.tsx` | Tab cart: Food + Grocery sections, bill, dual proceed |
| `food/screens/CheckoutScreen.tsx` | Place food order + track; `clearModule('food')` |
| `grocery/screens/GroceryCheckoutScreen.tsx` | Place grocery order; `clearModule('grocery')` |
| `orders/screens/OrderHistoryScreen.tsx` | History + rider/restaurant timeline |
| `orders/components/OrderWishBanner.tsx` | Orders header → open Jinni |
| `home/components/LocationHeader.tsx` | Center `JinniLogo` |
| `auth/screens/SplashScreen.tsx` / `LoginScreen.tsx` | Branding |
| `shared/theme/jinniAssets.ts` | PNG registry |
| `shared/theme/jinni.ts` | Colors |
| `shared/theme/typography.ts` | Inter font families |

---

## 6. Backend services

**Router:** `superapp-backend/app/modules/jinni/router.py`  
**Prefix:** `/api/v1/jinni` (mounted in main app)

| Endpoint | Auth | Behavior |
|----------|------|----------|
| `GET /status` | yes | Daily used / limit (3) / resets_at |
| `POST /session/start` | yes | 429 if exhausted; returns `session_id` |
| `POST /session/complete` | yes | Increments used |
| `POST /session/cancel` | yes | Releases without increment |
| `POST /interpret` | yes | Optional API mirror of keyword catalog |

Quota is **in-memory per user** until a DB table migration is added.

---

## 7. Assets (your machine — not always inside zip)

Place under `superapp-mobile/assets/`:

```
chirag_idle.png
chirag_listening.png
chirag_thinking.png
chirag_success.png
hero_jinni.png
hero_jinni_carousel.png
order_wish_banner_bg.png
splash_lamp_glow.png
```

Mapped only via `src/shared/theme/jinniAssets.ts`.  
If PNG missing / weak → `ChiragGenieFigure` vector still shows.

---

## 8. Dependencies / env

### New npm deps
- `@expo-google-fonts/inter`
- `expo-speech`
- `expo-speech-recognition` (native module — needs a dev build, see below)

```bash
cd superapp-mobile && npm install
npx expo prebuild --clean
# Android:
npx expo run:android
# iOS:
npx expo run:ios
```

Mic STT (`expo-speech-recognition`) is a **native module** — it will not
work inside Expo Go. If you run `npx expo start -c` and open in Expo Go,
the mic button will gracefully say "Voice abhi is build me available nahi
hai" and fall back to typing, instead of doing nothing. Build a dev client
(`expo run:android` / `expo run:ios`, or an EAS dev build) to get real mic
input.

### Env
- **Mobile:** existing API base URL (no new Jinni-only env required for free path)
- **Backend:** existing auth; Jinni routes use same JWT

### App branding
- `app.json` name: **Jinni**, splash background `#FFFCF5`

---

## 9. Explicitly not implemented (by design)

| Item | Reason |
|------|--------|
| Cloud LLM (Gemini etc.) | Cost = 0 path |
| Device STT (real mic → text) | Needs native module / cloud STT |
| Pre-recorded MP3 voice bank | TTS covers free path; MP3 optional later |
| Auto place-order without cart confirm | Safety |
| Live menu/search API in interpret | Demo catalog; swap to real `/food` `/grocery` search later |
| Persistent DB wish quota | In-memory today |

---

## 10. How to test (smoke)

1. Login → center **lamp** (not bulb)
2. Hear/see pehli wish greeting
3. Type `doodh bread maggi` → Jinni Mart items only
4. Type `burger` → Spice Hub only
5. Qty / remove → **Add to Cart**
6. Cart tab → Food / Grocery sections + **Proceed food / grocery**
7. Complete checkout → Orders tracking (food)
8. 3 wishes then lamp refuses open
9. Cancel mid-listening → used count unchanged

---

## 11. Key file map

```
superapp-mobile/src/modules/jinni/
  types.ts
  store/jinniStore.ts
  hooks/useJinniSession.ts
  hooks/useChiragAnimationState.ts
  hooks/useWishStatus.ts
  services/jinniService.ts
  services/interpretService.ts
  services/jinniPhrases.ts
  services/speakPhrase.ts
  components/ChiragOverlay.tsx
  components/ProposedItemsPanel.tsx
  components/MagicLampIcon.tsx
  components/JinniLogo.tsx
  components/ChiragAnimationStage.tsx
  …

superapp-backend/app/modules/jinni/router.py
```

---

*This doc is the single source of “what is implemented” for Jinni free-stack E2E.*
