# Transactions View Persistence + Date Range in URL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist and restore the transactions view (open account + date range + filters) across app restarts, put the date range in the URL on `/accounts/:id` (shareable), and give `/reports` the same restore-on-reopen behavior — all through one shared date-range model and precedence.

**Architecture:** Extract the reports period model up to `src/lib/period.ts` (+ a new `last-year` preset and shared `parsePeriodParams`/`periodParamsToSearch` helpers implementing the `URL → lastView → default` precedence) and the `PeriodSelector` up to `src/components/`. Both `TransactionsPane` and `ReportsPane` derive their date range from the URL via the shared parser, with a per-view `localStorage` "last view" as the fallback rung and a write-on-change effect. A cold-start redirect at `/` restores the last account.

**Tech Stack:** React 18, react-router-dom v6 (`useSearchParams`/`useParams`/`useNavigate`/`useLocation`), TanStack Query, Vitest + Testing Library + MSW, Playwright.

**Spec:** `docs/specs/2026-07-28-transactions-view-persistence-design.md`

**Conventions:** TDD (failing test first). Commit after each task. Run `just typecheck` and `just lint` before each commit; run the touched test file(s) with `pnpm exec vitest run <path>`. Import via `@/...` alias, never deep relatives.

---

## File structure (decomposition)

| File | Responsibility | Action |
| --- | --- | --- |
| `src/lib/period.ts` | Period data model: presets (incl. `last-year`), `PeriodValue`, `DayRange`, `presetRange`, `toQueryRange`, shared `parsePeriodParams`/`periodParamsToSearch` | **Create** (moved from `features/reports/period.ts`, extended) |
| `src/lib/period.test.ts` | Unit tests for the model + shared URL helpers | **Create** (moved from `features/reports/period.test.ts`, extended) |
| `src/components/PeriodSelector.tsx` | Presentational period control, now with a `presets` prop | **Create** (moved from `features/reports/PeriodSelector.tsx`) |
| `src/components/PeriodSelector.test.tsx` | Component test | **Create** (moved from `features/reports/PeriodSelector.test.tsx`) |
| `src/features/reports/period.ts` / `PeriodSelector.tsx` | — | **Delete** (replaced by moves; update importers) |
| `src/features/reports/reportsUrl.ts` | Reports URL parse/serialize, now delegating to `parsePeriodParams` + `lastView` fallback | **Modify** |
| `src/features/reports/lastView.ts` | `ha.reports.lastView` store (tab + period) | **Create** |
| `src/features/reports/lastView.test.ts` | Store unit tests | **Create** |
| `src/features/reports/ReportsPane.tsx` | Read/write reports `lastView`; import moved modules; pass `presets` | **Modify** |
| `src/features/transactions/lastView.ts` | `ha.transactions.lastView` store (account + period + filters) | **Create** |
| `src/features/transactions/lastView.test.ts` | Store unit tests | **Create** |
| `src/features/transactions/TransactionsPane.tsx` | URL-derived period, `PeriodSelector` in toolbar, filter seeding, write effect, `clearFilters` URL write | **Modify** |
| `src/features/transactions/TransactionFilterBar.tsx` | Drop the two raw date pickers (period moves out) | **Modify** |
| `src/features/accounts/AccountsPane.tsx` | `NavLink` preserves `location.search` | **Modify** |
| `src/pages/HomePage.tsx` | Cold-start redirect `/` → last account | **Modify** |
| `e2e/*.spec.ts` | Restore smoke test | **Create/extend** |

---

## Task 1: Move + extend the period model (`src/lib/period.ts`)

**Files:**
- Create: `src/lib/period.ts` (content from `src/features/reports/period.ts`, extended)
- Delete: `src/features/reports/period.ts`
- Modify importers: `src/features/reports/PeriodSelector.tsx`, `ReportsPane.tsx`, `reportsUrl.ts` (change `'./period'` → `'@/lib/period'`)

- [ ] **Step 1: Move the file.** `git mv src/features/reports/period.ts src/lib/period.ts`. Update the three reports importers' import path from `'./period'` to `'@/lib/period'`.

- [ ] **Step 2: Verify green (pure move).** Run: `just typecheck && pnpm exec vitest run src/features/reports/period.test.ts`. Expected: PASS (test still imports `./period` — move it in Step 3).

- [ ] **Step 3: Move the test.** `git mv src/features/reports/period.test.ts src/lib/period.test.ts`. No import change needed (it imports `./period`, still colocated).

- [ ] **Step 4: Commit.**
```bash
git add -A && git commit -m "refactor(period): move period model to src/lib"
```

- [ ] **Step 5: Add the `last-year` preset — failing test.** In `src/lib/period.test.ts` add:
```ts
import { presetRange } from './period';
const JUN_15_2026 = new Date('2026-06-15T10:00:00');
it('resolves last-year to the whole prior calendar year', () => {
  expect(presetRange('last-year', JUN_15_2026)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
});
```

- [ ] **Step 6: Run — expect FAIL** (`last-year` not assignable / not handled). Run: `pnpm exec vitest run src/lib/period.test.ts`.

- [ ] **Step 7: Implement.** In `src/lib/period.ts`:
  - Add `'last-year'` to the `PeriodPreset` union and to `PERIOD_PRESET_LABELS` (`'Last year'`).
  - Add to `presetRange`: `case 'last-year': return { from: day(y - 1, 1, 1), to: day(y - 1, 12, 31) };`
  - **Keep** the module-level `PERIOD_PRESETS` const (the migrated `period.test.ts` asserts `PERIOD_PRESETS[0] === 'this-month'`, and it stays exported for that test). Do **not** add `last-year` to it and do **not** remove it — each view supplies its own preset list (Tasks 3/5/7), but `PERIOD_PRESETS` remains the canonical four for reference/tests.
  - Change `toQueryRange` return type from `ReportRange` to the structurally-identical `{ from?: string; to?: string }` and drop the `import type { ReportRange }` line (verified identical in `api/reports.ts:9-12`). Report cards keep typing their prop as `ReportRange` at the call site.
  - Move `PeriodValue` here: `export type PeriodValue = PeriodPreset | 'custom';` (was in `PeriodSelector.tsx`).

- [ ] **Step 8: Run — expect PASS.** `pnpm exec vitest run src/lib/period.test.ts`.

- [ ] **Step 9: Commit.**
```bash
git add -A && git commit -m "feat(period): add last-year preset; generalise toQueryRange"
```

---

## Task 2: Shared URL helpers `parsePeriodParams` / `periodParamsToSearch`

**Files:**
- Modify: `src/lib/period.ts`
- Test: `src/lib/period.test.ts`

- [ ] **Step 1: Failing tests.** Add to `src/lib/period.test.ts`:
```ts
import { parsePeriodParams, periodParamsToSearch } from './period';
const P = ['this-month', 'last-month', 'this-year', 'last-year'] as const;
const parse = (s: string, fb?: Parameters<typeof parsePeriodParams>[2]['fallback']) =>
  parsePeriodParams(new URLSearchParams(s), JUN_15_2026, { presets: P, defaultPreset: 'last-month', fallback: fb });

it('URL preset wins', () => {
  expect(parse('?period=this-year')).toEqual({ periodValue: 'this-year', dayRange: { from: '2026-01-01', to: '2026-12-31' } });
});
it('URL custom with valid dates', () => {
  expect(parse('?period=custom&from=2026-03-02&to=2026-03-20')).toEqual({ periodValue: 'custom', dayRange: { from: '2026-03-02', to: '2026-03-20' } });
});
it('URL custom without valid dates keeps custom, uses default range', () => {
  expect(parse('?period=custom')).toEqual({ periodValue: 'custom', dayRange: { from: '2026-05-01', to: '2026-05-31' } }); // last-month
});
it('URL silent → default preset when no fallback', () => {
  expect(parse('')).toEqual({ periodValue: 'last-month', dayRange: { from: '2026-05-01', to: '2026-05-31' } });
});
it('URL silent → fallback preset when present', () => {
  expect(parse('', { period: 'this-month' })).toEqual({ periodValue: 'this-month', dayRange: { from: '2026-06-01', to: '2026-06-30' } });
});
it('URL silent → fallback custom range when present', () => {
  expect(parse('', { period: 'custom', from: '2026-02-01', to: '2026-02-10' })).toEqual({ periodValue: 'custom', dayRange: { from: '2026-02-01', to: '2026-02-10' } });
});
it('unknown URL period falls through to default (no fallback)', () => {
  expect(parse('?period=weekly')).toEqual({ periodValue: 'last-month', dayRange: { from: '2026-05-01', to: '2026-05-31' } });
});
it('serialises preset without from/to; custom with from/to', () => {
  expect(periodParamsToSearch('this-year', { from: '2026-01-01', to: '2026-12-31' })).toEqual({ period: 'this-year' });
  expect(periodParamsToSearch('custom', { from: '2026-03-02', to: '2026-03-20' })).toEqual({ period: 'custom', from: '2026-03-02', to: '2026-03-20' });
});
```

- [ ] **Step 2: Run — expect FAIL** (functions undefined). `pnpm exec vitest run src/lib/period.test.ts`.

- [ ] **Step 3: Implement** in `src/lib/period.ts`:
```ts
const isDay = (v: string | null | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

export interface PeriodResolution { periodValue: PeriodValue; dayRange: DayRange; }
export interface PeriodFallback { period: PeriodValue; from?: string; to?: string; }
export interface PeriodParseOptions {
  presets: readonly PeriodPreset[];
  defaultPreset: PeriodPreset;
  fallback?: PeriodFallback;
}

export function parsePeriodParams(
  params: URLSearchParams,
  today: Date,
  { presets, defaultPreset, fallback }: PeriodParseOptions,
): PeriodResolution {
  const raw = params.get('period');
  if (raw === 'custom') {
    const from = params.get('from');
    const to = params.get('to');
    const dayRange = isDay(from) && isDay(to) ? { from, to } : presetRange(defaultPreset, today);
    return { periodValue: 'custom', dayRange };
  }
  if (raw && (presets as readonly string[]).includes(raw)) {
    const p = raw as PeriodPreset;
    return { periodValue: p, dayRange: presetRange(p, today) };
  }
  // URL silent or unknown → fallback → default
  if (fallback) {
    if (fallback.period === 'custom' && isDay(fallback.from) && isDay(fallback.to)) {
      return { periodValue: 'custom', dayRange: { from: fallback.from, to: fallback.to } };
    }
    if (fallback.period !== 'custom' && (presets as readonly string[]).includes(fallback.period)) {
      return { periodValue: fallback.period, dayRange: presetRange(fallback.period, today) };
    }
  }
  return { periodValue: defaultPreset, dayRange: presetRange(defaultPreset, today) };
}

export function periodParamsToSearch(periodValue: PeriodValue, dayRange: DayRange): Record<string, string> {
  const out: Record<string, string> = { period: periodValue };
  if (periodValue === 'custom') { out.from = dayRange.from; out.to = dayRange.to; }
  return out;
}
```

- [ ] **Step 4: Run — expect PASS.** `pnpm exec vitest run src/lib/period.test.ts`.

- [ ] **Step 5: Commit.**
```bash
git add -A && git commit -m "feat(period): shared parsePeriodParams/periodParamsToSearch with lastView precedence"
```

---

## Task 3: Move `PeriodSelector` to `src/components/` + add `presets` prop

**Files:**
- Create: `src/components/PeriodSelector.tsx`, `src/components/PeriodSelector.test.tsx`
- Delete: `src/features/reports/PeriodSelector.tsx`, `src/features/reports/PeriodSelector.test.tsx`
- Modify importers: `src/features/reports/ReportsPane.tsx`, `reportsUrl.ts` (the `PeriodValue` import now comes from `@/lib/period`)

- [ ] **Step 1: Move files.** `git mv src/features/reports/PeriodSelector.tsx src/components/PeriodSelector.tsx` and `git mv src/features/reports/PeriodSelector.test.tsx src/components/PeriodSelector.test.tsx`.

- [ ] **Step 2: Update imports.** In `src/components/PeriodSelector.tsx`: import `DayRange`, `PeriodPreset`, `PeriodValue`, `PERIOD_PRESET_LABELS` from `@/lib/period` (drop the local `PeriodValue` definition and the `PERIOD_PRESETS` import). In `reportsUrl.ts`, change `import type { PeriodValue } from './PeriodSelector'` → `import type { PeriodValue } from '@/lib/period'`. In `ReportsPane.tsx`, change the `PeriodSelector` import to `@/components/PeriodSelector` and `PeriodValue` to `@/lib/period`.

- [ ] **Step 3: Add `presets` prop — failing test.** In `src/components/PeriodSelector.test.tsx` add:
```ts
it('renders only the presets passed in, plus Custom', async () => {
  const user = userEvent.setup();
  render(<PeriodSelector presets={['this-month', 'last-year']} value="this-month" range={{ from: '', to: '' }} onPresetChange={() => {}} onRangeChange={() => {}} />);
  await user.click(screen.getByRole('combobox', { name: /period/i }));
  expect(screen.getByRole('option', { name: 'This month' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Last year' })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: 'Last month' })).not.toBeInTheDocument();
  expect(screen.getByRole('option', { name: /custom/i })).toBeInTheDocument();
});
```
(Match the existing test's render/import style — reuse its helpers; the combobox role/name comes from `aria-label="Period"`.)

- [ ] **Step 4: Run — expect FAIL** (prop unknown / still maps `PERIOD_PRESETS`). `pnpm exec vitest run src/components/PeriodSelector.test.tsx`.

- [ ] **Step 5: Implement.** Add `presets: readonly PeriodPreset[]` to `PeriodSelectorProps`; map over `props.presets` instead of the removed `PERIOD_PRESETS` const. Keep appending the `custom` item. **Update the two migrated tests** (from the old `features/reports/PeriodSelector.test.tsx`): they render `<PeriodSelector ... />` with no `presets` — add `presets={['this-month','last-month','this-year','all-time']}` to each so they typecheck and still render the reports set they assert on.

- [ ] **Step 6: Run — expect PASS** (new test + the two updated migrated tests). `pnpm exec vitest run src/components/PeriodSelector.test.tsx`.

- [ ] **Step 7: Update `ReportsPane` call site.** Pass `presets={['this-month', 'last-month', 'this-year', 'all-time']}` (extract as `REPORTS_PRESETS` in `reportsUrl.ts` and import it). Run `just typecheck`.

- [ ] **Step 8: Commit.**
```bash
git add -A && git commit -m "refactor(period): move PeriodSelector to components; add presets prop"
```

---

## Task 4: Reports `parseReportsParams` delegates to shared helper + `lastView` fallback

**Files:**
- Modify: `src/features/reports/reportsUrl.ts`
- Test: `src/features/reports/reportsUrl.test.ts`

- [ ] **Step 1: Failing tests (new fallback behavior).** Add to `reportsUrl.test.ts`:
```ts
it('restores tab and period from lastView when URL is silent', () => {
  expect(parseReportsParams(new URLSearchParams(''), JUN_15, { tab: 'net-worth', period: 'last-month' }))
    .toEqual({ tab: 'net-worth', periodValue: 'last-month', dayRange: { from: '2026-05-01', to: '2026-05-31' } });
});
it('URL wins over lastView', () => {
  expect(parseReportsParams(new URLSearchParams('?tab=cash-flow&period=this-year'), JUN_15, { tab: 'net-worth', period: 'last-month' }))
    .toEqual({ tab: 'cash-flow', periodValue: 'this-year', dayRange: { from: '2026-01-01', to: '2026-12-31' } });
});
```
Keep all existing tests (2-arg calls) unchanged — they assert behavior is preserved.

- [ ] **Step 2: Run — expect FAIL** (3rd arg unsupported / no fallback). `pnpm exec vitest run src/features/reports/reportsUrl.test.ts`.

- [ ] **Step 3: Implement.** Rewrite `reportsUrl.ts`:
```ts
import { parsePeriodParams, periodParamsToSearch, type DayRange, type PeriodPreset, type PeriodValue } from '@/lib/period';

export type ReportsTab = 'cash-flow' | 'net-worth';
const TABS: readonly ReportsTab[] = ['cash-flow', 'net-worth'] as const;
export const REPORTS_PRESETS: readonly PeriodPreset[] = ['this-month', 'last-month', 'this-year', 'all-time'] as const;

export interface ReportsState { tab: ReportsTab; periodValue: PeriodValue; dayRange: DayRange; }
// Single definition of ReportsLastView — lastView.ts (Task 5) imports it from here (do not redeclare).
export interface ReportsLastView { tab: ReportsTab; period: PeriodValue; from?: string; to?: string; }

const isTab = (v: string | null | undefined): v is ReportsTab => !!v && TABS.includes(v as ReportsTab);

export function parseReportsParams(params: URLSearchParams, today: Date, lastView?: ReportsLastView): ReportsState {
  const rawTab = params.get('tab');
  const tab: ReportsTab = isTab(rawTab) ? rawTab : isTab(lastView?.tab) ? lastView!.tab : 'cash-flow';
  const { periodValue, dayRange } = parsePeriodParams(params, today, {
    presets: REPORTS_PRESETS,
    defaultPreset: 'this-month',
    fallback: lastView ? { period: lastView.period, from: lastView.from, to: lastView.to } : undefined,
  });
  return { tab, periodValue, dayRange };
}

export function reportsParamsToSearch(state: ReportsState): Record<string, string> {
  return { tab: state.tab, ...periodParamsToSearch(state.periodValue, state.dayRange) };
}
```

- [ ] **Step 4: Run — expect PASS** (all old + new). `pnpm exec vitest run src/features/reports/reportsUrl.test.ts`.

- [ ] **Step 5: Commit.**
```bash
git add -A && git commit -m "refactor(reports): parseReportsParams delegates to shared period helper + lastView fallback"
```

---

## Task 5: Reports `lastView` store + wire `ReportsPane`

**Files:**
- Create: `src/features/reports/lastView.ts`, `src/features/reports/lastView.test.ts`
- Modify: `src/features/reports/ReportsPane.tsx`
- Test: `src/features/reports/ReportsPane.test.tsx`

- [ ] **Step 1: Failing store tests.** `src/features/reports/lastView.test.ts` — mirror `stickyDate.test.ts` structure:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readReportsLastView, writeReportsLastView, REPORTS_LAST_VIEW_KEY } from './lastView';

describe('reports lastView', () => {
  beforeEach(() => localStorage.clear());
  it('round-trips', () => {
    writeReportsLastView({ tab: 'net-worth', period: 'custom', from: '2026-01-01', to: '2026-01-31' });
    expect(readReportsLastView()).toEqual({ tab: 'net-worth', period: 'custom', from: '2026-01-01', to: '2026-01-31' });
  });
  it('returns null when missing', () => expect(readReportsLastView()).toBeNull());
  it('returns null on corrupt json', () => { localStorage.setItem(REPORTS_LAST_VIEW_KEY, '{oops'); expect(readReportsLastView()).toBeNull(); });
  it('returns null on shape mismatch', () => { localStorage.setItem(REPORTS_LAST_VIEW_KEY, JSON.stringify({ tab: 'x' })); expect(readReportsLastView()).toBeNull(); });
});
```

- [ ] **Step 2: Run — expect FAIL.** `pnpm exec vitest run src/features/reports/lastView.test.ts`.

- [ ] **Step 3: Implement `src/features/reports/lastView.ts`** (localStorage, tolerant parse mirroring `stickyDate.ts`):
```ts
import type { PeriodValue } from '@/lib/period';
import type { ReportsTab, ReportsLastView } from './reportsUrl'; // ReportsLastView defined once, in reportsUrl.ts

export const REPORTS_LAST_VIEW_KEY = 'ha.reports.lastView';
const TABS = ['cash-flow', 'net-worth'];
const PERIODS = ['this-month', 'last-month', 'this-year', 'last-year', 'all-time', 'custom'];

export function readReportsLastView(): ReportsLastView | null {
  try {
    const o = JSON.parse(localStorage.getItem(REPORTS_LAST_VIEW_KEY) ?? '') as Record<string, unknown>;
    if (o && typeof o === 'object' && TABS.includes(o.tab as string) && PERIODS.includes(o.period as string)) {
      const v: ReportsLastView = { tab: o.tab as ReportsTab, period: o.period as PeriodValue };
      if (typeof o.from === 'string') v.from = o.from;
      if (typeof o.to === 'string') v.to = o.to;
      return v;
    }
  } catch { /* fall through */ }
  return null;
}

export function writeReportsLastView(v: ReportsLastView): void {
  localStorage.setItem(REPORTS_LAST_VIEW_KEY, JSON.stringify(v));
}
```
(Keep `ReportsLastView` defined once — either here or in `reportsUrl.ts` re-exported. Recommend defining in `reportsUrl.ts` and importing here to avoid duplication; adjust the test import accordingly.)

- [ ] **Step 4: Run — expect PASS.** `pnpm exec vitest run src/features/reports/lastView.test.ts`.

- [ ] **Step 5: Failing `ReportsPane` restore test.** In `ReportsPane.test.tsx` add a case: seed `localStorage` with `ha.reports.lastView = { tab: 'net-worth', period: 'this-year' }`, render at `/reports` with no query params, assert the Net worth tab is active. (Match existing render helper in that file.)

- [ ] **Step 6: Run — expect FAIL.** `pnpm exec vitest run src/features/reports/ReportsPane.test.tsx`.

- [ ] **Step 7: Implement `ReportsPane` wiring.**
  - Read once: `const lastView = useMemo(() => readReportsLastView(), []);`
  - `const { tab, periodValue, dayRange } = parseReportsParams(searchParams, new Date(), lastView);`
  - Add a write effect:
```ts
useEffect(() => {
  writeReportsLastView({ tab, period: periodValue, ...(periodValue === 'custom' ? { from: dayRange.from, to: dayRange.to } : {}) });
}, [tab, periodValue, dayRange.from, dayRange.to]);
```
  - Pass `presets={REPORTS_PRESETS}` to `<PeriodSelector>` (from Task 3).

- [ ] **Step 8: Run — expect PASS** (new + existing reports pane tests). `pnpm exec vitest run src/features/reports/ReportsPane.test.tsx`.

- [ ] **Step 9: Commit.**
```bash
git add -A && git commit -m "feat(reports): restore last tab + period on reopen"
```

---

## Task 6: Transactions `lastView` store

**Files:**
- Create: `src/features/transactions/lastView.ts`, `src/features/transactions/lastView.test.ts`

- [ ] **Step 1: Failing store tests.** `src/features/transactions/lastView.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readLastView, writeLastView, TX_LAST_VIEW_KEY } from './lastView';

const filters = { description: 'x', labelIds: ['a'], category: 'Food', contactId: '', showCancelledFailed: false };

describe('transactions lastView', () => {
  beforeEach(() => localStorage.clear());
  it('round-trips', () => {
    writeLastView({ accountId: 'acc1', period: 'last-month', filters });
    expect(readLastView()).toEqual({ accountId: 'acc1', period: 'last-month', filters });
  });
  it('null when missing / corrupt / shape mismatch / bad period', () => {
    expect(readLastView()).toBeNull();
    localStorage.setItem(TX_LAST_VIEW_KEY, '{oops'); expect(readLastView()).toBeNull();
    localStorage.setItem(TX_LAST_VIEW_KEY, JSON.stringify({ accountId: 'a' })); expect(readLastView()).toBeNull();
    localStorage.setItem(TX_LAST_VIEW_KEY, JSON.stringify({ accountId: 'a', period: 'weekly', filters })); expect(readLastView()).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `pnpm exec vitest run src/features/transactions/lastView.test.ts`.

- [ ] **Step 3: Implement `src/features/transactions/lastView.ts`.** LocalStorage, tolerant parse; validate `accountId` (non-empty string), `period` (in the known set), and `filters` shape (`description`/`category`/`contactId` strings, `labelIds` string[], `showCancelledFailed` boolean). Return `null` on any mismatch. Key `TX_LAST_VIEW_KEY = 'ha.transactions.lastView'`. Shape:
```ts
export interface TxLastView { accountId: string; period: PeriodValue; from?: string; to?: string; filters: TransactionFilters; }
```

- [ ] **Step 4: Run — expect PASS.** `pnpm exec vitest run src/features/transactions/lastView.test.ts`.

- [ ] **Step 5: Commit.**
```bash
git add -A && git commit -m "feat(transactions): lastView localStorage store"
```

---

## Task 7: Wire `TransactionsPane` to URL-derived period + storage

This is the largest task; keep the app compiling between steps but a single commit is fine at the end. Reference `ReportsPane.tsx` as the pattern.

> **Behavior change note:** the default window becomes the previous *whole calendar month* (`last-month` preset), replacing the old rolling `defaultDateWindow` (last-month..today). This is intentional (spec §Preset model). No existing test asserts the old default's exact `dateFrom`/`dateTo` (the guard test only checks validity), so it's safe — but reviewers should expect the default view to differ slightly.

**Files:**
- Modify: `src/features/transactions/TransactionsPane.tsx`, `src/features/transactions/TransactionFilterBar.tsx`
- Test: `src/features/transactions/TransactionsPane.test.tsx`, `TransactionFilterBar.test.tsx`

- [ ] **Step 1: Failing component tests** in `TransactionsPane.test.tsx` (reuse the existing `ui()` harness + MSW handlers):
  - `restores period from ?period in the URL`: render at `/accounts/:id?period=this-year`; assert the request MSW receives carries the this-year `dateFrom`/`dateTo` (or assert the period control shows "This year").
  - `changing the preset updates the URL`: open the period selector, pick "This year", assert `window.location.search` contains `period=this-year`.
  - `seeds filters from lastView`: seed `ha.transactions.lastView` with a `description` filter for the account, render, expand filters, assert the description input holds the stored value.
  - `persists filters to lastView on change`: type in description, assert `readLastView()?.filters.description` matches.
  - `clear resets filters and period`: assert after Clear the URL has `period=last-month` and filters are empty.

- [ ] **Step 2: Run — expect FAIL.** `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx`.

- [ ] **Step 3: Replace date state with URL derivation.** In `TransactionsPane`:
  - Add imports: `useSearchParams` from `react-router-dom`; `parsePeriodParams, periodParamsToSearch, presetRange, type PeriodValue, type DayRange` from `@/lib/period`; `PeriodSelector` from `@/components/PeriodSelector`; `readLastView, writeLastView` from `./lastView`.
  - Define `const TX_PRESETS = ['this-month', 'last-month', 'this-year', 'last-year'] as const;` (module scope).
  - Remove `defaultWindow`, `fromInput`, `toInput`, `appliedWindow` state (lines 188-191) and `onFromChange`/`onToChange`/`clearFilters`' window resets (355-376).
  - Add:
```ts
const [searchParams, setSearchParams] = useSearchParams();
const lastView = useMemo(() => readLastView(), []);
const { periodValue, dayRange } = parsePeriodParams(searchParams, new Date(), {
  presets: TX_PRESETS, defaultPreset: 'last-month',
  fallback: lastView ? { period: lastView.period, from: lastView.from, to: lastView.to } : undefined,
});
const onPresetChange = (next: PeriodValue) => setSearchParams(periodParamsToSearch(next, dayRange), { replace: true });
const onRangeChange = (range: DayRange) => setSearchParams(periodParamsToSearch('custom', range), { replace: true });
```
  - `const [filters, setFilters] = useState<TransactionFilters>(() => lastView?.filters ?? EMPTY_FILTERS);`
  - Feed the query: `useWindowedTransactions(id, dayRange.from, dayRange.to)`.
  - Update the selection reset key (line 288-290) to use `dayRange.from`/`dayRange.to`.
  - `clearFilters`:
```ts
const clearFilters = () => {
  setFilters(EMPTY_FILTERS);
  setSearchParams(periodParamsToSearch('last-month', presetRange('last-month', new Date())), { replace: true });
  setPageIndex(0);
};
```

- [ ] **Step 4: Add the persistence effect.**
```ts
useEffect(() => {
  if (!id) return;
  writeLastView({ accountId: id, period: periodValue, ...(periodValue === 'custom' ? { from: dayRange.from, to: dayRange.to } : {}), filters });
}, [id, periodValue, dayRange.from, dayRange.to, filters]);
```

- [ ] **Step 5: Place `PeriodSelector` in the toolbar (outside the collapsed filter panel).** In the toolbar row that holds the Filters toggle (`TransactionsPane.tsx:764`), render alongside it:
```tsx
<PeriodSelector presets={TX_PRESETS} value={periodValue} range={dayRange} onPresetChange={onPresetChange} onRangeChange={onRangeChange} />
```
Ensure it renders whenever an account is selected (same condition as the Filters toggle / `showFilterBar`), not gated on `filtersOpen`.

- [ ] **Step 6: Drop the raw date pickers from `TransactionFilterBar`.** Remove `from`, `to`, `onFromChange`, `onToChange` from `TransactionFilterBarProps` and the two `<DatePicker>` `<label>` blocks (lines 49-72). Update the `<TransactionFilterBar>` call in `TransactionsPane` (lines 786-789) to stop passing those props. Update `TransactionFilterBar.test.tsx` to drop the removed props/assertions.

- [ ] **Step 6b: Fix the pre-existing raw-picker test.** `TransactionsPane.test.tsx` has a test (~`:555`, "picking a From date from the calendar refetches without erroring") that drives the From picker via `openFilters(user)` + `getByLabelText('From')`. The From/To pickers now live in the toolbar `PeriodSelector` and appear only under the `custom` period. **Rewrite** that test to first select "Custom…" in the toolbar period `combobox` (`aria-label="Period"`), then drive the revealed From `DatePicker` — or delete it if the new `changing the preset updates the URL` test (Step 1) already covers the refetch path. Do not leave it asserting the old collapsed-filter-bar pickers.

- [ ] **Step 7: Run — expect PASS.** Run the three touched test files:
```bash
pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx src/features/transactions/TransactionsPane.merge.test.tsx src/features/transactions/TransactionFilterBar.test.tsx
```

- [ ] **Step 8: Typecheck + lint.** `just typecheck && just lint`. Fix any leftover references to the removed state (`appliedWindow`, `fromInput`, `isValidDateWindow` import if now unused in the pane).

- [ ] **Step 9: Commit.**
```bash
git add -A && git commit -m "feat(transactions): derive date range from URL; persist & restore view"
```

---

## Task 8: `AccountsPane` NavLink preserves the query string

**Files:**
- Modify: `src/features/accounts/AccountsPane.tsx`
- Test: `src/features/accounts/AccountsPane.test.tsx` (if present; else add a focused test)

- [ ] **Step 1: Failing test.** Render `AccountsPane` at `/accounts/:id?period=this-year`; assert an account row's link `href` includes `?period=this-year`.

- [ ] **Step 2: Run — expect FAIL.** `pnpm exec vitest run src/features/accounts/AccountsPane.test.tsx`.

- [ ] **Step 3: Implement.** Add `import { useLocation } from 'react-router-dom'`; `const location = useLocation();`; change the `NavLink` `to` to `{{ pathname: `/accounts/${a.id}`, search: location.search }}`. (The `NavLink` is cloned by Radix `asChild`; object `to` is accepted — keep the static className unchanged.)

- [ ] **Step 4: Run — expect PASS.** Re-run the test file.

- [ ] **Step 5: Commit.**
```bash
git add -A && git commit -m "feat(accounts): preserve date-range query when switching accounts"
```

---

## Task 9: Cold-start redirect at `/` → last account

**Files:**
- Modify: `src/pages/HomePage.tsx`
- Test: `src/pages/HomePage.test.tsx` (create if absent)

- [ ] **Step 1: Failing test.** In a new `HomePage.test.tsx`: sign in; seed `ha.transactions.lastView` for an account that the MSW accounts handler returns; render the app routes (`/` → HomePage, `/accounts/:id` → HomePage) at initial path `/`; assert the URL becomes `/accounts/<id>?period=<...>`. Add a second case: `lastView` for a non-existent account → stays at `/` (no redirect). Third: no `lastView` → stays at `/`.

- [ ] **Step 2: Run — expect FAIL.** `pnpm exec vitest run src/pages/HomePage.test.tsx`.

- [ ] **Step 3: Implement.** Add a redirect hook in `HomePage.tsx`:
```tsx
import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAccounts } from '@/features/accounts/useAccounts';
import { readLastView } from '@/features/transactions/lastView';
import { periodParamsToSearch } from '@/lib/period';

function useRestoreLastAccount() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const accounts = useAccounts();
  useEffect(() => {
    if (id || !accounts.isSuccess) return;
    const lv = readLastView();
    if (!lv || !accounts.data?.some((a) => a.id === lv.accountId)) return;
    const search = new URLSearchParams(periodParamsToSearch(lv.period, { from: lv.from ?? '', to: lv.to ?? '' })).toString();
    navigate(`/accounts/${lv.accountId}?${search}`, { replace: true });
  }, [id, accounts.isSuccess, accounts.data, navigate]);
}
```
Call `useRestoreLastAccount();` at the top of `HomePage`. (This respects the dependency rule: `pages → features`.)

- [ ] **Step 4: Run — expect PASS.** Re-run `HomePage.test.tsx`.

- [ ] **Step 5: Commit.**
```bash
git add -A && git commit -m "feat(transactions): restore last account on cold start"
```

---

## Task 10: Full suite + E2E smoke + verification

**Files:**
- Create/extend: `e2e/transactions-persistence.spec.ts` (or extend an existing spec)

- [ ] **Step 1: Full unit suite.** `just test`. Expected: all pass (fix any missed importers/fixtures).

- [ ] **Step 2: `just check`** (typecheck + lint + format-check). Fix findings.

- [ ] **Step 3: E2E smoke.** Add a Playwright spec: sign in, open an account, set period to "This year" and a description filter, reload the page → assert the period control shows "This year" and the filter is still applied; navigate to app root `/` → assert redirect back to `/accounts/<id>`. Run: `just e2e` (or `pnpm exec playwright test e2e/transactions-persistence.spec.ts`).

- [ ] **Step 4: Manual verification.** Use the `verify` skill / `just run` to drive the real app: change account + period + filter, close and reopen the tab (and hard-navigate to `/`), confirm restoration; confirm `/reports` restores its tab + period.

- [ ] **Step 5: Final commit (if any fixups).**
```bash
git add -A && git commit -m "test(transactions): e2e smoke for view persistence"
```

---

## Notes & gotchas

- **Keep reports' preset set at four** (`this-month, last-month, this-year, all-time`). `last-year` is transactions-only. Do not add `last-year` to `REPORTS_PRESETS`.
- **`all-time` excluded from `TX_PRESETS`** by design — the transactions list is never asked for an empty window (`useWindowedTransactions` always sends `dateFrom`/`dateTo`).
- **`new Date()` in render** matches `ReportsPane`'s existing pattern; acceptable (no `Date.now()` restriction in app code — that constraint is workflow-script only).
- **MSW request assertions**: to assert the date window reached the API, capture the request URL in a one-off `server.use(...)` handler (existing tests already inspect `dateFrom`/`dateTo` — follow that pattern).
- **`isValidDateWindow`/`isDateInputValue`/`defaultDateWindow`** in `transactionFilters.ts` may become unused after Task 7. Only remove them if no other module imports them (grep first); otherwise leave them.
- **DRY / YAGNI**: the two `lastView` stores intentionally stay separate (different shapes); do not build a generic store abstraction unless a third consumer appears.
