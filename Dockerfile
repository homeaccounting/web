# syntax=docker/dockerfile:1.7

# --- stage 1: build ---
FROM node:22-alpine AS build
WORKDIR /app

RUN npm install -g pnpm@9

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
# Default so every image build (CI and `just publish`) bakes analytics in.
# Override with --build-arg / .env to point elsewhere or set "" to disable.
ARG VITE_GOATCOUNTER_URL="https://homeaccounting-app.goatcounter.com/count"
ENV VITE_GOATCOUNTER_URL=$VITE_GOATCOUNTER_URL
ARG APP_COMMIT_HASH=""
ENV APP_COMMIT_HASH=$APP_COMMIT_HASH
RUN pnpm build

# --- stage 2: serve ---
FROM caddy:2-alpine
LABEL org.opencontainers.image.source="https://github.com/homeaccounting/web"
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
