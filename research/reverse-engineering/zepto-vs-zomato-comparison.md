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
