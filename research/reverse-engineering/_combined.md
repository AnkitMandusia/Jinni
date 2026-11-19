# Jinni Research Report


## Zepto, Zomato & Jinni — Competitive Analysis and Launch-Readiness Review


Generated 2026-10-25


---


<div style="page-break-before: always;"></div>


# Jinni Research — Executive Summary

Scope: Zepto static analysis (Zomato deferred per your instruction) + Jinni repository
audit, to inform Jinni's grocery-commerce architecture. All findings are read-only;
nothing in Jinni was modified.

## What was actually done
1. Zepto APK manifest + native-layer analysis (permissions, payment SDKs, auth SDKs,
   analytics/observability stack)
2. Zepto JS bundle identified as Hermes bytecode (v96); no disassembler available this
   session, so string-table-level evidence only (screen names, API hosts, feature flags,
   analytics events) — NOT verified code structure
3. Zepto screen inventory (~58 identifiers) and workflow mapping, both identifier-level
4. Jinni repo structural audit: module layout, then code-level verification of the
   grocery cart/checkout flow specifically, then architecture (state, API, navigation)
5. A first-pass gap analysis, corrected after code verification (two items originally
   flagged as "absent" turned out to be implemented)

## Confidence levels — read this before acting on anything below
- **Zepto findings: INFERRED**, not OBSERVED-and-verified. They're real strings pulled
  from compiled bytecode, but without a disassembler there's no confirmation of which
  screens actually call which APIs, what the real navigation graph looks like, or
  whether a feature is live vs. deprecated-but-still-referenced in the bundle.
- **Jinni findings: OBSERVED and code-verified** for grocery cart/checkout, cartStore,
  api.ts, useStore.ts, moduleRegistry.ts, and RootNavigator.tsx specifically. Other
  modules (food, cab, salon, orders detail, admin) were only verified at file-listing
  depth, not code-content depth — treat findings about them as directional only.

## Top findings that should actually change decisions

1. **Jinni's checkout is more complete than a surface scan suggested.** Coupons and a
   payment-method picker (COD/UPI with server-side verification) both already work.
   Don't rebuild these — the real gaps are narrower: serviceability pre-checking and
   structured OOS/substitution handling (currently a free-text note to the store).

2. **Jinni's order model is architecturally different from Zepto's, on purpose.**
   Zepto pre-resolves a single dark store by location before checkout. Jinni broadcasts
   orders to nearby stores to accept (race-to-accept). This isn't a gap to close — it's
   a different design that changes what "is this address serviceable" even means here.
   Any serviceability-check feature needs to be designed for Jinni's model, not copied
   from Zepto's.

3. **Jinni is one codebase serving five roles** (customer/admin/store/partner-shared),
   routed at the root navigator by user role and status. Zepto is consumer-only; its
   store/delivery-partner experiences are separate products. This is a real tradeoff
   (unified maintenance vs. bundle size and permission surface) worth being deliberate
   about as the app grows, not something to reassess by accident later.

4. **Cab and salon are live, not scaffolding.** `enabled: true` in the module registry,
   right now. If your near-term focus is genuinely grocery+food, worth an explicit
   decision about whether cab/salon get resourced too or stay parked — the code doesn't
   currently signal which.

5. **Zepto carries features outside grocery scope** (pharmacy with prescription
   upload/consent, electronics trade-in, festival campaign UI) — explicitly NOT
   recommended to replicate per your own instruction to design original architecture,
   not copy Zepto feature-for-feature.

## Remaining work (not yet done)
- Zomato analysis — deferred per your instruction, pick up later
- Deeper Jinni code verification for food/cab/salon modules (currently file-listing
  depth only)
- Phase 6 (Zepto-vs-Zomato comparison matrix) — blocked until Zomato is in scope
- Phase 8 remaining deliverables: jinni-proposed-architecture.md,
  jinni-data-models-and-api-proposals.md, implementation-roadmap.md,
  evidence-and-unknowns.md (a consolidated list of every UNKNOWN acronym/term —
  ZIC, NZS, POIA, OBD, PTP — flagged across the Zepto docs)

## Files produced this session (E:\work\super\research\reverse-engineering\)
- zepto-js-bundle-findings.md (Phase 2)
- zepto-screen-inventory.md (Phase 3)
- zepto-workflow-mapping.md (Phase 4)
- jinni-feature-gap-analysis.md (Phase 7, corrected after code verification)
- jinni-technical-architecture.md (Phase 5)
- executive-summary.md (this file)

Also on your local machine (not in the repo): zepto_bundle_strings*.json,
zepto_screen_events.json under C:\Users\Ankit\Downloads\jinni_plan\ — raw extraction
data behind the Zepto findings, kept outside the repo since it's Zepto's bytecode-derived
data, not Jinni's own content.




<div style="page-break-before: always;"></div>


# Zepto — Static Analysis (Phase 1: Manifest & Native Layer)

Source: com.zeptoconsumerapp.apk, version 26.9.3 (versionCode 760), min SDK 32 (Android
12), target SDK 35 (Android 15). Class count: 29,878. Resource count: 1,438.

## Architecture (OBSERVED)
React Native app. Native layer is ~390 first-party classes under `com.zeptoconsumerapp.*`
— almost entirely infrastructure/bridge modules (device APIs exposed to JS), not the
actual commerce UI, which lives in the Hermes JS bundle (see zepto-js-bundle-findings.md).
Single `MainActivity` (launchMode=singleTask) is the sole real entry point.

## Permissions (OBSERVED, notable)
- Location: ACCESS_FINE_LOCATION, ACCESS_COARSE_LOCATION
- Messaging/telephony: READ_SMS, RECEIVE_SMS, SEND_SMS, READ_PHONE_STATE,
  READ_BASIC_PHONE_STATE — OTP autofill
- Media: CAMERA, RECORD_AUDIO
- Contacts/profile: READ_CONTACTS, READ_PROFILE, GET_ACCOUNTS
- Push/analytics: POST_NOTIFICATIONS, FCM receive permission, AD_ID,
  ACCESS_ADSERVICES_* (Android 13+ Privacy Sandbox), DETECT_SCREEN_CAPTURE
- Storage/network: READ/WRITE_EXTERNAL_STORAGE, ACCESS_NETWORK_STATE,
  ACCESS_WIFI_STATE, CHANGE_NETWORK_STATE, DOWNLOAD_WITHOUT_NOTIFICATION
- Other: Truecaller SDK permission, Play Install Referrer binding, Samsung Maps Agent,
  Huawei AppMarket common-data permission, NFC, CHECK_LICENSE, FOREGROUND_SERVICE

## Package-visibility queries (OBSERVED, `<queries>` block)
- Payment deep-link schemes: upi://pay, upi://mandate, nb://pay, juspay://pay,
  credpay://checkout, Chrome Payment Request API actions (org.chromium.intent.action.PAY)
- Target packages: com.tatadigital.tcp (Tata Neu), com.google.android.apps.maps
- Auth: com.truecaller(+.debug), com.otpless.app
- Share targets: WhatsApp (+Business), Telegram, LINE, MiChat, Discord, Slack, Viber,
  Signal, BOTIM, Facebook, Instagram
- com.appsflyer.referrer.INSTALL_PROVIDER — AppsFlyer attribution confirmed
- in.amazon.mShop.android.shopping + Amazon auth actions — unresolved whether active
  integration or shared-dependency leftover

## Deep link / App Links (OBSERVED, autoVerify=true)
- https://{DeepLinkHost} (string resource, unresolved), https://store.zepto.co.in,
  https://s.zepto.co.in, https://www.zeptonow.com, https://www.zepto.com
- Custom scheme: zepto://zeptonow.com/app, zepto://zepto.com/app
- Two disabled activity-aliases (APP_ICON_CAMPAIGN_1/2) — seasonal icon-swap mechanism,
  same deep links, currently disabled

## Payments stack (OBSERVED)
- Juspay HyperSDK fully integrated: ProcessActivity, CustomtabActivity (scheme
  juspay://com.zeptoconsumerapp), RedirectResponseActivity (juspayexternalapp://),
  hypernfc.NfcActivity (NFC card payments), hypersmshandler.SmsRetrieverReceiver (OTP
  auto-read via Google's SMS Retriever API, not raw SMS permission)
- NPCI UPI PIN library: org.npci.upi.security.pinactivitycomponent
- Amazon Pay secondary integration: APayBrowserActivity, two RedirectUriReceiverActivity
  variants (scheme amzn://amazonpay.amazon.in/com.zeptoconsumerapp), AuthActivity,
  WorkflowActivity — appears India-focused in this evidence
- Google Sign-In present (SignInHubActivity, GoogleApiActivity)

## Auth (OBSERVED)
- Truecaller SDK with live partner key in meta-data — one-tap verification
- OTPLESS SDK (OtplessAutoReadZeroTapReceiver) — alternate passwordless auth
- WhatsAppOtpBroadcastReceiver (first-party) listens for com.whatsapp.otp.OTP_RETRIEVED
- Custom SharedAuthenticatorService via Android AccountAuthenticator framework — session
  persisted as an Android account, not just app-local storage

## Observability/analytics (OBSERVED)
- Firebase: Messaging (FCM), Crashlytics (collection DISABLED), Analytics (collection
  enabled, ad-personalization defaults true), Sessions
- Sentry present but auto-init=false, anr.enable=false — likely manually initialized in JS
- AppsFlyer (install-referrer query entry)
- Google AdMob fully wired (ad unit ID present) — unexpected for a grocery app, purpose
  unconfirmed (INFERRED: possibly in-app ad placements or a separate ad-funded feature)
- Chucker (HTTP inspector library) present and fully declared in this build — normally a
  debug-only library; flag as UNKNOWN whether this is a release or staging APK build

## Background work / lifecycle (OBSERVED)
- services.OrderCleanupService, services.GenericCleanupService,
  AppServiceStarter.api.OrderCleanupApiService, AppServiceStarter.api.POIACleanupApiService
  ("POIA" acronym unresolved — recurs elsewhere, likely a real internal system)
- Standard AndroidX WorkManager components for scheduled background jobs

## Location & storage (OBSERVED)
- ACCESS_FINE_LOCATION + ACCESS_COARSE_LOCATION, live Google Maps API key in meta-data
- requestLegacyExternalStorage=true, largeHeap=true (suggests heavy image/list rendering)

## Native-layer first-party module map (OBSERVED, ~390 classes under com.zeptoconsumerapp.*)
Almost entirely infra/bridge modules exposed to the JS layer, not business logic:
- Payments bridge: PaymentUPIHelper.* (NativePaymentUPIHelperModule)
- Auth/OTP: otpVerify.* (SmsOtpListener, WhatsappOtpListener), AutoLogin.*
  (SharedAccountAuthenticator, CredentialManagerModule, AutoBackupManager)
- Security/anti-fraud: attestation.* (PlayIntegrityHelper, KeystoreManager),
  rsa.RSAOAEPModule, WafIntegration.WafModule, securestorage.* (EncryptedMMKV,
  DEKManager, EncryptedDataStore)
- Session replay/gesture capture: ArkonGesture.* (ArkonGestureRecorder,
  ArkonGestureReplayer, ArkonTouchSurface) — INFERRED purpose: bug-repro or
  fraud/UX analytics tooling
- Location: FusedLocation.* — full wrapper exposed to RN
- Startup/perf: Startup.* (AppInitializer, AppPhoenixManager,
  StartupLaunchClassifier, LaunchTimingTracker), performancemode.* (adaptive
  perf mode by device/network/battery)
- Remote config: modules.configservice.* — "Phoenix" is Zepto's internal
  feature-flag/remote-config + hot-update system name
- API prefetching: apiprefetch.* (HomepageApiPrefetch, HaversineDistance) —
  confirms home-page content is prefetched using resolved-location distance
  before the home screen even renders
- Notifications: modules.notification.* — supports countdown-timer push (ETA/flash-sale
  urgency) and silent/data-only push for background sync
- Camera: zcamera.* — custom, not stock RN camera, purpose unconfirmed
- Gamification: gamification.scratchcard.*, SlotMachineTurbo.*
- Dynamic splash/icon: DynamicSplashScreen.*, DynamicAppIcon.*, AppShortcuts.*
- Networking infra: NetworkLogger.* (ApiSpooferController, ApiUrlRewriteInterceptor —
  suggests an internal QA/staging request-mocking capability), ZeptoDns
- Image pipeline: ZeptoImage.* (custom Fresco-based, ThumbHash placeholder decoding)
- Ads: GoogleAdsManager.* (banner + native ad formats actively wired into custom views)




<div style="page-break-before: always;"></div>


# Zepto JS Bundle — Phase 2 Findings (Hermes bytecode, static string extraction)

Source: assets/index.android.bundle, extracted from com.zeptoconsumerapp.apk (v26.9.3, build 760)
Method: raw printable-byte-run extraction (6-200 chars) from Hermes HBC file. NOT a disassembly —
no control flow, no function boundaries, no call graph recovered. Strings are concatenated without
reliable delimiters in this extraction method, so some entries below are two+ adjacent literals
run together (noted where relevant).

## Format identification (OBSERVED)
- Magic: 0x1F1903C103BC1FC6 (exact match to Hermes HBC magic constant)
- Bytecode version: 96
- File size: 15,836,084 bytes (~15.8 MB)
- Tooling gap: no Hermes disassembler (hbcdump/hermes-dec) available in this REA session.
  Only raw string-table-adjacent text was recovered, not instructions/control flow.

## Confirmed microservices / API gateway (OBSERVED, via literal URL strings)
- https://api-gateway.zepto.co.in/zepto-coins/api/... (loyalty "ZCoins" service)
- https://api-gateway.zepto.co.in/zerox-service/api/...
- https://api-gateway.zepto.co.in/recipe-service/api/...
- https://api-gateway.zepto.co.in/partner-integration-service/api/v2/pass/purchase...
- https://api-gateway.zepto.co.in/api/v1/pass/loyalty-trial-activate
- https://api-gateway.zepto.co.in/.../listing-api/reorder/...
- https://devspace.zeptonow.com/api (baseURL — likely internal/staging config string)
- v1/order/cart/recommended-upsell-banners
- /order/{orderId}/cancel-order-button (route/analytics id, not necessarily literal API path)
- zeptonow://... custom scheme routes: categorylist, commonproducts_, LayoutEngine?pageId=...
- www.zeptonow.com/Categories?categoryId=...&subCategoryId=... (web/deep-link category URLs)
- www.zeptonow.com/LayoutEngine?pageId=PAGE_IN_PAGE&layoutId=... (server-driven UI / widget layout system)
- www.zeptonow.com/CustomerSupport, /Orders, /pn/, /ActiveConversationsRepositoryInstanceProvider
- www.zeptonow.com/app-privacy-policy

## First-party feature areas (OBSERVED via identifier strings)
- **Zepto Cash** — wallet system: "Add Money to Zepto Cash", "ZeptoCashSuccessDescription",
  "PAY_VIA_ZEPTO_WALLET", "useZeptoCashPaymentStatus", cash-expiry warnings
- **Zepto Coins (ZCoins)** — loyalty/rewards currency, separate from Zepto Cash: ZCoinsHistory,
  ZCoinsReferralContactFilter, ZCoinsMaxLimitModalInCart, ZCoinsEmptyState/ErrorState,
  COINS_SUMMARY, coins_earned_in_this_cart
- **Zepto Cafe** — a separate vertical/sub-app inside the same bundle ("Zepto CafeMenuFAB",
  cafe-related chat bot strings) — UNKNOWN scope, flagging for a Jinni scope discussion since
  Zepto itself has grown a 3rd vertical beyond pure grocery
- **BNPL / Paylater** — "ZeptoPaylaterRepaymentWidget", EMI references, COD_HANDLING_FEE
- **Gift cards & vouchers** — giftCardTncList, DIGITAL_VOUCHERS_HISTORY, redeem voucher code
- **Loyalty Pass / membership** — "Add Loyalty Pass to Cart", loyalty_pass_add_to_cart_ptp_migration
- **Cart system** — CartBuilderPip (bottomsheet, likely min-order-value nudge), cart gifting slice,
  cart campaign slice, bulk update cart, swap-and-save substitution for OOS items, "Some items in
  your cart are [unavailable]", tobacco_sale_blocked (age-restricted item handling)
- **Rider/delivery tracking** — lastRiderLocationPress, rider_to_customer_eta, DeliveryBrandFunded,
  DeliveryPromiseNotInformed
- **AI chat bot** — i_chat_bot_add_to_cart_clicked, ChatBotResetConfirmation — in-app assistant
  that can add items to cart directly
- **Scheduled / future delivery** — "select Future Timestamp", pickupTimeSelector
- **Address management** — AddAddressButton, ChangeAddress, AddressAutoFill, isCartAddressTooltipShown
- **Referral program** — referralActionHandler, isUserEligibleForFeatured, ReferralContactFilter
- **Price comparison / "PCA" widgets** — PCA_BANNER_VIEWED_V2, PCA_CARD_FULL_SCREEN_V2,
  "Non-Member Price with Zepto Now" — INFERRED: a competitor/market price-comparison nudge
- **Security** — AWS_WAF_DOMAIN string present, isWafTokenA[vailable] — confirms the WafModule
  seen in the native layer talks to an AWS WAF-fronted endpoint

## Payments (OBSERVED, consistent with native-layer findings)
- Deep Juspay integration confirmed in strings: JUSPAY_ZEPTOUPI_ON_CLICK, JUSPAY_ZEPTOUPI_PAY_ENDED,
  JUSPAY_ZEPTOUPI_WALLET_SELECTED, juspay_bank_selected
- UPI outage handling: ZEPTOUPI_OUTAGE_INFO
- Firebase Analytics payment events confirmed: firebase.analytics().logAddToCart,
  firebase.analytics().logBeginCheckout
- CARD_BIN_VERIFICATION, SAVE_SECURE_MODAL (saved card tokenization flow)
- CHECK_BALANCE_CLICKED/FAILED (wallet/gift card balance check)

## Analytics/event naming convention (OBSERVED)
Two event-naming styles coexist in this bundle:
- snake_case lifecycle events: screen_viewed_cancelled_order_pop_up, payment_cancelled_by_user,
  i_chat_bot_add_to_cart_clicked, coins_earned_in_this_cart_added_product
- SCREAMING_SNAKE_CASE UI/analytics constants: CATEGORY_PAGE_BANNER_CLICKED,
  CHECKOUT_WITH_ZEPTO_NOW_CLICKED, WALLET_FAQ_CLICKED_V2, TRACK_ORDER_BUTTON_CLICKED

## Remaining blockers (per scope)
- Hermes bytecode cannot be disassembled with tools available in this session — no function
  boundaries, no control flow, no reliable per-string delimiters recovered.
- Cannot produce a clean screen-by-screen inventory or navigation graph from this bundle with
  current tooling. Everything above is identifier/string-level evidence only, not structural.
- Zepto Cafe appears to be a 3rd vertical bundled into the same app — scope question for Jinni,
  not investigated further here (out of stated grocery+food-delivery scope for this research pass).




<div style="page-break-before: always;"></div>


# Zepto — Phase 3: Screen Inventory (identifier-level, NOT code-level)

## Method & confidence caveat (OBSERVED methodology, read first)
Extracted via regex `SCREEN_VIEWE?D_[A-Z0-9_]+` directly against the Hermes bytecode's raw text.
Hermes packs string-table entries back-to-back with NO delimiter in this raw-byte view, so many
matches "bleed" into the next adjacent constant (e.g. `SCREEN_VIEWED_CART_PAGE_KEY` + the next
string `SCREEN_VIEWED_HOME_PAGE...` show up concatenated). The list below is manually cleaned to
the real left-hand token where the boundary is unambiguous (usually at `_PAGE`, `_BS`, `_MODAL`,
or a clear second `SCREEN_VIEWED_` prefix). Treat each entry as INFERRED to be a real analytics
screen-view event name; none of this is confirmed against actual navigation/route code, since no
Hermes disassembler was available to recover the call sites that fire these events (see Phase 2
findings doc for the tooling gap). This is the best available substitute for a route-level
screen inventory without that tooling.

Total raw SCREEN_VIEWED_* matches: 90. Cleaned to ~58 distinct screen identifiers below,
grouped by feature area (grouping is INFERRED from the name, not from code structure).

## Home / discovery
- SCREEN_VIEWED_WELCOME_HOME_ETA_REFRESH_CARD_INFO — home page, ETA refresh card
- SCREEN_VIEWED_LAYOUT_ENGINE_PAGE — server-driven home/category layout renderer
- SCREEN_VIEWED_TRENDING
- SCREEN_VIEWED_CATEGORY (bled suffix) — category listing
- SCREEN_VIEWED_SUBCATEGORY (bar/nudge)
- SCREEN_VIEWED_BRAND_SEARCH_PAGE
- SCREEN_VIEWED_TAB_PAGE / SCREEN_VIEWED_PILL_TAB_PAGE
- SCREEN_VIEWED_UGC_CONTENT_PAGE — user-generated content feed

## Product / PDP
- SCREEN_VIEWED_PRODUCT_DETAILS_PAGE
- SCREEN_VIEWED_PRODUCT_RATING_PAGE
- SCREEN_VIEWED_SIMILAR_PRODUCTS (bottom sheet)
- SCREEN_VIEWED_SHOPPING_LIST_PAGE / SHOPPING_LIST_ITEM_PAGE

## Cart / checkout
- SCREEN_VIEWED_CART_PAGE
- SCREEN_VIEWED_COUPON_BS (bottom sheet)
- SCREEN_VIEWED_PARTIAL_OOS_BOTTOM_SHEET — partial out-of-stock handling screen
- SCREEN_VIEWED_UNSERVICEABLE_STORE — serviceability failure screen

## Payments
- SCREEN_VIEWED_PAYMENT_PAGE
- SCREEN_VIEWED_PAYMENT_PROCESSING_INSTRUCTION
- SCREEN_VIEWED_PAYMENT_FAILURE
- SCREEN_VIEWED_PAYMENT_DOUBLE_CONFIRMATION_CANCEL_AUTOPAY
- SCREEN_VIEWED_PAY_WITH_EMI_BS
- SCREEN_VIEWED_ADD_NEW_CARD
- SCREEN_VIEWED_UPI_COLLECT_APPROVAL
- SCREEN_VIEWED_NO_COST_EMI_INFO

## Address
- SCREEN_VIEWED_ADD_ADDRESS_V2
- SCREEN_VIEWED_ADDRESS_ALREADY_SAVED (bled; address edit/selection flow)
- SCREEN_VIEWED_ACCOUNT_SETTINGS_ADDRESSES_NEW_LOCATION_PIN

## Orders
- SCREEN_VIEWED_ORDER_TRACKING_PAGE
- SCREEN_VIEWED_ORDERS_LIST
- SCREEN_VIEWED_CONFIRMING_ORDER_CONFIRMED_PAGE
- SCREEN_VIEWED_ORDER_CANCELLATION_BS
- SCREEN_VIEWED_CANCELLED_ORDER_POPUP
- SCREEN_VIEWED_ORDER_RATING_PAGE_V2 / ORDER_RATING_MODAL

## Auth / account
- SCREEN_VIEWED_SIGNUP_PAGE
- SCREEN_VIEWED_LOGIN_EVENT (sampling)
- SCREEN_VIEWED_VERIFY_OTP
- SCREEN_VIEWED_OTP_SAMPLE_BOTTOM_SHEET
- SCREEN_VIEWED_ACCOUNT_SUSPENDED
- SCREEN_VIEWED_ZEPTO_POLICY

## Loyalty / wallet / rewards
- SCREEN_VIEWED_ZCOINS_PAGE / ZCOINS_LEDGER_PAGE
- SCREEN_VIEWED_ZEPTO_CASH_ACTIVITY
- SCREEN_VIEWED_LOYALTY_PASS_PAGE
- SCREEN_VIEWED_REFERRALS_PAGE / REFERRAL_SIGNUP_PAGE / REFERRAL_EVENTS_PAGE / REFERRAL_CONTACT_LIST_PAGE
- SCREEN_VIEWED_GIFT_CARD_REDEMPTION_DETAILS_ENTRY_PAGE
- SCREEN_VIEWED_REDEEM_VOUCHER_FAILED / VOUCHER_DETAILS_PAGE
- SCREEN_VIEWED_SUPER_SAVER_HOME / ULTRA_SAVER_HOME_ENTRY_PAGE — subscription-tier landing pages

## Exchange / trade-in (a feature NOT in your original Zepto scope assumptions — flag for review)
- SCREEN_VIEWED_EXCHANGE_PAGE, EXCHANGE_SUMMARY_PAGE, EXCHANGE_IMEI_PAGE,
  EXCHANGE_DEVICE_CONDITION_PAGE, EXCHANGE_VARIENT_DETAILS_PAGE
  INFERRED: an electronics/device trade-in flow (IMEI capture implies phones/electronics),
  likely tied to a specific Zepto category expansion, not core grocery. Flag as out-of-scope
  for Jinni unless you want it.

## Support / misc
- SCREEN_VIEWED_CUSTOMER_SUPPORT_FAQ / FAQ_LIST_PAGE / FAQ_DETAILS_CHANNEL
- SCREEN_VIEWED_WEBVIEW_PAGE — generic WebView container (for web-rendered content/promos)
- SCREEN_VIEWED_RAKHI_MSG_SENDER_PAGE — festival-specific feature (Raksha Bandhan gifting)
- SCREEN_VIEWED_IPL_25_SKIP_BOWLING_BOTTOM_SHEET — IPL cricket season gamification tie-in
- SCREEN_VIEWED_POIA_PAGE — acronym unresolved (see Phase 1 native-layer notes, same unknown)

## Also extracted but not detailed here (saved in zepto_screen_events.json on this machine)
- 66 distinct BOTTOM_SHEET/MODAL-related view/open/click events
- 266 distinct *_CLICKED analytics events (first 400 captured, truncated at that cap)




<div style="page-break-before: always;"></div>


# Zepto — Phase 4: Workflow Mapping (identifier-level, same caveats as Phase 3)

Built by cross-referencing screen-inventory tokens with BOTTOM_SHEET/MODAL and *_CLICKED event
names recovered from the same Hermes string-table scan. Same confidence caveat as Phase 3 applies:
INFERRED screen/flow structure from event-name co-occurrence, not from verified navigation code.

## Grocery checkout — happy path (INFERRED sequence from token names)
Home (SCREEN_VIEWED_WELCOME_HOME) -> Category/Search (SCREEN_VIEWED_CATEGORY /
SCREEN_VIEWED_BRAND_SEARCH_PAGE) -> PDP (SCREEN_VIEWED_PRODUCT_DETAILS_PAGE) -> Add to cart
(ADD_ADDRESS/ATC events) -> Cart (SCREEN_VIEWED_CART_PAGE) -> Coupon bottom sheet
(SCREEN_VIEWED_COUPON_BS, SHOW_COUPON_DETAILS_BOTTOMSHEET) -> Address select/add
(SCREEN_VIEWED_ADD_ADDRESS_V2, SET_ADDRESS_CTA_CLICKED_ON_PTP_BS) -> Payment page
(SCREEN_VIEWED_PAYMENT_PAGE) -> Payment method selection (JUSPAY_UPI_APPS_BOTTOMSHEET_VIEWED,
SHOW_EMI_SELECTION_BOTTOMSHEET_VIEWED, PAY_COD_ZIC_BUTTON_CLICKED, PAY_ONLINE_ZIC_BUTTON_CLICKED) ->
Order confirmed (SCREEN_VIEWED_CONFIRMING_ORDER_CONFIRMED_PAGE) -> Order tracking
(SCREEN_VIEWED_ORDER_TRACKING_PAGE).

Note: "ZIC" prefix (PAY_COD_ZIC_BUTTON_CLICKED, ZIC_PLACE_ORDER_BUTTON_CLICKED,
ZIC_CANCEL_ORDER_BUTTON_CLICKED, ZIC_INSTANT_ORDER_BOTTOM_SHEET) is UNKNOWN acronym — likely
"Zepto Instant Checkout" given co-occurrence with place/cancel order actions, but unconfirmed.

## Failure / alternate branches (OBSERVED token names, INFERRED grouping)
- **Out of stock**: SCREEN_VIEWED_PARTIAL_OOS_BOTTOM_SHEET, RECOMMENDED_SWAP_AND_SAVE_BUTTON_CLICKED
  -> substitution flow exists for partially unavailable carts
- **Unserviceable address**: SCREEN_VIEWED_UNSERVICEABLE_STORE, ADDRESS_SERVICE_UNAVAILABLE
- **Payment failure**: SHOW_PAYMENT_FAILED_BOTTOMSHEET_CLICKED, PAYMENT_RETRY_DENIED/FAILED,
  SHOW_PAYMENT_RETRY_MODAL_V2, PAYMENT_RETRY_SELECTED -> explicit retry flow with its own modal
- **Order cancellation**: SCREEN_VIEWED_ORDER_CANCELLATION_BS, SCREEN_VIEWED_CANCELLED_ORDER_POPUP,
  COD_CANCEL_BUTTON_CLICKED, CANCEL_PAYMENT_CONFIRMATION_BOTTOMSHEET
- **Refunds**: REFUND_BOTTOMSHEET_VIEWED, REFUND_PROCESSED, REFUND_STATUS_WIDGET,
  FACING_ISSUES_WITH_YOUR_REFUND_BOTTOMSHEET

## Other confirmed sub-flows (OBSERVED tokens)
- **Pharmacy vertical**: PHARMA_CONSENT_BOTTOMSHEET_VIEWED, PHARMA_CONSENT_ACCEPTED,
  PRESCRIPTION_UPLOAD_BOTTOM_SHEET_VIEWED, PRESCRIPTION_VERIFICATION_INFO_BS_VIEWED,
  PRESCRIPTION_UPLOADING_FAILED -> a prescription-upload-and-consent flow exists, implying Zepto
  sells pharmacy items requiring Rx verification. Not in your original grocery-only scope — flag
  for a Jinni scope decision same as the Exchange/trade-in flow in Phase 3.
- **Truecaller one-tap auth**: TRUECALLER_BOTTOM_SHEET_VIEWED, SHOW_AUTO_LOGIN_MODAL_CTA_CLICKED
  (consistent with native-layer Truecaller SDK found in Phase 1)
- **BNPL / Paylater**: SHOW_BNPL_PTP_BOTTOMSHEET (confirms Phase 2 finding)
- **Gamification/campaigns**: SHOW_COLOSSEUM_BOTTOMSHEET_CAMPAIGN_CTA_CLICKED (an internal
  campaign system named "Colosseum"), IPL_25_SKIP_BOWLING_BOTTOM_SHEET (seasonal cricket tie-in),
  NZS_OFFER_STORE_BOTTOMSHEET_VIEWED / NZS_PRODUCT_BOTTOMSHEET (NZS acronym UNKNOWN)
- **Rate & review**: BEST_OFFER_FIRST_COLOR + ORDER_RATING_BOTTOM_SHEET_VIEWED, RNR_TOAST_VARIANT
  (RNR = "Rate aNd Review", a common internal abbreviation)
- **PIP (Picture-in-Picture) video**: PIP_VIDEO_VIEWED, PIP_FULLSCREEN_CLICK, PIP_MUTE_CLICK,
  PIP_DISMISSED -> shoppable video content with PiP playback, likely in PDP or home feed
- **Address sharing**: HANDLE_QR_SHARE_ADDRESS_CLICKED, URL_GET_FORMATTED_ADDRESS_CHANGE -> QR
  code-based address sharing (e.g. sharing delivery location with another person)

## Remaining blockers (unchanged from Phase 2/3)
- No Hermes disassembler available; all of the above is event-name/string evidence, not verified
  control flow or component structure.
- Several acronyms remain UNKNOWN: ZIC, NZS, POIA, OBD, PTP — these recur across cart, payment,
  and nudge contexts enough to be real internal systems, but their exact meaning can't be
  determined from strings alone.




<div style="page-break-before: always;"></div>


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




<div style="page-break-before: always;"></div>


# Zomato — Screen Inventory & Workflow Mapping (Phases 3 & 4 combined)

Method: raw string-literal extraction from all 11 classes*.dex files (same technique as
the Zepto Hermes scan — printable byte runs, 6-120 chars). Stronger than the Zepto pass
in one respect: Fragment/Activity CLASS NAMES are real, structurally-confirmed Android
component names (OBSERVED), not just loose analytics-event strings. Workflow grouping
below is still INFERRED from name co-occurrence, not verified navigation code.

## Architecture-defining discovery: "O2" cart (OBSERVED)
Food-ordering cart/checkout events are consistently prefixed `O2_` or `O2` (O2CartPageLoaded,
O2CartCheckoutButtonTapped, O2_Place_Order_Tapped, O2CartPromoApplied, O2OrderPlaced, etc.) —
INFERRED to mean "Order Online", Zomato's internal name for its core food-delivery cart,
distinct from `Delivery_Cart`/`DeliveryCartCheckout` (possibly an older/alternate naming
generation) and `ZWalletCartFragment`/`ZomatoPayV3CartFragment` (payment-specific cart
views). Multiple cart naming generations coexisting (`O2`, `Generic`, `Delivery_`,
`Crystal...Order...`) suggests this codebase has been through several rewrites — a
realistic signal for a 10+ year old app, not a design to copy.

## Core food-delivery screens (OBSERVED class names)
- Home: HomeActivity
- Restaurant page / menu: CrystalFragment, CrystalTopFragment, CrystalMapFragment,
  ResPageV2Fragment, MenuFragment, MenuSearchFragment, MenuCombosFragment,
  MenuCustomizationFragment, MenuStoriesFragment (Instagram-style story format for menus)
- Search/discovery: SearchV14Fragment, SearchV14AutoSuggestFragment,
  SearchV14BottomSheetFragment, SearchListFragment, AutoSuggestionTabsFragment,
  V2FiltersBottomSheetFragment, V3FiltersBottomSheetFragment
- Cart/checkout: O2CartFragment, GenericCartFragment, CartFullPageFragment,
  CatalogCartFragment, ChangeCustomizationFragment, CartChangeCustomizationFragment,
  EditCustomizationsCartFragment, RepeatCustomisationFragment
- OOS handling: CartOosRecommendationFragment (direct parallel to Zepto's
  SWAP_AND_SAVE / PARTIAL_OOS_BOTTOM_SHEET — same product problem, same solution shape)
- Order lifecycle: GenericOrderHistoryFragment, PostOrderCartFragment,
  OrderSchedulingSelectorFragment, OrderForSomeOneFragment (order as a gift to someone else)
- Group ordering: GroupOrderFragment, ParticipantInfoFragment, CreateGroupOrderBottomsheet,
  GroupOrderingMenu — a full multi-participant group-order feature, NOT present in
  anything observed from Zepto (grocery doesn't typically need this; worth considering
  for Jinni's food vertical specifically, not grocery)

## Payments (OBSERVED)
- PaymentOptionsFragment, CardCVVFragment, NoCvvFragment, OTPVerificationFragment,
  PhoneVerificationFragment
- Dedicated `zpay.zomato.com` subdomain (own payment product, "ZomatoPay")
- Amazon Pay integration confirmed across regional endpoints (amazon.in, .com, .co.uk,
  .co.jp, sandbox) — broader regional payment coverage than Zepto showed (Zepto's Amazon
  Pay integration appeared India-only)
- ZWalletCartFragment, ZWalletDashboardFragment, ZomatoMoneyIntroPageFragment,
  ZomatoMoneyLandingPageFragment — wallet UI confirmed (matches walletkit namespace from
  the class-count table)
- ZCreditsTapped (event name) — a SEPARATE currency from Zomato Money wallet; Zomato
  appears to run two parallel internal-currency systems (Money = wallet, Credits = likely
  promotional/refund credit) — worth noting as a complexity trap to avoid if Jinni adds
  its own wallet: pick ONE internal currency model, not two overlapping ones.
- PremiumCheckoutFragment — a distinct checkout path for Gold/Pro members (OBSERVED
  naming pattern, not confirmed what's actually different about it)

## Loyalty / membership / gamification (OBSERVED)
- Gold (current): GoldFaqFragment, GoldFullPageFragment, GoldPlanBottomSheetFragment,
  GoldPlanPageV15Fragment, GoldThankYouFragment, GoldCartPageOpen,
  GoldCartPlaceOrderSuccess/Failed
- Pro (older/parallel branding?): ProMembershipRefundFragment, ProPlanPageV2Fragment —
  co-existing with Gold naming suggests a rebrand in progress or regional variation,
  UNKNOWN which is current
- PremiumReferralFragment, ReferralFragment, ReferralScratchCardFragment, ScratchCardFragment
  — same scratch-card gamification pattern observed in Zepto, likely an industry-standard
  pattern worth adopting rather than something uniquely Zomato
- Gamification suite: TriviaFragment, LeaderBoardFragment, EasterGameFragment (seasonal,
  same pattern as Zepto's IPL/Rakhi tie-ins), HCGamePlayFragment, HCLobbyFragment,
  HCRoomFragment, HCTeamSelectionFragment, HCRewardsFragment (team-based multiplayer
  game — acronym unresolved, UNKNOWN), ZPLMatchFragment/ZPLWebFragment (likely "Zomato
  Premier League", a branded cricket-season engagement campaign)
- ZomatoAwardsFragment, ZomatoAwardsResPageFragment — annual restaurant awards feature,
  marketing/content, not core commerce

## Dine-out / District vertical (OBSERVED)
- DiningMapsFragment, DiningOfferWallFragment, DiningSearchV14Fragment,
  DinePaymentStatusFragment, TrBookingFragment (table reservation booking),
  CrystalMultiOrderBottomSheet, PayBillCartFragment, ProxyBillingActivity, O2CartFragment
  sibling O2-prefixed-but-dine-related events — a full in-restaurant "pay the bill"
  feature exists (scan QR at table, pay through app) distinct from delivery ordering

## Niche / vertical-specific features (OBSERVED, explicitly flagging as likely OUT of
## scope for a grocery+food-delivery app — same treatment as Zepto's pharmacy/exchange)
- TrainOrderingFragment, TrainOrderingSearchFragment — food delivery to train
  passengers/stations (a real, publicly known Zomato feature)
- HighwayListingFragment, HighwayOnboardingFragment — food ordering for highway travelers
- winecellar.zomato.com (alcohol delivery vertical, confirmed via URL string)
- FeedingIndiaCartFragment — charity donation add-on at checkout (low complexity if
  Jinni wants a CSR touch, otherwise skip)
- GiftCard* (6+ fragments: Balance, Claim, Customisation, Dashboard, LandingPage,
  OrderHistory, OrderSummary) — a full gift-card product, more developed than Zepto's
  single giftCardTncList string suggested

## Infra/support (OBSERVED)
- ChatSDKMainActivity, ChatMainWindowFragment, ChatGenericBottomSheetFragment,
  AIBotLandingFragment, AiChatBotLandingFragment, AudioInputBottomSheetFragment (voice
  input to the chat bot) — the 1,709-class chatsdk namespace maps to a very complete
  in-app support chat with AI bot + voice input, more developed than Zepto's single
  chat-bot-add-to-cart event suggested
- AppBlockerWebViewDialogFragment, NotificationBlockerFragment, BlockerFragment — a
  force-update/maintenance-mode blocking pattern (shows a WebView blocking the app)
- IdProofFragment — ID verification, likely for age-restricted items (alcohol, matches
  the winecellar vertical)
- SBMDIntroPageFragment, SBMDTransactionsFragment — UNKNOWN acronym, unresolved

## Remaining unknowns (UNKNOWN, flagged honestly rather than guessed)
- ZFE (ZFEDashboardFragment, ZFEOnboardingFragment) — possibly a B2B/enterprise ordering
  product given "Dashboard"+"Onboarding" shape, unconfirmed
- MFO_Cart, CSAO (CSAORail, CSAOItem) — acronyms, likely internal shorthand, unresolved
- com.zomato.crystal as a NAMESPACE is now understood (restaurant/menu page module,
  confirmed via CrystalFragment/CrystalTopFragment/CrystalMapFragment), but SBMD and HC
  remain unresolved
- com.zomato.karma — still unresolved; no class names in this scan clarify it further




<div style="page-break-before: always;"></div>


# Zepto vs Zomato — Comparison Matrix (Phase 6)

Built entirely from this session's own findings (zepto-js-bundle-findings.md,
zepto-screen-inventory.md, zepto-workflow-mapping.md, zomato-static-analysis.md,
zomato-screen-inventory.md). Confidence differs by side: Zepto evidence is
string-table-level (INFERRED structure), Zomato evidence is class-name-level
(OBSERVED structure, INFERRED grouping) — Zomato evidence is generally the stronger
of the two, see each source doc for specifics.

## Core architecture
| Dimension | Zepto | Zomato |
|---|---|---|
| Platform | React Native (Hermes bytecode v96) | Fully native Android (Kotlin), 11 DEX files, 35k+ classes |
| Cross-platform strategy | Single RN codebase for iOS/Android | Kotlin Multiplatform Mobile (kmm namespace, 156 classes) shares some logic with iOS; rest is platform-native |
| App roles | Single consumer app (store/rider apps inferred separate, not directly observed) | Consumer app confirmed separate from delivery-partner app (`com.carthero.driver` seen in package-visibility queries) |
| Internal design system | Not clearly named in evidence | "Sushi" (442 classes) — publicly documented Zomato design system |
| Server-driven UI | "LayoutEngine" (confirmed via deep-link URLs, `LayoutEngine?pageId=...`) | "ZFE" (zfekit, 153 classes) — likely analogous, unconfirmed purpose |

## Cart & checkout
| Dimension | Zepto | Zomato |
|---|---|---|
| Cart model | Single store/dark-store cart, store pre-resolved by location before checkout | "O2" cart for delivery, separate dine-out bill-pay cart, separate Gold-purchase cart — several parallel cart systems for different contexts |
| OOS/substitution | SWAP_AND_SAVE, PARTIAL_OOS_BOTTOM_SHEET | CartOosRecommendationFragment — same underlying problem (grocery/restaurant item unavailable), same solved pattern independently in both apps — worth treating as a genuinely standard pattern to build for Jinni, not optional |
| Coupons/promos | SCREEN_VIEWED_COUPON_BS, MANUAL_COUPON_BOTTOMSHEET | O2CartPromoApplied, O2CartPromoRemoved, OfferItemSelectionSheetFragment |
| Group/shared ordering | Not observed | GroupOrderFragment, ParticipantInfoFragment, CreateGroupOrderBottomsheet — food-delivery-specific, no grocery equivalent observed in either app |
| Scheduled orders | pickupTimeSelector, selectFutureTimestamp | OrderSchedulingSelectorFragment |
| Gift cards | Single string reference only (giftCardTncList) — limited evidence of a full product | 6+ dedicated screens (Balance/Claim/Customisation/Dashboard/LandingPage/OrderHistory/OrderSummary) — clearly the more developed gift-card product of the two |

## Payments
| Dimension | Zepto | Zomato |
|---|---|---|
| Primary gateway/SDK | Juspay HyperSDK (deeply integrated: UPI, NFC, bank selection, OTP auto-read) | Own "ZomatoPay" (dedicated zpay.zomato.com subdomain) — gateway SDK name not identified in this pass |
| Secondary payment | Amazon Pay (India-focused, single region observed) | Amazon Pay across multiple regions (IN, US, UK, JP, sandbox) — broader regional coverage observed |
| Wallet | Zepto Cash (single wallet currency) | TWO parallel systems: Zomato Money (wallet) + Zomato Credits (separate currency) — a complexity trap, not a pattern to copy |
| BNPL/EMI | ZeptoPaylaterRepaymentWidget, PAY_WITH_EMI_BS, NO_COST_EMI | Not observed in this pass (doesn't mean absent — just not surfaced by this extraction method) |
| Saved cards | SAVE_SECURE_MODAL, CARD_BIN_VERIFICATION | CardCVVFragment, NoCvvFragment |
| Auth-adjacent payment features | WhatsApp OTP, Truecaller, OTPLESS | OTPVerificationFragment, PhoneVerificationFragment — less SDK diversity observed than Zepto, though Facebook login SDK is more prominent in Zomato's manifest |

## Loyalty, membership, gamification
| Dimension | Zepto | Zomato |
|---|---|---|
| Paid membership | "Loyalty Pass" / "Super Saver" / "Ultra Saver" tiers | Zomato Gold (current branding) + legacy/parallel "Pro" naming still present in code |
| Points/rewards currency | ZCoins | "Karma" namespace exists (192 classes) — purpose UNKNOWN, possibly analogous |
| Scratch-card mechanic | gamification.scratchcard native module | ScratchCardFragment, ReferralScratchCardFragment — same mechanic, independently confirmed in both apps as a standard pattern |
| Seasonal campaigns | IPL_25_SKIP_BOWLING_BOTTOM_SHEET, Rakhi messaging feature | EasterGameFragment, ZPL (likely "Zomato Premier League", cricket-themed) — same seasonal-campaign pattern, different specific tie-ins |
| Dedicated gamification suite | Not as extensive in observed evidence | TriviaFragment, LeaderBoardFragment, HC*(Game/Lobby/Room/TeamSelection/Rewards) — Zomato's gamification investment appears larger (458-class namespace vs scattered Zepto references) |

## Support, tracking, and infra
| Dimension | Zepto | Zomato |
|---|---|---|
| In-app chat/support | i_chat_bot_add_to_cart_clicked, ChatBotResetConfirmation — a few event strings, limited evidence of scope | 1,709-class `chatsdk` namespace: ChatSDKMainActivity, AIBotLandingFragment, AudioInputBottomSheetFragment (voice input) — substantially more developed support system observed |
| Live tracking | FusedLocation native module, lastRiderLocationPress, rider_to_customer_eta | MQTT-based real-time infra: pulsemqtt, mqtt, livetelemetry, argus namespaces — a more explicit real-time-protocol investment than Zepto's evidence shows |
| Analytics pipeline | Firebase Analytics, Sentry (manual init), AppsFlyer | Firebase-style events plus "Jumbo" (jumbo.zomato.com) — Zomato's own publicly-documented internal analytics/event pipeline |
| Security/anti-fraud | Play Integrity attestation, RSA-OAEP, WAF module, EncryptedMMKV | Certificate pinning hosts observed (cert1/2/3.zomato.com) — different specific mechanism, same general goal |
| Health/wellness integration | Not observed | Android Health Connect nutrition-write permission — unique to Zomato in this comparison |

## Out-of-core-scope verticals (present in evidence, explicitly not recommended to copy)
| Zepto | Zomato |
|---|---|
| Pharmacy (prescription upload/consent) | Alcohol delivery (Wine Cellar) |
| Electronics trade-in/exchange (IMEI capture) | Train-station food ordering |
| — | Highway-traveler food ordering |
| — | Dine-out table booking + in-restaurant bill pay |
| — | Zomato District (events, separate growing vertical) |

Both apps have clearly grown well beyond their original single-vertical scope over time.
This is a useful cautionary data point for Jinni: scope creep into adjacent verticals
(cab, salon — already active in Jinni's module registry per jinni-technical-architecture.md)
is the INDUSTRY NORM for apps at this stage, not a Jinni-specific risk, but it still needs
to be a deliberate resourcing decision rather than something that happens by default.

## Shared patterns worth treating as "table stakes" for Jinni (both apps independently converged on these)
1. OOS/substitution handling at cart/checkout (not optional — both apps solved this)
2. Coupon/promo code application in cart
3. Scratch-card or similar gamified reveal mechanic for promotions
4. Seasonal/campaign-driven UI tie-ins (different specific events, same underlying system)
5. Server-driven layout/UI system for the home/discovery surface (LayoutEngine / ZFE)
6. Multi-channel OTP/auth verification redundancy (SMS + at least one alternate channel)

## What's genuinely different, not just differently-named (real architectural choices)
1. React Native (Zepto) vs native Android+KMM (Zomato) — a real platform-strategy fork
2. Single predetermined dark-store (Zepto) vs race-to-accept nearby-store broadcast,
   which is actually closer to Jinni's own grocery order model than Zepto's is — worth
   double-checking whether Zomato's RESTAURANT-side order acceptance (not grocery) uses
   a similar broadcast model, since that's the more relevant comparison for Jinni's food
   vertical specifically. UNKNOWN from this pass — would need targeted follow-up.
3. One wallet currency (Zepto) vs two parallel currencies (Zomato) — Zepto's simpler
   model is the one worth following if Jinni builds a wallet




<div style="page-break-before: always;"></div>


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




<div style="page-break-before: always;"></div>


# Jinni vs Zepto — Feature Gap Analysis (Grocery, Phase 7 excerpt)

Based on: Zepto static analysis (manifest + Hermes string-table evidence, see
zepto-js-bundle-findings.md and zepto-screen-inventory.md) vs Jinni's current
superapp-mobile/src/modules/{grocery,cart,orders,profile,home} structure (OBSERVED via
read-only directory listing on E:\work\super — not yet file-content-level review).

Confidence note: Jinni side is OBSERVED (real file listing). Zepto side is INFERRED from
bytecode string evidence (no code-level confirmation). Treat gaps below as directional,
not exhaustive — a deeper pass should open each Jinni screen file to confirm what's actually
implemented vs just scaffolded.

## Structural observation (OBSERVED, UPDATED after reading file content)
- CORRECTION: `GroceryCartScreen.tsx` and `UnifiedCartScreen.tsx` are NOT duplicates. Both
  read the same shared `cartStore`; `GroceryCartScreen` filters to `moduleType === 'grocery'`.
  This is an intentional unified-cart-across-verticals design (food module does the same
  filtering pattern, per an inline code comment). Not a gap or inconsistency.
- Jinni already has a module structure for cab, salon, delivery, food, grocery, admin —
  broader scope than "grocery + food delivery" alone. Worth confirming whether cab/salon
  are active priorities or dormant scaffolding, since it affects how much shared
  infrastructure (address, payments, cart) needs to serve non-commerce verticals too.
- ARCHITECTURAL DIFFERENCE from Zepto (OBSERVED in GroceryCheckoutScreen.tsx code comment):
  Jinni's grocery order model is "race-to-accept" — the order is placed generically via
  `POST /orders` and the backend broadcasts it to nearby stores to accept, with no store
  chosen at checkout. Zepto's model (INFERRED from Phase 1 manifest findings: single
  resolved-location-driven dark store via Haversine distance) pre-assigns a specific store
  before checkout. This is a deliberate, different design, not a gap — flagging for
  awareness since it changes what "store selection" even means in Jinni vs Zepto.

## Confirmed present in Jinni (OBSERVED, file-content-verified for checkout/cart)
- Store list, category browse, product list, product detail, cart, checkout (grocery module)
- Order history, order tracking (orders module)
- Saved addresses, profile, help/support, legal (profile module)
- Home with search bar, location header/prompt, hero carousel (home module)
- **Checkout (verified in code, not just file listing):** real saved-address selection with
  inline new-address entry, two payment methods (COD, UPI via Paytm with server-side
  payment verification/reconciliation — never trusts the client SDK result alone), coupon
  code entry that calls a real `/coupons/validate` backend endpoint, bill breakdown
  (subtotal, delivery fee with free-above-₹500 threshold, 5% GST, coupon discount, total),
  and a free-text notes field whose placeholder explicitly suggests "substitute if out of
  stock" — i.e. OOS substitution is handled as a manual note to the store, not a structured
  flow (see P0 table below, this downgrades that gap's severity).

## Gaps vs Zepto's observed feature surface (P0 = core commerce, P1 = conversion/retention, P2 = nice-to-have)

### P0 — core commerce, likely needed before launch
| Zepto evidence | Jinni status (CODE-VERIFIED) | Gap | Complexity |
|---|---|---|---|
| SCREEN_VIEWED_UNSERVICEABLE_STORE, ADDRESS_SERVICE_UNAVAILABLE | Checkout only validates pincode length (6 digits) and address line length — no check against actual store/delivery coverage before allowing order placement | Still a real gap: need an explicit "not serviceable at this address" check, ideally before checkout (at address-select or home) not just generic order-placement failure | Low-Medium |
| SCREEN_VIEWED_PARTIAL_OOS_BOTTOM_SHEET, SWAP_AND_SAVE | DOWNGRADED — handled only via a free-text "notes for store" field (placeholder literally suggests "substitute if out of stock"), not a structured flow. No programmatic OOS detection, no swap suggestion UI, no partial-fulfillment confirmation step | Real gap remains, but less severe than first assessed: a manual-notes workaround already exists; building a structured flow is an enhancement, not a from-scratch feature | Medium |
| JUSPAY_UPI_APPS_BOTTOMSHEET_VIEWED, PAY_COD_ZIC_BUTTON_CLICKED, PAY_ONLINE_ZIC_BUTTON_CLICKED | DOWNGRADED — Jinni DOES have a real payment method picker (COD vs UPI-via-Paytm) with server-side payment verification/reconciliation (doesn't trust client SDK alone). Single gateway (Paytm) vs Zepto's multi-provider (Juspay + Amazon Pay) stack | Smaller gap than first assessed: core UX pattern already exists; the gap is provider breadth (saved cards, multiple UPI intent apps shown individually, EMI) not the picker itself | Low-Medium |
| SCREEN_VIEWED_COUPON_BS, MANUAL_COUPON_BOTTOMSHEET_CTA_CLICKED | CORRECTED — coupon entry EXISTS and calls a real `/coupons/validate` backend endpoint with discount applied to the bill | No gap — already implemented. Removed from gap list. | N/A |

### P1 — conversion and retention features
| Zepto evidence | Jinni status | Gap | Complexity |
|---|---|---|---|
| ZCoins (loyalty currency), Zepto Cash (wallet) | No wallet/loyalty module or screens found anywhere in src/modules | Entire loyalty/wallet system absent — large scope item, needs its own module | High |
| SCREEN_VIEWED_REFERRALS_PAGE, referral program events | No referral screens found | Referral program absent | Medium |
| SHOW_ORDER_RATING_MODAL_V2, RNR_TOAST_VARIANT | No rate-and-review screen/component found for orders | Post-delivery rating flow absent | Low-Medium |
| SCREEN_VIEWED_PAY_WITH_EMI_BS, NO_COST_EMI | No EMI/BNPL option | Likely out of scope for MVP — flag only | Low priority to build |

### P2 — nice-to-have / platform maturity
| Zepto evidence | Jinni status | Gap | Complexity |
|---|---|---|---|
| Scheduled/future delivery (pickupTimeSelector) | No scheduling UI found | Delivery-time selection absent | Medium |
| Shopping lists (SCREEN_VIEWED_SHOPPING_LIST_PAGE) | Not found | Saved shopping lists absent | Low-Medium |
| PIP shoppable video | Not found | Not recommended for MVP scope | N/A |
| Gift cards / vouchers | Not found | Defer unless business requires it | Medium |

## Explicitly NOT recommended to replicate (per your original instruction to design
original architecture, not copy Zepto 1:1)
- Pharmacy vertical (prescription upload/consent) — out of grocery scope unless Jinni plans
  to sell regulated items
- Electronics exchange/trade-in flow — unrelated to grocery+food delivery
- Festival-specific campaign screens (Rakhi, IPL tie-ins) — seasonal marketing, not core architecture




<div style="page-break-before: always;"></div>


# Jinni — Food Module Deep Verification (code-level, same rigor as grocery)

## Checkout (verified in code: CheckoutScreen.tsx, food module)
Same quality tier and pattern as grocery checkout: real saved-address selection,
COD/UPI(Paytm) with server-side reconciliation (never trusts client SDK alone), coupon
via the SAME shared `/coupons/validate` endpoint (differentiated by `order_type: 'food'`
vs grocery's implicit type) — confirms coupons are a genuinely shared backend system
across verticals, not duplicated per-module. Bill breakdown adds a food-specific
`packaging_fee` line grocery doesn't have. Defensive UUID validation on restaurant/item/
option IDs with specific inline comments referencing real past bugs (a 422 "Input should
be a valid UUID" error) — this is evidence of real debugging history, not speculative
code. Same gaps as grocery: serviceability is pincode-length-only, no group ordering, no
scheduled delivery.

## MAJOR CORRECTION: "Order with Jinni" AI ordering assistant is REAL, not a stub

Initial read of `OrderWithJinniButton.tsx` (food module) suggested this was UI-only, per
its own code comment: "functional food pre-load (search_food / add_items_to_cart tools)
is backend work tracked separately; this wires the UI entry point and context hint only."

Opening `useJinniSession.ts` and `interpretService.ts` (jinni module) shows this comment
is STALE — the feature is substantially built and functioning end-to-end:

- **Voice session lifecycle**: open -> listening -> submitWish -> thinking -> results ->
  confirmAddToCart -> success, with server-tracked sessions (startSession/cancelSession/
  completeSession) and a rate-limited "wishes" quota (server-enforced via HTTP 429, with
  a client-side `isExhausted` check as a fast-path, refreshed from server state) — the
  genie/"Chirag" persona theme is carried through a named phrase system and TTS.
- **Real backend intent interpretation**: `interpretService.ts`'s own comment confirms
  hardcoded demo catalogs were explicitly REMOVED from the production path. All results
  come from `/jinni/interpret`, which the comment says reads from live `products`/
  `menu_items` tables (superapp-backend/app/modules/jinni/search_service.py — referenced
  but not independently opened in this pass, so treat the backend claim as INFERRED from
  a specific, detailed frontend comment rather than OBSERVED directly).
- **Local-first UX, server-authoritative data**: a local keyword matcher
  (`JinniIntentFinder`) gives instant UI feedback and a confidence hint sent to the
  backend, but is explicitly never trusted as a source of truth — on backend failure, the
  code deliberately surfaces a clarification message rather than fabricating items from
  the local match. This is a notably careful anti-hallucination design choice.
- **Real cart integration**: `confirmAddToCart` builds real cart lines and reuses the
  exact same cross-source conflict pattern (`addItem` / `forceAddItem`) documented in
  jinni-technical-architecture.md for the shared cart store — this isn't a parallel path,
  it feeds the same cart everything else uses.
- **TTS safety rule** (explicit in code comment): the app is only ever allowed to SPEAK
  pre-scripted phrases, never dynamic AI-generated text, product names, prices, or order
  details out loud — a deliberate guard against reading untrusted/hallucinated content
  aloud. Good practice worth preserving as this feature grows.

## Why this matters for the gap analysis
Neither Zepto nor Zomato showed evidence of anything like this. Zepto has a single
`i_chat_bot_add_to_cart_clicked` event (a support-chat-bot-can-add-to-cart feature, much
narrower). Zomato has a more developed chat SDK (1,709 classes) with AI bot + voice
input, but evidence doesn't show it driving a full voice-to-cart wish-granting flow with
its own quota/persona system. If this works as the code suggests, it's a genuine
differentiator already built, not a gap to close — the gap analysis should REMOVE any
assumption that Jinni needs to catch up here, and instead flag this as something worth
featuring prominently rather than hiding as an experimental side feature.

## Caveat — RESOLVED
The backend endpoint was independently verified (superapp-backend/app/modules/jinni/
search_service.py opened directly). The claim is now OBSERVED, not just inferred from a
frontend comment: real async SQLAlchemy queries against live `Product`, `MenuItem`, and
`Restaurant` tables, genuine stock/availability checks (grocery: `stock_quantity -
reserved_quantity > 0`; food: `item.is_available AND restaurant.is_open AND
restaurant.is_accepting_orders`), and a deliberately engineered two-tier search strategy:
full-phrase ILIKE match tried first, loose single-keyword match only as fallback — with
the module docstring explicitly documenting a real disambiguation bug this was built to
fix ("paneer butter masala" misrouting to grocery because "butter" overlaps both
domains; the fallback now tries the OTHER module's full phrase before giving up). This
is production-quality, bug-driven engineering, not a prototype. The "Order with Jinni"
feature is confirmed end-to-end: frontend voice session -> backend intent search against
real inventory -> cart integration. Treat this as one of Jinni's most mature subsystems,
not a gap or a stub.

## Grocery product listing (ProductListScreen.tsx) — additional verification
Confirms consistent quality: discount-percent badges (price vs MRP), inline quantity
stepper reusing the shared cart store, proper out-of-stock blocking (item is shown but
the ADD button is replaced with an "Out of Stock" label — consistent with earlier
finding that OOS substitution exists only as a checkout-notes workaround, not a
structured swap-suggestion UI at the listing level), a floating cart button with a live
item-count badge, and explicit pull-to-refresh/error-retry states. A code comment
literally says "Blinkit-style" card design — confirms the UI pattern was deliberately
modeled on a known reference, consistent with this whole research project's premise.

## Overall assessment of this deep-verification pass
Across checkout (both verticals), cart, and product listing: Jinni's core commerce code
is consistently well-engineered — real defensive validation, genuine bug-driven design
decisions documented in comments, and no evidence of placeholder/mock logic in the paths
checked. The AI ordering assistant is a confirmed, working, differentiated feature. The
gaps that remain (serviceability pre-check, structured OOS substitution, group ordering,
scheduled delivery) are genuine and worth prioritizing, but they are gaps in an otherwise
solid foundation, not signs of an unfinished app.





