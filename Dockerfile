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
ARG APP_COMMIT_HASH=""
ENV APP_COMMIT_HASH=$APP_COMMIT_HASH
RUN pnpm build

# --- stage 2: serve ---
FROM caddy:2-alpine
COPY --from=build /app/dist /srv
COPY Caddyfile /etc/caddy/Caddyfile
EXPOSE 80
