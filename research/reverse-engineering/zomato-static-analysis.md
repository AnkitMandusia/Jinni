# Zomato — Static Analysis (Phases 1 & 3 combined)

Source: zomato.apk, package `com.application.zomato`, extracted via plain ZIP extraction
(Python zipfile) + raw regex scan of AndroidManifest.xml (UTF-16LE string pool) and all
11 classes*.dex files (DEX type-descriptor strings). REA's JADX-based tools hit a hard
120-second timeout on this APK regardless of operation or heap size (documented, not a
config issue) — this analysis bypasses JADX entirely using a lighter method.

Confidence note: this is stronger evidence than the Zepto Hermes findings — these are
REAL class/package names parsed directly from DEX string pools (OBSERVED), not loose
string-table fragments. Still not full decompilation (no method bodies, no control flow),
but the namespace map below is a reliable first-party module inventory.

## Architecture (OBSERVED — this is the headline finding)
**Zomato is a fully native Android app (Kotlin), NOT React Native.** Zero Hermes bundle
or RN bridge artifacts found anywhere in the archive (checked explicitly — no
`index.android.bundle`, no `.bundle` files at all). 11 separate classes*.dex files,
35,181 first-party classes under `com.zomato.*`/`com.application.zomato.*`. This is the
single biggest architecture contrast with Zepto (React Native) found in this research.
A `com.zomato.kmm` namespace (156 classes) suggests Kotlin Multiplatform Mobile is used
for sharing some business logic with iOS, which is a different cross-platform strategy
than Zepto's full React Native approach.

## First-party module map (OBSERVED, by class count — top namespaces)
| Namespace | Classes | Inferred purpose |
|---|---|---|
| com.zomato.ui | 11,075 | UI component library (by far the largest — a full internal design system) |
| com.application.zomato | 9,790 | Main app module (screens, feature glue code) |
| com.zomato.android | 2,328 | Android platform integration layer |
| com.zomato.chatsdk | 1,709 | In-app chat (support and/or rider chat) — very large, a serious investment |
| com.zomato.crystal | 1,466 | UNKNOWN purpose by name alone — large enough to be a core module |
| com.zomato.cardKit | 1,452 | Card-based UI component system (distinct from cartkit — easy to confuse) |
| com.zomato.library | 952 | Shared utility library |
| com.zomato.dining | 737 | Dine-out / restaurant reservation vertical |
| com.zomato.restaurantkit | 657 | Restaurant discovery/listing/menu components |
| com.zomato.walletkit | 549 | Zomato Money wallet |
| com.zomato.customisation | 480 | Food item customization/add-ons at order time |
| com.zomato.gamification | 458 | Contests, streaks, engagement mechanics |
| com.zomato.sushi | 442 | Zomato's public design system (confirmed name, "Sushi" is publicly documented) |
| com.zomato.reviewsFeed | 422 | Review/rating feed |
| com.zomato.order | 396 | Order lifecycle |
| com.zomato.commons | 313 | Shared utilities |
| com.zomato.cartkit | 259 | Cart system (smaller than cardKit — don't conflate the two) |
| com.zomato.karma | 192 | UNKNOWN — likely a loyalty/engagement points system ("Zomato Karma") |
| com.zomato.zcommons | 188 | More shared utilities (naming suggests a rewrite/migration in progress) |
| com.zomato.kmm | 156 | Kotlin Multiplatform shared business logic (cross-platform with iOS) |
| com.zomato.zfekit | 153 | Likely "frontend experience kit" — possibly a server-driven UI layer, similar role to Zepto's LayoutEngine |
| com.zomato.zdatakit | 148 | Data layer / API client kit |
| com.zomato.loginkit | 115 | Auth |
| com.zomato.performance | 113 | Performance monitoring |
| com.zomato.notifications | 101 | Push notifications |

## Smaller but notable modules (OBSERVED)
| Namespace | Classes | Inferred purpose |
|---|---|---|
| com.zomato.argus / pulsemqtt / mqtt / livetelemetry | 69+69+32+62 | Real-time order/rider tracking infrastructure — MQTT-based live location (not just polling), "argus" (the many-eyed watcher) suggests a monitoring/telemetry layer |
| com.zomato.appupdate | 20 | In-app update prompts |
| com.zomato.district / districtkit | 15+3 | Zomato District — events/dining-out booking vertical (confirmed newer, smaller class count fits a newer product) |
| com.zomato.voiceassistant_core / voiceAssistant | 7+3 | A voice assistant feature exists — small class count suggests either early-stage or a thin wrapper around a larger SDK |
| com.zomato.photofilters | 10 | Photo filters, likely for review photo uploads |
| com.zomato.zimageloader | 24 | Custom image loading (alongside Coil, seen in manifest — possibly a wrapper) |

## Manifest findings (OBSERVED, via UTF-16LE string-pool scan — 710 strings, 54 permissions, 25 package-like identifiers)

### Permissions (selected, notable)
- Standard commerce: `INTERNET`, `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `CAMERA`, `RECORD_AUDIO`, `CALL_PHONE`, `GET_ACCOUNTS`, `VIBRATE`
- Auth: `USE_BIOMETRIC`, `USE_FINGERPRINT`, `USE_CREDENTIALS` — biometric login support
- **Health Connect integration**: `android.permission.health.WRITE_NUTRITION`,
  `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` — Zomato writes nutrition data to
  Android's Health Connect platform. Not something Zepto does (not observed in Zepto's
  manifest). Worth a product conversation: is calorie/nutrition tracking integration
  something Jinni's food vertical should consider, or explicitly skip for MVP?
  (INFERRED relevance, OBSERVED permission)
- Ad attribution: `ACCESS_ADSERVICES_AD_ID`, `ACCESS_ADSERVICES_TOPICS`,
  `ACCESS_ADSERVICES_CUSTOM_AUDIENCE`, `ACCESS_ADSERVICES_ATTRIBUTION` (Android 13+
  Privacy Sandbox, same pattern as Zepto)
- Notifications: `POST_NOTIFICATIONS`, `POST_PROMOTED_NOTIFICATIONS` (a promoted/priority
  notification channel — likely for live order-tracking notifications), `SCHEDULE_EXACT_ALARM`

### Package-level integrations (via package-visibility queries, OBSERVED)
- **`com.grofers.customerapp`** — this is Blinkit's OLD package name (Grofers rebranded
  to Blinkit after Zomato's acquisition). Confirms Zomato's app has direct integration
  with/awareness of Blinkit, consistent with Zomato's real-world multi-vertical strategy
  (food delivery + dining + grocery under one corporate umbrella, even if not fully merged
  into one app).
- **`com.carthero.driver`** — Zomato's own delivery-partner app (Carthero was an earlier
  Zomato logistics acquisition/brand). Confirms the partner-facing app is SEPARATE from
  the consumer app, unlike Jinni's single-codebase multi-role design (see
  jinni-technical-architecture.md) — this is the same "separate apps per role" pattern
  Zepto appears to use too, making Jinni's unified-app approach the outlier among all
  three, not the norm. Worth being aware of as a deliberate choice, not an accident.
- Payment: `net.one97.paytm` (Paytm app-based UPI), `com.samsung.android.spay` (Samsung
  Pay) — alongside whatever gateway SDK is in the main app (not yet identified without
  deeper DEX string scanning for payment SDK names)
- Social/login: Facebook SDK fully present (`com.facebook.CustomTabActivity`,
  `FacebookActivity`, App ID + Client Token meta-data keys) — Facebook login, not seen as
  prominently in Zepto's manifest (Zepto leaned on Truecaller/OTPLESS instead)
- `com.google.android.aicore` — Google's on-device AI Core (Gemini Nano access) is
  referenced. INFERRED: possibly powers the voice assistant module seen in the class
  namespace map, or an on-device recommendation/search feature. Unconfirmed without
  deeper analysis.

### Build flavor / sub-brand evidence (OBSERVED, via package suffix strings)
`com.application.zomato.default`, `.gold`, `.veg`, `.district`, `.appstart` — these look
like product-flavor or feature-flag identifiers tied to: Zomato Gold (membership tier),
a Pure-Veg mode, and District (events vertical), baked in at the package/build level
rather than purely server-side flags. INFERRED significance: these aren't just marketing
labels, they're build-system-level identifiers, suggesting real code branching exists for
at least Gold and Veg-mode as distinct configurations.

## Remaining blockers
- No method-level or control-flow analysis possible without JADX, which times out on
  this APK regardless of settings tried. Everything above is class/package name and
  manifest-string evidence, not verified call sites or screen navigation structure.
- `com.zomato.crystal` (1,466 classes, the 5th largest module) has no clear purpose from
  naming alone — flagged as UNKNOWN, worth deeper investigation if tooling allows later.
- `com.zomato.karma` purpose is inferred (loyalty/engagement) but not confirmed.
- No screen-inventory or workflow-mapping pass done yet for Zomato (would need either a
  working JADX run with more time, or the same raw-string approach applied per-DEX-file
  rather than just type descriptors — feasible as a follow-up).
