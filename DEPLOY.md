# Jinni — Docker deploy

Stack: **Postgres 16 · Redis 7 · migrate (Alembic, one-shot) · api (FastAPI, 2 workers) · admin (React → nginx, proxies `/api` + WebSocket)**.
Sized for a single-city workload (2–3 lakh people): one small VPS (2 vCPU / 2–4 GB RAM) is enough.

## Local / staging
```bash
cp .env.docker.example .env      # set POSTGRES_PASSWORD, SECRET_KEY (see file)
docker compose up -d --build     # builds, migrates, starts everything
docker compose ps                # all "healthy"; migrate = Exited (0) is correct
open http://localhost:8080       # admin; API also at http://127.0.0.1:8000/docs (DEBUG only)
```
Create the first admin (no hard-coded password):
```bash
docker compose run --rm -e ADMIN_EMAIL=you@example.com -e ADMIN_PASSWORD='at-least-12-chars' api python scripts/create_admin.py
```
Push notifications: put the Firebase service-account JSON at `secrets/firebase-credentials.json`.

## Production (single VPS, automatic HTTPS)
1. VPS with Docker; DNS `A` record `DOMAIN → server IP`; open ports 80/443.
2. `.env`: set `DEBUG=false`, `OTP_DEBUG=false` (once real SMS/Firebase login works), `CORS_ORIGINS=https://<DOMAIN>`, `DOMAIN`, `ACME_EMAIL`, Paytm live keys, `PAYTM_CALLBACK_URL=https://<DOMAIN>/api/v1/payments/paytm/callback`.
3. ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
   ```
   Caddy gets the TLS certificate automatically; api/admin are no longer published on host ports.
4. Mobile app: set `EXPO_PUBLIC_API_URL=https://<DOMAIN>` for the release build.

## Operations
| Task | Command |
|---|---|
| Logs | `docker compose logs -f api` |
| Update to new code | `git pull && docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build` (migrations run automatically before api restarts) |
| Backups | prod overlay writes a daily `pg_dump` to `./backups` (14 days kept). **Copy them off the server.** Restore: `docker compose exec -T db pg_restore -U jinni -d jinni --clean < backups/jinni-YYYY-MM-DD.dump` |
| Rollback a migration | `docker compose run --rm migrate alembic downgrade -1` |
| DB shell | `docker compose exec db psql -U jinni jinni` |

## Not included / decide later
- Scheduled orders are broadcast immediately (no delayed dispatcher yet).
- Redis/Postgres are single instances (no HA) — fine at this scale; backups are the safety net.
- Image uploads go to Cloudflare R2 (configure `R2_*`), not to a container volume.
