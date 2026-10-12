# Paytm UPI / Online Payment — Staging Setup

This project now contains the server-side Paytm Payment Gateway flow and the React Native checkout integration.

## Flow

1. Customer selects **UPI / Online** on Food Checkout.
2. `POST /api/v1/food/orders` creates the merchant order with `payment_status=pending`.
3. Mobile calls `POST /api/v1/payments/paytm/initiate/{orderId}`.
4. Backend signs the Paytm Initiate Transaction request with the merchant key and receives a `txnToken`.
5. React Native invokes Paytm All-in-One SDK.
6. Customer completes UPI/payment in Paytm/UPI flow.
7. Mobile calls `POST /api/v1/payments/paytm/verify/{orderId}`.
8. Backend calls Paytm Transaction Status API and only then marks the order `paid`.
9. Restaurant Partner order listing exposes online orders only after payment is confirmed.

Paytm recommends server-side Transaction Status verification before confirming/fulfilling an order.

## Backend `.env`

Set these values in `superapp-backend/.env`:

```env
PAYTM_ENVIRONMENT=staging
PAYTM_MERCHANT_ID=<YOUR_STAGING_MID>
PAYTM_MERCHANT_KEY=<YOUR_STAGING_TEST_KEY>
PAYTM_WEBSITE_NAME=WEBSTAGING
PAYTM_CALLBACK_URL=https://<your-public-https-host>/api/v1/payments/paytm/callback
```

Do NOT put `PAYTM_MERCHANT_KEY` in the React Native app.

For local development, use a public HTTPS tunnel such as ngrok for the callback endpoint. The callback is a reconciliation safety net; the mobile SDK result is never trusted as the final payment authority.

## Backend install

From `superapp-backend`:

```bash
pip install -r requirements.txt
alembic upgrade head
```

The new migration is `0009_paytm_payment_reference.py` and adds `orders.payment_reference` for unique Paytm gateway order IDs and retries/reconciliation.

## React Native dependency

The mobile project is not included in this uploaded ZIP, so install Paytm's React Native bridge in the actual mobile project:

```bash
npm install paytm_allinone_react-native@1.2.3
```

Then rebuild the native app. **Expo Go cannot load this native payment SDK**; use a development build / prebuild / EAS build with the native module included.

Paytm's React Native bridge requires the Paytm Maven repository on Android and native callback URL configuration on iOS. Follow the package README/native setup before building the app.

## Android

Ensure the Android project-level Gradle repositories contain:

```gradle
maven { url "https://artifactory.paytm.in/libs-release-local" }
```

Then rebuild the app.

## iOS

Configure the Paytm URL scheme required by the SDK. The integration code uses:

```text
paytm<MID>
```

as the callback URL scheme. Also add the required Paytm application query scheme and native URL callback handling described in the Paytm React Native SDK README.

## Staging / Production

Staging:

```env
PAYTM_ENVIRONMENT=staging
PAYTM_WEBSITE_NAME=WEBSTAGING
```

Production, after Paytm activates the merchant account and issues production API credentials:

```env
PAYTM_ENVIRONMENT=production
PAYTM_WEBSITE_NAME=DEFAULT
PAYTM_MERCHANT_ID=<PRODUCTION_MID>
PAYTM_MERCHANT_KEY=<PRODUCTION_MERCHANT_KEY>
PAYTM_CALLBACK_URL=https://api.yourdomain.com/api/v1/payments/paytm/callback
```

Never mix staging credentials with production endpoints or vice versa.

## Important security rules

- Merchant key stays only on the backend.
- Never mark an order paid from the mobile SDK callback alone.
- Always call `/payments/paytm/verify/{orderId}` or reconcile through the Paytm callback + Transaction Status API.
- Validate the Paytm amount against the server-side order total.
- Do not commit `.env` or merchant keys to Git.
- Rotate the test key if it has been exposed publicly.
