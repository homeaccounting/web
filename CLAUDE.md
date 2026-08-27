# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

React/TypeScript single-page application that consumes the [HomeAccounting backend](../backend/). Built with Vite, TanStack Query, React Router, react-hook-form + Zod, and shadcn/ui (Radix + Tailwind).

- **Node**: 22 (enforced via `engines` and CI)
- **Package manager**: pnpm 9 (lockfile committed; CI uses `--frozen-lockfile`)
- **Bundler**: Vite 6 (`base: '/app/'`)
- **UI**: React 18, Tailwind CSS 3, shadcn/ui components in `src/components/ui/`
- **Routing**: react-router-dom v6, `BrowserRouter` with `basename="/app"`
- **Server state**: `@tanstack/react-query`
- **Forms**: `react-hook-form` + `zod` via `@hookform/resolvers`
- **Auth**: JWT bearer tokens with OAuth (Google/GitHub/Microsoft), kept in `localStorage`

## Development Environment

The project uses **Nix** to manage development tooling. Run `nix develop` at the start of each session (or rely on `direnv` via `.envrc`) to put `node`, `pnpm`, and `just` on `PATH`. Without Nix, install Node 22, pnpm 9, and (optionally) `just` manually.

Copy `.env.example` to `.env` and adjust `VITE_API_BASE_URL` to point at a running backend (default `http://localhost:8080`).

## Common Commands

All commands use `just` (task runner). Run `just --list` to see all recipes.

```bash
just install            # pnpm install
just run                # pnpm dev   (Vite at http://localhost:5173/app/)
just build              # tsc -b + vite build
just preview            # vite preview --host
just typecheck          # tsc --noEmit
just lint               # eslint .
just lint-fix           # eslint . --fix
just format             # prettier --write .
just format-check       # prettier --check .
just check              # typecheck + lint + format-check
just test               # vitest run
just test-watch         # vitest
just e2e                # playwright test (auto-starts dev server)
just clean              # remove dist/node_modules/.vite/playwright-report/test-results
just rebuild            # clean + install + build
just all                # check + test + build
just publish [tag]      # build & push image to ghcr.io/homeaccounting/web
just ci                 # trigger CI workflow for current branch
```

Direct pnpm scripts also work (`pnpm dev`, `pnpm test`, `pnpm build`, etc.).

## Architecture

Feature-oriented layout under `src/`. The dependency direction is `pages → features → (api | auth | lib | components)`; reverse imports are not allowed.

```
src/
├── api/           # Typed HTTP client and DTOs that mirror backend Web/Types.hs
├── auth/          # AuthContext, ProtectedRoute, OAuth flow, session storage
├── components/    # Shared components and shadcn/ui primitives (ui/)
├── features/      # Feature folders: accounts/, transactions/, configuration/
├── lib/           # Utilities (queryClient, format, classnames cn)
├── pages/         # Route-level components (HomePage, LoginPage, …)
├── styles/        # Tailwind globals and CSS variables
├── test/          # Vitest setup, MSW server, fixtures, render helpers
├── App.tsx        # Route table
├── main.tsx       # Composition root: BrowserRouter + QueryClient + AuthProvider
└── vite-env.d.ts
```

Build/dev concerns live outside `src/`:

- `vite.config.ts` — Vite + Vitest config, path alias `@/*` → `src/*`, `base: '/app/'`
- `vite/plugins/info-endpoint.ts` — Vite plugin that exposes `GET /app/info → {version, commit}` in dev (middleware) and prod (emits `/srv/info` for Caddy)
- `Dockerfile` + `Caddyfile` — multi-stage build (Node → Caddy) that serves the SPA under `/app/` with SPA fallback
- `e2e/` — Playwright suite running against `http://localhost:5173/app/`

### API client (`src/api/`)

`ApiClient` (`src/api/client.ts`) is a thin `fetch` wrapper that:

- Injects `Authorization: Bearer <token>` when a token is available via `getToken()`
- Calls `onUnauthorized()` on `401` so the auth layer can sign out
- Normalises non-2xx responses into a single `ApiError` (status, code, message, fieldErrors)
- Treats any empty body (including `Post '[JSON] NoContent` 200s) as `void`

Per-resource modules (`accounts.ts`, `auth.ts`, `transactions.ts`, `users.ts`, `configuration.ts`) build on top. DTOs in `types.ts` mirror the Haskell types in `backend/src/Web/Types.hs` and `backend/src/Domain/Core/Types.hs`. **When the backend wire format changes, update `types.ts` first** — drift is the most common source of bugs here.

### Auth (`src/auth/`)

- `AuthProvider` keeps a single source of truth: `localStorage` + a `tokenRef` + React state are updated together so a child fetch firing in the same commit always sees the new token (TanStack Query's queryFn runs synchronously in mount effects).
- `ProtectedRoute` redirects unauthenticated users to `/login`.
- OAuth uses redirect flow with state in `sessionStorage`; the callback page exchanges the code for a session.

### Features

Each feature folder owns its hooks (`useX.ts`), components (`XPane.tsx`, dialogs), and Zod schemas. Hooks wrap TanStack Query and the API client; components stay presentational.

## Code Style

- **Formatter**: Prettier (with `prettier-plugin-tailwindcss`). Run `just format` before committing.
- **Linter**: ESLint flat config (`eslint.config.js`) with `typescript-eslint` _type-checked_ rules, `react`, `react-hooks`, and `jsx-a11y`. Treat lint errors as build failures — don't disable rules without a documented reason.
- **TypeScript**: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `noUncheckedIndexedAccess`. The CI runs `tsc --noEmit` separately from `vite build`.
- **Path alias**: import from `@/...` (configured in both `tsconfig.json` and `vite.config.ts`). Don't use deep relative paths (`../../../`).
- **shadcn/ui**: components in `src/components/ui/` are vendored from shadcn. They are excluded from ESLint and should be regenerated via `pnpm dlx shadcn@latest add <component>` rather than hand-edited (see `components.json`).
- **Styling**: Tailwind only; no CSS modules. Use the `cn()` helper in `src/lib/utils.ts` for conditional classes.

## Testing

Tests live next to the code they exercise (`*.test.ts` / `*.test.tsx`) plus E2E specs under `e2e/`.

| Scope          | Tooling                                    | Notes                                                                                       |
| -------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Unit/component | Vitest + Testing Library + happy-dom + MSW | `src/test/setup.ts` boots an MSW server (`onUnhandledRequest: 'error'`); see `handlers.ts`. |
| E2E (smoke)    | Playwright (chromium)                      | `playwright.config.ts` auto-starts `pnpm dev`; baseURL `http://localhost:5173/app/`.        |
| Build plugin   | Vitest under `vite/`                       | `vite/plugins/info-endpoint.test.ts` covers the dev/build payload contract.                 |

### Conventions

- Render via the helper in `src/test/utils.tsx` so the QueryClient and AuthProvider are wired consistently.
- Add or extend MSW handlers in `src/test/handlers.ts`; per-test overrides go through `server.use(...)` and reset automatically.
- The setup file polyfills Radix's pointer-capture calls on `Element.prototype` for happy-dom — don't strip those polyfills.
- **MSW must stay on `~2.13.3`**: 2.14.x removed response cloning, which locks happy-dom's `ReadableStream` and breaks every HTTP-mocked test.
- Each test should sign the user in (or use the helper) rather than mutating `localStorage` directly, so the `tokenRef`/state invariant holds.

### Running specific tests

```bash
pnpm exec vitest run -t "create account"            # filter by test name
pnpm exec vitest run src/features/accounts          # by path
pnpm exec playwright test --headed                  # E2E with browser UI
```

## Configuration

Runtime configuration is read from Vite-style env vars (only variables prefixed with `VITE_` reach the client):

- `VITE_API_BASE_URL` — backend origin, e.g. `http://localhost:8080`. Set in `.env` for local dev; injected at build time via `--build-arg` in the Dockerfile for production images.
- `APP_COMMIT_HASH` — populated by CI; consumed by `vite/plugins/info-endpoint.ts` to expose `GET /app/info`.

`.envrc` loads `.env` through direnv. There is no separate config file format — everything is environment-driven.

## Routing & Base Path

The app is mounted at `/app/`:

- Vite `base: '/app/'` (so all built asset URLs are `/app/...`)
- Router `basename="/app"` (so `<Link to="/login">` becomes `/app/login`)
- Caddy `try_files {path} /index.html` provides SPA fallback

When introducing new routes, register them in `src/App.tsx` and put protected routes under the `<ProtectedRoute />` parent route.

## Change Philosophy

- Treat existing code, types, tests, and documentation as intentionally designed
- Modifications should be strictly additive by default
- Never remove or significantly alter existing content without explicit request or documented evidence of incorrectness
- When modifying: quote the specific section, explain the reason, verify preservation of invariants
- Keep DTOs in `src/api/types.ts` in lockstep with backend `Web/Types.hs`; cite the backend source location in a comment when adding fields

## Documentation Structure

Durable project documentation lives in `docs/` and is versioned.
