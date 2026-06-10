# Transactions List Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the transactions list show colored labels (gmail style) and per-type icons, and add browser-side filtering (date window, description, label, category) plus client-side pagination.

**Architecture:** A From/To date window bounds the fetch via the backend's `dateFrom`/`dateTo` params (the only server-side filter); the queryfn pages `limit=200`/`offset` to accumulate the whole window into one in-memory `TransactionResponse[]`. Description/label/category filtering and pagination run in the browser over that array via pure helpers. Presentation (type icon, label chips) is split into small focused components.

**Tech Stack:** React 18 + TypeScript (strict), TanStack Query, Tailwind, shadcn/ui, lucide-react, Vitest + Testing Library + MSW.

**Spec:** `docs/specs/2026-06-10-transactions-list-improvements-design.md`

**Conventions (read before starting):**

- Path alias `@/*` → `src/*`. No deep relative imports.
- `noUncheckedIndexedAccess` is on — array index access is `T | undefined`; use `!` only where provably safe.
- Tests: render via `renderWithProviders` (`src/test/utils.tsx`); MSW handlers in `src/test/handlers.ts`, per-test overrides via `server.use(...)`. `onUnhandledRequest: 'error'`.
- Commit after each task. Run `just typecheck` / `just lint` / `just test` (or `pnpm exec tsc --noEmit`, `pnpm exec eslint`, `pnpm exec vitest run`).
- Branch is `feat/transactions-list-improvements` (already created).

---

## File Structure

**Create:**

- `src/features/transactions/transactionType.tsx` — pure map `transactionType → { Icon, colorClass, label }`.
- `src/features/transactions/transactionType.test.tsx`
- `src/features/transactions/labelColors.ts` — pure `labelChipClasses(id) → Tailwind classes`.
- `src/features/transactions/labelColors.test.ts`
- `src/features/transactions/transactionFilters.ts` — pure `applyTransactionFilters`, `sortTransactions`, `defaultDateWindow`, date→UTC helpers.
- `src/features/transactions/transactionFilters.test.ts`
- `src/features/transactions/useWindowedTransactions.ts` — paged-accumulation TanStack Query hook.
- `src/features/transactions/useWindowedTransactions.test.tsx`
- `src/features/transactions/TransactionTypeIcon.tsx` + `.test.tsx`
- `src/features/transactions/LabelChips.tsx` + `.test.tsx`
- `src/features/transactions/TransactionPagination.tsx` + `.test.tsx`
- `src/features/transactions/TransactionFilterBar.tsx` + `.test.tsx`

**Modify:**

- `src/api/types.ts` — DTO sync (add `limit`/`offset` to `TransactionListResponse`, `amendmentCount` to `TransactionResponse`).
- `src/api/transactions.ts` — extend `list()` (params + full-response return type).
- `src/test/fixtures.ts` / `src/test/handlers.ts` — `amendmentCount`, 4-field response, honor query params.
- `src/features/transactions/TransactionsPane.tsx` — integrate filter bar, chips, type icon, pagination, new hook, empty states.
- `src/features/transactions/TransactionsPane.test.tsx` — extend + update empty-state assertion.

**Remove:**

- `src/features/transactions/useTransactions.ts` — superseded by `useWindowedTransactions`; its only consumer is `TransactionsPane`. (No test file exists for it.)

---

## Task 1: DTO sync + test fixtures

**Files:**

- Modify: `src/api/types.ts:266-287`
- Modify: `src/test/fixtures.ts` (`transactionFixture`)
- Modify: `src/test/handlers.ts` (`editedTransactionFixture`, `GET /api/transactions`)

- [ ] **Step 1: Update the DTOs**

In `src/api/types.ts`, add `amendmentCount` to `TransactionResponse` (after `labels`):

```ts
  labels: UUID[];
  // Count of completed amendments; always 0 if never amended.
  // Source: backend Web/Types.hs `data TransactionResponse` (amendmentCount :: Word).
  amendmentCount: number;
}
```

And add `limit`/`offset` to `TransactionListResponse`:

```ts
export interface TransactionListResponse {
  transactions: TransactionResponse[];
  totalCount: number; // all matches before paging
  // Effective page size/offset applied by the server (after defaulting).
  // Source: backend Web/Types.hs:565-575 (TransactionListResponse).
  limit: number;
  offset: number;
}
```

- [ ] **Step 2: Run typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: an error **only** at `src/test/fixtures.ts` (`transactionFixture` is the one literal explicitly annotated `: TransactionResponse`). Note: tsc will **not** flag the untyped literals — `editedTransactionFixture` (`handlers.ts:20`, an unannotated arrow fn) and the inline objects in `TransactionsPane.test.tsx` are passed straight into `HttpResponse.json()` with no `TransactionResponse` annotation, so they must be updated by **inspection**, not by trusting tsc.

- [ ] **Step 3: Fix fixtures & handlers**

In `src/test/fixtures.ts`, add `amendmentCount: 0` to `transactionFixture` (the tsc-flagged one).
By inspection (not tsc-flagged), also add `amendmentCount: 0` to: `editedTransactionFixture` in `src/test/handlers.ts`, and any inline `TransactionResponse`-shaped object in `src/test/handlers.ts` / `TransactionsPane.test.tsx` / `useEditTransaction.test.tsx` (`txResponse`). Grep for `transactionType:` to find them all.

Update the list handler to return the 4-field shape (param-honoring comes in Task 5):

```ts
  http.get(`${apiBase}/api/transactions`, () =>
    HttpResponse.json({
      transactions: [transactionFixture],
      totalCount: 1,
      limit: 50,
      offset: 0,
    }),
  ),
```

- [ ] **Step 4: Verify typecheck + existing tests pass**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: PASS (no behavior change yet).

- [ ] **Step 5: Commit**

```bash
git add src/api/types.ts src/test/fixtures.ts src/test/handlers.ts src/features/transactions/TransactionsPane.test.tsx
git commit -m "feat(transactions): sync TransactionResponse/ListResponse DTOs with backend (#25)"
```

---

## Task 2: Transaction type icon map (pure)

**Files:**

- Create: `src/features/transactions/transactionType.tsx`
- Test: `src/features/transactions/transactionType.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from 'vitest';
import { ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, Scale } from 'lucide-react';
import { transactionTypeMeta } from './transactionType';

describe('transactionTypeMeta', () => {
  it('maps each known type to its icon, color, and label', () => {
    expect(transactionTypeMeta('income')).toMatchObject({ Icon: ArrowDownToLine, label: 'Income' });
    expect(transactionTypeMeta('expense')).toMatchObject({
      Icon: ArrowUpFromLine,
      label: 'Expense',
    });
    expect(transactionTypeMeta('transfer')).toMatchObject({
      Icon: ArrowLeftRight,
      label: 'Transfer',
    });
    expect(transactionTypeMeta('adjustment')).toMatchObject({ Icon: Scale, label: 'Adjustment' });
  });

  it('income is green, expense is destructive (red)', () => {
    expect(transactionTypeMeta('income').colorClass).toContain('green');
    expect(transactionTypeMeta('expense').colorClass).toContain('destructive');
  });

  it('falls back for an unknown type', () => {
    const meta = transactionTypeMeta('weird');
    expect(meta.label).toBe('weird');
    expect(meta.Icon).toBeTypeOf('object');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/transactionType.test.tsx`
Expected: FAIL ("Cannot find module './transactionType'").

- [ ] **Step 3: Implement**

```tsx
import {
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowUpFromLine,
  Circle,
  Scale,
  type LucideIcon,
} from 'lucide-react';
import type { TransferTypeText } from '@/api/types';

export interface TransactionTypeMeta {
  Icon: LucideIcon;
  colorClass: string;
  label: string;
}

// Maps the backend `transactionType` discriminator to a leading icon + color
// for the list row. Unknown values (the open `(string & {})` arm of
// TransferTypeText) fall back to a neutral dot labelled with the raw value.
export function transactionTypeMeta(type: TransferTypeText): TransactionTypeMeta {
  switch (type) {
    case 'income':
      return {
        Icon: ArrowDownToLine,
        colorClass: 'text-green-600 dark:text-green-400',
        label: 'Income',
      };
    case 'expense':
      return { Icon: ArrowUpFromLine, colorClass: 'text-destructive', label: 'Expense' };
    case 'transfer':
      return {
        Icon: ArrowLeftRight,
        colorClass: 'text-blue-600 dark:text-blue-400',
        label: 'Transfer',
      };
    case 'adjustment':
      return { Icon: Scale, colorClass: 'text-muted-foreground', label: 'Adjustment' };
    default:
      return { Icon: Circle, colorClass: 'text-muted-foreground', label: type || 'Unknown' };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/transactionType.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/transactionType.tsx src/features/transactions/transactionType.test.tsx
git commit -m "feat(transactions): add per-type icon/color map (#25)"
```

---

## Task 3: Deterministic label chip colors (pure)

**Files:**

- Create: `src/features/transactions/labelColors.ts`
- Test: `src/features/transactions/labelColors.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { labelChipClasses, LABEL_CHIP_PALETTE } from './labelColors';

describe('labelChipClasses', () => {
  it('is deterministic for the same id', () => {
    expect(labelChipClasses('abc')).toBe(labelChipClasses('abc'));
  });

  it('always returns a class string from the palette', () => {
    for (const id of ['a', 'trip-123', '', '00000000-0000-0000-0000-0000000000aa']) {
      expect(LABEL_CHIP_PALETTE).toContain(labelChipClasses(id));
    }
  });

  it('spreads different ids across more than one palette entry', () => {
    const seen = new Set(Array.from({ length: 50 }, (_, i) => labelChipClasses(`label-${i}`)));
    expect(seen.size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/labelColors.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// Fixed palette of complete Tailwind class strings (literal so the JIT
// scanner emits them). Light + dark variants chosen for chip contrast.
export const LABEL_CHIP_PALETTE = [
  'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200',
  'bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200',
  'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200',
  'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200',
  'bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200',
  'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200',
  'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200',
  'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200',
] as const;

// Stable hash → palette index, so a label always renders the same color.
export function labelChipClasses(labelId: string): string {
  let hash = 0;
  for (let i = 0; i < labelId.length; i += 1) {
    hash = (hash * 31 + labelId.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(hash) % LABEL_CHIP_PALETTE.length;
  return LABEL_CHIP_PALETTE[idx]!;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/labelColors.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/labelColors.ts src/features/transactions/labelColors.test.ts
git commit -m "feat(transactions): add deterministic label chip colors (#25)"
```

---

## Task 4: Filter + sort + date-window helpers (pure)

**Files:**

- Create: `src/features/transactions/transactionFilters.ts`
- Test: `src/features/transactions/transactionFilters.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import type { TransactionResponse } from '@/api/types';
import {
  applyTransactionFilters,
  defaultDateWindow,
  dateInputToUtcEnd,
  dateInputToUtcStart,
  sortTransactions,
  type TransactionFilters,
} from './transactionFilters';

const base: TransactionResponse = {
  id: 't1',
  sourceAccountId: 'a',
  targetAccountId: 'a',
  sourceAmount: 0,
  sourceCurrency: 'USD',
  targetAmount: 0,
  targetCurrency: 'USD',
  exchangeRate: null,
  description: 'Coffee at cafe',
  status: 'Completed',
  failureReason: null,
  transactionType: 'expense',
  category: 'cat-food',
  date: '2026-05-01T00:00:00Z',
  labels: ['lbl-trip'],
  amendmentCount: 0,
};
const row = (o: Partial<TransactionResponse>): TransactionResponse => ({ ...base, ...o });
const noFilter: TransactionFilters = { description: '', labelIds: [], categoryId: '' };

describe('applyTransactionFilters', () => {
  const rows = [
    row({ id: '1', description: 'Coffee', category: 'cat-food', labels: ['lbl-trip'] }),
    row({ id: '2', description: 'Salary', category: 'cat-salary', labels: [] }),
    row({ id: '3', description: 'Transfer', category: null, labels: ['lbl-fun'] }),
  ];

  it('returns all rows when no filter is set', () => {
    expect(applyTransactionFilters(rows, noFilter)).toHaveLength(3);
  });
  it('filters by case-insensitive partial description', () => {
    expect(
      applyTransactionFilters(rows, { ...noFilter, description: 'coff' }).map((r) => r.id),
    ).toEqual(['1']);
  });
  it('filters by label (ANY of)', () => {
    expect(
      applyTransactionFilters(rows, { ...noFilter, labelIds: ['lbl-trip', 'lbl-fun'] }).map(
        (r) => r.id,
      ),
    ).toEqual(['1', '3']);
  });
  it('filters by exact category and excludes null-category rows', () => {
    expect(
      applyTransactionFilters(rows, { ...noFilter, categoryId: 'cat-food' }).map((r) => r.id),
    ).toEqual(['1']);
  });
  it('composes filters with AND', () => {
    expect(
      applyTransactionFilters(rows, {
        description: 'o',
        labelIds: ['lbl-trip'],
        categoryId: 'cat-food',
      }).map((r) => r.id),
    ).toEqual(['1']);
  });
});

describe('sortTransactions', () => {
  it('orders by date desc, ties by id asc', () => {
    const out = sortTransactions([
      row({ id: 'b', date: '2026-05-01T00:00:00Z' }),
      row({ id: 'a', date: '2026-05-01T00:00:00Z' }),
      row({ id: 'c', date: '2026-06-01T00:00:00Z' }),
    ]);
    expect(out.map((r) => r.id)).toEqual(['c', 'a', 'b']);
  });
});

describe('date helpers', () => {
  it('defaultDateWindow returns last-month..today as YYYY-MM-DD', () => {
    const { from, to } = defaultDateWindow(new Date('2026-06-10T12:00:00Z'));
    expect(to).toBe('2026-06-10');
    expect(from).toBe('2026-05-10');
  });
  it('converts date inputs to inclusive UTC bounds', () => {
    expect(dateInputToUtcStart('2026-05-10')).toBe('2026-05-10T00:00:00.000Z');
    expect(dateInputToUtcEnd('2026-06-10')).toBe('2026-06-10T23:59:59.999Z');
  });
});
```

> Note: `defaultDateWindow` takes the "today" `Date` as a parameter so it is pure/testable; callers pass `new Date()`. The test pins a UTC noon date to avoid TZ edge cases at the day boundary.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/transactionFilters.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import type { TransactionResponse } from '@/api/types';

export interface TransactionFilters {
  description: string;
  labelIds: string[];
  categoryId: string; // '' = no category constraint (UUID | '')
}

// Browser-side filtering over the loaded window. AND across fields; an empty
// field imposes no constraint. Label match is ANY-of (backend overlap
// semantics). Category is exact-match on the head allocation surfaced by the
// backend; null-category rows (transfer/adjustment) are excluded when a
// category is selected. See spec §5.
export function applyTransactionFilters(
  rows: TransactionResponse[],
  filters: TransactionFilters,
): TransactionResponse[] {
  const q = filters.description.trim().toLowerCase();
  return rows.filter((row) => {
    if (q && !row.description.toLowerCase().includes(q)) return false;
    if (filters.labelIds.length > 0 && !filters.labelIds.some((id) => row.labels.includes(id)))
      return false;
    if (filters.categoryId && row.category !== filters.categoryId) return false;
    return true;
  });
}

// Matches the backend ordering exactly: date descending, ties broken by id
// ascending (Application/ReadModels/Transaction.hs). Defensive so pagination
// is deterministic regardless of page-merge order.
export function sortTransactions(rows: TransactionResponse[]): TransactionResponse[] {
  return [...rows].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
  });
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Default window: last month .. today (local calendar dates — cosmetic
// default only; the UTC bounds for the request come from the helpers below).
// Note: setMonth(-1) on a 31st normalizes (e.g. May 31 → "April 31" → May 1),
// a harmless ~1-day skew in the default window.
export function defaultDateWindow(today: Date): { from: string; to: string } {
  const fromDate = new Date(today);
  fromDate.setMonth(fromDate.getMonth() - 1);
  return { from: toDateInput(fromDate), to: toDateInput(today) };
}

// Inclusive UTC bounds for the backend dateFrom/dateTo params. Start-of-day
// mirrors the existing isoDay pattern (schema.ts); end-of-day is new to this
// slice and correct because Range.within compares the ISO text lexically.
export function dateInputToUtcStart(yyyyMmDd: string): string {
  return `${yyyyMmDd}T00:00:00.000Z`;
}
export function dateInputToUtcEnd(yyyyMmDd: string): string {
  return `${yyyyMmDd}T23:59:59.999Z`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/transactionFilters.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/transactionFilters.ts src/features/transactions/transactionFilters.test.ts
git commit -m "feat(transactions): add filter/sort/date-window helpers (#25)"
```

---

## Task 5: Extend the transactions API `list()`

**Files:**

- Modify: `src/api/transactions.ts:17-21`
- Modify: `src/test/handlers.ts` (`GET /api/transactions` honors params)
- Test: covered indirectly in Task 6 (the hook test exercises this).

- [ ] **Step 1: Update `list()` signature & return type**

In `src/api/transactions.ts`, replace the `list` method:

```ts
  list: async (params: {
    accountId: UUID;
    dateFrom?: ISO8601;
    dateTo?: ISO8601;
    limit?: number;
    offset?: number;
  }): Promise<TransactionListResponse> => {
    const qs = new URLSearchParams({ accountId: params.accountId });
    if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
    if (params.dateTo) qs.set('dateTo', params.dateTo);
    if (params.limit != null) qs.set('limit', String(params.limit));
    if (params.offset != null) qs.set('offset', String(params.offset));
    return client.get<TransactionListResponse>(`/api/transactions?${qs.toString()}`);
  },
```

Add `ISO8601` to the type imports at the top of the file (alongside `UUID`).

> This changes the return type from `TransactionResponse[]` to the full `TransactionListResponse`. The only consumer (`useTransactions.ts`) is removed in Task 11; the new hook (Task 6) consumes the full response.

- [ ] **Step 2: Make the MSW handler honor params (so the accumulation test is meaningful)**

In `src/test/handlers.ts`, replace the `GET /api/transactions` handler with a paginating one driven by a module-level list. Add near the other transaction fixtures:

```ts
// Default windowed list; tests override via server.use(...) when they need
// more rows or specific dates.
const listTransactions = (url: URL) => {
  const all = [transactionFixture];
  const limit = Number(url.searchParams.get('limit') ?? '50');
  const offset = Number(url.searchParams.get('offset') ?? '0');
  const page = all.slice(offset, offset + limit);
  return HttpResponse.json({
    transactions: page,
    totalCount: all.length,
    limit,
    offset,
  });
};
```

And the handler:

```ts
  http.get(`${apiBase}/api/transactions`, ({ request }) => listTransactions(new URL(request.url))),
```

- [ ] **Step 3: Apply the REQUIRED interim fix to `useTransactions.ts`**

The return-type change breaks the sole consumer: `useTransactions.ts:17` returns the list value, and `TransactionsPane.tsx:66,80` call `data.length` / `data.map` — which no longer typecheck against `TransactionListResponse`. This is **not optional**; without it Step 4's `tsc --noEmit` fails. (`useTransactions.ts` is deleted in Task 11; this keeps the tree green in between.)

Edit `useTransactions.ts` — make the queryFn `async` and unwrap `.transactions`:

```ts
    queryFn: async () => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return (await transactionsApi(client).list({ accountId: accountId! })).transactions;
    },
```

- [ ] **Step 4: Verify typecheck + existing tests pass**

Run: `pnpm exec tsc --noEmit && pnpm exec vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/transactions.ts src/test/handlers.ts src/features/transactions/useTransactions.ts
git commit -m "feat(transactions): extend list() with date window + pagination params (#25)"
```

---

## Task 6: `useWindowedTransactions` hook (paged accumulation)

**Files:**

- Create: `src/features/transactions/useWindowedTransactions.ts`
- Test: `src/features/transactions/useWindowedTransactions.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { server } from '@/test/server';
import { AuthContext } from '@/auth/AuthContext';
import { transactionFixture } from '@/test/fixtures';
import { useWindowedTransactions } from './useWindowedTransactions';

const apiBase = 'http://localhost:8080';

// Mirrors the AuthContext mock used in useEditTransaction.test.tsx — provide a
// tokenRef + session directly rather than mutating localStorage.
function makeWrapper(client = new QueryClient()) {
  const ctx = {
    tokenRef: { current: 't' },
    session: { userId: 'u', email: 'a@b' } as never,
    signIn: vi.fn(),
    signOut: vi.fn(),
  } as never;
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={ctx}>{children}</AuthContext.Provider>
      </QueryClientProvider>
    );
  };
}
const wrapper = makeWrapper();

describe('useWindowedTransactions', () => {
  it('accumulates all pages of the window (totalCount > limit)', async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      ...transactionFixture,
      id: `t${String(i).padStart(3, '0')}`,
    }));
    server.use(
      http.get(`${apiBase}/api/transactions`, ({ request }) => {
        const url = new URL(request.url);
        const limit = Number(url.searchParams.get('limit'));
        const offset = Number(url.searchParams.get('offset'));
        return HttpResponse.json({
          transactions: many.slice(offset, offset + limit),
          totalCount: many.length,
          limit,
          offset,
        });
      }),
    );

    const { result } = renderHook(() => useWindowedTransactions('a1', '2026-05-10', '2026-06-10'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toHaveLength(250));
  });
});
```

> The auth wrapper mirrors `useEditTransaction.test.tsx` exactly (mocked `AuthContext.Provider`). The behavior under test is the multi-page accumulation (250 rows over two `limit=200` pages).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/useWindowedTransactions.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
import { useQuery } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { transactionsApi } from '@/api/transactions';
import type { TransactionResponse } from '@/api/types';
import { useAuth } from '@/auth/useAuth';
import { dateInputToUtcEnd, dateInputToUtcStart, sortTransactions } from './transactionFilters';

const PAGE_SIZE = 200; // backend max

// Fetches the whole date-bounded window by paging limit=200/offset until the
// accumulated count reaches totalCount (or a short page signals the end).
// `fromDate`/`toDate` are YYYY-MM-DD. Returns rows sorted date-desc, id-asc.
// See spec §4.
export function useWindowedTransactions(
  accountId: string | undefined,
  fromDate: string,
  toDate: string,
) {
  const { tokenRef, signOut, session } = useAuth();
  return useQuery({
    queryKey: ['transactions', accountId, fromDate, toDate],
    enabled: !!session && !!accountId,
    queryFn: async (): Promise<TransactionResponse[]> => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      const api = transactionsApi(client);
      const dateFrom = dateInputToUtcStart(fromDate);
      const dateTo = dateInputToUtcEnd(toDate);

      const acc: TransactionResponse[] = [];
      let offset = 0;
      // Dual guard: stop on a short page OR once we've reached totalCount.
      for (;;) {
        const res = await api.list({
          accountId: accountId!,
          dateFrom,
          dateTo,
          limit: PAGE_SIZE,
          offset,
        });
        acc.push(...res.transactions);
        if (res.transactions.length < PAGE_SIZE || acc.length >= res.totalCount) break;
        offset += PAGE_SIZE;
      }
      return sortTransactions(acc);
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/useWindowedTransactions.test.tsx`
Expected: PASS (two backend pages fetched, 250 rows accumulated).

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/useWindowedTransactions.ts src/features/transactions/useWindowedTransactions.test.tsx
git commit -m "feat(transactions): add windowed paged-accumulation hook (#25)"
```

---

## Task 7: `TransactionTypeIcon` component

**Files:**

- Create: `src/features/transactions/TransactionTypeIcon.tsx`
- Test: `src/features/transactions/TransactionTypeIcon.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TransactionTypeIcon } from './TransactionTypeIcon';

describe('TransactionTypeIcon', () => {
  it('exposes the type as an accessible label', () => {
    render(<TransactionTypeIcon type="income" />);
    expect(screen.getByLabelText('Income')).toBeInTheDocument();
  });
  it('renders a fallback for unknown types', () => {
    render(<TransactionTypeIcon type="weird" />);
    expect(screen.getByLabelText('weird')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/TransactionTypeIcon.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
import { cn } from '@/lib/utils';
import type { TransferTypeText } from '@/api/types';
import { transactionTypeMeta } from './transactionType';

export function TransactionTypeIcon({
  type,
  className,
}: {
  type: TransferTypeText;
  className?: string;
}) {
  const { Icon, colorClass, label } = transactionTypeMeta(type);
  return (
    <span role="img" aria-label={label} className={cn('inline-flex', colorClass, className)}>
      <Icon className="h-4 w-4" aria-hidden />
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/TransactionTypeIcon.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/TransactionTypeIcon.tsx src/features/transactions/TransactionTypeIcon.test.tsx
git commit -m "feat(transactions): add transaction type icon component (#25)"
```

---

## Task 8: `LabelChips` component

**Files:**

- Create: `src/features/transactions/LabelChips.tsx`
- Test: `src/features/transactions/LabelChips.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { LabelChips } from './LabelChips';

const names = new Map([
  ['l1', 'Trip'],
  ['l2', 'Food'],
]);

describe('LabelChips', () => {
  it('renders a chip per known label id', () => {
    render(<LabelChips labelIds={['l1', 'l2']} nameById={names} />);
    expect(screen.getByText('Trip')).toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();
  });
  it('skips unknown ids and renders nothing when empty', () => {
    const { container } = render(<LabelChips labelIds={['nope']} nameById={names} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/LabelChips.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
import { cn } from '@/lib/utils';
import { labelChipClasses } from './labelColors';

export function LabelChips({
  labelIds,
  nameById,
}: {
  labelIds: string[];
  nameById: Map<string, string>;
}) {
  const known = labelIds.filter((id) => nameById.has(id));
  if (known.length === 0) return null;
  return (
    <span className="ml-2 inline-flex flex-wrap gap-1 align-middle">
      {known.map((id) => (
        <span
          key={id}
          className={cn('rounded px-1.5 py-0.5 text-xs font-medium', labelChipClasses(id))}
        >
          {nameById.get(id)}
        </span>
      ))}
    </span>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/LabelChips.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/LabelChips.tsx src/features/transactions/LabelChips.test.tsx
git commit -m "feat(transactions): add gmail-style label chips (#25)"
```

---

## Task 9: `TransactionPagination` component (+ persisted page size)

**Files:**

- Create: `src/features/transactions/TransactionPagination.tsx`
- Test: `src/features/transactions/TransactionPagination.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import {
  TransactionPagination,
  usePersistedPageSize,
  PAGE_SIZE_KEY,
} from './TransactionPagination';

describe('usePersistedPageSize', () => {
  beforeEach(() => localStorage.clear());
  it('defaults to 50 and persists changes', () => {
    const { result } = renderHook(() => usePersistedPageSize());
    expect(result.current[0]).toBe(50);
    act(() => result.current[1](100));
    expect(localStorage.getItem(PAGE_SIZE_KEY)).toBe('100');
  });
  it('reads a persisted value', () => {
    localStorage.setItem(PAGE_SIZE_KEY, '25');
    const { result } = renderHook(() => usePersistedPageSize());
    expect(result.current[0]).toBe(25);
  });
});

describe('TransactionPagination', () => {
  const props = {
    total: 123,
    pageIndex: 0,
    pageSize: 50,
    onPageIndexChange: vi.fn(),
    onPageSizeChange: vi.fn(),
  };
  it('shows the N–M of T range', () => {
    render(<TransactionPagination {...props} />);
    expect(screen.getByText(/1–50 of 123/)).toBeInTheDocument();
  });
  it('disables Prev on the first page and advances on Next', () => {
    const onPageIndexChange = vi.fn();
    render(<TransactionPagination {...props} onPageIndexChange={onPageIndexChange} />);
    expect(screen.getByRole('button', { name: /prev/i })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: /next/i }));
    expect(onPageIndexChange).toHaveBeenCalledWith(1);
  });
  it('disables Next on the last page', () => {
    render(<TransactionPagination {...props} pageIndex={2} />);
    expect(screen.getByRole('button', { name: /next/i })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/TransactionPagination.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export const PAGE_SIZE_KEY = 'ha.transactions.pageSize';
export const PAGE_SIZES = [25, 50, 100] as const;
const DEFAULT_PAGE_SIZE = 50;

export function usePersistedPageSize(): [number, (n: number) => void] {
  const [size, setSize] = useState<number>(() => {
    const raw = Number(localStorage.getItem(PAGE_SIZE_KEY));
    return PAGE_SIZES.includes(raw as (typeof PAGE_SIZES)[number]) ? raw : DEFAULT_PAGE_SIZE;
  });
  const update = (n: number) => {
    setSize(n);
    localStorage.setItem(PAGE_SIZE_KEY, String(n));
  };
  return [size, update];
}

export interface TransactionPaginationProps {
  total: number;
  pageIndex: number;
  pageSize: number;
  onPageIndexChange: (i: number) => void;
  onPageSizeChange: (n: number) => void;
}

export function TransactionPagination({
  total,
  pageIndex,
  pageSize,
  onPageIndexChange,
  onPageSizeChange,
}: TransactionPaginationProps) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const clamped = Math.min(pageIndex, pageCount - 1);
  const start = total === 0 ? 0 : clamped * pageSize + 1;
  const end = Math.min(total, (clamped + 1) * pageSize);

  return (
    <div className="flex items-center justify-between border-t px-4 py-2 text-sm text-muted-foreground">
      <span>
        Showing {start}–{end} of {total}
      </span>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-1">
          Rows
          <select
            aria-label="Rows per page"
            className="rounded border bg-background px-1 py-0.5"
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <Button
          variant="outline"
          size="sm"
          disabled={clamped <= 0}
          onClick={() => onPageIndexChange(clamped - 1)}
        >
          ‹ Prev
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={clamped >= pageCount - 1}
          onClick={() => onPageIndexChange(clamped + 1)}
        >
          Next ›
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/TransactionPagination.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/TransactionPagination.tsx src/features/transactions/TransactionPagination.test.tsx
git commit -m "feat(transactions): add client-side pagination with persisted page size (#25)"
```

---

## Task 10: `TransactionFilterBar` component

**Files:**

- Create: `src/features/transactions/TransactionFilterBar.tsx`
- Test: `src/features/transactions/TransactionFilterBar.test.tsx`

The bar is fully controlled: it takes the current `TransactionFilters` + From/To dates and emits changes. The parent owns state (Task 11). The category options are prepended with the `{ id: '', name: 'All categories' }` sentinel so the field can be deselected without a global Clear (spec §5).

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import type { DictionaryEntryResponse } from '@/api/types';
import { TransactionFilterBar } from './TransactionFilterBar';

const labels: DictionaryEntryResponse[] = [{ id: 'l1', name: 'Trip' }];
const categories: DictionaryEntryResponse[] = [{ id: 'c1', name: 'Food' }];

function setup(overrides = {}) {
  const props = {
    from: '2026-05-10',
    to: '2026-06-10',
    filters: { description: '', labelIds: [], categoryId: '' },
    labelOptions: labels,
    categoryOptions: categories,
    onFromChange: vi.fn(),
    onToChange: vi.fn(),
    onFiltersChange: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
  render(<TransactionFilterBar {...props} />);
  return props;
}

describe('TransactionFilterBar', () => {
  it('emits description changes', () => {
    const props = setup();
    fireEvent.change(screen.getByPlaceholderText(/description/i), { target: { value: 'coffee' } });
    expect(props.onFiltersChange).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'coffee' }),
    );
  });
  it('caps the From input at To (max attr)', () => {
    setup();
    expect(screen.getByLabelText(/from/i)).toHaveAttribute('max', '2026-06-10');
  });
  it('fires onClear', () => {
    const props = setup();
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(props.onClear).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/TransactionFilterBar.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```tsx
import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import type { DictionaryEntryResponse } from '@/api/types';
import { CategoryCombobox } from './CategoryCombobox';
import { LabelMultiSelect } from './LabelMultiSelect';
import type { TransactionFilters } from './transactionFilters';

export interface TransactionFilterBarProps {
  from: string;
  to: string;
  filters: TransactionFilters;
  labelOptions: DictionaryEntryResponse[];
  categoryOptions: DictionaryEntryResponse[];
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onFiltersChange: (next: TransactionFilters) => void;
  onClear: () => void;
}

export function TransactionFilterBar({
  from,
  to,
  filters,
  labelOptions,
  categoryOptions,
  onFromChange,
  onToChange,
  onFiltersChange,
  onClear,
}: TransactionFilterBarProps) {
  // Sentinel-first options so "All categories" deselects the field (spec §5).
  const categoryOpts = useMemo(
    () => [{ id: '', name: 'All categories' }, ...categoryOptions],
    [categoryOptions],
  );

  return (
    <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2 text-sm">
      <label className="flex items-center gap-1">
        From
        <Input
          type="date"
          aria-label="From"
          value={from}
          max={to}
          onChange={(e) => onFromChange(e.target.value)}
          className="h-8 w-auto"
        />
      </label>
      <label className="flex items-center gap-1">
        To
        <Input
          type="date"
          aria-label="To"
          value={to}
          min={from}
          onChange={(e) => onToChange(e.target.value)}
          className="h-8 w-auto"
        />
      </label>
      <Input
        placeholder="Description…"
        value={filters.description}
        onChange={(e) => onFiltersChange({ ...filters, description: e.target.value })}
        className="h-8 w-44"
      />
      <div className="w-56">
        <LabelMultiSelect
          options={labelOptions}
          value={filters.labelIds}
          onChange={(labelIds) => onFiltersChange({ ...filters, labelIds })}
        />
      </div>
      <div className="w-48">
        <CategoryCombobox
          options={categoryOpts}
          value={filters.categoryId}
          placeholder="All categories"
          onChange={(categoryId) => onFiltersChange({ ...filters, categoryId })}
        />
      </div>
      <Button variant="ghost" size="sm" onClick={onClear}>
        Clear
      </Button>
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/TransactionFilterBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/TransactionFilterBar.tsx src/features/transactions/TransactionFilterBar.test.tsx
git commit -m "feat(transactions): add filter bar (date/description/label/category) (#25)"
```

---

## Task 11: Integrate into `TransactionsPane`

**Files:**

- Modify: `src/features/transactions/TransactionsPane.tsx`
- Modify: `src/features/transactions/TransactionsPane.test.tsx`
- Remove: `src/features/transactions/useTransactions.ts`

This wires everything: window state (default last month), filter state, pagination state, derived filtered+paged rows, the filter bar, label chips, type icon, and the pagination footer. Pagination `pageIndex` is reset to 0 on any filter/date/page-size change; `pageCount` and the clamped index are derived during render (spec §6).

- [ ] **Step 1: Update the existing test expectations + add new ones**

In `src/features/transactions/TransactionsPane.test.tsx`:

- Change **both** `/no transactions yet/i` assertions to `/no transactions in this date range/i` (there are two: ~line 54 "renders empty state" and ~line 205 "renders no header …", which also returns `transactions: []`). Grep for `no transactions yet` to confirm you caught both (spec §8).
- Add tests (using the existing authenticated render + MSW pattern in that file):
  - label chips render for a row that has labels (configure the MSW list to return a row with `labels: [tripLabelId]`; assert the label name "Trip" appears).
  - the type icon is present (assert `getByLabelText('Expense')` for the expense fixture).
  - typing in the description filter narrows the visible rows.
  - the pagination footer shows "Showing 1–N of T".
  - selecting a filter that matches nothing shows `/no transactions match your filters/i`.

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx`
Expected: FAIL (new behavior not implemented).

- [ ] **Step 2: Rewrite `TransactionsPane` body**

Replace the data hook + render. Key pieces (keep the existing `AccountHeader`, `ControlBar`, `EditTransactionDialog`, context-menu/double-click edit, and amount logic):

```tsx
import { useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
// ...existing imports (Alert, Button, Skeleton, ContextMenu*, Pencil,
// useConfiguration, useDictionaryEntryNames, useAccountById, formatDate,
// formatMoney, cn, TransactionResponse, AccountHeader, ControlBar,
// EditTransactionDialog)...
import { useWindowedTransactions } from './useWindowedTransactions';
import {
  applyTransactionFilters,
  defaultDateWindow,
  type TransactionFilters,
} from './transactionFilters';
import { TransactionFilterBar } from './TransactionFilterBar';
import { TransactionTypeIcon } from './TransactionTypeIcon';
import { LabelChips } from './LabelChips';
import { TransactionPagination, usePersistedPageSize } from './TransactionPagination';

const EMPTY_FILTERS: TransactionFilters = { description: '', labelIds: [], categoryId: '' };

export function TransactionsPane() {
  const { id } = useParams<{ id?: string }>();

  const [window, setWindow] = useState(() => defaultDateWindow(new Date()));
  const [filters, setFilters] = useState<TransactionFilters>(EMPTY_FILTERS);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageSize, setPageSize] = usePersistedPageSize();

  const { data, isLoading, isError, refetch } = useWindowedTransactions(id, window.from, window.to);
  const { data: account, isLoading: accountLoading } = useAccountById(id);
  const { data: configuration } = useConfiguration();
  const categoryNameById = useDictionaryEntryNames(configuration);
  const labelNameById = categoryNameById; // same flat id→name map covers labels

  const labelOptions = configuration?.dictionaries.labels?.entries ?? [];
  const categoryOptions = useMemo(
    () => [
      ...(configuration?.dictionaries['income-category']?.entries ?? []),
      ...(configuration?.dictionaries['expense-category']?.entries ?? []),
    ],
    [configuration],
  );

  const filtered = useMemo(() => applyTransactionFilters(data ?? [], filters), [data, filters]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const clampedPage = Math.min(pageIndex, pageCount - 1);
  const pageRows = filtered.slice(clampedPage * pageSize, clampedPage * pageSize + pageSize);

  const [editing, setEditing] = useState<TransactionResponse | null>(null);
  const openEdit = (t: TransactionResponse) => setEditing(t);

  const updateFilters = (next: TransactionFilters) => {
    setFilters(next);
    setPageIndex(0);
  };
  const clearFilters = () => {
    setFilters(EMPTY_FILTERS);
    setWindow(defaultDateWindow(new Date()));
    setPageIndex(0);
  };
  // ...
}
```

Body rendering rules:

- `!id` → "Select an account." (unchanged).
- `isLoading` → skeletons (unchanged).
- `isError` → error alert + Retry (unchanged).
- `data` empty (window has nothing) → "No transactions in this date range."
- `data` non-empty but `filtered` empty → "No transactions match your filters."
- otherwise → the table over `pageRows`, with:
  - a leading cell `<TransactionTypeIcon type={t.transactionType} />`,
  - the description cell followed by `<LabelChips labelIds={t.labels} nameById={labelNameById} />`,
  - the existing Category and Amount cells (unchanged logic).

Always render `<ControlBar />`, the header, and — when `id` is set and not loading/error — the `<TransactionFilterBar ... />` above the table and `<TransactionPagination total={filtered.length} pageIndex={clampedPage} pageSize={pageSize} onPageIndexChange={setPageIndex} onPageSizeChange={(n) => { setPageSize(n); setPageIndex(0); }} />` below it. Wire `onFromChange`/`onToChange` to update `window` and reset `pageIndex` to 0.

> **Existing 2-field MSW overrides (do not migrate):** several existing tests `server.use(...)` a `GET /api/transactions` returning only `{ transactions, totalCount }` (no `limit`/`offset`). These keep working through `useWindowedTransactions` because the accumulation loop's **short-page guard** (`res.transactions.length < PAGE_SIZE`) breaks after page 1 (every override returns < 200 rows). Don't "simplify" the loop to depend solely on `totalCount`, and don't bother migrating those overrides to the 4-field shape.

> **Query-cache interaction (do not "fix"):** the hook's key is `['transactions', accountId, from, to]`. Existing create/edit/adjust/resync `invalidateQueries({ queryKey: ['transactions', accountId] })` calls match by prefix and refetch this query. The edit optimistic `patchCachedTx` targets the 2-element key and won't touch this view, but the settle-invalidation refetch keeps it correct; `EditTransactionDialog.currentTx` falls back to the passed `tx` prop. This is intended.

- [ ] **Step 3: Run the Pane tests**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx`
Expected: PASS.

- [ ] **Step 4: Delete the superseded hook**

```bash
git rm src/features/transactions/useTransactions.ts
```

Run: `pnpm exec tsc --noEmit`
Expected: PASS (no remaining importers).

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/TransactionsPane.tsx src/features/transactions/TransactionsPane.test.tsx
git commit -m "feat(transactions): integrate filtering, labels, type icons, pagination into list (#25)"
```

---

## Task 12: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Run the whole check suite**

Run: `just check && just test`
(or `pnpm exec tsc --noEmit && pnpm exec eslint . && pnpm exec prettier --check . && pnpm exec vitest run`)
Expected: all PASS. Fix any lint/format issues (`just lint-fix`, `just format`).

- [ ] **Step 2: Build**

Run: `just build`
Expected: PASS (`tsc -b` + `vite build`).

- [ ] **Step 3: Manual smoke (optional but recommended)**

Use the `verify` / `run` skill or `just run`, open an account with transactions, and confirm: labels show as colored chips, type icons appear, date window + description + label + category filters narrow the list, and pagination pages through results. (Use the `superpowers:verification-before-completion` skill before claiming done.)

- [ ] **Step 4: Final commit (if any fixups)**

```bash
git add -A
git commit -m "chore(transactions): lint/format fixups for list improvements (#25)"
```

---

## Notes & invariants

- **DTO lockstep:** `types.ts` additions cite `Web/Types.hs`. Don't drop them.
- **Tailwind dynamic classes:** label palette + type colors are complete literal strings so the JIT scanner emits them; never build these class names by interpolation.
- **Pagination derivation:** `pageCount`/clamped index are derived at render; `pageIndex` is reset only on discrete filter/date/page-size events — no clamp-via-effect (spec §6).
- **Window scaling:** a very wide window loads everything into memory; acceptable for the last-month default (spec §4, §11).
- **Category filter = head allocation only** (spec §5 known limitation).
