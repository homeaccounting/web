---
status: draft
---

# Edit Transaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** [`docs/specs/2026-06-04-edit-transaction-design.md`](../specs/2026-06-04-edit-transaction-design.md)
**Issue:** [homeaccounting/web#14](https://github.com/homeaccounting/web/issues/14)
**Branch:** `feat/edit-transaction` (already created on `master`).

**Goal:** Let a signed-in user edit description, date, amount, category (allocations), and labels on an existing `Completed` transaction (income, expense, transfer) via a dialog opened by double-click or right-click → Edit.

**Architecture:** Reuse the existing `mode`-aware `IncomeExpenseForm` and `TransferForm`. A new `EditTransactionDialog` dispatches by `transferType`, seeds defaults from the in-list `TransactionResponse`, runs a sequential diff against the five backend per-field endpoints (amendment → allocations → description → date → labels), and re-seeds from the cache after every sub-call so partial failures keep the form mounted with successful steps clean. The orchestration mirrors `EditAccountDialog` / `useEditAccount`.

**Tech Stack:** React 18 + TypeScript, react-hook-form + Zod, TanStack Query, shadcn/ui (Radix), Vite, Vitest + Testing Library + happy-dom + MSW, Playwright.

**TDD discipline:** Every task follows @superpowers:test-driven-development — write failing test → confirm fail → minimal implementation → confirm pass → commit. Conventional commit messages per the user's global CLAUDE.md (`<type>[(scope)]: <description>`).

---

## File map

| File                                                       | New / Modified | Responsibility                                                                                                                                                                         |
| ---------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/api/client.ts`                                        | Modified       | Add `patch<T>(path, body)` method.                                                                                                                                                     |
| `src/api/types.ts`                                         | Modified       | Add `Allocation`, `SetTransactionLabelsRequest`, `SetTransactionAllocationsRequest`, `ChangeTransactionDescriptionRequest`, `ChangeTransactionDateRequest`, `AmendTransactionRequest`. |
| `src/api/transactions.ts`                                  | Modified       | Add `setDescription`, `setDate`, `setLabels`, `setAllocations`, `amend`.                                                                                                               |
| `src/features/transactions/schema.ts`                      | Modified       | Add `toIncomeExpenseFormValues`, `toTransferFormValues` mappers.                                                                                                                       |
| `src/features/transactions/diffTransaction.ts`             | New            | Pure `diffIncomeExpense` / `diffTransfer` producing a `TransactionEditDiff`.                                                                                                           |
| `src/features/transactions/diffTransaction.test.ts`        | New            | Pure-mapper unit tests.                                                                                                                                                                |
| `src/features/transactions/labels.ts`                      | Modified       | Add `editTitle`, `editSubmit` per kind.                                                                                                                                                |
| `src/features/transactions/IncomeExpenseForm.tsx`          | Modified       | Hide "Defaults to today" helper text in edit mode; use `editSubmit` label in edit mode; disable Save when clean.                                                                       |
| `src/features/transactions/IncomeExpenseForm.test.tsx`     | Modified       | Extend with edit-mode cases.                                                                                                                                                           |
| `src/features/transactions/TransferForm.tsx`               | Modified       | Same mode-conditional adjustments.                                                                                                                                                     |
| `src/features/transactions/TransferForm.test.tsx`          | Modified       | Extend with edit-mode cases.                                                                                                                                                           |
| `src/features/transactions/useEditTransaction.ts`          | New            | Mutation that runs the diff plan; per-sub-call cache patch + `onSubCallApplied`.                                                                                                       |
| `src/features/transactions/EditTransactionDialog.tsx`      | New            | Status guard, dispatch by `transferType`, banner, field-error routing, partial-failure reseed.                                                                                         |
| `src/features/transactions/EditTransactionDialog.test.tsx` | New            | Behaviour tests for the dialog.                                                                                                                                                        |
| `src/components/ui/context-menu.tsx`                       | New            | Vendored shadcn primitive.                                                                                                                                                             |
| `src/features/transactions/TransactionsPane.tsx`           | Modified       | Wrap rows in `ContextMenu`; double-click + Enter/Space handlers; render `<EditTransactionDialog />`.                                                                                   |
| `src/features/transactions/TransactionsPane.test.tsx`      | Modified       | Extend with row-activation cases.                                                                                                                                                      |
| `src/test/handlers.ts`                                     | Modified       | MSW handlers for the five edit endpoints.                                                                                                                                              |
| `e2e/edit-transaction.spec.ts`                             | New            | One happy-path Playwright spec.                                                                                                                                                        |

---

## Task 1 — Verify branch and baseline

**Files:** none.

- [ ] **Step 1: Confirm we're on the feature branch and tests are green before any change**

Run:

```bash
git rev-parse --abbrev-ref HEAD
```

Expected: `feat/edit-transaction`

Run:

```bash
just check && just test
```

Expected: passes (typecheck + lint + format-check + vitest).

If anything is red, stop and surface the failure — the spec/plan commits should not have broken the baseline.

---

## Task 2 — Add `patch<T>` to `ApiClient`

**Files:**

- Modify: `src/api/client.ts:23-40`
- Test: `src/api/client.test.ts` (create if absent; otherwise extend).

- [ ] **Step 1: Write the failing test**

If `src/api/client.test.ts` does not exist, create it; otherwise add the case below alongside existing tests.

```ts
// src/api/client.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from './client';

describe('ApiClient.patch', () => {
  const originalFetch = global.fetch;
  beforeEach(() => {
    global.fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      return new Response(JSON.stringify({ ok: true, method: init?.method, body: init?.body }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }) as unknown as typeof fetch;
  });
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('sends a PATCH with JSON body', async () => {
    const client = new ApiClient({
      baseUrl: 'http://test',
      getToken: () => null,
      onUnauthorized: () => undefined,
    });
    const res = await client.patch<{ ok: boolean; method: string; body: string }>('/x', { a: 1 });
    expect(res.ok).toBe(true);
    expect(res.method).toBe('PATCH');
    expect(res.body).toBe('{"a":1}');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/api/client.test.ts -t "PATCH"`
Expected: FAIL — `client.patch is not a function` (or the type-checker rejects the call).

- [ ] **Step 3: Implement `patch<T>`**

In `src/api/client.ts`, immediately after the existing `put<T>` method (around line 34):

```ts
patch<T>(path: string, body?: unknown): Promise<T> {
  return this.request<T>(path, { method: 'PATCH', body: jsonBody(body) });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/api/client.test.ts -t "PATCH"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts src/api/client.test.ts
git commit -m "feat(api): add patch method to ApiClient"
```

---

## Task 3 — Add edit-transaction DTOs

**Files:**

- Modify: `src/api/types.ts` (append after the existing transaction request DTOs).

This task has no runtime behaviour — types are exercised by Task 4's compile-time use.

- [ ] **Step 1: Add the new interfaces**

Append to `src/api/types.ts` (group near the existing `IncomeRequest` / `ExpenseRequest` / `InternalTransferRequest` block; place above the `// --- Transactions ---` response section). Use `ISO8601` and `UUID` from the existing aliases in the same file.

```ts
// Edit transaction — per-field DTOs.
// Mirrors backend Web/Types.hs:408-484.

export interface Allocation {
  category: UUID;
  amount: number;
  currency: string;
}

export interface SetTransactionLabelsRequest {
  labels: UUID[];
}

export interface SetTransactionAllocationsRequest {
  newAllocations: Allocation[];
}

export interface ChangeTransactionDescriptionRequest {
  description: string;
}

export interface ChangeTransactionDateRequest {
  at: ISO8601;
}

export interface AmendTransactionRequest {
  sourceAccountId: UUID;
  targetAccountId: UUID;
  sourceAmount: number;
  sourceCurrency: string;
  targetAmount: number;
  targetCurrency: string;
  exchangeRate?: number;
  // Optional on the wire; this slice always omits it and uses the dedicated
  // PATCH /allocations endpoint for allocation changes.
  newAllocations?: Allocation[];
}
```

- [ ] **Step 2: Verify the typecheck still passes**

Run: `just typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/api/types.ts
git commit -m "feat(api): add edit-transaction DTOs"
```

---

## Task 4 — Add edit endpoints to `transactionsApi`

**Files:**

- Modify: `src/api/transactions.ts`
- Test: `src/api/transactions.test.ts` (create if absent; otherwise extend).

- [ ] **Step 1: Write the failing test**

```ts
// src/api/transactions.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApiClient } from './client';
import { transactionsApi } from './transactions';

const mkClient = () =>
  new ApiClient({
    baseUrl: 'http://test',
    getToken: () => null,
    onUnauthorized: () => undefined,
  });

const respond = (overrides: Record<string, unknown> = {}) =>
  vi.fn(
    async (_url: string, _init?: RequestInit) =>
      new Response(
        JSON.stringify({
          id: 'tx-1',
          sourceAccountId: 's',
          targetAccountId: 't',
          sourceAmount: 0,
          sourceCurrency: 'USD',
          targetAmount: 0,
          targetCurrency: 'USD',
          exchangeRate: null,
          description: '',
          status: 'Completed',
          failureReason: null,
          transferType: 'Income',
          category: null,
          date: '2026-01-01T00:00:00.000Z',
          labels: [],
          ...overrides,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
  ) as unknown as typeof fetch;

describe('transactionsApi edit endpoints', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('PUTs description', async () => {
    const spy = respond();
    global.fetch = spy;
    await transactionsApi(mkClient()).setDescription('tx-1', { description: 'new' });
    expect(spy).toHaveBeenCalledWith(
      'http://test/api/transactions/tx-1/description',
      expect.objectContaining({ method: 'PUT', body: '{"description":"new"}' }),
    );
  });

  it('PUTs date', async () => {
    const spy = respond();
    global.fetch = spy;
    await transactionsApi(mkClient()).setDate('tx-1', { at: '2026-02-02T00:00:00.000Z' });
    expect(spy).toHaveBeenCalledWith(
      'http://test/api/transactions/tx-1/date',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('PUTs labels', async () => {
    const spy = respond();
    global.fetch = spy;
    await transactionsApi(mkClient()).setLabels('tx-1', { labels: [] });
    expect(spy).toHaveBeenCalledWith(
      'http://test/api/transactions/tx-1/labels',
      expect.objectContaining({ method: 'PUT', body: '{"labels":[]}' }),
    );
  });

  it('PATCHes allocations', async () => {
    const spy = respond();
    global.fetch = spy;
    await transactionsApi(mkClient()).setAllocations('tx-1', { newAllocations: [] });
    expect(spy).toHaveBeenCalledWith(
      'http://test/api/transactions/tx-1/allocations',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('PUTs amendment', async () => {
    const spy = respond();
    global.fetch = spy;
    await transactionsApi(mkClient()).amend('tx-1', {
      sourceAccountId: 's',
      targetAccountId: 't',
      sourceAmount: 10,
      sourceCurrency: 'USD',
      targetAmount: 10,
      targetCurrency: 'USD',
    });
    expect(spy).toHaveBeenCalledWith(
      'http://test/api/transactions/tx-1/amendment',
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/api/transactions.test.ts`
Expected: FAIL — methods do not exist on `transactionsApi`.

- [ ] **Step 3: Add the five methods**

In `src/api/transactions.ts`, extend the existing object literal returned by `transactionsApi`. Add imports for the new request DTOs at the top of the file, then the methods at the end of the object:

```ts
import type {
  AmendTransactionRequest,
  ChangeTransactionDateRequest,
  ChangeTransactionDescriptionRequest,
  ExpenseRequest,
  IncomeRequest,
  InternalTransferRequest,
  SetTransactionAllocationsRequest,
  SetTransactionLabelsRequest,
  TransactionListResponse,
  TransactionResponse,
  UUID,
} from './types';
```

```ts
  setDescription: (id: UUID, body: ChangeTransactionDescriptionRequest) =>
    client.put<TransactionResponse>(`/api/transactions/${id}/description`, body),
  setDate: (id: UUID, body: ChangeTransactionDateRequest) =>
    client.put<TransactionResponse>(`/api/transactions/${id}/date`, body),
  setLabels: (id: UUID, body: SetTransactionLabelsRequest) =>
    client.put<TransactionResponse>(`/api/transactions/${id}/labels`, body),
  setAllocations: (id: UUID, body: SetTransactionAllocationsRequest) =>
    client.patch<TransactionResponse>(`/api/transactions/${id}/allocations`, body),
  amend: (id: UUID, body: AmendTransactionRequest) =>
    client.put<TransactionResponse>(`/api/transactions/${id}/amendment`, body),
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm exec vitest run src/api/transactions.test.ts`
Expected: PASS — all five cases.

- [ ] **Step 5: Commit**

```bash
git add src/api/transactions.ts src/api/transactions.test.ts
git commit -m "feat(api): add per-field edit endpoints to transactionsApi"
```

---

## Task 5 — Form-value mappers (`toIncomeExpenseFormValues`, `toTransferFormValues`)

**Files:**

- Modify: `src/features/transactions/schema.ts` (append at the bottom).
- Test: `src/features/transactions/schema.test.ts` (extend).

- [ ] **Step 1: Write the failing tests**

Append to `src/features/transactions/schema.test.ts` (use existing import block; add what is missing):

```ts
import { toIncomeExpenseFormValues, toTransferFormValues } from './schema';
import type { AccountResponse, TransactionResponse } from '@/api/types';

const acc = (id: string, currency = 'USD'): AccountResponse =>
  ({
    id,
    name: id,
    currency,
    balance: 0,
    overdraftLimit: null,
    subtype: { type: 'cash' },
    version: 1,
  }) as AccountResponse;

const baseTx = (overrides: Partial<TransactionResponse>): TransactionResponse =>
  ({
    id: 'tx-1',
    sourceAccountId: 'ext',
    targetAccountId: 'a1',
    sourceAmount: 10,
    sourceCurrency: 'USD',
    targetAmount: 10,
    targetCurrency: 'USD',
    exchangeRate: null,
    description: 'd',
    status: 'Completed',
    failureReason: null,
    transferType: 'Income',
    category: 'cat-1',
    date: '2026-03-04T15:00:00.000Z',
    labels: ['l1'],
    ...overrides,
  }) as TransactionResponse;

describe('toIncomeExpenseFormValues', () => {
  it('income → regular leg is the target', () => {
    const v = toIncomeExpenseFormValues(baseTx({ transferType: 'Income' }), [acc('a1')]);
    expect(v).toEqual({
      accountId: 'a1',
      amount: 10,
      currency: 'USD',
      category: 'cat-1',
      description: 'd',
      date: '2026-03-04',
      labels: ['l1'],
    });
  });

  it('expense → regular leg is the source', () => {
    const tx = baseTx({
      transferType: 'Expense',
      sourceAccountId: 'a1',
      targetAccountId: 'ext',
    });
    const v = toIncomeExpenseFormValues(tx, [acc('a1')]);
    expect(v.accountId).toBe('a1');
  });

  it('defensive: missing category collapses to empty string', () => {
    const v = toIncomeExpenseFormValues(baseTx({ category: null }), [acc('a1')]);
    expect(v.category).toBe('');
  });
});

describe('toTransferFormValues', () => {
  it('seeds source/target ids and currency from the source account', () => {
    const tx = baseTx({
      transferType: 'Transfer',
      sourceAccountId: 'a1',
      targetAccountId: 'a2',
      sourceAmount: 50,
      sourceCurrency: 'USD',
      targetAmount: 45,
      targetCurrency: 'EUR',
      exchangeRate: 0.9,
      category: null,
    });
    const v = toTransferFormValues(tx, [acc('a1', 'USD'), acc('a2', 'EUR')]);
    expect(v).toEqual({
      sourceAccountId: 'a1',
      targetAccountId: 'a2',
      amount: 50,
      currency: 'USD',
      description: 'd',
      exchangeRate: 0.9,
      date: '2026-03-04',
      labels: ['l1'],
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/features/transactions/schema.test.ts -t "FormValues"`
Expected: FAIL — exports are not defined.

- [ ] **Step 3: Implement the mappers**

Append to `src/features/transactions/schema.ts`:

```ts
import type { AccountResponse, TransactionResponse } from '@/api/types';

const dateToYyyyMmDd = (iso: string) => iso.slice(0, 10);

export function toIncomeExpenseFormValues(
  tx: TransactionResponse,
  accounts: AccountResponse[],
): IncomeExpenseFormValues {
  const isIncome = tx.transferType === 'Income';
  const accountId = isIncome ? tx.targetAccountId : tx.sourceAccountId;
  const amount = isIncome ? tx.targetAmount : tx.sourceAmount;
  const currency =
    accounts.find((a) => a.id === accountId)?.currency ??
    (isIncome ? tx.targetCurrency : tx.sourceCurrency);
  return {
    accountId,
    amount,
    currency,
    category: tx.category ?? '',
    description: tx.description,
    date: dateToYyyyMmDd(tx.date),
    labels: tx.labels,
  };
}

export function toTransferFormValues(
  tx: TransactionResponse,
  accounts: AccountResponse[],
): TransferFormValues {
  return {
    sourceAccountId: tx.sourceAccountId,
    targetAccountId: tx.targetAccountId,
    amount: tx.sourceAmount,
    currency: accounts.find((a) => a.id === tx.sourceAccountId)?.currency ?? tx.sourceCurrency,
    description: tx.description,
    exchangeRate: tx.exchangeRate ?? undefined,
    date: dateToYyyyMmDd(tx.date),
    labels: tx.labels,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/features/transactions/schema.test.ts -t "FormValues"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/schema.ts src/features/transactions/schema.test.ts
git commit -m "feat(transactions): add form-value mappers for edit mode"
```

---

## Task 6 — `diffTransaction` pure module

**Files:**

- Create: `src/features/transactions/diffTransaction.ts`
- Test: `src/features/transactions/diffTransaction.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/transactions/diffTransaction.test.ts
import { describe, it, expect } from 'vitest';
import { diffIncomeExpense, diffTransfer } from './diffTransaction';
import type { TransactionResponse } from '@/api/types';
import type { IncomeExpenseFormValues, TransferFormValues } from './schema';

const baseTx: TransactionResponse = {
  id: 'tx-1',
  sourceAccountId: 'ext',
  targetAccountId: 'a1',
  sourceAmount: 10,
  sourceCurrency: 'USD',
  targetAmount: 10,
  targetCurrency: 'USD',
  exchangeRate: null,
  description: 'old',
  status: 'Completed',
  failureReason: null,
  transferType: 'Income',
  category: 'cat-1',
  date: '2026-03-04T00:00:00.000Z',
  labels: ['l1'],
};

const ieInitial: IncomeExpenseFormValues = {
  accountId: 'a1',
  amount: 10,
  currency: 'USD',
  category: 'cat-1',
  description: 'old',
  date: '2026-03-04',
  labels: ['l1'],
};

describe('diffIncomeExpense', () => {
  it('returns empty diff when nothing changed', () => {
    expect(diffIncomeExpense(ieInitial, ieInitial, baseTx)).toEqual({});
  });

  it('description change only', () => {
    const d = diffIncomeExpense(ieInitial, { ...ieInitial, description: 'new' }, baseTx);
    expect(d).toEqual({ description: 'new' });
  });

  it('date change becomes a UTC start-of-day ISO string', () => {
    const d = diffIncomeExpense(ieInitial, { ...ieInitial, date: '2026-04-05' }, baseTx);
    expect(d).toEqual({ date: '2026-04-05T00:00:00.000Z' });
  });

  it('labels change (including clearing to [])', () => {
    expect(diffIncomeExpense(ieInitial, { ...ieInitial, labels: ['l2'] }, baseTx)).toEqual({
      labels: ['l2'],
    });
    expect(diffIncomeExpense(ieInitial, { ...ieInitial, labels: [] }, baseTx)).toEqual({
      labels: [],
    });
  });

  it('amount change emits amendment + allocations (income → target leg)', () => {
    const d = diffIncomeExpense(ieInitial, { ...ieInitial, amount: 25 }, baseTx);
    expect(d.amendment).toEqual({
      sourceAccountId: 'ext',
      targetAccountId: 'a1',
      sourceAmount: 25,
      sourceCurrency: 'USD',
      targetAmount: 25,
      targetCurrency: 'USD',
    });
    expect(d.allocations).toEqual([{ category: 'cat-1', amount: 25, currency: 'USD' }]);
    expect(d.description).toBeUndefined();
  });

  it('account change (same currency) emits amendment + allocations with the new regular leg', () => {
    const d = diffIncomeExpense(ieInitial, { ...ieInitial, accountId: 'a2' }, baseTx);
    expect(d.amendment).toMatchObject({
      sourceAccountId: 'ext',
      targetAccountId: 'a2',
      sourceAmount: 10,
      targetAmount: 10,
    });
    expect(d.allocations).toEqual([{ category: 'cat-1', amount: 10, currency: 'USD' }]);
  });

  it('expense account change touches the source leg, not target', () => {
    const expenseTx: TransactionResponse = {
      ...baseTx,
      transferType: 'Expense',
      sourceAccountId: 'a1',
      targetAccountId: 'ext',
    };
    const initial = { ...ieInitial, accountId: 'a1' };
    const d = diffIncomeExpense(initial, { ...initial, accountId: 'a2' }, expenseTx);
    expect(d.amendment).toMatchObject({
      sourceAccountId: 'a2',
      targetAccountId: 'ext',
    });
  });

  it('category change alone emits allocations only', () => {
    const d = diffIncomeExpense(ieInitial, { ...ieInitial, category: 'cat-2' }, baseTx);
    expect(d.allocations).toEqual([{ category: 'cat-2', amount: 10, currency: 'USD' }]);
    expect(d.amendment).toBeUndefined();
  });

  it('amount + category change emits both, with the new pair', () => {
    const d = diffIncomeExpense(ieInitial, { ...ieInitial, amount: 30, category: 'cat-2' }, baseTx);
    expect(d.amendment).toMatchObject({ sourceAmount: 30, targetAmount: 30 });
    expect(d.allocations).toEqual([{ category: 'cat-2', amount: 30, currency: 'USD' }]);
  });
});

const transferTx: TransactionResponse = {
  ...baseTx,
  transferType: 'Transfer',
  sourceAccountId: 'a1',
  targetAccountId: 'a2',
  sourceAmount: 50,
  sourceCurrency: 'USD',
  targetAmount: 50,
  targetCurrency: 'USD',
  exchangeRate: null,
  category: null,
};

const trInitial: TransferFormValues = {
  sourceAccountId: 'a1',
  targetAccountId: 'a2',
  amount: 50,
  currency: 'USD',
  description: 'old',
  exchangeRate: undefined,
  date: '2026-03-04',
  labels: ['l1'],
};

describe('diffTransfer', () => {
  it('clean diff is empty', () => {
    expect(diffTransfer(trInitial, trInitial, transferTx)).toEqual({});
  });

  it('same-currency amount change → amendment only (no allocations on transfer)', () => {
    const d = diffTransfer(trInitial, { ...trInitial, amount: 75 }, transferTx);
    expect(d.amendment).toMatchObject({
      sourceAccountId: 'a1',
      targetAccountId: 'a2',
      sourceAmount: 75,
      targetAmount: 75,
      sourceCurrency: 'USD',
      targetCurrency: 'USD',
    });
    expect(d.amendment?.exchangeRate).toBeUndefined();
    expect(d.allocations).toBeUndefined();
  });

  it('cross-currency: amount + exchangeRate change emits both currencies and rate', () => {
    const crossTx: TransactionResponse = {
      ...transferTx,
      sourceCurrency: 'USD',
      targetCurrency: 'EUR',
      targetAmount: 45,
      exchangeRate: 0.9,
    };
    const initial: TransferFormValues = { ...trInitial, currency: 'USD', exchangeRate: 0.9 };
    const d = diffTransfer(initial, { ...initial, amount: 100, exchangeRate: 0.8 }, crossTx);
    expect(d.amendment).toMatchObject({
      sourceAmount: 100,
      sourceCurrency: 'USD',
      targetAmount: 80,
      targetCurrency: 'EUR',
      exchangeRate: 0.8,
    });
  });

  it('swapping source/target accounts emits amendment with the new ids', () => {
    const d = diffTransfer(
      trInitial,
      { ...trInitial, sourceAccountId: 'a3', targetAccountId: 'a4' },
      transferTx,
    );
    expect(d.amendment).toMatchObject({
      sourceAccountId: 'a3',
      targetAccountId: 'a4',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/features/transactions/diffTransaction.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `diffTransaction.ts`**

```ts
// src/features/transactions/diffTransaction.ts
import type {
  Allocation,
  AmendTransactionRequest,
  ISO8601,
  TransactionResponse,
  UUID,
} from '@/api/types';
import type { IncomeExpenseFormValues, TransferFormValues } from './schema';

export interface TransactionEditDiff {
  description?: string;
  date?: ISO8601;
  labels?: UUID[];
  amendment?: AmendTransactionRequest;
  allocations?: Allocation[];
}

const isoDayUtc = (yyyyMmDd: string): ISO8601 => `${yyyyMmDd}T00:00:00.000Z`;
const sameLabels = (a: readonly UUID[], b: readonly UUID[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

export function diffIncomeExpense(
  initial: IncomeExpenseFormValues,
  next: IncomeExpenseFormValues,
  tx: TransactionResponse,
): TransactionEditDiff {
  const diff: TransactionEditDiff = {};
  if (next.description !== initial.description) diff.description = next.description;
  if (next.date !== initial.date && next.date) diff.date = isoDayUtc(next.date);
  if (!sameLabels(initial.labels, next.labels)) diff.labels = [...next.labels];

  const isIncome = tx.transferType === 'Income';
  const externalLeg = isIncome ? tx.sourceAccountId : tx.targetAccountId;
  const externalCurrency = isIncome ? tx.sourceCurrency : tx.targetCurrency;
  const accountChanged = next.accountId !== initial.accountId;
  const amountChanged = next.amount !== initial.amount;
  const categoryChanged = next.category !== initial.category;

  if (accountChanged || amountChanged) {
    diff.amendment = {
      sourceAccountId: isIncome ? externalLeg : next.accountId,
      targetAccountId: isIncome ? next.accountId : externalLeg,
      sourceAmount: next.amount,
      sourceCurrency: isIncome ? externalCurrency : next.currency,
      targetAmount: next.amount,
      targetCurrency: isIncome ? next.currency : externalCurrency,
    };
    diff.allocations = [{ category: next.category, amount: next.amount, currency: next.currency }];
  } else if (categoryChanged) {
    diff.allocations = [{ category: next.category, amount: next.amount, currency: next.currency }];
  }

  return diff;
}

export function diffTransfer(
  initial: TransferFormValues,
  next: TransferFormValues,
  tx: TransactionResponse,
): TransactionEditDiff {
  const diff: TransactionEditDiff = {};
  if (next.description !== initial.description) diff.description = next.description;
  if (next.date !== initial.date && next.date) diff.date = isoDayUtc(next.date);
  if (!sameLabels(initial.labels, next.labels)) diff.labels = [...next.labels];

  const sourceChanged = next.sourceAccountId !== initial.sourceAccountId;
  const targetChanged = next.targetAccountId !== initial.targetAccountId;
  const amountChanged = next.amount !== initial.amount;
  const rateChanged = (next.exchangeRate ?? null) !== (initial.exchangeRate ?? null);

  if (sourceChanged || targetChanged || amountChanged || rateChanged) {
    const crossCurrency = tx.sourceCurrency !== tx.targetCurrency;
    const sourceAmount = next.amount;
    const targetAmount = crossCurrency ? next.amount * (next.exchangeRate ?? 1) : next.amount;
    diff.amendment = {
      sourceAccountId: next.sourceAccountId,
      targetAccountId: next.targetAccountId,
      sourceAmount,
      sourceCurrency: tx.sourceCurrency,
      targetAmount,
      targetCurrency: tx.targetCurrency,
      ...(crossCurrency && next.exchangeRate !== undefined
        ? { exchangeRate: next.exchangeRate }
        : {}),
    };
  }

  return diff;
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm exec vitest run src/features/transactions/diffTransaction.test.ts`
Expected: PASS — all cases.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/diffTransaction.ts src/features/transactions/diffTransaction.test.ts
git commit -m "feat(transactions): add diffTransaction for edit-mode orchestration"
```

---

## Task 7 — Mode-aware label additions

**Files:**

- Modify: `src/features/transactions/labels.ts`

- [ ] **Step 1: Add `editTitle` and `editSubmit` per kind**

Replace the existing object literal so each kind carries both create- and edit-mode strings:

```ts
export const TRANSACTION_KIND_LABELS = {
  income: {
    title: 'Add income',
    submit: 'Add income',
    aria: 'Add income',
    editTitle: 'Edit income',
    editSubmit: 'Save',
  },
  expense: {
    title: 'Add expense',
    submit: 'Add expense',
    aria: 'Add expense',
    editTitle: 'Edit expense',
    editSubmit: 'Save',
  },
  transfer: {
    title: 'Add transfer',
    submit: 'Add transfer',
    aria: 'Add transfer',
    editTitle: 'Edit transfer',
    editSubmit: 'Save',
  },
} as const;

export type TransactionKind = keyof typeof TRANSACTION_KIND_LABELS;
```

- [ ] **Step 2: Verify typecheck**

Run: `just typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/features/transactions/labels.ts
git commit -m "feat(transactions): add edit-mode title/submit labels"
```

---

## Task 8 — `IncomeExpenseForm` edit-mode adjustments

**Files:**

- Modify: `src/features/transactions/IncomeExpenseForm.tsx`
- Modify: `src/features/transactions/IncomeExpenseForm.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append three cases inside the existing `describe('IncomeExpenseForm', …)` block (use the existing render helper / fixtures already present in the test file). If the file has no render helper, follow the create-mode pattern — `renderWithProviders(...)` from `src/test/utils.tsx`.

```ts
it('edit mode: hides the "Defaults to today" helper text', () => {
  renderForm({ mode: 'edit', defaultValues: editDefaults });
  expect(screen.queryByText(/Defaults to today/i)).toBeNull();
});

it('edit mode: submit button label is "Save"', () => {
  renderForm({ mode: 'edit', defaultValues: editDefaults });
  expect(screen.getByRole('button', { name: /^Save$/ })).toBeInTheDocument();
});

it('edit mode: Save is disabled when the form is clean', () => {
  renderForm({ mode: 'edit', defaultValues: editDefaults });
  expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled();
});
```

If the file lacks `editDefaults` / `renderForm`, add them at the top of the file:

```ts
const editDefaults = {
  accountId: 'a1',
  amount: 10,
  currency: 'USD',
  category: 'cat-1',
  description: 'old',
  date: '2026-03-04',
  labels: [] as string[],
};

function renderForm(overrides: Partial<React.ComponentProps<typeof IncomeExpenseForm>> = {}) {
  return renderWithProviders(
    <IncomeExpenseForm
      kind="income"
      mode="create"
      accounts={[{ id: 'a1', name: 'A', currency: 'USD', balance: 0, overdraftLimit: null, subtype: { type: 'cash' }, version: 1 } as never]}
      categories={[{ id: 'cat-1', name: 'Cat 1' }]}
      labels={[]}
      defaultValues={editDefaults}
      isSubmitting={false}
      onSubmit={vi.fn()}
      onCancel={vi.fn()}
      {...overrides}
    />,
  );
}
```

(Adjust imports — `renderWithProviders`, `vi`, `screen` — to match the existing imports in the file.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/features/transactions/IncomeExpenseForm.test.tsx -t "edit mode"`
Expected: FAIL — helper text still present, button label is "Add income", Save is enabled.

- [ ] **Step 3: Adjust `IncomeExpenseForm.tsx`**

In `src/features/transactions/IncomeExpenseForm.tsx`:

1. After the `useForm` call, derive `isDirty` and `isEdit`:

   ```ts
   const isEdit = mode === 'edit';
   const isDirty = form.formState.isDirty;
   ```

2. Replace the existing helper paragraph under the date field (currently `<p className="text-xs text-muted-foreground">Defaults to today on the server.</p>`) with a conditional:

   ```tsx
   {
     !isEdit && <p className="text-xs text-muted-foreground">Defaults to today on the server.</p>;
   }
   ```

3. Replace the submit button (currently `{isSubmitting ? 'Saving…' : TRANSACTION_KIND_LABELS[kind].submit}`) with:

   ```tsx
   <Button type="submit" disabled={isSubmitting || (isEdit && !isDirty)}>
     {isSubmitting
       ? 'Saving…'
       : isEdit
         ? TRANSACTION_KIND_LABELS[kind].editSubmit
         : TRANSACTION_KIND_LABELS[kind].submit}
   </Button>
   ```

4. Remove the trailing `<input type="hidden" value={mode} … />` workaround — the prop is now meaningfully consumed and no longer needs the unused-prop guard.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm exec vitest run src/features/transactions/IncomeExpenseForm.test.tsx`
Expected: PASS — both existing create-mode cases and the three new edit-mode cases.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/IncomeExpenseForm.tsx src/features/transactions/IncomeExpenseForm.test.tsx
git commit -m "feat(transactions): edit-mode label, helper, and dirty-gating on IncomeExpenseForm"
```

---

## Task 9 — `TransferForm` edit-mode adjustments

**Files:**

- Modify: `src/features/transactions/TransferForm.tsx`
- Modify: `src/features/transactions/TransferForm.test.tsx`

- [ ] **Step 1: Write the failing tests**

Mirror Task 8's three cases inside the existing `describe('TransferForm', …)` block. Use a `renderForm` helper consistent with the file's existing style; defaults:

```ts
const editDefaults = {
  sourceAccountId: 'a1',
  targetAccountId: 'a2',
  amount: 50,
  currency: 'USD',
  description: 'd',
  exchangeRate: undefined as number | undefined,
  date: '2026-03-04',
  labels: [] as string[],
};
```

Cases (same intent as Task 8): helper text hidden in edit mode; submit label "Save"; Save disabled when clean.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/features/transactions/TransferForm.test.tsx -t "edit mode"`
Expected: FAIL.

- [ ] **Step 3: Adjust `TransferForm.tsx`**

In `src/features/transactions/TransferForm.tsx`:

1. Add `isEdit` / `isDirty` derivations after `useForm`.
2. Wrap the date-helper paragraph with `!isEdit`.
3. Update the submit button with the same edit-mode label and disabled-when-clean logic as Task 8.
4. Remove the trailing `<input type="hidden" value={mode} … />`.

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm exec vitest run src/features/transactions/TransferForm.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/TransferForm.tsx src/features/transactions/TransferForm.test.tsx
git commit -m "feat(transactions): edit-mode label, helper, and dirty-gating on TransferForm"
```

---

## Task 10 — `useEditTransaction` orchestration hook

**Files:**

- Create: `src/features/transactions/useEditTransaction.ts`
- Create: `src/features/transactions/useEditTransaction.test.tsx`

The hook mirrors `useEditAccount.ts:1-58` — sequential sub-calls, per-sub-call cache patching, `onSubCallApplied` epoch bump on each applied call.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/transactions/useEditTransaction.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { server } from '@/test/server';
import { http, HttpResponse } from 'msw';
import { AuthContext } from '@/auth/AuthContext';
import { useEditTransaction } from './useEditTransaction';
import type { TransactionResponse } from '@/api/types';

const apiBase = 'http://localhost:8080';

function wrapper(client = new QueryClient()): (p: { children: ReactNode }) => JSX.Element {
  // Minimal auth context: tokenRef holds a token, session is truthy.
  const tokenRef = { current: 't' };
  const ctx = {
    tokenRef,
    session: { userId: 'u', email: 'a@b' } as never,
    signIn: vi.fn(),
    signOut: vi.fn(),
  } as never;
  return ({ children }) => (
    <QueryClientProvider client={client}>
      <AuthContext.Provider value={ctx}>{children}</AuthContext.Provider>
    </QueryClientProvider>
  );
}

const txResponse = (overrides: Partial<TransactionResponse> = {}): TransactionResponse =>
  ({
    id: 'tx-1',
    sourceAccountId: 'ext',
    targetAccountId: 'a1',
    sourceAmount: 10,
    sourceCurrency: 'USD',
    targetAmount: 10,
    targetCurrency: 'USD',
    exchangeRate: null,
    description: 'd',
    status: 'Completed',
    failureReason: null,
    transferType: 'Income',
    category: 'cat-1',
    date: '2026-03-04T00:00:00.000Z',
    labels: [],
    ...overrides,
  }) as TransactionResponse;

describe('useEditTransaction', () => {
  it('runs amendment → allocations → description → date → labels in order and invokes the per-step callback', async () => {
    const calls: string[] = [];
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, () => {
        calls.push('amendment');
        return HttpResponse.json(txResponse());
      }),
      http.patch(`${apiBase}/api/transactions/:id/allocations`, () => {
        calls.push('allocations');
        return HttpResponse.json(txResponse());
      }),
      http.put(`${apiBase}/api/transactions/:id/description`, () => {
        calls.push('description');
        return HttpResponse.json(txResponse({ description: 'new' }));
      }),
      http.put(`${apiBase}/api/transactions/:id/date`, () => {
        calls.push('date');
        return HttpResponse.json(txResponse());
      }),
      http.put(`${apiBase}/api/transactions/:id/labels`, () => {
        calls.push('labels');
        return HttpResponse.json(txResponse({ labels: ['l1'] }));
      }),
    );

    const client = new QueryClient();
    client.setQueryData(['transactions', 'a1'], [txResponse()] as TransactionResponse[]);

    const onSubCallApplied = vi.fn();
    const { result } = renderHook(() => useEditTransaction(), { wrapper: wrapper(client) });
    await result.current.mutateAsync({
      id: 'tx-1',
      accountIds: ['a1'],
      diff: {
        amendment: {
          sourceAccountId: 'ext',
          targetAccountId: 'a1',
          sourceAmount: 25,
          sourceCurrency: 'USD',
          targetAmount: 25,
          targetCurrency: 'USD',
        },
        allocations: [{ category: 'cat-1', amount: 25, currency: 'USD' }],
        description: 'new',
        date: '2026-04-05T00:00:00.000Z',
        labels: ['l1'],
      },
      onSubCallApplied,
    });

    expect(calls).toEqual(['amendment', 'allocations', 'description', 'date', 'labels']);
    expect(onSubCallApplied).toHaveBeenCalledTimes(5);
  });

  it('stops on the first failure and surfaces the ApiError', async () => {
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, () =>
        HttpResponse.json(
          { status: 422, message: 'nope', fieldErrors: { sourceAmount: 'too small' } },
          { status: 422 },
        ),
      ),
    );

    const client = new QueryClient();
    client.setQueryData(['transactions', 'a1'], [txResponse()] as TransactionResponse[]);

    const { result } = renderHook(() => useEditTransaction(), { wrapper: wrapper(client) });
    await expect(
      result.current.mutateAsync({
        id: 'tx-1',
        accountIds: ['a1'],
        diff: {
          amendment: {
            sourceAccountId: 'ext',
            targetAccountId: 'a1',
            sourceAmount: 1,
            sourceCurrency: 'USD',
            targetAmount: 1,
            targetCurrency: 'USD',
          },
          description: 'never sent',
        },
        onSubCallApplied: vi.fn(),
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('patches the cached row after each successful sub-call', async () => {
    server.use(
      http.put(`${apiBase}/api/transactions/:id/description`, () =>
        HttpResponse.json(txResponse({ description: 'patched' })),
      ),
    );

    const client = new QueryClient();
    client.setQueryData(['transactions', 'a1'], [txResponse()] as TransactionResponse[]);

    const { result } = renderHook(() => useEditTransaction(), { wrapper: wrapper(client) });
    await result.current.mutateAsync({
      id: 'tx-1',
      accountIds: ['a1'],
      diff: { description: 'patched' },
      onSubCallApplied: vi.fn(),
    });

    await waitFor(() => {
      const list = client.getQueryData<TransactionResponse[]>(['transactions', 'a1']);
      expect(list?.[0]?.description).toBe('patched');
    });
  });
});
```

> If `src/test/server.ts` does not exist, the project's MSW server lives in `src/test/setup.ts`. Verify the export path before running — adjust the import to whatever the existing tests use.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/useEditTransaction.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

```ts
// src/features/transactions/useEditTransaction.ts
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiClient } from '@/api/client';
import { transactionsApi } from '@/api/transactions';
import type { TransactionResponse, UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';
import type { TransactionEditDiff } from './diffTransaction';

const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

export interface EditTransactionVars {
  id: UUID;
  accountIds: UUID[]; // one (income/expense) or two (transfer) cache keys to invalidate
  diff: TransactionEditDiff;
  onSubCallApplied: () => void;
}

export function useEditTransaction() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<TransactionResponse | null, Error, EditTransactionVars>({
    mutationFn: async ({ id, accountIds, diff, onSubCallApplied }) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      const api = transactionsApi(client);
      let last: TransactionResponse | null = null;

      const apply = (resp: TransactionResponse) => {
        last = resp;
        for (const acc of accountIds) {
          patchCachedTx(queryClient, acc, resp);
        }
        onSubCallApplied();
      };

      if (diff.amendment) apply(await api.amend(id, diff.amendment));
      if (diff.allocations)
        apply(await api.setAllocations(id, { newAllocations: diff.allocations }));
      if (diff.description !== undefined)
        apply(await api.setDescription(id, { description: diff.description }));
      if (diff.date) apply(await api.setDate(id, { at: diff.date }));
      // labels presence — not truthiness — gates the request; empty array is
      // the user's explicit "clear labels" and must be sent.
      if (diff.labels !== undefined) apply(await api.setLabels(id, { labels: diff.labels }));

      return last;
    },
    onSettled: (_data, _err, { accountIds }) => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      for (const acc of accountIds) {
        void queryClient.invalidateQueries({ queryKey: ['transactions', acc] });
      }
    },
  });
}

function patchCachedTx(queryClient: QueryClient, accountId: UUID, next: TransactionResponse) {
  queryClient.setQueryData<TransactionResponse[] | undefined>(['transactions', accountId], (list) =>
    list?.map((t) => (t.id === next.id ? next : t)),
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm exec vitest run src/features/transactions/useEditTransaction.test.tsx`
Expected: PASS — three cases.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/useEditTransaction.ts src/features/transactions/useEditTransaction.test.tsx
git commit -m "feat(transactions): add useEditTransaction orchestration hook"
```

---

## Task 11 — Default MSW handlers for the five edit endpoints

**Files:**

- Modify: `src/test/handlers.ts`

The dialog test in Task 12 needs sensible defaults; per-test overrides via `server.use` still work.

- [ ] **Step 1: Append handlers**

In `src/test/handlers.ts`, near the existing `http.post(.../api/transactions/...)` block, add five handlers. Each one returns a full `TransactionResponse`-shaped JSON body — copy the literal already used by the `http.post('/api/transactions/income', …)` handler in the same file so the shape stays in lockstep. Use a single helper to avoid repetition:

```ts
const editedTransactionFixture = (overrides: Record<string, unknown> = {}) => ({
  id: 'tx-edit',
  sourceAccountId: 'ext',
  targetAccountId: 'a1',
  sourceAmount: 0,
  sourceCurrency: 'USD',
  targetAmount: 0,
  targetCurrency: 'USD',
  exchangeRate: null,
  description: 'edited',
  status: 'Completed',
  failureReason: null,
  transferType: 'Income',
  category: 'cat-1',
  date: '2026-03-04T00:00:00.000Z',
  labels: [],
  ...overrides,
});

// Add to the exported `handlers` array:
http.put(`${apiBase}/api/transactions/:id/description`, async ({ request }) => {
  const body = (await request.json()) as { description: string };
  return HttpResponse.json(editedTransactionFixture({ description: body.description }));
}),
http.put(`${apiBase}/api/transactions/:id/date`, async ({ request }) => {
  const body = (await request.json()) as { at: string };
  return HttpResponse.json(editedTransactionFixture({ date: body.at }));
}),
http.put(`${apiBase}/api/transactions/:id/labels`, async ({ request }) => {
  const body = (await request.json()) as { labels: string[] };
  return HttpResponse.json(editedTransactionFixture({ labels: body.labels }));
}),
http.patch(`${apiBase}/api/transactions/:id/allocations`, () =>
  HttpResponse.json(editedTransactionFixture()),
),
http.put(`${apiBase}/api/transactions/:id/amendment`, async ({ request }) => {
  const body = (await request.json()) as {
    sourceAmount: number;
    targetAmount: number;
    sourceCurrency: string;
    targetCurrency: string;
  };
  return HttpResponse.json(
    editedTransactionFixture({
      sourceAmount: body.sourceAmount,
      targetAmount: body.targetAmount,
      sourceCurrency: body.sourceCurrency,
      targetCurrency: body.targetCurrency,
    }),
  );
}),
```

> If the existing income/expense/transfer fixture literal in this file differs in any field name from the one above (e.g. `failureReason` vs. some other key), prefer the existing literal — it is the source of truth for this project's wire shape.

- [ ] **Step 2: Verify the existing test suite still runs (handlers don't introduce regressions)**

Run: `just test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/test/handlers.ts
git commit -m "test(msw): add default handlers for transaction edit endpoints"
```

---

## Task 12 — `EditTransactionDialog`

**Files:**

- Create: `src/features/transactions/EditTransactionDialog.tsx`
- Create: `src/features/transactions/EditTransactionDialog.test.tsx`

The dialog mirrors `EditAccountDialog` (`src/features/accounts/EditAccountDialog.tsx:1-141`): a wrapper that owns the `editEpoch`, an inner form component re-reading the freshest cache row via `editEpoch`, and a `handleSubmit` that diffs against `baselineRef.current`.

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/transactions/EditTransactionDialog.test.tsx
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { EditTransactionDialog } from './EditTransactionDialog';
import type { TransactionResponse } from '@/api/types';

const apiBase = 'http://localhost:8080';

const baseTx: TransactionResponse = {
  id: 'tx-1',
  sourceAccountId: 'ext',
  targetAccountId: 'a1',
  sourceAmount: 10,
  sourceCurrency: 'USD',
  targetAmount: 10,
  targetCurrency: 'USD',
  exchangeRate: null,
  description: 'old',
  status: 'Completed',
  failureReason: null,
  transferType: 'Income',
  category: 'cat-1',
  date: '2026-03-04T00:00:00.000Z',
  labels: [],
};

describe('EditTransactionDialog', () => {
  it('renders read-only with a status notice when the transaction is not Completed', async () => {
    renderWithProviders(
      <EditTransactionDialog open onOpenChange={vi.fn()} tx={{ ...baseTx, status: 'Failed' }} />,
    );
    expect(
      await screen.findByText(/This transaction is Failed and cannot be edited/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Save$/ })).toBeNull();
  });

  it('description-only edit fires exactly one PUT description', async () => {
    const calls: string[] = [];
    server.use(
      http.put(`${apiBase}/api/transactions/:id/description`, () => {
        calls.push('description');
        return HttpResponse.json({ ...baseTx, description: 'new' });
      }),
    );
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<EditTransactionDialog open onOpenChange={onOpenChange} tx={baseTx} />);
    const descInput = await screen.findByLabelText(/Description/i);
    await user.clear(descInput);
    await user.type(descInput, 'new');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    await screen.findByRole('button', { name: /^Save$/ }); // settle
    expect(calls).toEqual(['description']);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('amount edit fires amendment then allocations in order', async () => {
    const calls: string[] = [];
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, () => {
        calls.push('amendment');
        return HttpResponse.json({ ...baseTx, sourceAmount: 25, targetAmount: 25 });
      }),
      http.patch(`${apiBase}/api/transactions/:id/allocations`, () => {
        calls.push('allocations');
        return HttpResponse.json({ ...baseTx, sourceAmount: 25, targetAmount: 25 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<EditTransactionDialog open onOpenChange={vi.fn()} tx={baseTx} />);
    const amount = await screen.findByLabelText(/^Amount$/i);
    await user.clear(amount);
    await user.type(amount, '25');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    await screen.findByRole('button', { name: /^Save$/ });
    expect(calls).toEqual(['amendment', 'allocations']);
  });

  it('first-failure surfaces a banner and stops further requests', async () => {
    const calls: string[] = [];
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, () => {
        calls.push('amendment');
        return HttpResponse.json({ status: 422, message: 'amount too small' }, { status: 422 });
      }),
      http.patch(`${apiBase}/api/transactions/:id/allocations`, () => {
        calls.push('allocations');
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<EditTransactionDialog open onOpenChange={vi.fn()} tx={baseTx} />);
    const amount = await screen.findByLabelText(/^Amount$/i);
    await user.clear(amount);
    await user.type(amount, '25');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/amount too small/i);
    expect(calls).toEqual(['amendment']);
  });

  it('fieldErrors.targetAccountId on income amendment maps to the accountId field', async () => {
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, () =>
        HttpResponse.json(
          { status: 422, message: 'bad', fieldErrors: { targetAccountId: 'unknown account' } },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<EditTransactionDialog open onOpenChange={vi.fn()} tx={baseTx} />);
    const amount = await screen.findByLabelText(/^Amount$/i);
    await user.clear(amount);
    await user.type(amount, '25');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    const accountField = await screen.findByLabelText(/^Account$/i);
    expect(within(accountField.closest('div')!).getByText(/unknown account/i)).toBeInTheDocument();
  });

  it('income picker lists only same-currency accounts', async () => {
    renderWithProviders(<EditTransactionDialog open onOpenChange={vi.fn()} tx={baseTx} />, {
      // The provider helper seeds useAccounts via MSW; per-test override.
      msw: [
        http.get(`${apiBase}/api/accounts`, () =>
          HttpResponse.json({
            accounts: [
              {
                id: 'a1',
                name: 'USD A',
                currency: 'USD',
                balance: 0,
                overdraftLimit: null,
                subtype: { type: 'cash' },
                version: 1,
              },
              {
                id: 'a2',
                name: 'USD B',
                currency: 'USD',
                balance: 0,
                overdraftLimit: null,
                subtype: { type: 'cash' },
                version: 1,
              },
              {
                id: 'a3',
                name: 'EUR A',
                currency: 'EUR',
                balance: 0,
                overdraftLimit: null,
                subtype: { type: 'cash' },
                version: 1,
              },
            ],
            totalCount: 3,
          }),
        ),
      ],
    });
    const account = await screen.findByLabelText(/^Account$/i);
    const options = within(account as HTMLSelectElement).getAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(
      expect.arrayContaining(['USD A (USD)', 'USD B (USD)']),
    );
    expect(options.map((o) => o.textContent)).not.toContain('EUR A (EUR)');
  });
});
```

> If `renderWithProviders` does not accept an `msw` option in this project, replace that single case with an explicit `server.use(...)` call before render.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/features/transactions/EditTransactionDialog.test.tsx`
Expected: FAIL — component not found.

- [ ] **Step 3: Implement `EditTransactionDialog.tsx`**

Use `EditAccountDialog.tsx` as a structural template. The complete implementation:

```tsx
// src/features/transactions/EditTransactionDialog.tsx
import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ApiError } from '@/api/client';
import type { TransactionResponse, UUID } from '@/api/types';
import { useAccounts } from '@/features/accounts/useAccounts';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { IncomeExpenseForm, type IncomeExpenseFormApi } from './IncomeExpenseForm';
import { TransferForm, type TransferFormApi } from './TransferForm';
import {
  toIncomeExpenseFormValues,
  toTransferFormValues,
  type IncomeExpenseFormValues,
  type TransferFormValues,
} from './schema';
import { diffIncomeExpense, diffTransfer } from './diffTransaction';
import { useEditTransaction } from './useEditTransaction';
import { TRANSACTION_KIND_LABELS, type TransactionKind } from './labels';

export interface EditTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tx: TransactionResponse;
}

export function EditTransactionDialog({ open, onOpenChange, tx }: EditTransactionDialogProps) {
  const queryClient = useQueryClient();
  const edit = useEditTransaction();
  const [editEpoch, setEditEpoch] = useState(0);
  const onSubCallApplied = useCallback(() => setEditEpoch((n) => n + 1), []);

  const isTransfer = tx.transferType === 'Transfer';
  const kind: TransactionKind = isTransfer
    ? 'transfer'
    : tx.transferType === 'Income'
      ? 'income'
      : 'expense';

  const accountIds = useMemo<UUID[]>(
    () =>
      isTransfer
        ? [tx.sourceAccountId, tx.targetAccountId]
        : [kind === 'income' ? tx.targetAccountId : tx.sourceAccountId],
    [isTransfer, kind, tx.sourceAccountId, tx.targetAccountId],
  );

  // Re-read the freshest version of the row each time editEpoch ticks.
  const currentTx = useMemo<TransactionResponse>(() => {
    for (const acc of accountIds) {
      const list = queryClient.getQueryData<TransactionResponse[]>(['transactions', acc]);
      const cached = list?.find((t) => t.id === tx.id);
      if (cached) return cached;
    }
    return tx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, tx, editEpoch]);

  const title = TRANSACTION_KIND_LABELS[kind].editTitle;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Update transaction details.</DialogDescription>
        </DialogHeader>
        {currentTx.status !== 'Completed' ? (
          <ReadOnlyNotice status={currentTx.status} onClose={() => onOpenChange(false)} />
        ) : isTransfer ? (
          <EditTransferBody
            tx={currentTx}
            edit={edit}
            kind="transfer"
            accountIds={accountIds}
            onSubCallApplied={onSubCallApplied}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <EditIncomeExpenseBody
            tx={currentTx}
            edit={edit}
            kind={kind as 'income' | 'expense'}
            accountIds={accountIds}
            onSubCallApplied={onSubCallApplied}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReadOnlyNotice({ status, onClose }: { status: string; onClose: () => void }) {
  return (
    <div className="space-y-3">
      <Alert role="alert">
        <AlertDescription>This transaction is {status} and cannot be edited.</AlertDescription>
      </Alert>
      <div className="flex justify-end">
        <button type="button" onClick={onClose} className="rounded-md border px-3 py-1.5 text-sm">
          Close
        </button>
      </div>
    </div>
  );
}

function EditIncomeExpenseBody({
  tx,
  edit,
  kind,
  accountIds,
  onSubCallApplied,
  onClose,
}: {
  tx: TransactionResponse;
  edit: ReturnType<typeof useEditTransaction>;
  kind: 'income' | 'expense';
  accountIds: UUID[];
  onSubCallApplied: () => void;
  onClose: () => void;
}) {
  const { data: accounts = [] } = useAccounts();
  const { data: config } = useConfiguration();

  // Same-currency filter on the picker. The seed currency comes from the tx
  // (income → targetCurrency; expense → sourceCurrency) so it survives even
  // if `accounts` hasn't loaded yet.
  const seedCurrency = kind === 'income' ? tx.targetCurrency : tx.sourceCurrency;
  const filteredAccounts = useMemo(
    () => accounts.filter((a) => a.currency === seedCurrency),
    [accounts, seedCurrency],
  );

  const categoryDictId = kind === 'income' ? 'income-category' : 'expense-category';
  const categories = config?.dictionaries[categoryDictId]?.entries ?? [];
  const labels = config?.dictionaries.labels?.entries ?? [];

  const defaultValues = useMemo(() => toIncomeExpenseFormValues(tx, accounts), [tx, accounts]);
  const baselineRef = useRef(defaultValues);
  baselineRef.current = defaultValues;

  const apiRef = useRef<IncomeExpenseFormApi | null>(null);
  const handleReady = useCallback((api: IncomeExpenseFormApi) => {
    apiRef.current = api;
  }, []);

  const handleSubmit = async (values: IncomeExpenseFormValues) => {
    try {
      const diff = diffIncomeExpense(baselineRef.current, values, tx);
      await edit.mutateAsync({ id: tx.id, accountIds, diff, onSubCallApplied });
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          const target = mapIncomeExpenseFieldError(field, kind);
          if (target) apiRef.current?.setFieldError(target, message);
        }
      }
    }
  };

  const showBanner = edit.isError && !(edit.error instanceof ApiError && edit.error.fieldErrors);
  const bannerMessage =
    edit.error instanceof ApiError ? edit.error.message : 'Something went wrong. Please try again.';

  return (
    <>
      {showBanner && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{bannerMessage}</AlertDescription>
        </Alert>
      )}
      <IncomeExpenseForm
        kind={kind}
        mode="edit"
        accounts={filteredAccounts}
        categories={categories}
        labels={labels}
        defaultValues={defaultValues}
        isSubmitting={edit.isPending}
        onSubmit={handleSubmit}
        onCancel={onClose}
        onReady={handleReady}
      />
    </>
  );
}

function EditTransferBody({
  tx,
  edit,
  kind,
  accountIds,
  onSubCallApplied,
  onClose,
}: {
  tx: TransactionResponse;
  edit: ReturnType<typeof useEditTransaction>;
  kind: 'transfer';
  accountIds: UUID[];
  onSubCallApplied: () => void;
  onClose: () => void;
}) {
  const { data: accounts = [] } = useAccounts();
  const { data: config } = useConfiguration();
  const labels = config?.dictionaries.labels?.entries ?? [];

  const defaultValues = useMemo(() => toTransferFormValues(tx, accounts), [tx, accounts]);
  const baselineRef = useRef(defaultValues);
  baselineRef.current = defaultValues;

  const apiRef = useRef<TransferFormApi | null>(null);
  const handleReady = useCallback((api: TransferFormApi) => {
    apiRef.current = api;
  }, []);

  const handleSubmit = async (values: TransferFormValues) => {
    try {
      const diff = diffTransfer(baselineRef.current, values, tx);
      await edit.mutateAsync({ id: tx.id, accountIds, diff, onSubCallApplied });
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          const target = mapTransferFieldError(field);
          if (target) apiRef.current?.setFieldError(target, message);
        }
      }
    }
  };

  const showBanner = edit.isError && !(edit.error instanceof ApiError && edit.error.fieldErrors);
  const bannerMessage =
    edit.error instanceof ApiError ? edit.error.message : 'Something went wrong. Please try again.';

  return (
    <>
      {showBanner && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{bannerMessage}</AlertDescription>
        </Alert>
      )}
      <TransferForm
        mode="edit"
        accounts={accounts}
        labels={labels}
        defaultValues={defaultValues}
        isSubmitting={edit.isPending}
        onSubmit={handleSubmit}
        onCancel={onClose}
        onReady={handleReady}
      />
    </>
  );
}

// Maps backend field names to IncomeExpenseForm field names. Returns null for
// fields that should fall back to the banner (e.g. the External leg for
// income — not user-facing).
function mapIncomeExpenseFieldError(field: string, kind: 'income' | 'expense'): string | null {
  switch (field) {
    case 'description':
      return 'description';
    case 'at':
      return 'date';
    case 'labels':
      return 'labels';
    case 'sourceAmount':
    case 'targetAmount':
    case 'sourceCurrency':
    case 'targetCurrency':
    case 'exchangeRate':
      return 'amount';
    case 'newAllocations':
    case 'allocations':
      return 'category';
    case 'sourceAccountId':
      return kind === 'expense' ? 'accountId' : null;
    case 'targetAccountId':
      return kind === 'income' ? 'accountId' : null;
    default:
      return null;
  }
}

function mapTransferFieldError(field: string): string | null {
  switch (field) {
    case 'description':
      return 'description';
    case 'at':
      return 'date';
    case 'labels':
      return 'labels';
    case 'sourceAmount':
    case 'targetAmount':
    case 'sourceCurrency':
    case 'targetCurrency':
      return 'amount';
    case 'exchangeRate':
      return 'exchangeRate';
    case 'sourceAccountId':
      return 'sourceAccountId';
    case 'targetAccountId':
      return 'targetAccountId';
    default:
      return null;
  }
}
```

> Note for the executor on category dictionary ids: `CreateIncomeDialog.tsx` reads `config.dictionaries['income-category']` and `CreateExpenseDialog` reads `'expense-category'`. Re-use those exact keys above (see existing files if uncertain).

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm exec vitest run src/features/transactions/EditTransactionDialog.test.tsx`
Expected: PASS — all six cases.

- [ ] **Step 5: Run the full transactions suite**

Run: `pnpm exec vitest run src/features/transactions`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/transactions/EditTransactionDialog.tsx src/features/transactions/EditTransactionDialog.test.tsx
git commit -m "feat(transactions): add EditTransactionDialog"
```

---

## Task 13 — Vendor shadcn `ContextMenu`

**Files:**

- Create: `src/components/ui/context-menu.tsx`

- [ ] **Step 1: Vendor the primitive**

Run:

```bash
pnpm dlx shadcn@latest add context-menu
```

Expected: writes `src/components/ui/context-menu.tsx` and updates `package.json` (`@radix-ui/react-context-menu`).

If the CLI prompts about overwriting or about `components.json` location, accept the defaults — the project's `components.json` already targets `src/components/ui/`.

- [ ] **Step 2: Verify build & typecheck**

Run: `just typecheck && pnpm exec vitest run`
Expected: PASS (no other module imports the new primitive yet, so it should be inert).

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/context-menu.tsx package.json pnpm-lock.yaml
git commit -m "chore(ui): vendor shadcn ContextMenu primitive"
```

---

## Task 14 — Row activation in `TransactionsPane`

**Files:**

- Modify: `src/features/transactions/TransactionsPane.tsx`
- Modify: `src/features/transactions/TransactionsPane.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to the existing test file. Use the file's existing fixtures and render helper.

```tsx
it('opens the edit dialog on double-click of a row', async () => {
  const user = userEvent.setup();
  renderWithProviders(<TransactionsPane />, { route: '/accounts/a1' });
  const row = await screen.findByText(/old/).then((el) => el.closest('tr')!);
  await user.dblClick(row);
  expect(await screen.findByRole('dialog', { name: /Edit income/i })).toBeInTheDocument();
});

it('opens the context menu with an Edit item on right-click', async () => {
  const user = userEvent.setup();
  renderWithProviders(<TransactionsPane />, { route: '/accounts/a1' });
  const row = await screen.findByText(/old/).then((el) => el.closest('tr')!);
  await user.pointer({ keys: '[MouseRight]', target: row });
  expect(await screen.findByRole('menuitem', { name: /Edit/i })).toBeInTheDocument();
});

it('opens the edit dialog when Enter is pressed on a focused row', async () => {
  const user = userEvent.setup();
  renderWithProviders(<TransactionsPane />, { route: '/accounts/a1' });
  const row = await screen.findByText(/old/).then((el) => el.closest('tr')!);
  row.focus();
  await user.keyboard('{Enter}');
  expect(await screen.findByRole('dialog', { name: /Edit income/i })).toBeInTheDocument();
});
```

> The MSW default `GET /api/transactions` handler must return at least one row whose description is `old`. If the existing fixture differs, adjust the matcher; do not change the fixture for the test's sake.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx -t "edit"`
Expected: FAIL — rows are inert.

- [ ] **Step 3: Wrap rows with `ContextMenu` and add activation handlers**

In `src/features/transactions/TransactionsPane.tsx` replace the `<tbody>` row loop (lines 67–95) with a version that:

1. Tracks `const [editing, setEditing] = useState<TransactionResponse | null>(null);` near the top of the component (above the existing `let body`).
2. Renders each row inside a `<ContextMenu>` with a single `Edit` trigger, and adds row-level `onDoubleClick` and `onKeyDown` handlers, plus `role="button" tabIndex={0}` and the existing hover/cursor classes.
3. Renders `{editing && <EditTransactionDialog open onOpenChange={(o) => !o && setEditing(null)} tx={editing} />}` after the existing JSX block.

Concrete patch:

```tsx
import { useState } from 'react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { TransactionResponse } from '@/api/types';
import { EditTransactionDialog } from './EditTransactionDialog';
```

Inside the component (right above the `let body` declaration):

```tsx
const [editing, setEditing] = useState<TransactionResponse | null>(null);
const openEdit = (t: TransactionResponse) => setEditing(t);
```

Replace the row loop with:

```tsx
{
  data.map((t) => {
    const isTarget = t.targetAccountId === id && t.sourceAccountId !== id;
    const amount = isTarget ? t.targetAmount : -t.sourceAmount;
    const currency = isTarget ? t.targetCurrency : t.sourceCurrency;
    const negative = amount < 0;
    return (
      <ContextMenu key={t.id}>
        <ContextMenuTrigger asChild>
          <tr
            className="cursor-pointer border-t hover:bg-muted/50"
            role="button"
            tabIndex={0}
            onDoubleClick={() => openEdit(t)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                openEdit(t);
              }
            }}
          >
            <td className="px-4 py-2">{formatDate(t.date)}</td>
            <td className="px-4 py-2">{t.description}</td>
            <td className="w-40 truncate px-4 py-2">
              {t.category ? (categoryNameById.get(t.category) ?? '') : ''}
            </td>
            <td className={cn('px-4 py-2 text-right tabular-nums', negative && 'text-destructive')}>
              {formatMoney(amount, currency)}
            </td>
          </tr>
        </ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem onSelect={() => openEdit(t)}>Edit</ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  });
}
```

And add the dialog mount at the end of the returned fragment, after `{body}`:

```tsx
{
  editing && (
    <EditTransactionDialog
      open
      onOpenChange={(o) => {
        if (!o) setEditing(null);
      }}
      tx={editing}
    />
  );
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx`
Expected: PASS — existing cases plus the three new ones.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/TransactionsPane.tsx src/features/transactions/TransactionsPane.test.tsx
git commit -m "feat(transactions): open EditTransactionDialog from double-click and context menu"
```

---

## Task 15 — Happy-path E2E spec

**Files:**

- Create: `e2e/edit-transaction.spec.ts`

- [ ] **Step 1: Write the spec**

Mirror the existing `e2e/create-transaction.spec.ts` (auth + seed scaffolding). The new spec:

1. Logs in with the test account; navigates to an account that already has a transaction (seed-side or via the create flow at the start of the spec — match what `create-transaction.spec.ts` already does).
2. Locates the row by visible description text and double-clicks it.
3. Waits for the `Edit income` (or whichever kind) dialog.
4. Clears the description input and types a new one.
5. Clicks `Save`.
6. Asserts the row's description in the list updates to the new text.

Use the file structure conventions from `e2e/create-transaction.spec.ts` — same imports, fixture helpers, `baseURL`. Keep the spec terse; one happy path is the goal.

- [ ] **Step 2: Run it**

Run: `pnpm exec playwright test e2e/edit-transaction.spec.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/edit-transaction.spec.ts
git commit -m "test(e2e): add happy-path spec for editing a transaction"
```

---

## Task 16 — Full verification

**Files:** none.

- [ ] **Step 1: Run the whole check + test bundle**

Run: `just all`
Expected: PASS (typecheck + lint + format-check + vitest + build).

- [ ] **Step 2: Run e2e**

Run: `just e2e`
Expected: PASS (auto-starts dev server and runs Playwright).

- [ ] **Step 3: Manual UI sanity check**

Per the parent system prompt's UI rule: open the dev server and use the feature in a browser.

Run (foreground): `just run`

- Sign in → open any account with a transaction → double-click the row → confirm the dialog opens with seeded values; change the description; Save; confirm the row updates.
- Right-click another row → confirm the context menu with `Edit` appears; click it; confirm the same dialog opens.
- Open a non-`Completed` transaction → confirm the read-only notice.

Stop the dev server when done.

- [ ] **Step 4: Push the branch**

Confirm with the user before pushing or opening a PR. Suggested phrasing: "All tasks complete. Branch is `feat/edit-transaction`. Want me to push and open a PR titled `feat: edit transaction (#14)`?"

---

## Out-of-band notes

- **Conventional Commit scope** is `transactions` (feature folder) for transaction-specific changes, `api` for API surface, `ui` for vendored primitives, and `test` for test-only adjustments. The user's global CLAUDE.md requires Conventional Commits — every commit message in this plan already follows that.
- **Do not skip hooks** (`--no-verify`) — if a pre-commit hook fails, fix the underlying issue and create a new commit.
- **No backend changes.** All endpoints referenced exist in `server-infra/src/Web/API/TransactionAPI.hs:135-174`.
- **Spec citations:** field/test selections derived from `docs/specs/2026-06-04-edit-transaction-design.md` §3–§7. If a behaviour seems under-specified during execution, refer back to the spec before improvising; surface ambiguities rather than guessing.
