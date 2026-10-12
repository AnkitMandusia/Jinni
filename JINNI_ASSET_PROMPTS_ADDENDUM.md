# Jinni — Asset/Image Generation Prompts Addendum

Companion to `Jinni_UI_Rebrand_Spec.md` section 9. That section already has
prompts for the icon, splash, Chirag states, lamp tab-bar states, the Home
nudge card, and an "Order with Jinni" icon concept. This addendum covers the
**specific UI now built** in this pass, so asset production can target the
actual components rather than the general concept.

Nothing below has been generated — these are prompt drafts for a designer
or image generator when asset production starts. All current UI renders
with vector/icon placeholders (Ionicons + Reanimated), built to be swapped
for these assets without further code changes.

---

## 1. Replacing the ChiragAnimationStage placeholder

`src/modules/jinni/components/ChiragAnimationStage.tsx` currently renders
Chirag as a circle + sparkle icon driven by a Reanimated state machine
(emerge/sway/glow/sparkle values). The component is built to accept a real
Lottie/Rive rig in its place — the state machine (`scene` prop: idle → tap →
summoning → arriving → listening → thinking → speaking → success →
dismissing) is the authoritative timing contract. When commissioning the
real asset, hand over this exact scene list plus the per-scene prompts
already in the main spec (section 9, "Chirag character — base design" /
"listening state" / "thinking/working state" / "success/sparkle state").

**Additional prompt — idle/arriving transitional frame** (not in the
original spec, needed because this build treats "arriving" as its own
beat before "listening"):
> Same Chirag character, genie, mid-emergence from the lamp: lower half
> still a loose swirl of golden-white smoke, upper half/face just reaching
> full opacity, eyes opening, a soft warm light bloom around the shoulders
> at the moment of arrival. Captures the instant *just before* he's fully
> present — one frame earlier than the calm "idle" reference.

## 2. JinniLampButton (tab bar)

`src/modules/jinni/components/JinniLampButton.tsx` is currently a plain
gold-outlined circle with a bulb icon, a breathing-glow halo, and a small
purple "x/3" badge in the exhausted state. Use the spec's existing "Lamp
tab-bar icon (idle / glow / exhausted states)" prompt (section 9) as-is —
the component's three visual states map 1:1 to that prompt's three states.

## 3. ChiragSmokeLayer

`src/modules/jinni/components/ChiragSmokeLayer.tsx` is a Reanimated
stand-in (four soft circles rising/fading) for the real smoke/particle
layer called for in spec section 6.3. No new prompt needed beyond the
"Chirag character — base design" prompt's smoke description — this layer
should be produced as a **separate, independent Lottie/Rive loop** (per
the component's own code comment) so density (idle/summoning/arriving/
thinking/dismissing) can be driven by the `scene` prop rather than baked
into a single fixed-length clip.

## 4. Home — "Try Jinni" nudge card

`src/modules/home/components/TryJinniNudgeCard.tsx` is built as a
gradient (purple-100 → cream) card with a plain lamp-icon badge on the
left and text on the right — this matches the spec's existing nudge-card
prompt (section 9) closely enough that it can be used as-is once the
static illustration is ready; swap the `Ionicons name="bulb"` badge for
the generated artwork.

## 5. Food — "Order with Jinni" entry point

`src/modules/food/components/OrderWithJinniButton.tsx` renders as a
pill-shaped chip (bulb icon + "Order with Jinni" label + small gold dot)
on `RestaurantListScreen` (above the restaurant list) and
`RestaurantDetailScreen` (in the restaurant header, below the delivery-fee
line). The spec's existing icon prompt (section 9, "Food screen 'Order
with Jinni' entry point icon") still applies for the icon mark itself.

**Additional prompt — pill/chip treatment** (to match how it's actually
placed, inline in a row rather than full-width):
> A small pill-shaped button icon, gold lamp silhouette inside a cream
> circle badge, sized to sit at the left edge of a rounded chip-style
> button next to the label "Order with Jinni". Flat vector, single color
> gold + a thin champagne outline, must read clearly at ~18px.

## 6. Order success — "wish granted" sparkle

`src/shared/components/JinniSparkleAccent.tsx` renders a soft gold glow
halo plus three small animated dots, positioned behind the "Delivered
successfully" status title on `OrderTrackingScreen`. The spec's existing
prompt (section 9, "Order success 'wish granted' sparkle accent") applies
directly — once generated, swap it in behind `styles.statusTitleRow`
instead of the current animated-dot placeholder.

## 7b. Home hero carousel — new "Jinni" slide

`src/modules/home/screens/CustomerHomeScreen.tsx` now has a 4th hero
slide (after Food / Rides / Local Stores) that opens the Chirag overlay
directly when tapped. It needs a full-bleed photo-style background image,
same shape as the other three hero slides (landscape, ~328×168 card, dark
scrim + white text overlaid at the bottom-left).

**File name — exact, required:** `hero_jinni.png`
**Location:** `superapp-mobile/assets/hero_jinni.png` (same folder as
`hero_food.jpg`, `hero_ride.jpg`, `hero_stores.jpg`)
**Already wired up** in `src/shared/theme/assets.ts` as `homeAssets.heroJinni`
— drop the file in and it renders, no code change needed.

**Prompt:**
> A premium, cinematic hero banner image for a mobile app home screen
> carousel slide, landscape orientation. A single elegant gold-metallic
> genie lamp sits slightly off-center, with warm golden-white smoke
> rising from the spout and gently dissolving into soft light — no genie
> character visible, just the lamp and magical smoke. Background is a
> deep royal-purple to near-black gradient with a subtle warm glow around
> the lamp, scattered tiny gold sparkle particles. Photographic/cinematic
> lighting, not flat vector this time — moody and premium, like a movie
> poster crop. Leave the bottom-left third darker/clearer of detail so
> white overlay text ("JINNI — Tap the lamp, make a wish") stays legible
> when placed on top.

## 7. Splash

`src/auth/screens/SplashScreen.tsx` currently renders a code-built lamp
circle (bulb icon + soft gold glow halo) and an animated "Jinni" wordmark
in champagne gold on cream, per spec section 4.1. The existing splash
prompt in the main spec (section 9) should be used for the final
illustration; keep the wordmark as styled text (not baked into the image)
so it stays crisp at all screen densities and doesn't need re-export per
locale.

---

## Notes for whoever generates these

- Every placeholder above is driven by the same `ChiragScene` state machine
  (`src/modules/jinni/types.ts`) and the scoped `jinniColors` tokens
  (`src/shared/theme/jinni.ts`) — color values there are a reasonable
  starting palette but are flagged as an open decision in spec section 10
  item 2 and may need a short palette pass once real assets exist.
- Nothing outside `/modules/jinni` and the six touchpoints listed above
  uses these colors or assets — per the spec's restraint rule, don't let
  asset production creep onto cart/checkout/menu screens.
