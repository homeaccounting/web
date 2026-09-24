# syntax=docker/dockerfile:1.7

# --- stage 1: build ---
# Pinned to the builder's own architecture: the output is a static bundle, so
# it is identical for every target and there is no reason to run the install
# and the Vite build again under emulation for each one (tracker#75).
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /app

RUN npm install -g pnpm@9

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
ARG VITE_API_BASE_URL=""
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL
ARG VITE_GOATCOUNTER_URL=""
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
