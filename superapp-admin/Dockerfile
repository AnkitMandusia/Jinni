# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# Empty VITE_API_URL => the SPA calls same-origin /api/v1, which nginx proxies to the API.
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_API_SAME_ORIGIN=1
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -qO- http://127.0.0.1/healthz || exit 1
