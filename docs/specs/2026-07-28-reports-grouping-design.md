---
status: draft
---

# Reports grouped by type with per-group date scope (web)

## Context

The `/reports` page (`src/features/reports/ReportsPane.tsx`) renders every report as a flat
stack of cards under a single, page-wide `PeriodSelector` placed in the `PageHeader` actions:

- `IncomeVsExpenseCard range={query}` — consumes the range.
- `SpendingByCategoryCard range={query}` — consumes the range.
- `NetWorthCard` — takes **no** range (its hook `useNetWorth()` has a period-independent query
  key) yet still visually sits under the shared period selector, which is misleading.

Two problems (issue [#69](https://github.com/homeaccounting/web/issues/69)):

1. **Flat structure won't scale.** Each new report type adds another card to one long page
   with no grouping or navigation.
2. **A single global date range is wrong for some reports.** Net Worth is a point-in-time
   snapshot; a period range implies filtering it does not perform.

The dictionaries UI already solved the grouping problem: `ProfileDictionariesPane` groups
related dictionaries under an underline `Tabs` (`variant="underline"`). We mirror that here.

## Goals

- Group reports by type using the shared underline `Tabs` pattern (consistent with dictionaries).
- Scope the date-range control to the report group that uses it; Net Worth shows no range control.
- Persist selected tab + period across refresh via URL query params (shareable, deep-linkable).
- No regression: card components, `useReports.ts` hooks, `period.ts`, and the API layer are unchanged.

## Non-goals (deferred to follow-ups)

Compare-to-previous-period, per-report export, drill-down to transactions, currency/account
scoping, additional presets, empty-first-run guidance. These are listed in issue #69 as
"additional UX improvements to consider" and are explicitly out of scope for this change.

## Design

### Grouping

`ReportsPane` becomes a controlled two-tab layout:

- **Cash flow** (`value="cash-flow"`) → `IncomeVsExpenseCard` + `SpendingByCategoryCard`
- **Net worth** (`value="net-worth"`) → `NetWorthCard`

Uses `Tabs` / `TabsList variant="underline"` / `TabsTrigger` / `TabsContent` from
`@/components/ui/tabs`, matching `ProfileDictionariesPane`. The `PageHeader` keeps only the
title; the `PeriodSelector` moves out of the header.

### Per-group date scope

- The **Cash flow** `TabsContent` renders a single `PeriodSelector` at its top; both cash-flow
  cards receive the same derived `query` range (unchanged from today's behaviour).
- The **Net worth** `TabsContent` renders no period control.
- Period state (preset + custom `DayRange`) lives in `ReportsPane`. `NetWorthCard` never
  receives it.

### Persistence via URL query params

State is reflected in the URL using react-router `useSearchParams`:

- `tab` — `cash-flow` (default) | `net-worth`
- `period` — `this-month` (default) | `last-month` | `this-year` | `all-time` | `custom`
- `from`, `to` — `YYYY-MM-DD` day strings, present only when `period=custom`

Behaviour:

- On mount, initial state is derived from the URL. Unknown/garbage values fall back to defaults
  (`tab=cash-flow`, `period=this-month`, custom range = this-month preset).
- Changing tab or period calls `setSearchParams(next, { replace: true })` so report views are
  refresh-safe and bookmarkable without spamming browser history.
- `period=custom` without valid `from`/`to` falls back to the this-month preset range.

### URL ⇄ state helpers (pure, unit-tested)

A new `reportsUrl.ts` module isolates the URL mapping from React:

- `parseReportsParams(params: URLSearchParams, today: Date): { tab, periodValue, dayRange }`
- `reportsParamsToSearch(state: { tab, periodValue, dayRange }): Record<string, string>`

These reuse `PERIOD_PRESETS`, `presetRange`, and `DayRange` from `period.ts`. Keeping the
mapping pure means the round-trip and fallback logic are testable without rendering.

### Unchanged

`IncomeVsExpenseCard`, `SpendingByCategoryCard`, `NetWorthCard`, `PeriodSelector`,
`useReports.ts`, `period.ts`, `src/api/reports.ts`. Each card retains its own
loading/error/empty state, so one failing report never blanks the page.

## Testing

TDD. New/extended tests:

- `reportsUrl.test.ts` (new): `parseReportsParams` for each preset; `custom` with valid
  `from`/`to`; `custom` with missing/invalid dates → this-month fallback; unknown `tab`/`period`
  → defaults. `reportsParamsToSearch` round-trips each case and omits `from`/`to` for presets.
- `ReportsPane.test.tsx` (extended):
  - Renders both tabs.
  - Cash flow tab shows the period selector and both cash-flow report cards.
  - Net worth tab shows the net-worth card and **no** period selector.
  - Switching tab updates `?tab=`; changing period updates `?period=` (and `from`/`to` for custom).
  - Initial URL params (`?tab=net-worth`, `?period=last-month`) restore the corresponding tab/period.

Existing card-level tests remain unchanged and green.

## Files

- `src/features/reports/ReportsPane.tsx` — rewired to tabs + per-group period.
- `src/features/reports/reportsUrl.ts` — new pure URL⇄state helpers.
- `src/features/reports/reportsUrl.test.ts` — new.
- `src/features/reports/ReportsPane.test.tsx` — extended.

No backend or `types.ts` changes.
