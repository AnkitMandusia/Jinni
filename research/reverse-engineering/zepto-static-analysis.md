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
