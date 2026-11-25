#!/usr/bin/env bash
# DEV ONLY — for when the Docker VM has no internet (so `docker compose up --build` fails on apt/npm/pip).
# Rebuilds just the app code on top of the already-built base image and restarts the container.
#   scripts/dev-offline/rebuild.sh api      # backend code changed (runs migrations first)
#   scripts/dev-offline/rebuild.sh admin    # web console code changed (built on the host, packaged with nginx)
#   scripts/dev-offline/rebuild.sh all
set -euo pipefail
cd "$(cd "$(dirname "$0")/../.." && pwd)"

rebuild_api() {
  docker image inspect jinni-api-base:offline >/dev/null 2>&1 || { echo "Base image jinni-api-base:offline missing. With internet run: docker compose build api && docker tag jinni-api:latest jinni-api-base:offline"; exit 1; }
  docker build -q -f scripts/dev-offline/Dockerfile.api -t jinni-api:latest superapp-backend >/dev/null
  docker compose up -d --no-build --force-recreate migrate api
}
rebuild_admin() {
  (cd superapp-admin && npm install --silent && VITE_API_SAME_ORIGIN=1 npm run build)
  tmp="$(mktemp -d)"; cp -R superapp-admin/dist superapp-admin/nginx.conf "$tmp"/
  docker build -q -f scripts/dev-offline/Dockerfile.admin -t jinni-admin:latest "$tmp" >/dev/null
  docker compose up -d --no-build --force-recreate admin
}
case "${1:-all}" in
  api) rebuild_api ;;
  admin) rebuild_admin ;;
  all) rebuild_api; rebuild_admin ;;
  *) echo "usage: $0 api|admin|all"; exit 2 ;;
esac
docker compose ps
