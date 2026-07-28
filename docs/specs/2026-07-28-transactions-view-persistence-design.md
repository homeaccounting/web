---
status: draft
---

# Persist & restore the transactions view (+ date range in URL) (web)

## Context

The "currently open account" is already URL-addressable: `/accounts/:id` (`src/App.tsx:21`) is the
single source of truth, read independently by `AccountsPane` (`useParams`,
`src/features/accounts/AccountsPane.tsx:48`) and `TransactionsPane`
(`src/features/transactions/TransactionsPane.tsx:186`). Selecting an account is navigation.

Everything *else* about the transactions view is ephemeral React state in `TransactionsPane` and is
**neither persisted nor in the URL**:

- **Date window** — `defaultWindow` / `fromInput` / `toInput` / `appliedWindow`
  (`TransactionsPane.tsx:188-191`), defaulting to `defaultDateWindow(new Date())` (last month → today,
  `transactionFilters.ts:65-69`). Two raw `DatePicker`s in `TransactionFilterBar`
  (`TransactionFilterBar.tsx:49-72`), with an `isValidDateWindow` mid-edit guard
  (`TransactionsPane.tsx:363-376`).
- **Filters** — `useState<TransactionFilters>(EMPTY_FILTERS)` (`TransactionsPane.tsx:192`); shape in
  `transactionFilters.ts:4-18` (`description`, `labelIds`, `category` by **name**, `contactId` by id,
  `showCancelledFailed`). Applied client-side over the loaded window
  (`applyTransactionFilters`, `transactionFilters.ts:26-46`).

Consequences: reopening the app resets the date window and filters, and a filtered/date-scoped view
cannot be shared as a link.

The `/reports` page already solved the "date range in the URL" problem cleanly and is the pattern we
reuse:

- Period **data model** — `src/features/reports/period.ts`: `PeriodPreset`, `PERIOD_PRESETS`,
  `PERIOD_PRESET_LABELS`, `DayRange`, `presetRange(preset, today)`, `toQueryRange(range)`.
- Period **control** — `src/features/reports/PeriodSelector.tsx` (a `Select` of presets + `custom`,
  revealing two `DatePicker`s for custom).
- **URL parse/serialize** — `src/features/reports/reportsUrl.ts`
  (`parseReportsParams` / `reportsParamsToSearch`), with the URL as source of truth; `ReportsPane`
  holds no local state and writes via `setSearchParams(..., { replace: true })`.

Two persistence idioms already exist in the repo: a localStorage hook
(`usePersistedPageSize`, `TransactionPagination.tsx:15-25`, key `ha.transactions.pageSize`) and plain
module functions over storage (`stickyDate.ts`, sessionStorage, key `ha.transactions.lastDay`, with a
stale-across-midnight guard). Auth uses localStorage (`src/auth/storage.ts`, key `ha.auth.v1`).

## Goals

- **Restore on reopen**: reopening the app returns the user to the last account, with its date range
  and filters — a single **global "last view"** (one remembered account + period + filters, not
  per-account).
- **Date range in the URL** on `/accounts/:id`, using the **reports period model** (presets +
  custom), so a shared/bookmarked link carries account + date range and stays *live* (presets are
  relative). This is consistent with the accounting-app norm (reports/periods are the one thing those
  apps make addressable) and with this app's own `/reports` page.
- **Reuse, not reinvent, the date-range data model** — extract the reports period pieces up a layer
  so both `/reports` and `/accounts/:id` share one model.
- **Reports parity**: `/reports` reuses the *same* precedence (`URL → lastView → default`) for its
  date range and restores its last period + tab on reopen — symmetric with transactions. (This
  replaces the earlier "no change to reports behavior" goal: reports now gains restore-on-reopen too,
  via the shared mechanism.)
- No regression to pagination persistence, sticky create-dialog date, the client-side filtering
  semantics, or reports' URL param names / preset set.

## Non-goals (deferred)

- **Filters in the URL.** Per the accounting-app norm, ad-hoc transaction filters
  (search text, labels, category, contact, cancelled/failed) stay **storage-only**. Sharing a
  *filtered* slice via a link is out of scope; a shared link carries account + date range only.
  Export remains the path for sharing filtered data.
- **Per-account memory.** One global last view only (transactions).
- **`all-time` for transactions** (see Preset model).
- **Cross-page restore.** Opening the app root restores the last *account/transactions* view; it does
  not route you to `/reports` even if reports was the last page visited. Each page restores its own
  view when navigated to.
- New filter facets, sorting, server-side filter params, changing pagination persistence.

## Design

### Precedence (the resolution chain)

Date range resolves as **URL → lastView → default (`last-month`)**, derive-only:

1. **URL carries `period`** → authoritative (shared links, bookmarks, back/forward, and the
   cold-start redirect, which rebuilds the URL *from* lastView so the restored range arrives through
   the URL).
2. **URL has no `period`** → fall back to stored `lastView.period` (+ its custom `from`/`to`).
3. **No lastView** → default preset `last-month`.

Derive-only means the pane resolves the range from that chain each render (as `ReportsPane` already
derives a default when the URL is silent — we only lengthen the fallback chain by one). No forced URL
rewrite on mount. The cold-start `/` redirect and search-preserving `NavLink`s (below) keep `period`
in the URL during normal use, so step 2 is chiefly a safety net for a bare, externally-pasted
`/accounts/:id`. This makes date range behave consistently with filters (which also restore from
storage when the URL is silent). `lastView` is therefore read in exactly two places: the cold-start
redirect and the pane's date-range fallback + filter seed.

**This precedence is implemented once (in the shared `parsePeriodParams`) and reused by both views.**
`/reports` resolves its date range through the identical `URL → lastView → default` chain (and its
tab through `URL → lastView → 'cash-flow'`). Reports has no account rung and needs no redirect — its
restore is pure derive-from-`lastView` when the URL is silent, exactly like the transactions
date-range fallback. See "Reports parity" below.

### Preset model (shared, reused from reports)

Extract the reports period pieces up a layer so `features/transactions/` can consume them without a
feature→feature import (the dependency rule is `pages → features → (api | auth | lib | components)`):

| Piece | From | To |
| --- | --- | --- |
| `period.ts` (`PeriodPreset`, `PERIOD_PRESET_LABELS`, `DayRange`, `presetRange`, `toQueryRange`) | `src/features/reports/period.ts` | `src/lib/period.ts` |
| `PeriodSelector.tsx` | `src/features/reports/PeriodSelector.tsx` | `src/components/PeriodSelector.tsx` |
| **new** `parsePeriodParams` / `periodParamsToSearch` (period, from, to) | — | `src/lib/period.ts` (or `src/lib/periodUrl.ts`) |

Adjustments:

- **Add a `last-year` preset** to the model: `PeriodPreset` gains `'last-year'`;
  `presetRange('last-year', today)` → Jan 1 – Dec 31 of the prior year; add a `PERIOD_PRESET_LABELS`
  entry (`'Last year'`). `all-time` stays in the model (reports still uses it).
- **`PeriodSelector` gains a `presets` prop** — an ordered `readonly PeriodValue[]` of which presets
  to render (still always appending `custom`). Views pick their own subset from one model:
  - **Reports**: `['this-month', 'last-month', 'this-year', 'all-time']` — unchanged behavior.
  - **Transactions**: `['this-month', 'last-month', 'this-year', 'last-year']`, **default
    `last-month`**, **no `all-time`**.
- `toQueryRange`'s dependency on `ReportRange` (`@/api/reports`) is resolved by having it return the
  structurally-identical plain `{ from?: string; to?: string }`; callers that need the `ReportRange`
  type keep it at the call site. (`dateInputToUtcStart/End` already live in `@/lib/dates`.)
- **Shared URL helpers**: `parsePeriodParams(params, today, { presets, defaultPreset, fallback? })`
  reads `period` (validated against known presets; `custom` reads `from`/`to`, falling back to the
  default preset's range if the pair is invalid) and returns `{ periodValue, dayRange }`. The
  optional **`fallback?: { period: PeriodValue; from?: string; to?: string }`** is the persisted
  `lastView` period portion: when the URL carries no `period`, the resolver uses `fallback` (if
  valid) before the `defaultPreset` — this is the single implementation of the `URL → lastView →
  default` order, reused by both views. `periodParamsToSearch(periodValue, dayRange)` emits `period`,
  plus `from`/`to` only for `custom`.
- `reportsUrl.ts`'s `parseReportsParams(params, today, lastReportsView?)` becomes `{ tab } +
  parsePeriodParams(params, today, { presets: REPORTS_PRESETS, defaultPreset: 'this-month', fallback:
  lastReportsView })`, where `tab` resolves `URL → lastReportsView.tab → 'cash-flow'`. Same URL param
  names (`tab`/`period`/`from`/`to`) and same preset set (incl. `all-time`); the only behavior change
  is the added `lastView` fallback (goal, not regression).

`last-month` default = the previous *whole calendar month* (e.g. viewing in July → June 1–30), not a
rolling 30 days.

### Transactions date range → URL (mirror `ReportsPane`)

`TransactionsPane` drops `defaultWindow` / `fromInput` / `toInput` / `appliedWindow` and the
`isValidDateWindow` mid-edit buffer. It derives the window from `useSearchParams` +
`parsePeriodParams(searchParams, new Date(), { presets: TX_PRESETS, defaultPreset: 'last-month' })`,
then feeds `useWindowedTransactions(id, range.from, range.to)`
(query key `['transactions', accountId, from, to]`, `useWindowedTransactions.ts:27`). Preset and
custom-range changes write back with `setSearchParams(..., { replace: true })`. The `DatePicker`
emits complete dates (as it already does in reports), so the mid-edit guard is no longer needed.

**Period selector placement.** The two raw `DatePicker`s live today inside `TransactionFilterBar`,
which renders only when the collapsible "Filters" panel is expanded (`TransactionsPane.tsx:785`), and
`activeFilterCount` deliberately excludes the date window. Because a restored/shared non-default
period must be *visible* (a stated goal — the range should be prominent and addressable), the
`<PeriodSelector presets={TX_PRESETS}>` is placed **outside** the collapsed filters panel — always
visible in the pane header/toolbar area — rather than inside `TransactionFilterBar` with the other
raw pickers. (This is the one deliberate UX change from today's collapsed date pickers.)

`clearFilters` (`TransactionsPane.tsx:355-362`) resets filters to `EMPTY_FILTERS` and the period to
`last-month`. Because the period is now URL-derived, this reset **must write the URL** via
`setSearchParams(periodParamsToSearch('last-month', …), { replace: true })` (not just local state),
so the URL and the resolved period cannot diverge. The selection reset key
(`TransactionsPane.tsx:288-290`) and `activeFilterCount` (`:337-342`) are unaffected (the date window
remains a primary range control, excluded from the filter count).

### Storage layer — `lastView.ts` (mirrors the `stickyDate.ts` idiom)

New `src/features/transactions/lastView.ts`: plain module functions over **`localStorage`** (survives
a full restart, unlike the sticky-date's sessionStorage), key `ha.transactions.lastView`:

```ts
interface LastView {
  accountId: string;
  period: PeriodValue;      // preset or 'custom'
  from?: string;            // only when period === 'custom'
  to?: string;
  filters: TransactionFilters;
}
```

- `readLastView(): LastView | null` — tolerant parse; returns `null` on missing/corrupt/shape-mismatch
  (validate `period` against known values and `filters` against the `TransactionFilters` shape; drop
  the whole record rather than trust a partial one).
- `writeLastView(v: LastView): void`.

`TransactionsPane`:

- **Seeds** its `filters` state from `readLastView()?.filters ?? EMPTY_FILTERS` (lazy `useState`
  initializer, the `usePersistedPageSize` idiom).
- **Writes** `lastView` whenever account, resolved period, or filters change (a small effect keyed on
  `{ id, periodValue, from, to, filters }`), so the latest view is always captured. The effect
  **only writes when an account is selected** (`id` is defined) — at bare `/` there is no
  `accountId` to persist, so `LastView.accountId` is never written empty.

Stale references inside stored `filters` (a renamed/deleted category name, label id, or contact id)
are harmless: the client-side matcher simply yields no rows for that facet. No extra validation
needed beyond shape.

### Reports parity — `src/features/reports/lastView.ts`

A sibling store, same idiom, **`localStorage`** key `ha.reports.lastView`:

```ts
interface ReportsLastView {
  tab: ReportsTab;          // 'cash-flow' | 'net-worth'
  period: PeriodValue;
  from?: string;            // only when period === 'custom'
  to?: string;
}
```

- `readReportsLastView()` / `writeReportsLastView(v)` — tolerant parse (as above).
- `ReportsPane` passes `readReportsLastView()` into `parseReportsParams(searchParams, new Date(),
  lastView)` so the URL-silent case restores tab + period; and adds a write effect that persists
  `{ tab, periodValue, from, to }` whenever they change. No redirect and no forced URL write —
  `/reports` restores purely by deriving from `lastView` when the URL lacks params (same derive-only
  rule as transactions).

The two stores stay separate (different shapes); each mirrors the `stickyDate.ts` tolerant-parse
idiom. A tiny shared `readJson<T>/writeJson` helper is optional (YAGNI) — the established repo idiom
is per-module storage functions.

### Cold-start restore (the "reopen" behavior)

At the `/` route (`HomePage`, when `useParams` has no `:id`): once the accounts list has loaded, if
`readLastView()` names an account that **still exists** in the list, redirect via
`navigate('/accounts/' + accountId + '?' + serialized, { replace: true })`, where `serialized` is
`periodParamsToSearch(lastView.period, { from, to })`. Guards:

- Runs only from bare `/` (no `:id`) → cannot loop or hijack explicit navigation to another route.
- Account deleted / no `lastView` → no redirect; the default view renders (a plain `/` today shows
  `AccountsPane` with no account selected).
- Waits for `accounts.isSuccess` before deciding, so a slow list doesn't cause a premature
  no-redirect.

Browser session-restore (reopening a tab) restores the last full URL directly, in which case the URL
already carries `period` and the redirect is unnecessary — the URL-first precedence handles it. The
redirect covers the "navigate fresh to the app root" path.

### Nav consistency

`AccountsPane`'s `NavLink to={`/accounts/${a.id}`}` (`AccountsPane.tsx:100-101`) is updated to
**preserve the current `location.search`** (`to={{ pathname: `/accounts/${a.id}`, search: location.search }}`)
so switching accounts keeps the period visible and addressable in the URL. Combined with the
precedence chain, a `NavLink` that ever lacks `period` still resolves via `lastView` → default.

## Data flow

```
                       ┌─────────────── URL (?period&from&to) ───────────────┐
                       │                    (source of truth when present)    │
 reopen at "/" ─▶ readLastView() ─▶ redirect /accounts/:id?period=…           │
                       │                                                       ▼
 /accounts/:id ─▶ parsePeriodParams(URL, presets, default) ──▶ DayRange ─▶ useWindowedTransactions
       │                    ▲ (URL → lastView → last-month)
       │                    └── readLastView().period (fallback)
       ▼
 filters: seed from readLastView().filters ──▶ applyTransactionFilters (client-side)
       │
       └── on change (account | period | filters) ──▶ writeLastView(localStorage)

 /reports ─▶ parseReportsParams(URL, today, readReportsLastView())
       │        ▲ tab:    URL → lastView.tab    → 'cash-flow'
       │        └ period: URL → lastView.period → this-month   (shared parsePeriodParams)
       └── on change (tab | period) ──▶ writeReportsLastView(localStorage)   [no redirect]
```

## Edge cases

- **`all-time` open-ended window on the transactions endpoint** — excluded from the transactions
  preset set by design, so the transactions list is never asked for an empty `from`/`to` window.
  (Verify the endpoint's behavior only if `all-time` is ever added; reports handles empty bounds via
  `toQueryRange` omitting them.)
- **Corrupt / partial `localStorage`** — `readLastView` returns `null`; falls back to default preset
  + empty filters.
- **Stored account deleted** — cold-start redirect is skipped; if the user is already on a stale
  `/accounts/:deleted`, existing not-found handling applies (unchanged).
- **Reports behavior** — same URL param names and preset set (incl. `all-time`) after delegating to
  the shared helpers; the one intended change is the added `lastView` fallback + persistence
  (restore-on-reopen). When the URL carries params (a shared/bookmarked reports link), they still win
  over `lastView`.
- **Corrupt reports `localStorage`** — `readReportsLastView` returns `null`; reports falls back to
  its defaults (`cash-flow` tab, `this-month`).

## Testing

- **Unit — `src/lib/period.test.ts`**: `presetRange('last-year', ...)` (leap/non-leap, year
  boundary); `parsePeriodParams` (each preset, `custom` with valid/invalid `from`/`to`, unknown
  preset → default, preset not in a view's `presets` set); `periodParamsToSearch` (from/to emitted
  only for custom).
- **Unit — `reportsUrl.test.ts`**: extend to confirm existing URL behavior is unchanged after
  delegating to the shared helpers, PLUS the new `lastView` fallback (URL-silent → `lastView` tab +
  period; URL present still wins).
- **Test relocation**: the extraction moves `period.ts` and `PeriodSelector.tsx`, so the existing
  `src/features/reports/period.test.ts` and `PeriodSelector.test.tsx` (and any imports of the moved
  modules) must be relocated/re-pointed to `src/lib/period` and `src/components/PeriodSelector` to
  avoid dangling imports.
- **Unit — `transactions/lastView.test.ts` & `reports/lastView.test.ts`**: round-trip; missing key →
  `null`; corrupt JSON → `null`; shape mismatch → `null`; unknown `period`/`tab` → `null`.
- **Component — `ReportsPane`**: with a `ha.reports.lastView` present and no URL params, tab + period
  restore from storage; a URL param overrides storage; changing tab/period persists to storage.
- **Component — `TransactionsPane`**: window derived from URL `?period`; changing the preset / custom
  range updates the URL; changing a filter persists to `lastView`; filters seeded from `lastView` on
  mount; `clear` resets filters + period to `last-month`.
- **Component — cold start**: mount at `/` with a `lastView` for an existing account → redirect to
  `/accounts/:id?period=…`; deleted account → no redirect; no `lastView` → no redirect.
- **E2E smoke** (`e2e/`): set account + period + a filter, reload → all three restored; open the app
  root cold → redirected to the last account with its period.
```

