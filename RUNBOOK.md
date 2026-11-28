# Jinni runbook — start, open, test (Mac, local)

Everything below is run from the repo root `~/Desktop/Jinni` unless stated.

## 1. Web console in the browser (admin · restaurant · store)
Only **Docker** is needed — no separate backend command. The `admin` container serves the web app *and* proxies `/api` to the API.
```bash
open -a Docker                 # start Docker Desktop, wait until the whale stops animating
docker compose up -d           # db, redis, migrate, api, admin   (add --build only if Docker has internet)
docker compose ps              # api & admin = healthy; migrate = Exited (0) is correct
open http://localhost:8080     # the console
```
First time (or after wiping the DB) create the test accounts + data:
```bash
docker compose exec api python scripts/seed_dev_all.py
```
Logins (password **`Test@1234`** for all): `admin@test.com` (super admin) · `store@test.com` · `restaurant1@test.com`
(+ more in `ADMIN_WEB.md`). API docs: http://127.0.0.1:8000/docs (DEBUG only). Logs: `docker compose logs -f api`.
Stop: `docker compose stop` (keeps data) · reset everything: `docker compose down -v` (**deletes the database**).

**Changed backend/web code?** If Docker has internet: `docker compose up -d --build`.
If the Docker VM has **no internet** (build fails on apt/npm): `scripts/dev-offline/rebuild.sh api|admin|all`.
Quick internet test for Docker: `docker run --rm alpine wget -q -T 8 -O /dev/null https://github.com && echo OK`.
Fixes if it fails: quit VPN/firewall tools → update Docker Desktop → Settings ▸ General switch VMM/Apple Virtualization →
Troubleshoot ▸ Reset to factory defaults (wipes local images/DB; re-run seed).

## 2. Mobile app — Android emulator
One-time: Android Studio + SDK, **JDK 17** (Temurin) — `export JAVA_HOME=$(/usr/libexec/java_home -v 17)`.
```bash
# 1) start Docker stack (section 1) — the app talks to it
# 2) start the emulator (AVD name: Medium_Phone_API_37.0) — or press ▶ in Android Studio ▸ Device Manager
~/Library/Android/sdk/emulator/emulator -avd Medium_Phone_API_37.0 &
adb devices                                  # emulator-5554  device

# 3) Metro (JS bundler) — emulator reaches your Mac at 10.0.2.2
cd superapp-mobile
EXPO_PUBLIC_API_URL=http://10.0.2.2:8080 npx expo start --dev-client --port 8081 -c
adb reverse tcp:8081 tcp:8081                # lets the emulator reach Metro

# 4) first time / native code changed: build + install the dev app (separate terminal)
export JAVA_HOME=$(/usr/libexec/java_home -v 17); SKIP_PAYTM_NATIVE=1 npx expo run:android
#    later runs: just open the "Jinni" app on the emulator — it loads from Metro
```
Notes: `EXPO_PUBLIC_*` is baked in when Metro starts — change it ⇒ restart Metro with `-c`.
Black screen / "Unable to load script" ⇒ Metro not running or `adb reverse` missing — repeat steps 3. Session expired ⇒ just log in again.
`superapp-mobile/.env` already has `EXPO_PUBLIC_API_URL=http://10.0.2.2:8080` for the emulator.

## 3. Mobile app — physical Android phone
Phone and Mac must be on the **same Wi-Fi**. The phone cannot use `10.0.2.2`; use the Mac's LAN IP (it changes with the network!).
```bash
ipconfig getifaddr en0                       # e.g. 192.168.92.251
```
**a) Connect the phone** (pick one)
* USB: Developer options ▸ **USB debugging** on → plug in → accept prompt → `adb devices` shows it.
* Wireless (Android 11+): Developer options ▸ **Wireless debugging** ▸ *Pair device with code* →
  `adb pair <ip>:<pair-port>` (enter code) → `adb connect <ip>:<port>` → `adb devices`.

**b) Run Metro on a different port than the emulator** (so both can run together)
```bash
cd superapp-mobile
EXPO_PUBLIC_API_URL=http://<MAC_LAN_IP>:8080 npx expo start --dev-client --port 8082 -c
```
**c) Install the app on the phone** (first time): `SKIP_PAYTM_NATIVE=1 npx expo run:android --device` and choose the phone.
(Or build once, then `adb -s <phone> install app-debug.apk`.)
**d) Point the app at Metro:** open the app ▸ shake / dev menu ▸ **Configure Bundler** ▸ `<MAC_LAN_IP>:8082` ▸ reload.

Checks if login says "network error": phone browser can open `http://<MAC_LAN_IP>:8080` · macOS Firewall allows Docker/Node ·
IP did not change (re-run `ipconfig getifaddr en0`, restart Metro with the new IP) · both on the same Wi-Fi (not a guest network).

## 4. What to start for what
| I want to… | Start |
|---|---|
| use the web console | Docker (`docker compose up -d`) → http://localhost:8080 |
| test the app on emulator | Docker + emulator + Metro 8081 (+ `adb reverse`) |
| test on my phone | Docker + Metro 8082 with Mac IP + phone connected |
| test rides end-to-end | log in on emulator as customer, and on the phone as `delivery@test.com` (bike) — rider must be **Online** and have location on |
| stop everything | `docker compose stop` · close Metro terminals · `adb emu kill` |

## 5. Test accounts (password `Test@1234`)
admin@test.com · customer@test.com · delivery@ (bike) / delivery2@ (auto) / delivery3@ (cab) / delivery4@ (pending KYC) ·
store@test.com · restaurant1–3@test.com · salon@ · cab@. All `@test.com`.
