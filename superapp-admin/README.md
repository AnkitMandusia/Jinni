# Jinni Web Portal

The web portal is the responsive browser version of the Jinni partner/admin experience. It uses the **same FastAPI authentication and account records** as the Jinni mobile app.

## Sign in

- Email or phone number + password.
- Uses `POST /api/v1/auth/login` with `{ "identifier": "...", "password": "..." }`, the same endpoint and payload as the mobile application.
- Persists the API access and refresh tokens in the browser and refreshes the access token through `POST /api/v1/auth/refresh`.
- The returned account role selects Super Admin, Restaurant, or Grocery Store navigation. The backend remains authoritative for role and active-account permissions.

## Vercel project settings

Create/link the Vercel project to this repository with:
- Root Directory: `superapp-admin`
- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`

### Required environment variable

In Vercel → Project → Settings → Environment Variables, add:

| Key | Value |
| --- | --- |
| `VITE_API_URL` | Your actual public FastAPI backend origin, e.g. `https://api.example.com` |

Important:
- Replace the example with the real deployed backend origin.
- Do **not** append `/api/v1` or a trailing slash. The frontend appends `/api/v1` itself.
- Apply to Production, Preview and Development as appropriate, then redeploy.
- This is a public browser-side variable. Never put database credentials, JWT signing secrets, Redis passwords, Firebase Admin private keys or other server secrets in a `VITE_*` variable.

The API origin must be reachable over HTTPS from the browser. Ensure the backend CORS policy allows `https://partners.jinniwishes.in` (and any Preview domain you intend to test).

## Routes

- `/admin` — Super Admin
- `/restaurant` — Restaurant partner dashboard
- `/store` — Grocery Store dashboard

## Real backend features

The partner portal reads and mutates Jinni APIs for:
- Restaurant statistics, open/accepting-order status, incoming orders, menu categories and menu items.
- Store statistics, new and assigned orders, order status, product availability, custom products and store profile.
- Restaurant first-time setup when the account does not yet have a restaurant profile.

The portal does not synthesize demo orders, revenue, products or account data. When an API request fails, the UI shows the API error rather than replacing it with mock values.

## Local development

```bash
npm ci
# Optional: create .env.local with VITE_API_URL set to the FastAPI origin
npm run dev
npm run build
```
