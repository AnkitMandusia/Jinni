# Jinni — Phase 5: Technical Architecture Findings (superapp-mobile)

All OBSERVED — read directly from source files in E:\work\super\superapp-mobile\src.

## State management
- **Zustand** throughout, via two factory helpers in shared/store/useStore.ts:
  - `createStore` — plain store with devtools middleware only
  - `createPersistedStore` — adds `persist` middleware backed by AsyncStorage (custom
    storage adapter, JSON-serialized), a `partialize` step that strips transient fields
    (`isLoading`, `error`) from what gets persisted, and an `onRehydrateStorage` hook
  - Special case: the auth store's rehydration hook calls `setApiToken()` to warm the
    API client's in-memory token cache immediately on cold start, avoiding an
    AsyncStorage round-trip on the first request
- Per-module stores follow this same pattern consistently: `cartStore`, `groceryStore`,
  `orderStore`, `authStore`, `locationStore` all use one of the two factories
- Minor cleanup item (not urgent): `createPersistedStore` has several `console.log` debug
  statements left in (store creation, storage reads, rehydration status) — fine for dev,
  worth stripping or gating behind `__DEV__` before a release build

## Cart architecture
- **Single unified cart store** (`modules/cart/store/cartStore.ts`) shared across ALL
  verticals (food, grocery, cab, salon), not per-module carts. Each `CartItem` carries
  its own `moduleType` and `sourceId`/`sourceName` (restaurant or store).
- Cross-source conflict handling: `addItem()` returns `{ok: false, needsConfirm: true, ...}`
  if the cart already has items from a different restaurant/store IN THE SAME module type,
  requiring the caller to explicitly call `forceAddItem()` to replace that module's items.
  This is the single-cart equivalent of what many single-vertical apps (including, per
  Phase 1-4 evidence, likely Zepto) handle by just locking the cart to one store — Jinni's
  version is more general since it has to coexist with 3 other verticals in the same store.
- Per-module derived totals (`getFoodTotal`, `getGroceryTotal`) exist on the shared store
  rather than each module computing its own — keeps a single source of truth.

## API / networking layer
- Single Axios instance (`shared/services/api.ts`), REST only, base path `/api/v1` against
  a FastAPI-style backend (consistent with your profile: FastAPI/PostgreSQL backend).
- **Auth token handling**: in-memory `_tokenCache` warmed on login/refresh/rehydration,
  with AsyncStorage as fallback for cold-start before the store rehydrates. JWT validity
  is sanity-checked by segment count (3 dot-separated parts) before use.
- **401 handling**: response interceptor catches 401, attempts a refresh-token exchange
  exactly once (`_retry` flag guards against infinite loop), updates the in-memory cache
  before retrying the original request, and on refresh failure clears all auth storage
  and calls a registered `onAuthFailure` callback — this callback indirection avoids a
  circular import between api.ts and authStore.
- No request-level retry/backoff beyond the single 401-refresh retry; no offline request
  queue observed in this file (would need to check elsewhere if that's a requirement).

## Navigation
- **React Navigation** (native-stack). `RootNavigator` is role-based, not just
  authenticated-vs-not: it inspects `user.role` and `user.status` to route into one of
  FIVE distinct navigators — Auth, Main (customer), Admin, Store (store-owner), Partner
  (covers restaurant/delivery/cab_driver/salon roles with one shared navigator).
- This is architecturally distinct from Zepto: Zepto (per Phase 1 manifest findings) is a
  single-role consumer app; store and delivery-partner experiences are presumably separate
  apps/products. Jinni is ONE codebase serving customer + admin + store + all partner
  types, routed by role at the root. This is a significant design decision with real
  tradeoffs (single codebase to maintain and ship vs. bundle size / permission surface
  covering all roles in one build) worth being deliberate about rather than incidental.
- `isFullySetup` gates on `profile_complete` AND `role` being set, with a distinct
  `pending_approval` status screen — suggests partner/store roles go through a
  manual-approval step before activation, unlike customer signup.

## Module architecture
- Static module registry (`modules/moduleRegistry.ts`): food, grocery, cab, salon are
  all `enabled: true` RIGHT NOW — confirmed NOT dormant scaffolding. Jinni is actively a
  4-vertical super-app today, not grocery+food with extra folders. Worth flagging
  explicitly since it's broader than your original research brief's framing
  ("grocery-commerce and food-delivery application") — may be worth a scope conversation
  about whether cab/salon share your roadmap priority or are earlier-stage/parked work.
- Each module supplies a `HomeCard` component (home screen vertical switcher tile) and a
  `navigator` (its own stack) — consistent, pluggable pattern. Static imports are used
  deliberately ("Metro compatibility" per inline comment) rather than dynamic
  require/lazy-loading, which is a reasonable tradeoff for a 4-module app but would need
  revisiting if more verticals are added (bundle size grows linearly with every module,
  always included, never code-split).

## Order model (carried over from Phase 7 note, included here for completeness)
- Grocery orders use a "race-to-accept" broadcast model: order is placed generically via
  `POST /orders`, backend notifies nearby stores to accept — no store pre-selected by the
  customer at checkout. This is a deliberate architectural choice distinct from Zepto's
  single-resolved-dark-store model, with implications for Phase 5 serviceability-check
  design (per Phase 7 gap analysis): "is this address serviceable" in Jinni's model means
  "will any nearby store accept this", which is a different (harder) guarantee to give
  the customer upfront than Zepto's "this specific store will fulfill it."
