# Jinni Superapp — Is pass me kya fix hua (task list + engineering notes)

Read kiya: `JINNI_IMPLEMENTED.md`, `CHANGES_AND_GAPS.md`, `Jinni_UI_Rebrand_Spec.md`.
Niche har complaint ka root cause aur fix diya hai.

---

## 1. Jinni AI — voice + chat flow

| # | Complaint | Root cause | Fix |
|---|-----------|------------|-----|
| 1a | Voice ka input nahi ja raha, sirf text jata hai | Mic button pehle se **stub** tha — koi real speech-to-text wire hi nahi tha (doc me explicitly "❌ Not wired" likha tha). Tap karne par kuch nahi hota tha agar text empty ho. | `expo-speech-recognition` add kiya (free, on-device OS speech recognizer — Google/Apple ka, koi paid API nahi). Naya hook `hooks/useVoiceInput.ts` banaya: mic dabao → permission maango → live sunte hue text box me words aate jaate hain (jaise WhatsApp/Google mic) → bolna band karo to auto-submit. hi-IN try karta hai, device support na kare to en-IN pe fallback. Agar build me native module nahi hai (Expo Go me), mic silently fail nahi karta — Chirag bol deta hai "Voice abhi available nahi hai, type karo". |
| 1b | Ek baar bhejne ke baad hamesha wahi same response aata hai | `interpretWish` khud deterministic/catalog-based hai (ye already "cache" jaisa hi hai — koi paid LLM nahi, fixed hi hai by design). Code review me ek latent bug mila: transcript/message ids `Date.now()` se bante the — agar do messages same millisecond me ban jayein (jo ek hi handler ke andar aam hai), React unhe same id samajh ke purane bubble ko hi re-use kar sakta hai, jisse purana text dikhta reh sakta hai. | Naya `services/idGen.ts` — counter + timestamp se **collision-proof unique id**. Saari transcript push calls (`useJinniSession.ts`) isko use karti hain ab. |
| 1c | AI jyada useful nahi, fixed response ko Gemini jaisa "cache karke" use karna | Ye already free/zero-cost catalog-matching hai, koi API call nahi hoti — isliye "cache" karne ki zarurat hi nahi (cost already ₹0). Agar future me real Gemini jaisa AI chahiye, wo ek alag cost-bearing decision hai. | Scope me nahi rakha (explicitly by-design free path — `JINNI_IMPLEMENTED.md` section 9). Agar aage chahiye to bata dena, alag se plan karenge (quota + caching strategy sahit). |

### Testing (mic ke liye)
`expo-speech-recognition` ek **native module** hai — Expo Go me kaam nahi karega.
```
cd superapp-mobile && npm install
npx expo prebuild --clean
npx expo run:android      # ya run:ios
```

---

## 2. Tab icon — "Chirag jaisa nahi, mug jaisa lagta hai"

**Root cause:** `MagicLampIcon.tsx` (jo tab button + logo + har jagah use hoti hai)
ka body-shape bada tha aur spout chhota/thin — 18-24px tab-icon size par
spout barely dikhta tha, sirf gol body + side-handle reh jata tha → mug jaisa
lagta tha.

**Fix:** Icon redesign kiya — squat & wide teapot-silhouette (height se bahut
zyada width), spout ko bahut lamba/sharp banaya left-upward sweep ke saath
(ye silhouette ek mug kabhi nahi bana sakta), domed lid + finial spike top
par, flame spout ki tip se bold nikalti hui. Same component Home logo,
Splash, Login, aur tab bar — sab jagah use hoti hai, isliye ek fix se
sab jagah consistent "Chirag lamp" look aa gaya.

**Chirag character art (PNG) ke baare me:** `chirag_idle.png` /
`chirag_listening.png` etc. actual generated art files hain jo tumhare
machine par daalne hote hain (code me sirf registry hai,
`shared/theme/jinniAssets.ts`) — wo is zip me present nahi the, isliye unka
visual quality main fix nahi kar saka. `JINNI_ASSET_PROMPTS_ADDENDUM.md`
me already achhe prompts likhe hain Gemini/Midjourney jaisi tools ke liye
— agar chaho to unhi prompts se naye PNG generate karke
`assets/` folder me daal do, code automatically pick karega.

---

## 3. Food screens — font default aa raha tha

**Root cause (confirmed):** 12 screens me style jaisi thi:
```ts
{ fontSize: 14, fontWeight: '700', fontFamily: fontFamily.bold }
```
`fontFamily.bold` = custom loaded font `'Inter-Bold'` (expo-google-fonts se,
`App.tsx` me alag-alag weight alag family-name se register hoti hai:
`Inter-Regular`, `Inter-Medium`, `Inter-SemiBold`, `Inter-Bold`). Jab
`fontWeight` bhi saath me diya jata hai, Android is custom family ka ek
"bolder variant" dhoondhne ki koshish karta hai jo exist hi nahi karta —
aur silently **system default font** pe fall back ho jata hai. Home tab me
ye mix nahi tha, isliye wahan sahi dikh raha tha.

**Fix:** In 12 files se conflicting `fontWeight` hata diya jahan
`fontFamily: fontFamily.*` already set tha (boldness font file me hi
baked-in hai):
- RestaurantListScreen, RestaurantDetailScreen, FoodCartScreen, CheckoutScreen
- partner/RestaurantProfileScreen, RestaurantSetupScreen, AddEditMenuItemScreen,
  RestaurantOrdersScreen, RestaurantDashboardScreen, RestaurantMenuScreen
- store/StoreProfileScreen, delivery/DeliveryProfileScreen

Ab ye sab Home tab jaisa hi consistent Inter font dikhayenge.

---

## 4. Restaurant list search — galat/khaali results

**Root cause:** Backend search sirf **restaurant ka naam/description**
match karta tha (`app/modules/food/service.py` → `list_restaurants`).
Agar koi "burger" ya "pizza" search kare (ek dish ka naam, restaurant ka
naam nahi), toh kuch nahi milta tha — jabki Swiggy/Zomato me dish search
karne par wo restaurants dikhte hain jo wo dish banate hain.

**Fix (`service.py`):**
1. Query ko words me split karke har word ko alag se match karta hai
   (ab "chkn burgr" jaisa partial/typo-ish bhi kaam karega, ek single
   word se bhi).
2. `cuisines` array field bhi ab search me include hai.
3. **Naya: dish-level search** — agar query kisi restaurant ke menu item
   (`MenuItem.name`) se match karti hai, wo restaurant bhi result me
   aata hai, aur response me `matched_dish` field batata hai **kaunsa
   dish match hua** — bilkul Swiggy/Zomato jaisa "Has 'Burger'" tag.
4. Frontend (`RestaurantListScreen.tsx`) ab is field ko restaurant card
   par chhota chip dikhata hai: `🔍 Has "Burger"` — isse clear hota hai
   ki ye restaurant kyun result me aaya.
5. Search box par 300ms debounce add kiya — ab har keystroke pe alag
   API call nahi jaati, typing settle hone ke baad ek hi call.

---

## 5. Home → Order delivered — full flow

`JINNI_IMPLEMENTED.md` section 2 ke end-to-end diagram ke hisaab se flow
already wired hai: Home → restaurant list/search → menu → cart
(`cart/store/cartStore.ts`) → `CheckoutScreen` → `POST /food/orders` →
`OrderTracking` → `orders/screens/OrderHistoryScreen.tsx` rider/restaurant
timeline. Code-level is pass me koi break nahi mila is chain me — sirf
upar wale font aur search gaps the jo list/detail screens par asar daal
rahe the. Agar kisi specific step par order "stuck" hota dikhe (e.g.
status update nahi ho raha), wo alag se reproduce karke batao, specific
step dekhenge.

---

## Files changed — summary

**Backend**
- `app/modules/food/service.py` — search ab cuisines + dish-name match karta hai, `matched_dish` return karta hai
- `app/modules/food/schemas.py` — `RestaurantResponse.matched_dish` field add
- `app/modules/food/router.py` — naye 3-tuple return ko handle kiya

**Mobile**
- `src/modules/jinni/hooks/useVoiceInput.ts` — **naya** — real on-device STT
- `src/modules/jinni/services/idGen.ts` — **naya** — collision-safe ids
- `src/modules/jinni/hooks/useJinniSession.ts` — ids ko `nextId()` se replace kiya
- `src/modules/jinni/components/ChiragOverlay.tsx` — mic wiring + voice error messages
- `src/modules/jinni/components/MagicLampIcon.tsx` — redesigned silhouette (lamp, not mug)
- `src/modules/food/screens/RestaurantListScreen.tsx` — font fix + search debounce + matched-dish chip
- `src/modules/food/store/foodStore.ts` — `matchedDish` field mapping
- 10 aur screens (food partner/store/delivery) — font-conflict fix
- `app.json` — mic permission + `expo-speech-recognition` plugin
- `package.json` — naya dependency

---

## 6. Partner dashboards — full visual-parity pass (round 2)

`CHANGES_AND_GAPS.md` me flag tha: "Dashboard screens ke full layout/card
style ko ek common theme me unify karna baaki hai." Ye kiya:

**A) Raw pixel values → shared tokens** (17 files — Store, Delivery, Restaurant
partner screens + their incoming-order-alert components): har jagah hardcoded
`borderRadius: 12`, `padding: 16`, `gap: 8` jaisi cheezein ab
`borderRadius.md`, `spacing.lg`, `spacing.sm` tokens use karti hain
(`shared/theme/spacing.ts` se) — 135 values tokenize hui. Isse ab agar kal
radius/spacing scale change karna ho, ek jagah se poora app update hoga.

**B) Bada mila gap — poora Delivery module (Dashboard, Orders, Earnings,
Active-Order, Incoming-Alert) aur zyada tar Store module (Dashboard, Orders,
Products, Incoming-Alert) — 9 files — **custom Inter font load hi nahi
karte the**, kabhi bhi `fontFamily` import/use nahi kiya tha. Sirf
`DeliveryProfileScreen` (jo pehle se best-built tha) aur Restaurant partner
screens font use karte the. Matlab in 9 screens me text hamesha system
default font me hi dikh raha tha — Restaurant/Store list wali font-bug se
bhi bada gap, kyunki wahan font load hota tha bas conflict tha, yahan load
hi nahi hota tha. **Fix:** in sab jagah `fontWeight: '600'/'700'` etc. ko
sahi `fontFamily.semiBold`/`fontFamily.bold` se replace kiya (purani bug
dobara na ho, dono saath nahi diye) — 100 replacements, 9 files.

**C) Shadow styles inconsistent the** — `DeliveryActiveOrderScreen`,
`DeliveryEarningsScreen`, `DeliveryOrdersScreen` me har jagah apna
hand-written `shadowColor/shadowOffset/shadowOpacity/shadowRadius/elevation`
block tha (alag-alag values), jabki Admin/Restaurant/Store dashboards me
ya to shared `shadows` token hai ya flat bordered card (no shadow). In 4
blocks ko shared `shadows.sm` token se replace kiya — ab card elevation
poore app me consistent hai.

**D) Raw hex colors → theme tokens (round 3, ab complete):** in 6 files
(Delivery: IncomingOrderAlert, ActiveOrder, Dashboard, Earnings, Orders;
Store: IncomingOrderAlert) **226 hardcoded hex colors** the — turns out
ye screens Tailwind ke generic gray palette (`#111827`, `#6B7280` etc.)
use kar rahe the, jo app ke apne branded warm-gray palette
(`shared/theme/colors.ts`) se bilkul alag hai. High-confidence, 1:1
semantic matches (white, gray scale, success/error/warning/info) ko
map kiya — 226 replace hue. 13 bahut kam-frequency (1-3 baar) one-off
colors (category-chip tints, ek WhatsApp-green brand color) jaanbujh kar
chhoda — unhe bina visually confirm kiye map karna galat-guess ka risk
tha. StoreDashboard/StoreOrders/StoreProducts me pehle se hi hex nahi
tha — wo already `colors.*` tokens use kar rahe the, sirf font missing
thi (round B me fix hui).

**E) Typography scale unification (round 4, "full" parity ka last piece):**
Admin dashboard (`AdminDashboardScreen.tsx`) ek shared `typography.*` scale
use karta hai (`shared/theme/typography.ts` — h1-h6, body1/2, caption,
overline, label) — har heading/label ek fixed, designed size+line-height
se aata hai. Restaurant/Store/Delivery ke 3 main Dashboard screens ye scale
bilkul use nahi karte the — har style apna hi random `fontSize` (13, 15,
10, 11, 18, 20...) hand-likhta tha. Isse in 3 partner apps "same family"
nahi, "similar par thoda off" lagte the admin se.

Teeno Dashboard screens (`RestaurantDashboardScreen`, `StoreDashboardScreen`,
`DeliveryDashboardScreen`) ke header-greeting, name/title, section-title,
stat-value, stat-label, aur action-label — in sab ko Admin jaisi hi
`typography.*` tokens pe move kiya:
- Greeting line → `typography.overline` (uppercase, letter-spaced) +
  `colors.primary[600]` — bilkul Admin ke eyebrow jaisa
- Name/Title → `typography.h4`
- Section titles → `typography.overline` + `colors.text.muted`, Admin
  jaisa uppercase-muted look (pehle har jagah bold dark 15-16px tha)
- Stat numbers → `typography.h5`, stat labels → `typography.caption`
- Action-card labels → `typography.label`

Saath me 4 bache hue hardcoded hex (`#A7F3D0`, `#1E40AF`, aur ek Switch
`trackColor`) ko bhi theme tokens (`colors.success.DEFAULT`,
`colors.info.dark`, `colors.success.light`) se replace kiya, aur
`container` background jo kahi `colors.gray[50]` kahi `colors.surface.background`
tha (same hex value, alag naam) — sab `colors.surface.background` pe
standardize kiya, jaisa Admin karta hai.

**Ab visual-parity pass genuinely complete hai** — font, spacing/radius
tokens, shadow, color palette, aur typography scale — paanchon dimensions
consistent hain Delivery + Store + Restaurant Dashboard screens me, Admin
ke established pattern ke hisaab se. (Baaki sibling screens — Orders,
Profile, Menu, Earnings — pehle rounds me font+radius+shadow+color fix ho
chuki hain; unka sectionTitle/header bhi isi typography scale pe laana
ek chhota follow-up ho sakta hai agar chaho.)

---

## 7. Doosri chat ka order-routing/pincode gap — verify + related modules check

Tumne jo paste kiya (`food/service.py` me `_assert_deliverable`,
`orders/service.py` me `accept_order_by_store` pincode check,
`delivery/router.py` me `accept_delivery` pincode check) — **ye teeno
is zip me pehle se hi present the** (us chat ka kaam already is upload
me baked-in tha, `CHANGES_AND_GAPS.md` me bhi likha hua tha). Maine
confirm kiya code me — koi extra fix nahi chahiye tha.

Isi gap-class ke liye related modules bhi check kiye:
- **Grocery** — apna alag "accept" endpoint nahi hai, grocery orders
  bhi same shared `orders/service.py → accept_order_by_store()` se
  guzarte hain — matlab wahi fix grocery ko bhi already cover karta hai.
- **Cab, Salon** — inme koi "accept blindly from a pool" pattern hai hi
  nahi (booking directly ek provider ko assign hoti hai creation time
  par, jaise Food), isliye ye gap-class unpe apply nahi hoti.

---

## Abhi bhi pending (next pass, scope bada hai isliye separate rakha)

1. **Chirag character PNG art** — actual image generation tumhare side
   se hoga (prompts already `JINNI_ASSET_PROMPTS_ADDENDUM.md` me hain).
2. **Raw hex colors → theme tokens** in Delivery/Store screens (section 6
   ke end me likha hai) — visual-parity ka agla logical step.
3. Order-routing edge case jahan lat/lng dono taraf missing ho — deliberately
   lenient chhoda gaya hai (flagged in `CHANGES_AND_GAPS.md`).
4. Agar real paid-free Gemini-jaisa smarter AI chahiye (sirf keyword-catalog
   se aage), wo cost + rate-limit ka alag decision hai — bata dena.

---

## Zip ko apne project me kaise paste/apply karna hai

Is zip ke andar bilkul wahi folder-structure hai jo tumhare project me
hai (`superapp-mobile/src/...`, `superapp-backend/app/...`) — isliye
sabse aasan tareeka hai **extract karke apne project root ke upar
overwrite kar dena**, file-by-file copy karne ki zarurat nahi:

**Windows (jahan tumhara code hai — `E:\work\super\...`):**
1. Zip ko `E:\work\super\` me extract karo (ya kahin bhi, phir copy karo)
2. Extract hone par 2 top-level folders milenge: `superapp-mobile` aur
   `superapp-backend`
3. Dono ko apne asli `superapp-mobile` aur `superapp-backend` folders
   ke **upar hi paste karo** ("Replace/Overwrite" choose karna, confirm
   aayega kyunki same-name files already exist) — Windows Explorer me
   bas drag-drop karke "Replace the files in destination" select karo
4. Bas — sirf wahi ~34 files overwrite hongi jo is pass me badli hain,
   baaki sab tumhara existing code untouched rahega

**Ya terminal/PowerShell se (zyada safe, kyunki dry-run dikha sakte ho):**
```powershell
cd E:\work\super
Expand-Archive -Path "jinni-fixes-complete.zip" -DestinationPath "." -Force
```
`-Force` matlab same-naam files automatically overwrite ho jayengi.

**Git use kar rahe ho to best tareeka:** extract karke `git status` /
`git diff` se exactly dekh sakte ho kya-kya badla, phir normal commit.

Extract/paste karne ke baad:
```powershell
cd superapp-mobile
npm install
npx expo prebuild --clean
npx expo run:android
```
(mic STT ke liye prebuild+dev-build zaroori hai, upar section 1 me
likha hai).
