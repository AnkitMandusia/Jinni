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
