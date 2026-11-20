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
