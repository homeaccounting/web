# Web MVP — Design

**Date:** 2026-04-28
**Status:** Draft (pre-implementation)
**Scope:** First web client for the HomeAccounting backend.

## 1. Purpose & scope

Build the first web client for the HomeAccounting REST API. MVP delivers exactly three end-user features:

1. **Authentication.** Register and log in with email + password. Sign in with Google (OAuth). Persist session via JWT. Sign out.
2. **Accounts pane (left).** List accounts the authenticated user can access (`GET /api/accounts`). Selection is URL-driven via `/accounts/:id`.
3. **Transactions pane (right).** When an account is selected, list its transactions (`GET /api/transactions?accountId=...`), newest first, read-only.

### Explicitly out of scope

Creating / editing accounts and transactions; share & revoke; overdraft limits; account subtype editing; banking integrations; telegram; configuration / dictionaries; any cross-currency UI logic beyond rendering what the API returns; mobile-first design beyond a stacked-panes fallback.

These are tracked as follow-ups (§9) but are not built or designed here.

## 2. Stack

| Concern              | Choice                                                                               |
| -------------------- | ------------------------------------------------------------------------------------ |
| Build tool           | Vite                                                                                 |
| Language             | TypeScript (strict, `noUncheckedIndexedAccess`)                                      |
| UI                   | React 18                                                                             |
| Routing              | React Router v6                                                                      |
| Server state         | TanStack Query                                                                       |
| Forms / validation   | `react-hook-form` + `zod`                                                            |
| Styling              | Tailwind CSS                                                                         |
| Component primitives | `shadcn/ui` (button, input, card, avatar, dropdown-menu, skeleton, alert, separator) |
| API types            | Hand-written DTOs (see §6)                                                           |
| Tests                | Vitest + React Testing Library + MSW; one Playwright smoke (local-only)              |
| Lint / format        | ESLint flat config + Prettier (`prettier-plugin-tailwindcss`)                        |
| Package manager      | pnpm                                                                                 |
| Dev environment      | Nix flake + direnv (`use flake; dotenv .env`)                                        |
| Task runner          | `just`                                                                               |
| CI                   | GitHub Actions: build + test only, no deploy                                         |

Rationale: a thin authenticated SPA over an existing REST API gets no SSR benefit, so Vite + React keeps build/dev fast and the deploy story trivially "static bundle behind a reverse proxy." Server state ownership belongs to TanStack Query; UI state is small enough that React Context (auth) plus URL params (selected account) is the whole picture — no Redux, no Zustand. shadcn/ui keeps the component layer copy-pasted-into-the-repo, so no opaque framework lock-in.

## 3. Repository layout

```
web/
├─ flake.nix                 # devShell: nodejs_22, pnpm, just, gettext
├─ flake.lock
├─ .envrc                    # use flake; dotenv .env
├─ .env.example              # VITE_API_BASE_URL=http://localhost:8080
├─ justfile                  # mirrors backend recipe style
├─ .github/
│  └─ workflows/
│     └─ ci.yml              # build & test, no deploy
├─ index.html
├─ vite.config.ts            # base: '/app/'
├─ tsconfig.json
├─ package.json
├─ eslint.config.js
├─ .prettierrc
├─ tailwind.config.ts
├─ postcss.config.js
└─ src/
   ├─ main.tsx               # React root, providers (QueryClient, Router, AuthProvider)
   ├─ App.tsx                # router config
   ├─ api/
   │  ├─ client.ts           # fetch wrapper: base URL, JWT header, error mapping, 401 handling
   │  ├─ types.ts            # hand-written DTOs (mirrors backend Web/Types.hs and *API.hs)
   │  ├─ auth.ts             # register / login / oauth-initiate / oauth-callback / link-oauth / refresh
   │  ├─ accounts.ts         # listAccounts()
   │  ├─ transactions.ts     # listTransactions({ accountId })
   │  └─ users.ts            # getMe()
   ├─ auth/
   │  ├─ AuthContext.tsx     # token + user, persisted to localStorage under "ha.auth.v1"
   │  ├─ useAuth.ts
   │  ├─ ProtectedRoute.tsx
   │  └─ oauthFlow.ts        # state generation, sessionStorage handling
   ├─ features/
   │  ├─ accounts/
   │  │  ├─ AccountsPane.tsx
   │  │  └─ useAccounts.ts
   │  └─ transactions/
   │     ├─ TransactionsPane.tsx
   │     └─ useTransactions.ts
   ├─ pages/
   │  ├─ LoginPage.tsx
   │  ├─ RegisterPage.tsx
   │  ├─ OAuthCallbackPage.tsx
   │  └─ HomePage.tsx        # two-pane layout w/ <Outlet/> for /accounts/:id
   ├─ components/
   │  ├─ ui/                 # shadcn/ui primitives (copy-pasted, owned by us)
   │  ├─ Header.tsx          # app name + user menu
   │  └─ UserMenu.tsx        # avatar dropdown: "Link Google" / "Sign out"
   ├─ lib/
   │  ├─ format.ts           # currency / date formatters
   │  └─ queryClient.ts
   ├─ test/
   │  ├─ fixtures.ts
   │  ├─ handlers.ts         # MSW handlers
   │  └─ setup.ts
   └─ styles/
      └─ globals.css         # Tailwind base
```

Each module has a single responsibility. `api/*` only does HTTP. `features/*` owns UI plus the queries it needs. `auth/*` owns session. `pages/*` is composition. Cross-feature concerns (auth, query client) live above features.

## 4. Routing

The web app is served under the **`/app`** path prefix at `WEB_ORIGIN` (e.g. `https://example.com/app/...`). Concretely:

- `vite.config.ts` sets `base: '/app/'` so all built asset URLs are prefixed correctly.
- `BrowserRouter` is configured with `basename="/app"` so route paths remain authored as the un-prefixed paths below; the prefix is applied automatically when generating URLs and parsing `location.pathname`.
- Reverse proxy (or static host) is responsible for serving `index.html` for any `${WEB_ORIGIN}/app/*` path that doesn't match a file in `dist/` (SPA fallback).
- The backend continues to serve `${API_ORIGIN}/api/*`. In a single-origin deployment, the proxy routes `/api/*` to the backend and `/app/*` to the static SPA bundle.

| Path (router-relative)           | Full URL example                               | Auth      | Component                |
| -------------------------------- | ---------------------------------------------- | --------- | ------------------------ |
| `/login`                         | `${WEB_ORIGIN}/app/login`                      | public    | `LoginPage`              |
| `/register`                      | `${WEB_ORIGIN}/app/register`                   | public    | `RegisterPage`           |
| `/auth/oauth/:provider/callback` | `${WEB_ORIGIN}/app/auth/oauth/google/callback` | public    | `OAuthCallbackPage`      |
| `/`                              | `${WEB_ORIGIN}/app/`                           | protected | `HomePage` (placeholder) |
| `/accounts/:id`                  | `${WEB_ORIGIN}/app/accounts/<uuid>`            | protected | `HomePage` + selection   |
| `*`                              | —                                              | —         | 404                      |

`ProtectedRoute` redirects unauthenticated users to `/login?redirectTo=<path>` (router-relative; React Router resolves the `/app` basename when navigating).

## 5. Authentication

### 5.1 Token storage and lifecycle

`AuthResponse` from the backend is `{ token, userId, email: string | null, expiresIn: number /* seconds */ }`. The frontend computes `expiresAt = Date.now() + expiresIn * 1000` on receipt and persists `{ token, userId, email, expiresAt }` to `localStorage` under key `ha.auth.v1`. `AuthContext` hydrates from there on mount and exposes `{ user, token, login, register, logout }`. The `api/client.ts` fetch wrapper reads the current token from a small in-memory ref (kept in sync with context) and adds `Authorization: Bearer <token>`. On `401` from any API call the wrapper clears the session and the router pushes to `/login`. Token refresh (`POST /api/auth/refresh` with body `{ token }`) is wired but invoked only reactively on `401` — no pre-emptive refresh in MVP.

`email` may be `null` — OAuth-only users whose provider didn't return an email will have `email: null` in both `AuthResponse` and `UserProfileResponse`. UI surfaces (header avatar, login confirmation) must handle this case; fallback is the short user id.

**Tradeoff (accepted):** localStorage JWT is XSS-exposed. Hardening to httpOnly cookies needs backend cooperation and is tracked under §9.

### 5.2 Email / password

`POST /api/auth/register` and `POST /api/auth/login` exchange `{ email, password }` for an `AuthResponse`. zod schemas enforce email shape and password min-length; backend `ValidationErr`s map field-by-field; generic errors render as a banner above the form.

### 5.3 Google OAuth (sign-in)

The backend already exposes the redirect-based OAuth flow. The frontend orchestrates:

1. User clicks "Sign in with Google" on `/login` (or `/register`).
2. Frontend calls `GET /api/auth/oauth/google`. Backend returns `{ redirectUrl, state }`.
3. Frontend stores `state` in `sessionStorage` under `ha.oauth.state`, clears any `linking` flag, then `window.location.href = redirectUrl`.
4. Google redirects the browser to **the frontend** at `${WEB_ORIGIN}/app/auth/oauth/google/callback?code=…&state=…`. (Cross-repo coordination: the OAuth client's redirect URI must point at this exact path under `/app`, and the backend's OAuth config must use the same URI when exchanging the code.)
5. `OAuthCallbackPage` validates the returned `state` against `sessionStorage`, then calls `GET /api/auth/oauth/google/callback?code=…&state=…` (XHR), receives `AuthResponse`, stores the session, navigates to `redirectTo` or `/`.

State mismatches and missing `code` produce an inline error with a "Try again" link back to `/login`.

### 5.4 Account linking

We must not silently create duplicate users when someone registers with email and later signs in with Google. Two complementary mechanisms:

**(a) Backend auto-link by verified email.** When `Application/Services/AuthService.handleOAuthCallback` finds no user via `(provider, subject)`, it must look up by the OAuth-provided email (gated on `email_verified`). If a user exists, attach the OAuth identity to that user and return their JWT; otherwise create a new user as today. This is a backend prerequisite — see [`backend/docs/specs/2026-04-28-oauth-auto-link-by-email-design.md`](../../../backend/docs/specs/2026-04-28-oauth-auto-link-by-email-design.md). The web MVP can ship before this lands; the only consequence is the duplicate-account hole stays open until then.

**(b) Web "Link Google" UI** in the user menu (header avatar dropdown). Visible only when `oauthIdentities` from `GET /api/users/me` does not contain an entry for `google`. Click flow:

1. Frontend calls `GET /api/auth/oauth/google` (same initiate as sign-in).
2. Stores `state` plus `linking=true` in `sessionStorage`.
3. Redirects to Google.
4. Google returns to `/auth/oauth/google/callback?code=&state=`.
5. `OAuthCallbackPage` reads `linking` from sessionStorage. If set **and** the user is already authenticated, it calls `POST /api/auth/link-oauth` with `{ provider: "google", code, state }`; if not, falls through to the normal sign-in callback.
6. On success, the page invalidates the `['users','me']` query and navigates to `/`. Errors (e.g. "OAuth account already linked to another user") render as a banner.

### 5.5 Linked providers — already on the backend

`GET /api/users/me` returns `UserProfileResponse { userId, email, hasPassword, oauthIdentities, telegramIdentity, externalAccountId }`. The frontend uses `oauthIdentities` to drive the "Link Google" / "Google linked" branch in the user menu. **No backend change needed for this.**

## 6. API integration

### 6.1 Hand-written DTOs (MVP choice)

The backend currently has no OpenAPI document (no `servant-openapi3` dependency, no `ToSchema` instances). Adding it is a real chunk of mostly-mechanical work and not necessary for the MVP. We instead hand-write the narrow set of TypeScript DTOs the web app touches in `src/api/types.ts`, mirroring `backend/src/Web/Types.hs` plus the request and response types in each `Web/API/*API.hs` module. Approximate footprint: ~120 LOC.

Trade-off: silent drift if backend DTOs change. Mitigated by (a) keeping the hand-written types co-located with their fetcher functions so a backend change forces a visible diff at the call site, and (b) hard component tests via MSW that exercise the same shapes.

The list endpoints wrap their results: `GET /api/accounts` returns `AccountListResponse { accounts, totalCount }` and `GET /api/transactions` returns `TransactionListResponse { transactions, totalCount }`. The fetcher functions in `src/api/accounts.ts` and `src/api/transactions.ts` unwrap to a plain array so callers (and TanStack Query) receive `Account[]` / `Transaction[]` directly. `totalCount` is currently informational and not used in MVP — kept available on a wrapping type if the component layer needs it later.

When OpenAPI is added to the backend (for API documentation purposes or because drift bites), migrate to `openapi-typescript` + `openapi-fetch`.

### 6.2 Endpoints used by MVP

| Method & path                          | Purpose                       |
| -------------------------------------- | ----------------------------- |
| `POST /api/auth/register`              | email/password registration   |
| `POST /api/auth/login`                 | email/password login          |
| `GET  /api/auth/oauth/google`          | begin OAuth                   |
| `GET  /api/auth/oauth/google/callback` | sign-in OAuth callback        |
| `POST /api/auth/link-oauth`            | link Google to current user   |
| `POST /api/auth/refresh`               | refresh JWT (reactive on 401) |
| `GET  /api/users/me`                   | profile + linked providers    |
| `GET  /api/accounts`                   | list accessible accounts      |
| `GET  /api/transactions?accountId=…`   | list transactions for account |

Out of scope for MVP: every other endpoint (account create / share / overdraft / type, transaction income / expense / transfer / labels / category, configuration, banking, telegram, user update / change-password / unlink).

### 6.3 Server state

TanStack Query owns server state. Two query keys:

- `['accounts']` → `listAccounts()`
- `['transactions', accountId]` → `listTransactions({ accountId })`
- `['users','me']` → `getMe()` (used by header)

Stale time 30s, refetch on window focus. No optimistic updates in MVP (read-only).

### 6.4 UI state

Selected account ID lives in the URL (`/accounts/:id`) — bookmarkable, shareable, no separate global store. `AuthContext` is the only Context. No Redux, no Zustand.

## 7. UI / layout

### 7.1 Shell

```
┌──────────────────────────────────────────────────────────────────┐
│ Header: app name · user menu (avatar → Link Google / Sign out)   │
├────────────────┬─────────────────────────────────────────────────┤
│ AccountsPane   │ TransactionsPane                                │
│ (left, ~280px) │ (right, fills)                                  │
└────────────────┴─────────────────────────────────────────────────┘
```

### 7.2 AccountsPane

A vertical list (`<ul>`) of selectable items. Each row: account name, optional subtype tag, current balance + currency. Active item highlighted (URL-driven). States:

- **Loading** — skeleton rows.
- **Error** — inline retry banner.
- **Empty** — "No accounts yet" (no create CTA in MVP).

Built by hand — semantically a list, not a grid. ~5 lines of JSX with `.map()`.

### 7.3 TransactionsPane

When the route is `/`, shows a "Select an account" placeholder.
When `/accounts/:id`:

- Header strip: selected account name + balance.
- Plain `<table>`: date (right-aligned), description, category, amount (right-aligned, signed, currency-formatted, red for negative).
- Order: as returned by API (newest first per backend spec).
- No client-side sort, filter, virtualization, or pagination in MVP. If transaction lists grow large, virtualization or TanStack Table become a flagged follow-up.
- States: skeleton rows / inline retry banner / "No transactions yet."

Built by hand — 4 read-only columns, no interactions. Migration to TanStack Table is cheap because the markup is small and TanStack Table is headless.

### 7.4 Login / Register pages

Centered card. Email and password inputs (`react-hook-form` + `zod`). Below the form: separator + **Sign in with Google** button. Cross-link between login and register. Server `ValidationErr` maps to per-field errors; other errors render as a banner above the form.

### 7.5 Header & user menu

The header shows the app name and a user avatar dropdown:

- **Link Google** (visible only when `google` is not in `oauthIdentities`)
- **Sign out** (always visible)

### 7.6 Errors

Network and HTTP errors surface inline within the affected pane (banner above the list with a "Retry" action). Backend `ValidationErr`s map field-by-field on forms. No global toast system in MVP.

### 7.7 Responsive

Desktop-first. Below ~768px the two panes stack: AccountsPane collapses into a drawer toggled from the header. Functional only — proper mobile design is a follow-up (§9).

## 8. Quality gates

### 8.1 Linting & formatting

- ESLint flat config (`eslint.config.js`) with TypeScript-ESLint recommended-type-checked, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-jsx-a11y`. No custom rules in MVP.
- Prettier with `prettier-plugin-tailwindcss` so class-list ordering doesn't churn diffs.
- `tsconfig.json`: `strict: true`, `noUncheckedIndexedAccess: true`, `noFallthroughCasesInSwitch: true`. Path alias `@/*` → `src/*`.
- `just check` runs `typecheck + lint + format-check` (mirrors backend's `just check`). CI runs the same three.

### 8.2 Tests

Three tiers, kept small:

1. **Unit (Vitest), co-located `*.test.ts(x)`:**
   - `src/lib/format.ts` (currency, date)
   - `AuthContext` reducer/state transitions
   - `api/client.ts` (Authorization header, 401 handling, error mapping)
   - zod schemas

2. **Component (Vitest + RTL + MSW):**
   - `LoginPage` happy path + invalid creds
   - `RegisterPage` happy path
   - `OAuthCallbackPage` for both flows (sign-in vs link), including state mismatch
   - `AccountsPane` loading / empty / populated / error
   - `TransactionsPane` swapping when account selection changes
   - `ProtectedRoute` redirects unauthenticated users

3. **End-to-end (Playwright), one smoke test, local-only:**
   - `register → empty accounts pane → log out → log in → still empty accounts pane`
   - Wired as `just e2e`. Requires backend running locally. Not in CI in MVP — bringing up Postgres + the Haskell backend for one smoke test isn't worth the CI time today.

No coverage thresholds. No visual regression. No a11y audits beyond what RTL queries naturally enforce.

### 8.3 CI

`.github/workflows/ci.yml`, mirroring backend triggers (push to `main` / `master` / tags, PRs on `**`, `workflow_dispatch`), `concurrency` with cancel-in-progress, single `build-and-test` job:

```
actions/checkout@v4
pnpm/action-setup@v4 (pnpm 9)
actions/setup-node@v4 (Node 22, cache: pnpm)
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
pnpm exec eslint .
pnpm exec prettier --check .
pnpm exec vitest run
pnpm build
```

No image build, no deploy job — out of scope.

### 8.4 Pre-commit

`lint-staged` + `simple-git-hooks` are wired but **opt-in** — they install only when an explicit env var is set during `pnpm install`. Default contributor experience is `just check`.

## 9. Backend prerequisites (separate spec)

Tracked in [`backend/docs/specs/2026-04-28-oauth-auto-link-by-email-design.md`](../../../backend/docs/specs/2026-04-28-oauth-auto-link-by-email-design.md).

Single code-level prerequisite:

1. **Auto-link OAuth by verified email** in `Application/Services/AuthService.handleOAuthCallback`. Without it, `register-with-email then sign-in-with-Google` silently creates a duplicate user. Web MVP can ship before this lands; the duplicate-account hole stays open until it does.

Configuration-level prerequisite (no code change, but must be done before the OAuth flow works end-to-end in any environment):

2. **Google OAuth client redirect URI must point at the frontend, including the `/app` prefix.** Per §5.3 step 4, Google redirects the browser to `${WEB_ORIGIN}/app/auth/oauth/google/callback`, and the frontend then forwards `code` and `state` via XHR to the backend's existing `GET /api/auth/oauth/google/callback`. The backend's OAuth client configuration must (a) register the exact frontend URI (with `/app` prefix) as an authorized redirect URI in the Google Cloud Console for the OAuth client, and (b) supply that same URI when exchanging the code (otherwise Google rejects the exchange). One line per environment (local dev, prod) — but it has to be coordinated, not assumed.

Originally proposed prereqs that turned out to be unnecessary:

- ~~Linked-providers info on `/api/users/me`~~ — `oauthIdentities` is already in `UserProfileResponse`.
- ~~Expose OpenAPI~~ — chose hand-written DTOs (§6.1) to avoid forcing scope creep on the backend.

## 10. Flagged follow-ups (not in MVP)

- Mobile / responsive design beyond stacked panes.
- Account create / edit, transaction record, sharing, overdraft, type editing, telegram, banking, dictionaries, configuration.
- TanStack Table when client-side sort / filter / virtualization is needed.
- E2E in CI (currently local-only).
- Image build + deploy story (Caddy serving `dist/` static bundle; GHCR image; deploy recipes parallel to backend's). Separate infra spec.
- Token storage hardening (httpOnly cookies) — needs backend cooperation.
- Pre-emptive token refresh before expiry.
- OpenAPI-typed client when the backend grows OpenAPI for its own reasons.

## 11. Cross-cutting tradeoffs accepted

- **localStorage JWT** for MVP — XSS-exposed; documented and tracked.
- **No e2e in CI** — mitigated by hand-written DTOs co-located with their callers, plus MSW component tests against the same shapes.
- **No virtualization** — acceptable until transaction lists grow.
- **Hand-written DTOs** instead of generated ones — drift risk accepted to avoid forcing OpenAPI scope onto the backend right now.

## 12. Definition of done (MVP)

- A user can register with email + password, log in, log out, and stay signed in across reloads.
- A user can sign in with Google, and (if a Google account is not yet linked) link Google from the user menu while logged in.
- After login, the AccountsPane lists every account from `GET /api/accounts`.
- Selecting an account routes to `/accounts/:id` and the TransactionsPane lists `GET /api/transactions?accountId=…`.
- Loading, empty, and error states are visible for both panes.
- `just check` (typecheck + lint + format-check) and `just test` (unit + component) both pass.
- CI workflow runs `install / typecheck / lint / format-check / test / build` on PRs and pushes.
