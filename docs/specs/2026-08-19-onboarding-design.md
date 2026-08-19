---
status: draft
date: 2026-08-19
---

# First-run onboarding — base setup before the app (web)

Web-client feature (`homeaccounting/monorepo`) that gives a newly-registered user
a dedicated **first-run screen** to confirm their base settings — **country,
default currency, language, and base currency** — before dropping them into the
normal app view. Tracker: `homeaccounting/tracker#58`.

Onboarding is **pure UX**: the app is fully usable without it (exactly as it is
today). This spec adds a soft, skippable nudge that leans on the regional
**preset cascade** already shipped in tracker#47 so one country choice seeds
sensible region-appropriate defaults.

## Motivation

Today a new user lands directly in the transactions view with base signals unset
or on silent defaults (USD + English, `country == null`). They discover the
mismatch only after entering data. A one-time first-run screen surfaces these
critical choices up front and makes the country preset do the heavy lifting.

## Scope

**In scope**

- A `/onboarding` route with a first-run screen that lets the user confirm
  country → (preset applies) → default currency, language, and base currency,
  reusing the tracker#47 selectors and mutation hooks.
- A soft, once-per-session redirect that sends a brand-new, unconfigured user to
  `/onboarding` when they land on the index route — never a hard gate.
- Copy reassuring the user they can change everything later in Settings.

**Out of scope** (unchanged from tracker#58)

- The UI-translation runtime / catalogs — localization epic
  (`homeaccounting/tracker#56` / `#35`).
- Region-appropriate starter-content seeding — personalization epic
  (`homeaccounting/tracker#48`) future scope.
- Any backend contract change. Onboarding consumes only endpoints already
  shipped for tracker#47; this repo is web-only.

## The gate: when a user needs onboarding

Onboarding is shown only when the account is **both brand-new and unconfigured**:

```
needsOnboarding = config.country == null && !hasAnyTransaction
```

Rationale for the conjunction (either signal alone is wrong):

| Scenario                                   | Shows onboarding? | Correct because                                    |
| ------------------------------------------ | ----------------- | -------------------------------------------------- |
| Fresh registration (no txns, country null) | yes               | This is exactly the target case.                   |
| Completes onboarding (picks a country)     | no                | `country` is now set → nudge permanently clears.   |
| Skips, then adds a transaction             | no                | Account has data → user has clearly started.       |
| Existing user who never set a country      | no                | Has transactions → established users never nagged. |
| Skips, adds nothing, logs in again         | yes (re-nudge)    | Still empty + unset; a gentle soft nudge.          |

- **`has transactions`** protects established users from ever being nagged — the
  key reason a pure `country == null` check is unacceptable (it would surface
  onboarding to every pre-existing user who never set a country).
- **`country == null`** is what onboarding _fixes_, so completing it — even with
  zero transactions — permanently clears the nudge.

The formula above is the semantic definition of "needs onboarding." The
session-skip flag (below) is a separate _redirect suppressor_ layered on top by
`useOnboardingStatus` — it is not part of this definition, so a skipped-but-still
-empty account still "needs onboarding" and re-nudges on a fresh session.

### Soft, once-per-session behavior

The redirect is a nudge, not a trap:

- It fires only on the app's **home/transactions landing surface** — the `/` and
  `/transactions` routes, which both render the same `HomePage` — and only when
  `needsOnboarding` is true and the session-skip flag is unset. Both routes are
  guarded (not just `/`), so a fresh user is nudged whichever way they reach the
  landing surface; guarding only `/` would leave `/transactions` as an unguarded
  path to the same screen.
- Every other route (`/reports`, `/profile`, `/onboarding` itself) stays
  reachable without redirect — that, plus the once-per-session skip flag, is what
  keeps the nudge from being a trap.
- `/onboarding` is freely visitable even when `needsOnboarding` is false (an
  already-configured or established user who navigates there directly just sees
  the form with their current values and can leave via Get started); it is
  harmless and intentionally not redirected away.
- **"Skip for now"** sets `sessionStorage['onboarding:skipped:<userId>']` so the
  redirect does not re-fire for the rest of that browser session. It intentionally
  re-nudges on a _fresh_ login while the account is still empty and unset — a
  `sessionStorage` (not `localStorage`) flag, so no persistent cruft and no
  backend change.

## Components & files

### `src/features/transactions/useHasTransactions.ts` (new)

A cheap emptiness probe. TanStack query keyed `['transactions', 'any']`, enabled
only when a session exists, calling `transactionsApi.list({ limit: 1 })` and
selecting `res.transactions.length > 0`. `limit: 1` keeps the payload minimal;
the backend `GET /api/transactions` with no `accountId` lists across all of the
user's accounts (`src/api/transactions.ts:47-64`). The `['transactions', 'any']`
key is deliberately distinct from the account-scoped transaction-list keys, so it
is not touched by the `useSetCountry` refetch (which targets `['configuration']`
and `['providers']`) nor by account-scoped list invalidations; it only needs to
resolve once and stays valid for the life of the onboarding decision.

### `src/features/onboarding/useOnboardingStatus.ts` (new)

Composes the gate. Reads `useConfiguration()` and `useHasTransactions()`, and the
session-skip flag (keyed by the current user id from the auth session), returning:

```ts
{
  needsOnboarding: boolean; // country == null && !hasAnyTransaction && !skipped
  isPending: boolean;       // either underlying query still loading
  skip: () => void;         // set the session-skip flag
}
```

While either query is pending, `needsOnboarding` is `false` and `isPending` is
`true` so the gate never redirects on incomplete data (avoids a flash-redirect
that a later resolve would contradict).

### `src/features/onboarding/OnboardingGate.tsx` (new)

Wraps the index route element. If `useOnboardingStatus().needsOnboarding`, it
renders `<Navigate to="/onboarding" replace />`; otherwise it renders its
children (the normal `HomePage`). It does **not** wrap `/onboarding` itself, so
there is no redirect loop. While `isPending`, it renders the children's normal
loading affordance (no redirect).

### `src/features/onboarding/OnboardingForm.tsx` (new)

The setup controls, reusing the existing tracker#47 hooks and selector UI
patterns from `ProfileGeneralPane`:

- **Country** (`useSetCountry`) — the primary control. On change the existing
  preset cascade runs server-side (may set default currency, language, and base
  currency) and the hook refetches `['configuration']` + `['providers']` and
  toasts what it adjusted.
- **Default currency** (`useSetDefaultCurrency`) — pre-filled from config,
  editable. Uses `values` (not `defaultValues`) so it re-syncs when the country
  preset shifts it, matching the existing `CurrencyRow` behavior.
- **Language** (`useSetLanguage`) — pre-filled from config, editable.
- **Base currency** (`useSetBaseCurrency`) — pre-filled from config, editable
  while `config.baseCurrencyEditable` is true (always true for a brand-new,
  transaction-less account). **No** `AlertDialog` confirmation here — there is
  nothing to re-base on an empty account, unlike the Settings surface.

Each control writes immediately on change (same as Settings today), so a user who
picks a country and then hits Skip still keeps the applied preset.

### `src/pages/OnboardingPage.tsx` (new)

Route shell: a welcome heading ("Let's set up the basics"), `<OnboardingForm>`,
a reassurance line — _"You can change any of this later in Settings."_ — and the
actions:

- **Get started** (primary) → `navigate('/transactions', { replace: true })`.
- **Skip for now** (secondary) → `status.skip()` then the same navigation.

If configuration fails to load, the page shows the same load-error affordance as
`ProfileGeneralPane` (alert + retry) rather than blocking the user.

### `src/App.tsx` (modified)

- Register `<Route path="/onboarding" element={<OnboardingPage />} />` inside the
  `<ProtectedRoute>` tree (ungated — no `OnboardingGate` wrapper, so no loop).
- Wrap **both** landing-surface route elements — `/` and `/transactions`, which
  each render `HomePage` — in `<OnboardingGate>`, e.g.
  `<Route path="/" element={<OnboardingGate><HomePage /></OnboardingGate>} />`
  and the identical wrapper on `/transactions`. This is the only place the nudge
  fires; all other routes are left unwrapped.

## Data flow

1. User registers → `signIn` → navigates to `/` (unchanged in `RegisterPage`).
2. `OnboardingGate` resolves `useConfiguration` + `useHasTransactions`. For a
   fresh account (`country == null`, no transactions) → redirect to `/onboarding`.
3. User picks a country → `useSetCountry` cascade updates config server-side →
   refetch settles → `OnboardingForm` fields reflect the preset (currency,
   language) live from the shared `['configuration']` cache.
4. User optionally overrides any field (each persists on change).
5. **Get started** / **Skip for now** → navigate to `/transactions`. Because
   `country` is now set (if they picked one) or the session-skip flag is set (if
   they skipped), the gate will not redirect again.

## Testing

**Unit / component (Vitest + Testing Library + MSW)**

- `useHasTransactions`: empty list → `false`; non-empty → `true` (MSW handler
  returning 0 vs 1 transaction).
- `useOnboardingStatus`: truth table over `country` (null/set) ×
  `hasAnyTransaction` (true/false) × skip flag (set/unset), plus the
  `isPending` → `needsOnboarding === false` invariant.
- `OnboardingGate`: redirects to `/onboarding` when `needsOnboarding`; renders
  children otherwise; never redirects while pending.
- `OnboardingForm`: changing country updates the visible currency/language from
  the refetched config; each control issues its mutation on change; base currency
  has no confirmation dialog.
- `OnboardingPage`: "Get started" navigates to `/transactions`; "Skip for now"
  sets the session flag and navigates; config load error shows retry.

**E2E (Playwright, `@local`)**

- Register → land on `/onboarding` → select a country → currency + language
  reflect the preset → **Get started** → `/transactions`, and re-visiting `/`
  does not redirect back to onboarding.
- Register → **Skip for now** → `/transactions`; re-visiting `/` in the same
  session does not redirect.

## Constraints / principles

- **No backend contract change.** Consume only the tracker#47 endpoints.
- **Additive.** New feature folder + one route registration + gate wrapper on the
  landing-surface routes (`/` and `/transactions`); existing Settings surfaces and
  hooks are unchanged.
- **Soft by construction.** The app is never blocked; onboarding is a one-time
  per-session nudge the user can always leave.

## Related

- `homeaccounting/tracker#47` — country/language signal + provider scoping (web);
  provides the selectors and preset-cascade hooks this builds on. Design:
  `docs/specs/2026-08-18-country-language-provider-scoping-design.md`.
- `homeaccounting/tracker#48` — personalization epic (curation).
- `homeaccounting/tracker#56` / `#35` — localization epic (UI translation), a
  later consumer of the language choice made here.
