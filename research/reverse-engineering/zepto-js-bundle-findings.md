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
