# Minimal Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `/reports` page that consumes the backend's three reporting endpoints (spending-by-category, income-vs-expense, net-worth) and renders them with a period selector and dependency-free CSS bars.

**Architecture:** New `src/features/reports/` feature folder + a route-level `ReportsPage`, following `pages → features → (api | lib | components)`. A pure `period.ts` computes date ranges; three TanStack Query hooks wrap a new `reportsApi`; presentational cards render the data. The inclusive-UTC date helpers currently in `transactions/transactionFilters.ts` are promoted to `lib/dates.ts` (re-exported to keep transactions imports intact) and reused here.

**Tech Stack:** React 18, TypeScript (strict), TanStack Query, react-router v6, Tailwind, shadcn/ui (`Select`, `Skeleton`, `Alert`), Vitest + Testing Library + MSW.

**Spec:** `docs/specs/2026-06-24-minimal-reporting-design.md`

**Conventions to follow:**

- DTOs in `src/api/types.ts` mirror backend `server-infra/src/Web/Types.hs` — cite line refs in comments. Additive only.
- Hooks mirror `useConfiguration`/`useAccounts` (`tokenRef`, `enabled: !!session`, `onUnauthorized: signOut`).
- Tests: `saveSession(...)` + wrap in `<AuthProvider>` + `renderWithProviders`; MSW handlers in `src/test/handlers.ts`, per-test overrides via `server.use(...)`. `onUnhandledRequest: 'error'` — every endpoint a test touches needs a default handler.
- `apiBase = 'http://localhost:8080'` in tests.
- Run commands from repo root. `just typecheck`, `just lint`, `just test`.

---

### Task 1: Reporting DTOs in `src/api/types.ts`

**Files:**

- Modify: `src/api/types.ts` (append; additive only)

- [ ] **Step 1: Add the five DTOs.** Append to `src/api/types.ts`. `Money` and `UUID`/`ISO8601` aliases already exist in this file — reuse them.

```ts
// --- Reporting (mirrors server-infra/src/Web/Types.hs:683-737) ---

// CategorySpend { categoryId :: Text, total :: Money } — categoryId is a
// dictionary-entry UUID (same wire format as allocation DTOs).
export interface CategorySpend {
  categoryId: string;
  total: Money;
}

// SpendingByCategoryResponse { categories :: [CategorySpend], total :: Money }
// All amounts in base currency.
export interface SpendingByCategoryResponse {
  categories: CategorySpend[];
  total: Money;
}

// IncomeVsExpenseResponse { income, expense, net :: Money } — base currency.
export interface IncomeVsExpenseResponse {
  income: Money;
  expense: Money;
  net: Money;
}

// AccountNetWorth { accountId :: UUID, balance :: Money, baseBalance :: Money }
// balance is the account's NATIVE currency; baseBalance is its base-currency
// equivalent.
export interface AccountNetWorth {
  accountId: string;
  balance: Money;
  baseBalance: Money;
}

// NetWorthResponse { accounts :: [AccountNetWorth], total :: Money } — total in
// base currency. Period-independent (endpoint takes no date params).
export interface NetWorthResponse {
  accounts: AccountNetWorth[];
  total: Money;
}
```

- [ ] **Step 2: Typecheck.** Run: `just typecheck` — Expected: PASS (pure additions).
- [ ] **Step 3: Commit.**

```bash
git add src/api/types.ts
git commit -m "feat(reports): reporting response DTOs mirroring backend (#24)"
```

---

### Task 2: `reportsApi` HTTP module

**Files:**

- Create: `src/api/reports.ts`
- Test: `src/api/reports.test.ts`

- [ ] **Step 1: Write the failing test.** `src/api/reports.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { ApiClient } from './client';
import { reportsApi } from './reports';

const apiBase = 'http://localhost:8080';
const client = new ApiClient({ baseUrl: apiBase, getToken: () => 't', onUnauthorized: () => {} });
const api = reportsApi(client);

describe('reportsApi', () => {
  it('GETs spending-by-category with from/to query params', async () => {
    let url: URL | undefined;
    server.use(
      http.get(`${apiBase}/api/reports/spending-by-category`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ categories: [], total: { amount: 0, currency: 'USD' } });
      }),
    );
    await api.spendingByCategory({
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-30T23:59:59.999Z',
    });
    expect(url?.searchParams.get('from')).toBe('2026-06-01T00:00:00.000Z');
    expect(url?.searchParams.get('to')).toBe('2026-06-30T23:59:59.999Z');
  });

  it('omits absent bounds (open range)', async () => {
    let url: URL | undefined;
    server.use(
      http.get(`${apiBase}/api/reports/spending-by-category`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ categories: [], total: { amount: 0, currency: 'USD' } });
      }),
    );
    await api.spendingByCategory({});
    expect(url?.searchParams.has('from')).toBe(false);
    expect(url?.searchParams.has('to')).toBe(false);
  });

  it('GETs income-vs-expense and net-worth', async () => {
    server.use(
      http.get(`${apiBase}/api/reports/income-vs-expense`, () =>
        HttpResponse.json({
          income: { amount: 100, currency: 'USD' },
          expense: { amount: 40, currency: 'USD' },
          net: { amount: 60, currency: 'USD' },
        }),
      ),
      http.get(`${apiBase}/api/reports/net-worth`, () =>
        HttpResponse.json({ accounts: [], total: { amount: 0, currency: 'USD' } }),
      ),
    );
    await expect(api.incomeVsExpense({})).resolves.toMatchObject({ net: { amount: 60 } });
    await expect(api.netWorth()).resolves.toMatchObject({ total: { amount: 0 } });
  });
});
```

- [ ] **Step 2: Run, verify it fails.** Run: `pnpm exec vitest run src/api/reports.test.ts` — Expected: FAIL (`reports` module not found).

- [ ] **Step 3: Implement `src/api/reports.ts`.** Mirror `transactions.ts` query building (`URLSearchParams`, omit undefined).

```ts
import type { ApiClient } from './client';
import type {
  IncomeVsExpenseResponse,
  NetWorthResponse,
  SpendingByCategoryResponse,
} from './types';

// from/to are ISO-8601 UTC timestamps (backend UTCTime); absent => open bound.
export interface ReportRange {
  from?: string;
  to?: string;
}

function rangeQuery(range: ReportRange): string {
  const qs = new URLSearchParams();
  if (range.from) qs.set('from', range.from);
  if (range.to) qs.set('to', range.to);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const reportsApi = (client: ApiClient) => ({
  spendingByCategory: (range: ReportRange): Promise<SpendingByCategoryResponse> =>
    client.get<SpendingByCategoryResponse>(`/api/reports/spending-by-category${rangeQuery(range)}`),
  incomeVsExpense: (range: ReportRange): Promise<IncomeVsExpenseResponse> =>
    client.get<IncomeVsExpenseResponse>(`/api/reports/income-vs-expense${rangeQuery(range)}`),
  netWorth: (): Promise<NetWorthResponse> => client.get<NetWorthResponse>('/api/reports/net-worth'),
});
```

- [ ] **Step 4: Run, verify it passes.** Run: `pnpm exec vitest run src/api/reports.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/api/reports.ts src/api/reports.test.ts
git commit -m "feat(reports): typed reportsApi HTTP module (#24)"
```

---

### Task 3: Promote inclusive-UTC date helpers to `lib/dates.ts`

Rationale: `dateInputToUtcStart`/`dateInputToUtcEnd` are generic date utilities currently in `transactions/transactionFilters.ts`. Reports needs them too. Move them to `lib/dates.ts` (next to `dateInputToWire`) and re-export from `transactionFilters.ts` so existing transaction imports/tests keep working unchanged — additive, no cross-feature coupling.

**Files:**

- Modify: `src/lib/dates.ts` (add two functions)
- Modify: `src/features/transactions/transactionFilters.ts` (replace defs with re-export)
- Existing tests cover behavior: `src/features/transactions/transactionFilters.test.ts`

- [ ] **Step 1: Add to `src/lib/dates.ts`** (append):

```ts
// Inclusive UTC day bounds for backend from/to (UTCTime) params. Start-of-day
// mirrors the isoDay pattern; end-of-day is correct because the backend
// compares the ISO text lexically (Range.within).
export function dateInputToUtcStart(yyyyMmDd: string): string {
  return `${yyyyMmDd}T00:00:00.000Z`;
}
export function dateInputToUtcEnd(yyyyMmDd: string): string {
  return `${yyyyMmDd}T23:59:59.999Z`;
}
```

- [ ] **Step 2: Replace the definitions in `transactionFilters.ts` with a re-export.** Delete the two original `export function dateInputToUtcStart` / `dateInputToUtcEnd` definitions (currently the last functions in the file, ~lines 80-85) so there is no duplicate-export collision, then add this top-level re-export. Only `useWindowedTransactions.ts` and `transactionFilters.test.ts` import these (both via `./transactionFilters`), so the public surface is unchanged:

```ts
// Re-exported from lib/dates so reporting can share the same inclusive-UTC
// bounds without importing across features. Definitions moved there; the
// public surface of this module is unchanged.
export { dateInputToUtcStart, dateInputToUtcEnd } from '@/lib/dates';
```

- [ ] **Step 3: Run the affected suites + typecheck.** Run: `pnpm exec vitest run src/features/transactions/transactionFilters.test.ts src/features/transactions/useWindowedTransactions.test.tsx && just typecheck` — Expected: PASS (behavior unchanged, imports still resolve).
- [ ] **Step 4: Commit.**

```bash
git add src/lib/dates.ts src/features/transactions/transactionFilters.ts
git commit -m "refactor(dates): promote inclusive-UTC day bounds to lib/dates (#24)"
```

---

### Task 4: `period.ts` — presets + range→query conversion (pure)

**Files:**

- Create: `src/features/reports/period.ts`
- Test: `src/features/reports/period.test.ts`

- [ ] **Step 1: Write the failing test.** `src/features/reports/period.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { PERIOD_PRESETS, presetRange, toQueryRange, type PeriodPreset } from './period';

const JUN_15 = new Date('2026-06-15T10:00:00'); // local

describe('presetRange', () => {
  it('this-month spans the calendar month containing today', () => {
    expect(presetRange('this-month', JUN_15)).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  });
  it('last-month spans the previous calendar month', () => {
    expect(presetRange('last-month', JUN_15)).toEqual({ from: '2026-05-01', to: '2026-05-31' });
  });
  it('this-year spans Jan 1..Dec 31 of the current year', () => {
    expect(presetRange('this-year', JUN_15)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
  it('all-time has empty (open) bounds', () => {
    expect(presetRange('all-time', JUN_15)).toEqual({ from: '', to: '' });
  });
  it('last-month crosses the year boundary', () => {
    expect(presetRange('last-month', new Date('2026-01-10T10:00:00'))).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });
});

describe('toQueryRange', () => {
  it('maps day strings to inclusive UTC timestamps', () => {
    expect(toQueryRange({ from: '2026-06-01', to: '2026-06-30' })).toEqual({
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-30T23:59:59.999Z',
    });
  });
  it('omits empty bounds', () => {
    expect(toQueryRange({ from: '', to: '' })).toEqual({});
  });
  it('exposes presets in display order with this-month first', () => {
    expect(PERIOD_PRESETS[0]).toBe<PeriodPreset>('this-month');
  });
});
```

- [ ] **Step 2: Run, verify it fails.** Run: `pnpm exec vitest run src/features/reports/period.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `src/features/reports/period.ts`.** Use local `Date` getters (matches `transactionFilters.toDateInput`). `today` is injected — no ambient `new Date()` in the pure helpers.

```ts
import { dateInputToUtcEnd, dateInputToUtcStart } from '@/lib/dates';
import type { ReportRange } from '@/api/reports';

export type PeriodPreset = 'this-month' | 'last-month' | 'this-year' | 'all-time';

export const PERIOD_PRESETS: readonly PeriodPreset[] = [
  'this-month',
  'last-month',
  'this-year',
  'all-time',
] as const;

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  'this-month': 'This month',
  'last-month': 'Last month',
  'this-year': 'This year',
  'all-time': 'All time',
};

// 'YYYY-MM-DD' day strings — the shape DatePicker and the API converters use.
export interface DayRange {
  from: string;
  to: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const day = (y: number, m1: number, d: number) => `${y}-${pad(m1)}-${pad(d)}`;
// Last day of month m1 (1-based) in year y; day 0 of next month rolls back.
const lastDay = (y: number, m1: number) => new Date(y, m1, 0).getDate();

export function presetRange(preset: PeriodPreset, today: Date): DayRange {
  const y = today.getFullYear();
  const m1 = today.getMonth() + 1; // 1-based
  switch (preset) {
    case 'this-month':
      return { from: day(y, m1, 1), to: day(y, m1, lastDay(y, m1)) };
    case 'last-month': {
      const ly = m1 === 1 ? y - 1 : y;
      const lm = m1 === 1 ? 12 : m1 - 1;
      return { from: day(ly, lm, 1), to: day(ly, lm, lastDay(ly, lm)) };
    }
    case 'this-year':
      return { from: day(y, 1, 1), to: day(y, 12, 31) };
    case 'all-time':
      return { from: '', to: '' };
  }
}

// DayRange -> API ReportRange (inclusive UTC bounds; empty => omitted).
export function toQueryRange(range: DayRange): ReportRange {
  const out: ReportRange = {};
  if (range.from) out.from = dateInputToUtcStart(range.from);
  if (range.to) out.to = dateInputToUtcEnd(range.to);
  return out;
}
```

- [ ] **Step 4: Run, verify it passes.** Run: `pnpm exec vitest run src/features/reports/period.test.ts` — Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/features/reports/period.ts src/features/reports/period.test.ts
git commit -m "feat(reports): period presets and UTC range conversion (#24)"
```

---

### Task 5: Reporting hooks `useReports.ts`

**Files:**

- Create: `src/features/reports/useReports.ts`

(No standalone test — exercised via the `ReportsPane` integration test in Task 11. Keeping these thin and identical to `useConfiguration` keeps risk low.)

- [ ] **Step 1: Implement `src/features/reports/useReports.ts`.**

```ts
import { useQuery } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { reportsApi, type ReportRange } from '@/api/reports';
import { useAuth } from '@/auth/useAuth';

function useClient() {
  const { tokenRef, signOut } = useAuth();
  return () =>
    new ApiClient({ baseUrl, getToken: () => tokenRef.current, onUnauthorized: signOut });
}

export function useSpendingByCategory(range: ReportRange) {
  const { session } = useAuth();
  const makeClient = useClient();
  return useQuery({
    queryKey: ['reports', 'spending', range.from ?? null, range.to ?? null],
    enabled: !!session,
    queryFn: () => reportsApi(makeClient()).spendingByCategory(range),
  });
}

export function useIncomeVsExpense(range: ReportRange) {
  const { session } = useAuth();
  const makeClient = useClient();
  return useQuery({
    queryKey: ['reports', 'income-expense', range.from ?? null, range.to ?? null],
    enabled: !!session,
    queryFn: () => reportsApi(makeClient()).incomeVsExpense(range),
  });
}

export function useNetWorth() {
  const { session } = useAuth();
  const makeClient = useClient();
  return useQuery({
    queryKey: ['reports', 'net-worth'], // period-independent
    enabled: !!session,
    queryFn: () => reportsApi(makeClient()).netWorth(),
  });
}
```

> Note: confirm `useAuth()` exposes `session`, `tokenRef`, `signOut` (it does — see `useConfiguration.ts`). If the `useClient` closure pattern trips the `react-hooks` lint rule, inline the client construction into each `queryFn` exactly like `useConfiguration`.

- [ ] **Step 2: Typecheck + lint.** Run: `just typecheck && just lint` — Expected: PASS.
- [ ] **Step 3: Commit.**

```bash
git add src/features/reports/useReports.ts
git commit -m "feat(reports): TanStack Query hooks for the three reports (#24)"
```

---

### Task 6: MSW handlers + fixtures for reports

**Files:**

- Modify: `src/test/fixtures.ts` (add report fixtures)
- Modify: `src/test/handlers.ts` (add three default handlers)

- [ ] **Step 1: Add fixtures to `src/test/fixtures.ts`.** Reuse existing ids (`foodCategoryId`, `salaryCategoryId`, account `a1`).

```ts
import type {
  IncomeVsExpenseResponse,
  NetWorthResponse,
  SpendingByCategoryResponse,
} from '@/api/types';

export const spendingByCategoryFixture: SpendingByCategoryResponse = {
  categories: [
    { categoryId: foodCategoryId, total: { amount: 120, currency: 'USD' } },
    { categoryId: salaryCategoryId, total: { amount: 30, currency: 'USD' } },
  ],
  total: { amount: 150, currency: 'USD' },
};

export const incomeVsExpenseFixture: IncomeVsExpenseResponse = {
  income: { amount: 500, currency: 'USD' },
  expense: { amount: 150, currency: 'USD' },
  net: { amount: 350, currency: 'USD' },
};

export const netWorthFixture: NetWorthResponse = {
  accounts: [
    {
      accountId: 'a1',
      balance: { amount: 1234.56, currency: 'USD' },
      baseBalance: { amount: 1234.56, currency: 'USD' },
    },
  ],
  total: { amount: 1234.56, currency: 'USD' },
};
```

- [ ] **Step 2: Add default handlers to `src/test/handlers.ts`.** Import the new fixtures; add to the `handlers` array:

```ts
http.get(`${apiBase}/api/reports/spending-by-category`, () =>
  HttpResponse.json(spendingByCategoryFixture),
),
http.get(`${apiBase}/api/reports/income-vs-expense`, () =>
  HttpResponse.json(incomeVsExpenseFixture),
),
http.get(`${apiBase}/api/reports/net-worth`, () => HttpResponse.json(netWorthFixture)),
```

- [ ] **Step 3: Verify nothing breaks.** Run: `pnpm exec vitest run src/test` — Expected: PASS (fixtures typecheck against DTOs).
- [ ] **Step 4: Commit.**

```bash
git add src/test/fixtures.ts src/test/handlers.ts
git commit -m "test(reports): MSW fixtures and default handlers (#24)"
```

---

### Task 7: `BreakdownBar` primitive

**Files:**

- Create: `src/features/reports/BreakdownBar.tsx`
- Test: `src/features/reports/BreakdownBar.test.tsx`

- [ ] **Step 1: Write the failing test.**

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BreakdownBar } from './BreakdownBar';

describe('BreakdownBar', () => {
  it('renders label, amount, and a proportional bar width', () => {
    render(<BreakdownBar label="Food" amount="$120.00" fraction={0.5} />);
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('$120.00')).toBeInTheDocument();
    const bar = screen.getByTestId('breakdown-bar-fill');
    expect(bar).toHaveStyle({ width: '50%' });
  });

  it('clamps fraction into [0,1]', () => {
    render(<BreakdownBar label="X" amount="$1" fraction={2} />);
    expect(screen.getByTestId('breakdown-bar-fill')).toHaveStyle({ width: '100%' });
  });
});
```

- [ ] **Step 2: Run, verify it fails.** Run: `pnpm exec vitest run src/features/reports/BreakdownBar.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement `src/features/reports/BreakdownBar.tsx`.**

```tsx
export interface BreakdownBarProps {
  label: string;
  amount: string;
  fraction: number; // 0..1 of the largest row
}

export function BreakdownBar({ label, amount, fraction }: BreakdownBarProps) {
  const pct = Math.max(0, Math.min(1, Number.isFinite(fraction) ? fraction : 0)) * 100;
  return (
    <div className="flex flex-col gap-1 py-1.5">
      <div className="flex items-baseline justify-between text-sm">
        <span className="truncate">{label}</span>
        <span className="ml-2 shrink-0 tabular-nums">{amount}</span>
      </div>
      <div className="h-2 w-full rounded bg-muted" aria-hidden>
        <div
          data-testid="breakdown-bar-fill"
          className="h-2 rounded bg-primary"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run, verify it passes.** Run: `pnpm exec vitest run src/features/reports/BreakdownBar.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/features/reports/BreakdownBar.tsx src/features/reports/BreakdownBar.test.tsx
git commit -m "feat(reports): BreakdownBar bar primitive (#24)"
```

---

### Task 8: `PeriodSelector`

**Files:**

- Create: `src/features/reports/PeriodSelector.tsx`
- Test: `src/features/reports/PeriodSelector.test.tsx`

State model: the parent owns `{ preset, range }`. PeriodSelector emits `onPresetChange(preset)` (parent recomputes range via `presetRange`) and, when preset is a new `'custom'` value, emits `onRangeChange(DayRange)` from the two DatePickers. To keep `period.ts` unchanged, `'custom'` is a selector-only UI value (not a `PeriodPreset`); the parent treats `custom` by keeping the existing range editable.

- [ ] **Step 1: Write the failing test.**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PeriodSelector } from './PeriodSelector';

describe('PeriodSelector', () => {
  it('shows the active preset and emits onPresetChange', async () => {
    const onPreset = vi.fn();
    render(
      <PeriodSelector
        value="this-month"
        range={{ from: '2026-06-01', to: '2026-06-30' }}
        onPresetChange={onPreset}
        onRangeChange={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('combobox', { name: /period/i }));
    // Radix portals the listbox asynchronously — use findByRole (matches the
    // existing Select tests, e.g. CreateIncomeDialog.test.tsx).
    await userEvent.click(await screen.findByRole('option', { name: 'Last month' }));
    expect(onPreset).toHaveBeenCalledWith('last-month');
  });

  it('reveals custom date inputs when Custom is selected', () => {
    render(
      <PeriodSelector
        value="custom"
        range={{ from: '2026-06-01', to: '2026-06-30' }}
        onPresetChange={vi.fn()}
        onRangeChange={vi.fn()}
      />,
    );
    expect(screen.getByLabelText('From')).toBeInTheDocument();
    expect(screen.getByLabelText('To')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify it fails.** Run: `pnpm exec vitest run src/features/reports/PeriodSelector.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement `src/features/reports/PeriodSelector.tsx`.** Use the shadcn `Select` (`src/components/ui/select`) and the shared `DatePicker`. Mirror the From/To min/max cross-wiring from `TransactionFilterBar`.

```tsx
import { DatePicker } from '@/components/DatePicker';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { PERIOD_PRESETS, PERIOD_PRESET_LABELS, type DayRange, type PeriodPreset } from './period';

export type PeriodValue = PeriodPreset | 'custom';

export interface PeriodSelectorProps {
  value: PeriodValue;
  range: DayRange;
  onPresetChange: (preset: PeriodValue) => void;
  onRangeChange: (range: DayRange) => void;
}

export function PeriodSelector({
  value,
  range,
  onPresetChange,
  onRangeChange,
}: PeriodSelectorProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Select value={value} onValueChange={(v) => onPresetChange(v as PeriodValue)}>
        <SelectTrigger aria-label="Period" className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PERIOD_PRESETS.map((p) => (
            <SelectItem key={p} value={p}>
              {PERIOD_PRESET_LABELS[p]}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom…</SelectItem>
        </SelectContent>
      </Select>
      {value === 'custom' && (
        <>
          <label htmlFor="report-from" className="flex items-center gap-1">
            From
            <DatePicker
              id="report-from"
              value={range.from}
              onChange={(from) => onRangeChange({ ...range, from })}
              aria-label="From"
              maxDate={range.to}
              placeholder="From"
              className="w-auto"
            />
          </label>
          <label htmlFor="report-to" className="flex items-center gap-1">
            To
            <DatePicker
              id="report-to"
              value={range.to}
              onChange={(to) => onRangeChange({ ...range, to })}
              aria-label="To"
              minDate={range.from}
              placeholder="To"
              className="w-auto"
            />
          </label>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run, verify it passes.** Run: `pnpm exec vitest run src/features/reports/PeriodSelector.test.tsx` — Expected: PASS. (If Radix `Select` needs pointer polyfills, `src/test/setup.ts` already provides them — see CLAUDE.md.)
- [ ] **Step 5: Commit.**

```bash
git add src/features/reports/PeriodSelector.tsx src/features/reports/PeriodSelector.test.tsx
git commit -m "feat(reports): period selector (presets + custom range) (#24)"
```

---

### Task 9: `IncomeVsExpenseCard`

**Files:**

- Create: `src/features/reports/IncomeVsExpenseCard.tsx`
- Test: `src/features/reports/IncomeVsExpenseCard.test.tsx`

Props: takes a `ReportRange` and calls `useIncomeVsExpense` internally so the card owns its loading/empty/error states. Tests sign in + AuthProvider + handlers (default handler returns `incomeVsExpenseFixture`).

- [ ] **Step 1: Write the failing test.**

```tsx
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { server } from '@/test/server';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { renderWithProviders } from '@/test/utils';
import { IncomeVsExpenseCard } from './IncomeVsExpenseCard';

const apiBase = 'http://localhost:8080';
const signIn = () => saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });

describe('IncomeVsExpenseCard', () => {
  it('renders income, expense, and net', async () => {
    signIn();
    renderWithProviders(
      <AuthProvider>
        <IncomeVsExpenseCard range={{}} />
      </AuthProvider>,
    );
    expect(await screen.findByText('$500.00')).toBeInTheDocument();
    expect(screen.getByText('$150.00')).toBeInTheDocument();
    expect(screen.getByText('$350.00')).toBeInTheDocument();
  });

  it('shows an error state on failure', async () => {
    signIn();
    server.use(
      http.get(
        `${apiBase}/api/reports/income-vs-expense`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    renderWithProviders(
      <AuthProvider>
        <IncomeVsExpenseCard range={{}} />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
```

- [ ] **Step 2: Run, verify it fails.** Run: `pnpm exec vitest run src/features/reports/IncomeVsExpenseCard.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement `src/features/reports/IncomeVsExpenseCard.tsx`.** Use `formatMoney`, `Skeleton`, `Alert`. Follow the loading/error idiom used in `AccountsPane`/`TransactionsPane` (`Skeleton` while loading, `Alert role="alert"` on error).

```tsx
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/format';
import type { ReportRange } from '@/api/reports';
import { cn } from '@/lib/utils';
import { useIncomeVsExpense } from './useReports';

function Figure({
  label,
  money,
  className,
}: {
  label: string;
  money: { amount: number; currency: string };
  className?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn('text-lg font-semibold tabular-nums', className)}>
        {formatMoney(money.amount, money.currency)}
      </span>
    </div>
  );
}

export function IncomeVsExpenseCard({ range }: { range: ReportRange }) {
  const { data, isLoading, isError } = useIncomeVsExpense(range);
  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-3 font-semibold">Income vs. expense</h2>
      {isLoading && <Skeleton className="h-12 w-full" />}
      {isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>Could not load income vs. expense.</AlertDescription>
        </Alert>
      )}
      {data && (
        <div className="flex flex-wrap gap-8">
          <Figure label="Income" money={data.income} className="text-green-600" />
          <Figure label="Expense" money={data.expense} className="text-red-600" />
          <Figure
            label="Net"
            money={data.net}
            className={data.net.amount < 0 ? 'text-red-600' : 'text-green-600'}
          />
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run, verify it passes.** Run: `pnpm exec vitest run src/features/reports/IncomeVsExpenseCard.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/features/reports/IncomeVsExpenseCard.tsx src/features/reports/IncomeVsExpenseCard.test.tsx
git commit -m "feat(reports): income vs expense card (#24)"
```

---

### Task 10: `SpendingByCategoryCard`

**Files:**

- Create: `src/features/reports/SpendingByCategoryCard.tsx`
- Test: `src/features/reports/SpendingByCategoryCard.test.tsx`

Resolves category names via `useConfiguration` + `useDictionaryEntryNames`. Sorts rows by total desc; bar `fraction = total / maxTotal`. Unknown id → shortened id fallback (e.g. first 8 chars) so the row still shows.

- [ ] **Step 1: Write the failing test.**

```tsx
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { server } from '@/test/server';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { renderWithProviders } from '@/test/utils';
import { SpendingByCategoryCard } from './SpendingByCategoryCard';

const apiBase = 'http://localhost:8080';
const signIn = () => saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });

describe('SpendingByCategoryCard', () => {
  it('resolves category names and renders bars largest-first', async () => {
    signIn();
    renderWithProviders(
      <AuthProvider>
        <SpendingByCategoryCard range={{}} />
      </AuthProvider>,
    );
    // foodCategoryId -> "Food" (120), salaryCategoryId -> "Salary" (30)
    expect(await screen.findByText('Food')).toBeInTheDocument();
    expect(screen.getByText('Salary')).toBeInTheDocument();
    const labels = screen.getAllByText(/Food|Salary/).map((n) => n.textContent);
    expect(labels[0]).toBe('Food'); // largest first
  });

  it('shows empty state when there is no spending', async () => {
    signIn();
    server.use(
      http.get(`${apiBase}/api/reports/spending-by-category`, () =>
        HttpResponse.json({ categories: [], total: { amount: 0, currency: 'USD' } }),
      ),
    );
    renderWithProviders(
      <AuthProvider>
        <SpendingByCategoryCard range={{}} />
      </AuthProvider>,
    );
    expect(await screen.findByText(/no spending/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run, verify it fails.** Run: `pnpm exec vitest run src/features/reports/SpendingByCategoryCard.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement `src/features/reports/SpendingByCategoryCard.tsx`.**

```tsx
import { useMemo } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/format';
import type { ReportRange } from '@/api/reports';
import {
  useConfiguration,
  useDictionaryEntryNames,
} from '@/features/configuration/useConfiguration';
import { BreakdownBar } from './BreakdownBar';
import { useSpendingByCategory } from './useReports';

export function SpendingByCategoryCard({ range }: { range: ReportRange }) {
  const { data, isLoading, isError } = useSpendingByCategory(range);
  const { data: config } = useConfiguration();
  const nameById = useDictionaryEntryNames(config);

  const rows = useMemo(() => {
    const cats = [...(data?.categories ?? [])].sort((a, b) => b.total.amount - a.total.amount);
    const max = cats.reduce((m, c) => Math.max(m, c.total.amount), 0);
    return cats.map((c) => ({
      key: c.categoryId,
      label: nameById.get(c.categoryId) ?? c.categoryId.slice(0, 8),
      amount: formatMoney(c.total.amount, c.total.currency),
      fraction: max > 0 ? c.total.amount / max : 0,
    }));
  }, [data, nameById]);

  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-3 font-semibold">Spending by category</h2>
      {isLoading && <Skeleton className="h-24 w-full" />}
      {isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>Could not load spending by category.</AlertDescription>
        </Alert>
      )}
      {data && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No spending in this period.</p>
      )}
      {rows.length > 0 && (
        <div className="flex flex-col">
          {rows.map((r) => (
            <BreakdownBar key={r.key} label={r.label} amount={r.amount} fraction={r.fraction} />
          ))}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run, verify it passes.** Run: `pnpm exec vitest run src/features/reports/SpendingByCategoryCard.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/features/reports/SpendingByCategoryCard.tsx src/features/reports/SpendingByCategoryCard.test.tsx
git commit -m "feat(reports): spending-by-category card (#24)"
```

---

### Task 11: `NetWorthCard`

**Files:**

- Create: `src/features/reports/NetWorthCard.tsx`
- Test: `src/features/reports/NetWorthCard.test.tsx`

Resolves account names via `useAccounts`. Period-independent (`useNetWorth()`, no range prop). Each row shows native `balance`; when `baseBalance.currency` differs from `balance.currency`, also show the base equivalent. Total in base currency.

- [ ] **Step 1: Write the failing test.**

```tsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { renderWithProviders } from '@/test/utils';
import { NetWorthCard } from './NetWorthCard';

const signIn = () => saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });

describe('NetWorthCard', () => {
  it('resolves account names and shows the total', async () => {
    signIn();
    renderWithProviders(
      <AuthProvider>
        <NetWorthCard />
      </AuthProvider>,
    );
    expect(await screen.findByText('Checking')).toBeInTheDocument(); // accountFixture a1
    expect(screen.getAllByText('$1,234.56').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run, verify it fails.** Run: `pnpm exec vitest run src/features/reports/NetWorthCard.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement `src/features/reports/NetWorthCard.tsx`.**

```tsx
import { useMemo } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/format';
import { useAccounts } from '@/features/accounts/useAccounts';
import { useNetWorth } from './useReports';

export function NetWorthCard() {
  const { data, isLoading, isError } = useNetWorth();
  const { data: accountsData } = useAccounts();

  // useAccounts() returns a bare AccountResponse[] (accountsApi.list unwraps the
  // { accounts, totalCount } envelope) — iterate the array directly.
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accountsData ?? []) m.set(a.id, a.name);
    return m;
  }, [accountsData]);

  return (
    <section className="rounded-lg border p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-semibold">Net worth</h2>
        <span className="text-xs text-muted-foreground">current</span>
      </div>
      {isLoading && <Skeleton className="h-24 w-full" />}
      {isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>Could not load net worth.</AlertDescription>
        </Alert>
      )}
      {data && data.accounts.length === 0 && (
        <p className="text-sm text-muted-foreground">No accounts yet.</p>
      )}
      {data && data.accounts.length > 0 && (
        <>
          <ul className="flex flex-col divide-y">
            {data.accounts.map((a) => {
              const crossCurrency = a.baseBalance.currency !== a.balance.currency;
              return (
                <li
                  key={a.accountId}
                  className="flex items-baseline justify-between py-1.5 text-sm"
                >
                  <span className="truncate">
                    {nameById.get(a.accountId) ?? a.accountId.slice(0, 8)}
                  </span>
                  <span className="ml-2 shrink-0 text-right tabular-nums">
                    {formatMoney(a.balance.amount, a.balance.currency)}
                    {crossCurrency && (
                      <span className="ml-2 text-muted-foreground">
                        ({formatMoney(a.baseBalance.amount, a.baseBalance.currency)})
                      </span>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 flex items-baseline justify-between border-t pt-3 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">
              {formatMoney(data.total.amount, data.total.currency)}
            </span>
          </div>
        </>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Run, verify it passes.** Run: `pnpm exec vitest run src/features/reports/NetWorthCard.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/features/reports/NetWorthCard.tsx src/features/reports/NetWorthCard.test.tsx
git commit -m "feat(reports): net-worth card (#24)"
```

---

### Task 12: `ReportsPane` — compose + period state

**Files:**

- Create: `src/features/reports/ReportsPane.tsx`
- Test: `src/features/reports/ReportsPane.test.tsx`

Owns `{ periodValue, dayRange }`. Default `periodValue = 'this-month'`, `dayRange = presetRange('this-month', new Date())`. On preset change: if `'custom'`, keep current range editable; else recompute `dayRange = presetRange(preset, new Date())`. Passes `toQueryRange(dayRange)` to the period-scoped cards; `NetWorthCard` takes no range.

- [ ] **Step 1: Write the failing integration test** (period switch drives a refetch with new params):

```tsx
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '@/test/server';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { renderWithProviders } from '@/test/utils';
import { ReportsPane } from './ReportsPane';

const apiBase = 'http://localhost:8080';
const signIn = () => saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });

describe('ReportsPane', () => {
  it('loads all three reports for the default (this-month) period', async () => {
    signIn();
    renderWithProviders(
      <AuthProvider>
        <ReportsPane />
      </AuthProvider>,
    );
    expect(await screen.findByText('Income vs. expense')).toBeInTheDocument();
    expect(await screen.findByText('Food')).toBeInTheDocument();
    expect(await screen.findByText('Checking')).toBeInTheDocument();
  });

  it('refetches spending when the period changes', async () => {
    signIn();
    const seen: string[] = [];
    server.use(
      http.get(`${apiBase}/api/reports/spending-by-category`, ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('from') ?? 'open');
        return HttpResponse.json({ categories: [], total: { amount: 0, currency: 'USD' } });
      }),
    );
    renderWithProviders(
      <AuthProvider>
        <ReportsPane />
      </AuthProvider>,
    );
    await screen.findByText(/no spending/i);
    await userEvent.click(screen.getByRole('combobox', { name: /period/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'All time' }));
    // All time => open range (from param omitted) => a new fetch recorded.
    await waitFor(() => expect(seen).toContain('open'));
  });
});
```

- [ ] **Step 2: Run, verify it fails.** Run: `pnpm exec vitest run src/features/reports/ReportsPane.test.tsx` — Expected: FAIL.

- [ ] **Step 3: Implement `src/features/reports/ReportsPane.tsx`.**

```tsx
import { useMemo, useState } from 'react';
import { presetRange, toQueryRange, type DayRange } from './period';
import { PeriodSelector, type PeriodValue } from './PeriodSelector';
import { IncomeVsExpenseCard } from './IncomeVsExpenseCard';
import { SpendingByCategoryCard } from './SpendingByCategoryCard';
import { NetWorthCard } from './NetWorthCard';

export function ReportsPane() {
  const [periodValue, setPeriodValue] = useState<PeriodValue>('this-month');
  const [dayRange, setDayRange] = useState<DayRange>(() => presetRange('this-month', new Date()));

  const onPresetChange = (next: PeriodValue) => {
    setPeriodValue(next);
    if (next !== 'custom') setDayRange(presetRange(next, new Date()));
  };

  const query = useMemo(() => toQueryRange(dayRange), [dayRange]);

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Reports</h1>
        <PeriodSelector
          value={periodValue}
          range={dayRange}
          onPresetChange={onPresetChange}
          onRangeChange={setDayRange}
        />
      </div>
      <IncomeVsExpenseCard range={query} />
      <SpendingByCategoryCard range={query} />
      <NetWorthCard />
    </div>
  );
}
```

- [ ] **Step 4: Run, verify it passes.** Run: `pnpm exec vitest run src/features/reports/ReportsPane.test.tsx` — Expected: PASS.
- [ ] **Step 5: Commit.**

```bash
git add src/features/reports/ReportsPane.tsx src/features/reports/ReportsPane.test.tsx
git commit -m "feat(reports): ReportsPane composing the three reports (#24)"
```

---

### Task 13: `ReportsPage`, route, and Header link

**Files:**

- Create: `src/pages/ReportsPage.tsx`
- Modify: `src/App.tsx` (add protected route)
- Modify: `src/components/Header.tsx` (add nav link)
- Test: `src/pages/ReportsPage.test.tsx`

- [ ] **Step 1: Implement `src/pages/ReportsPage.tsx`** (full width, no accounts sidebar — mirrors `HomePage`'s Header usage):

```tsx
import { Header } from '@/components/Header';
import { ReportsPane } from '@/features/reports/ReportsPane';

export default function ReportsPage() {
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <main className="flex-1 overflow-y-auto">
        <ReportsPane />
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Register the route in `src/App.tsx`.** Add the import and a `<Route>` under the existing `<ProtectedRoute />` parent:

```tsx
import ReportsPage from '@/pages/ReportsPage';
// ...
<Route path="/reports" element={<ReportsPage />} />;
```

- [ ] **Step 3: Add the Header link in `src/components/Header.tsx`.** Add a nav link between the brand and `UserMenu`:

```tsx
import { Link } from 'react-router-dom';
import { UserMenu } from './UserMenu';

export function Header() {
  return (
    <header className="flex items-center justify-between border-b px-6 py-3">
      <div className="flex items-center gap-6">
        <Link to="/" className="font-semibold">
          Home Accounting
        </Link>
        <Link to="/reports" className="text-sm text-muted-foreground hover:text-foreground">
          Reports
        </Link>
      </div>
      <UserMenu />
    </header>
  );
}
```

- [ ] **Step 4: Write a smoke test `src/pages/ReportsPage.test.tsx`** (route renders when authenticated):

```tsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { renderWithProviders } from '@/test/utils';
import ReportsPage from './ReportsPage';

describe('ReportsPage', () => {
  it('renders the reports view at /reports', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(
      <AuthProvider>
        <Routes>
          <Route path="/reports" element={<ReportsPage />} />
        </Routes>
      </AuthProvider>,
      { initialPath: '/reports' },
    );
    expect(await screen.findByRole('heading', { name: 'Reports' })).toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run + typecheck.** Run: `pnpm exec vitest run src/pages/ReportsPage.test.tsx && just typecheck` — Expected: PASS.
- [ ] **Step 6: Commit.**

```bash
git add src/pages/ReportsPage.tsx src/App.tsx src/components/Header.tsx src/pages/ReportsPage.test.tsx
git commit -m "feat(reports): /reports route, page, and Header link (#24)"
```

---

### Task 14: Full verification

- [ ] **Step 1: Run the whole gate.** Run: `just check && just test` — Expected: typecheck + lint + format-check + all tests PASS. Fix any formatting with `just format`.
- [ ] **Step 2 (optional): Header nav E2E.** If adding an E2E smoke, assert the `/reports` link is reachable and the "Reports" heading renders. Otherwise note it as covered by the `ReportsPage` component test.
- [ ] **Step 3: Final commit (if formatting changed).**

```bash
git add -A
git commit -m "chore(reports): formatting and final verification (#24)"
```

---

## Notes / risks

- **DTO drift** is the top risk: the DTOs in Task 1 are transcribed from `server-infra/src/Web/Types.hs:683-737` on branch `feat/minimal-reporting`. If the backend shape changed after this plan was written, fix `types.ts` first.
- **`useAuth` surface**: hooks assume `{ session, tokenRef, signOut }` (confirmed against `useConfiguration.ts`). If lint flags the `useClient` closure, inline client construction per `queryFn` exactly like `useConfiguration`.
- **Radix `Select` in happy-dom**: pointer-capture polyfills already live in `src/test/setup.ts` (do not strip — CLAUDE.md). If a `Select` interaction still misbehaves under happy-dom, fall back to asserting via the open listbox options as other tests do.
- **`formatMoney` negative net**: `Intl.NumberFormat` currency style renders negatives as `-$x` / `($x)` depending on locale; the test asserts the positive fixture, so this is cosmetic only.
- **All-time / open range**: `presetRange('all-time')` returns empty bounds → omitted params → backend treats as open. Verified in `period.test.ts` and the `ReportsPane` refetch test.
