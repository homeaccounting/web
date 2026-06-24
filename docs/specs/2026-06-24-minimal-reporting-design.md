---
status: draft
date: 2026-06-24
issue: 24
depends_on:
  - ../../../server-infra/docs/specs/2026-06-23-minimal-reporting-design.md
---

# Minimal Reporting (issue #24)

## Problem

The web client has **no** reporting capability: no charts, summaries, or
category breakdowns. This is a gap against strategy — the "Always free" core
explicitly promises reports, and reporting is the retention payoff that makes
transaction logging worthwhile (issue #24).

The backend reporting slice has landed (`server-infra` branch
`feat/minimal-reporting`, [spec](../../../server-infra/docs/specs/2026-06-23-minimal-reporting-design.md)).
It exposes three read-only aggregation endpoints. This spec covers the web view
that consumes them.

## Scope

In scope (minimal — not a full suite):

- **Spending by category** over a selected period.
- **Income vs. expense** totals for a period.
- **Net / balance across accounts**, normalized to base currency.
- A `/reports` page with a period selector and simple breakdown bars.

Explicitly **out of scope** (per issue #24): budgets/envelopes,
net-worth-over-time & investments, forecasting, household sharing.

## Backend contract (mirrors `server-infra` `src/Web/Types.hs`)

All amounts are `Money = { amount: number; currency: string }` (already in
`src/api/types.ts`). The optional `from`/`to` query params are ISO-8601 UTC
timestamps (`UTCTime`); absent bounds are treated as open by the service.

- `GET /api/reports/spending-by-category?from&to`
  → `{ categories: { categoryId: string; total: Money }[]; total: Money }`
- `GET /api/reports/income-vs-expense?from&to`
  → `{ income: Money; expense: Money; net: Money }`
- `GET /api/reports/net-worth` (no params)
  → `{ accounts: { accountId: string; balance: Money; baseBalance: Money }[]; total: Money }`

`categoryId` is a dictionary-entry UUID (same wire format as allocation DTOs);
`accountId` is a raw account UUID. All amounts are in the configured base
currency except `AccountNetWorth.balance`, which is the account's native
currency (with `baseBalance` its base-currency equivalent).

## Architecture

New feature folder `src/features/reports/` plus a route-level page, following
the existing `pages → features → (api | lib | components)` direction. No
reverse imports; no coupling into `transactions`.

```
src/api/reports.ts              # reportsApi(client): 3 typed GET calls
src/api/types.ts                # + 5 DTOs (cite Web/Types.hs line refs)
src/features/reports/
  period.ts                     # preset → { from, to } date range; pure
  useReports.ts                 # 3 TanStack Query hooks
  ReportsPane.tsx               # period selector + the three sections
  PeriodSelector.tsx            # presets dropdown + custom DatePicker range
  IncomeVsExpenseCard.tsx
  SpendingByCategoryCard.tsx
  NetWorthCard.tsx
  BreakdownBar.tsx              # shared horizontal CSS bar primitive
src/pages/ReportsPage.tsx       # Header + ReportsPane (full width, no sidebar)
```

Route registered in `src/App.tsx` under `<ProtectedRoute />` at `/reports`; a
"Reports" link added to `src/components/Header.tsx`.

## Components & data flow

### Period model (`period.ts`)

A pure module — unit-tested, no React. Period state is held as `'YYYY-MM-DD'`
strings (`{ from, to }`), the format `DatePicker` produces and consumes.

- Presets: **This month** (default), **Last month**, **This year**,
  **All time**.
- `presetRange(preset, today)` returns `{ from, to }` day strings. **All time**
  returns empty bounds (`{ from: '', to: '' }`) → omitted query params → open
  range on the backend.
- `toQueryRange({ from, to })` converts the day strings to ISO-UTC timestamps
  for the API: `from` → start-of-day, `to` → **end-of-day (inclusive)**.
  Empty strings map to `undefined` (param omitted). `today` is injected (no
  ambient `new Date()` in the pure layer) so boundaries are testable.

### PeriodSelector

Presets `<Select>` plus, when **Custom** is chosen, two reused
`@/components/DatePicker` inputs (From/To) with `minDate`/`maxDate`
cross-wiring — the same pattern as `TransactionFilterBar`. `TransactionFilterBar`
itself is **not** reused (transaction-specific fields, wrong layer, no presets).

### Hooks (`useReports.ts`)

Three TanStack Query hooks wrapping `reportsApi`, mirroring `useConfiguration`
(token via `tokenRef`, `enabled: !!session`, `onUnauthorized: signOut`):

- `useSpendingByCategory(range)` — query key `['reports','spending', from, to]`.
- `useIncomeVsExpense(range)` — query key `['reports','income-expense', from, to]`.
- `useNetWorth()` — query key `['reports','net-worth']`; **period-independent**
  (backend takes no dates).

Changing the period changes the query key → automatic refetch.

### Cards & name resolution

- Category ids → `useDictionaryEntryNames(configuration)`; account ids →
  `useAccounts`. Unlike `CategoryChips` (which drops unknown ids), a report row
  must still show its amount, so an unresolved id falls back to a shortened id
  rather than being hidden.
- **SpendingByCategoryCard**: rows sorted by total desc; each `BreakdownBar`
  width = `total / max(categoryTotal)`. Amounts formatted via the existing
  format helper in `src/features/accounts/format.ts` (or `src/lib/format`).
- **IncomeVsExpenseCard**: three figures (income, expense, net) in base
  currency; net colored by sign.
- **NetWorthCard**: own heading marked "current" (not period-filtered); each
  row shows native `balance` and `baseBalance`; total in base currency.

## States

Each card owns its loading skeleton, empty state, and error display:

- **Loading**: skeleton rows.
- **Empty**: e.g. "No spending in this period" / "No accounts yet".
- **Error**: standard `ApiError` surfaced inline (consistent with other panes).

## Testing

- `period.ts` — pure unit tests: preset boundaries (month/year edges),
  end-of-day inclusivity, All-time → empty bounds, day→UTC conversion. `today`
  injected.
- New MSW handlers for the three endpoints in `src/test/handlers.ts`.
- Component tests via the `render` helper: default preset loads This-month;
  switching preset refetches; bars render proportionally; category/account
  names resolve and unknown ids fall back; empty and error states render;
  Net Worth ignores the period selector.
- Optional E2E: `/reports` nav link reachable from Header.

## Out of scope

Budgets/envelopes, net-worth-over-time, forecasting, household sharing,
per-account drill-down, CSV export, chart libraries (bars are dependency-free
CSS).
