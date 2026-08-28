# Accounting Web

Frontend client for the HomeAccounting platform. A React 18 + TypeScript single-page application built with Vite, TanStack Query, react-hook-form + Zod, and shadcn/ui (Radix + Tailwind). It consumes the [HomeAccounting backend](../backend/) over HTTP.

## Architecture

The app follows a feature-oriented layout. The dependency direction is `pages → features → (api | auth | lib | components)`; reverse imports are not allowed.

### `src/api/`

- Typed `fetch` wrapper (`ApiClient`) with bearer-token injection and unified `ApiError` handling
- Per-resource modules: `accounts`, `auth`, `transactions`, `users`, `configuration`
- DTOs in `types.ts` mirror the Haskell types in `backend/src/Web/Types.hs` and `Domain/Core/Types.hs`

### `src/auth/`

- `AuthProvider` keeps `localStorage`, a `tokenRef`, and React state in sync as a single unit
- `ProtectedRoute` redirects unauthenticated users to `/login`
- OAuth redirect flow (Google / GitHub / Microsoft) with state stored in `sessionStorage`

### `src/features/`

Feature folders own their hooks, components, and Zod schemas:

- `accounts/` — list, create dialog, subtype-aware fields
- `transactions/` — list / pane
- `configuration/` — base/default currency, dictionaries, banking config

### `src/components/`

- `ui/` — shadcn/ui primitives (vendored, regenerate via `pnpm dlx shadcn@latest add ...`)
- App-level components (`Header`, `UserMenu`, …)

### `src/pages/`

Route-level components: `HomePage`, `LoginPage`, `RegisterPage`, `OAuthCallbackPage`, `NotFoundPage`. Routes are declared in `src/App.tsx`; the router uses `basename="/app"` to match Vite's `base: '/app/'`.

## Features

- ✅ Email/password registration and login
- ✅ OAuth sign-in (Google / GitHub / Microsoft) via redirect flow
- ✅ Account list with skeletons, error states, and create dialog
- ✅ Account subtype forms: cash, bank account, e-wallet, asset, loan
- ✅ Transactions list pane
- ✅ User configuration (currencies, dictionaries, banking)
- ✅ MSW-backed unit/component tests and a Playwright smoke E2E
- ✅ `GET /app/info` build/commit endpoint for ops health checks

## Prerequisites

### With Nix (recommended)

- [Nix](https://nixos.org/download.html) with flakes enabled
- [direnv](https://direnv.net/) (optional, for automatic shell loading)

### Without Nix

- Node.js 22+
- pnpm 9+
- [`just`](https://github.com/casey/just) (optional but recommended)

## Quick Start

### 1. Set up the dev environment

#### With Nix

```bash
nix develop          # or: direnv allow
just dev-setup
```

#### Without Nix

```bash
pnpm install
```

### 2. Configure the backend URL

```bash
cp .env.example .env
# edit VITE_API_BASE_URL if your backend isn't on http://localhost:8080
```

Make sure the backend is running (see [`../backend/README.md`](../backend/README.md)).

### 3. Run the dev server

```bash
just run
# or: pnpm dev
```

The app is served at **http://localhost:5173/app/** (note the `/app/` prefix; the bare root is intentional 404).

## Development Workflow

### Project Structure

```
web/
├── src/
│   ├── api/             # HTTP client + DTOs
│   ├── auth/            # Session, OAuth, protected routes
│   ├── components/
│   │   └── ui/          # shadcn/ui primitives (vendored)
│   ├── features/
│   │   ├── accounts/
│   │   ├── configuration/
│   │   └── transactions/
│   ├── lib/             # queryClient, formatters, cn helper
│   ├── pages/           # Route-level components
│   ├── styles/          # Tailwind globals
│   ├── test/            # Vitest setup, MSW server, fixtures
│   ├── App.tsx          # Route table
│   └── main.tsx         # Composition root
├── vite/
│   └── plugins/         # info-endpoint Vite plugin (dev + build)
├── e2e/                 # Playwright specs
├── docs/                # specs/, plans/
├── Caddyfile            # Production static-file server config
├── Dockerfile           # Multi-stage: node:22 → caddy:2
├── flake.nix            # Nix dev shell (node, pnpm, just)
├── justfile             # Task recipes
├── playwright.config.ts # E2E config (chromium, baseURL /app/)
├── tailwind.config.ts
├── tsconfig.json
└── vite.config.ts       # Vite + Vitest, base '/app/', alias @/* → src/*
```

### Common Commands

```bash
# Install / run / build
just install                # pnpm install
just run                    # pnpm dev
just build                  # tsc -b + vite build
just preview                # vite preview --host
just rebuild                # clean + install + build

# Code quality
just typecheck              # tsc --noEmit
just lint                   # eslint .
just lint-fix               # eslint . --fix
just format                 # prettier --write .
just format-check           # prettier --check .
just check                  # typecheck + lint + format-check

# Tests
just test                   # vitest run
just test-watch             # vitest
just e2e                    # playwright test (auto-starts dev server)

# Maintenance
just clean                  # rm dist node_modules .vite playwright-report test-results
just all                    # check + test + build

# CI / images
just ci                     # gh workflow run CI on the current branch
just publish [tag]          # build & push ghcr.io/homeaccounting/web:<tag>

# List everything
just --list
```

### Configuration

The web client is configured exclusively through environment variables. Vite only exposes variables prefixed with `VITE_` to the client bundle.

| Variable            | Where                             | Purpose                                                      |
| ------------------- | --------------------------------- | ------------------------------------------------------------ |
| `VITE_API_BASE_URL` | `.env` (dev) / `--build-arg` (CI) | Backend origin, e.g. `http://localhost:8080`                 |
| `APP_COMMIT_HASH`   | CI / Docker `--build-arg`         | Surfaced via `GET /app/info` (otherwise resolved from `git`) |

`.envrc` loads `.env` automatically through direnv.

### Base Path & Routing

The SPA is mounted at `/app/`:

- Vite `base: '/app/'`
- Router `basename="/app"`
- Caddy `try_files {path} /index.html` for SPA fallback

This keeps the backend and the SPA cleanly separated on the same domain.

### `/app/info` Endpoint

`vite/plugins/info-endpoint.ts` serves `{ "version": ..., "commit": ... }` at `GET /app/info`:

- **Dev**: connect middleware on the Vite server
- **Build**: emits a no-extension `info` asset that Caddy serves as `/srv/info`

Use this for health checks and to correlate browser bug reports with the deployed bundle.

## Testing

### Unit / component tests (Vitest + Testing Library + MSW)

```bash
just test                              # all tests
pnpm exec vitest run -t "create"       # filter by name
pnpm exec vitest run src/features/auth # filter by path
just test-watch                        # watch mode
```

`src/test/setup.ts` boots an MSW server with `onUnhandledRequest: 'error'`, so any unmocked request fails the test. Add or extend handlers in `src/test/handlers.ts`; per-test overrides go through `server.use(...)` and reset automatically. Render through the helper in `src/test/utils.tsx` to wire the QueryClient and AuthProvider consistently.

> **MSW pin**: `msw` is held at `~2.13.3`. The 2.14.x line removed response cloning, which locks happy-dom's `ReadableStream` and breaks every HTTP-mocked test. Don't bump it without re-validating the suite.

### End-to-end tests (Playwright)

```bash
just e2e                              # headless chromium
pnpm exec playwright test --headed    # with browser UI
pnpm exec playwright test --ui        # UI mode
```

`playwright.config.ts` auto-starts `pnpm dev` (or reuses an existing server) and points at `http://localhost:5173/app/`. The smoke spec in `e2e/smoke.spec.ts` covers register → empty pane → sign out → sign in. **The backend must be reachable** at `VITE_API_BASE_URL` for the suite to pass.

## Continuous Integration

GitHub Actions (`.github/workflows/ci.yml`) runs on every push to `main`/`master`, all PRs, and on `v*` tags. The pipeline:

- ✅ `pnpm install --frozen-lockfile` (Node 22)
- ✅ `pnpm exec tsc --noEmit`
- ✅ `pnpm exec eslint .`
- ✅ `pnpm exec prettier --check .`
- ✅ `pnpm exec vitest run`
- ✅ `pnpm build`
- 🐳 On `master` (and on manual dispatch): build and push a multi-tag image to `ghcr.io/<owner>/web` (`<sha>`, `<branch>`, `latest`)

Trigger CI manually with `just ci`.

## Production Image & Deployment

The Dockerfile is multi-stage:

1. `node:22-alpine` — `pnpm install --frozen-lockfile`, then `pnpm build` (with `VITE_API_BASE_URL` and `APP_COMMIT_HASH` injected as build args)
2. `caddy:2-alpine` — copies `/app/dist` to `/srv` and ships the `Caddyfile`

```bash
# Local image build & push
just publish                # tag = dev-<short-sha>
just publish v1.2.3         # explicit tag
```

Deployment itself lives in `homeaccounting/infra`:

```bash
# From the infra repo
just deploy-web <sha>
# Or via gh:
gh workflow run deploy.yml -R homeaccounting/infra -f service=web -f tag=<sha>
```

## Troubleshooting

### Dev server / API issues

```bash
# Verify the backend is up at VITE_API_BASE_URL
curl "$(grep VITE_API_BASE_URL .env | cut -d= -f2)/api/health"

# Reset local session and retry (in DevTools console)
localStorage.clear(); sessionStorage.clear(); location.reload();
```

### Build issues

```bash
just clean                  # rm dist/node_modules/.vite/...
pnpm install                # reinstall against lockfile
just typecheck              # narrow down to a TS error
just build                  # repro the bundle build
```

If type errors only appear in CI, ensure your local Node is 22 (`node --version`) and pnpm is 9 (`pnpm --version`).

### Test failures after upgrades

- **MSW errors about cloned responses** — verify `msw` is still `~2.13.3` (see warning above)
- **Radix `hasPointerCapture is not a function`** — confirm `src/test/setup.ts` still polyfills `Element.prototype` pointer-capture methods
- **Playwright "page not loaded"** — make sure the backend is running and reachable from `localhost`

### Nix issues

```bash
nix flake update            # refresh inputs
nix develop --refresh       # rebuild dev shell
nix-collect-garbage -d      # clear cache (last resort)
```

## References

- [`docs/specs/`](docs/specs) — design specs (e.g. `2026-04-28-web-mvp-design.md`)
- [`docs/plans/`](docs/plans) — implementation plans
- [`CLAUDE.md`](CLAUDE.md) — coding conventions, architecture rules, testing policy
- [`../backend/README.md`](../backend/README.md) — backend setup and API surface

## License

GNU Affero General Public License v3.0 (AGPL-3.0) - See [LICENSE](LICENSE) for details
