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
