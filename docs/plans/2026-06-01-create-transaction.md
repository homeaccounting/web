---
status: draft
---

# Create Transaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user create income, expense, and internal-transfer transactions from `TransactionsPane` via a new control bar with three icon buttons. Each kind has its own dialog. Forms are mode-aware (`'create' | 'edit'`) so the future Edit Transaction slice can reuse them.

**Architecture:** Add three new POST methods to the existing `transactionsApi` factory; add request DTOs to `src/api/types.ts` mirroring backend `Web/Types.hs:349-380` (Income/Expense) and `406-422` (InternalTransfer). Add one shared `IncomeExpenseForm` and one `TransferForm` (both `mode`-aware) plus three thin dialogs that own their `useMutation` and push server `fieldErrors` into the form (same pattern as `CreateAccountDialog`). A new `ControlBar` component lives at the top of `TransactionsPane`. Three TanStack Query mutation hooks (one per kind) invalidate `['accounts']` and `['transactions', accountId]` after success.

**Tech Stack:**

- **Web:** React 18, TypeScript, Vite, Tailwind, shadcn/ui (Radix + Zod + react-hook-form), TanStack Query, MSW + Vitest + Testing Library, Playwright for one happy-path e2e.

**Spec:** `docs/specs/2026-06-01-create-transaction-design.md`

**Issue:** [homeaccounting/web#13](https://github.com/homeaccounting/web/issues/13)

**Branch / PR:** `feat/create-transaction` (already pushed) → draft PR [#18](https://github.com/homeaccounting/web/pull/18).

---

## File map

### Web (this repo)

- **Modify** `src/api/types.ts` — add `IncomeRequest`, `ExpenseRequest`, `InternalTransferRequest` interfaces.
- **Modify** `src/api/transactions.ts` — add `createIncome`, `createExpense`, `createTransfer` methods on the factory.
- **Create** `src/features/transactions/schema.ts` — `incomeExpenseFormSchema`, `transferFormSchema`, types, and DTO mappers (`toIncomeRequest`, `toExpenseRequest`, `toTransferRequest`).
- **Create** `src/features/transactions/schema.test.ts` — covers schema parsing and mapper output.
- **Create** `src/features/transactions/labels.ts` — short text labels per transaction kind (titles, button text).
- **Create** `src/features/transactions/LabelMultiSelect.tsx` — small in-feature component (NOT a shadcn primitive) that renders a `DropdownMenu` of checkbox items for choosing label IDs.
- **Create** `src/features/transactions/useCreateIncome.ts` — `useMutation` wrapper.
- **Create** `src/features/transactions/useCreateExpense.ts` — `useMutation` wrapper.
- **Create** `src/features/transactions/useCreateTransfer.ts` — `useMutation` wrapper.
- **Create** `src/features/transactions/IncomeExpenseForm.tsx` — shared presentational form (income + expense).
- **Create** `src/features/transactions/IncomeExpenseForm.test.tsx`.
- **Create** `src/features/transactions/TransferForm.tsx` — presentational form for transfer.
- **Create** `src/features/transactions/TransferForm.test.tsx`.
- **Create** `src/features/transactions/CreateIncomeDialog.tsx`.
- **Create** `src/features/transactions/CreateIncomeDialog.test.tsx`.
- **Create** `src/features/transactions/CreateExpenseDialog.tsx`.
- **Create** `src/features/transactions/CreateExpenseDialog.test.tsx`.
- **Create** `src/features/transactions/CreateTransferDialog.tsx`.
- **Create** `src/features/transactions/CreateTransferDialog.test.tsx`.
- **Create** `src/features/transactions/ControlBar.tsx` — header row with three icon buttons and the three dialogs.
- **Create** `src/features/transactions/ControlBar.test.tsx`.
- **Modify** `src/features/transactions/TransactionsPane.tsx` — render `<ControlBar selectedAccount={account} />` at the very top, above `AccountHeader`.
- **Modify** `src/features/transactions/TransactionsPane.test.tsx` — verify the new control bar renders and dialogs open.
- **Modify** `src/test/handlers.ts` — add default MSW handlers for the three new POST endpoints so tests outside the dialog test files don't trip `onUnhandledRequest: 'error'`.
- **Modify** `src/test/fixtures.ts` — extend `configurationFixture` with a `labels` dictionary (an empty `entries` array is fine for fixtures, plus one entry for testing the multi-select).
- **Create** `e2e/create-transaction.spec.ts` — Playwright happy path for adding an expense.

### Backend

None. The endpoints (`POST /api/transactions/income | /expense | /transfer`) already exist (`server-infra/src/Web/API/TransactionAPI.hs:104-125`).

---

## Commit conventions

Per the user's global CLAUDE.md (Conventional Commits v1.0.0):

- Frequent commits, one per logical TDD task. Never use `--no-verify`.
- `feat(transactions): …` for production behavior changes.
- `test(transactions): …` for test-only additions when separated from production code.
- `chore(test): …` for fixture/handler scaffolding.
- The PR is already opened as draft; pushes to `feat/create-transaction` update it.

---

## Pre-flight

- [ ] **Step 0.1: Verify branch and worktree**

Run: `git status && git branch --show-current`
Expected: clean working tree on `feat/create-transaction`.

- [ ] **Step 0.2: Verify dev tooling is on PATH**

Run: `node --version && pnpm --version && just --version`
Expected: Node 22.x, pnpm 9.x, just present. If any are missing, run `nix develop` first (project uses Nix/direnv per the project CLAUDE.md).

- [ ] **Step 0.3: Verify a clean baseline**

Run: `just check && just test`
Expected: both pass. If they don't on a freshly-checked-out branch, surface to the human before continuing — the plan is TDD, so existing failures will pollute every "expected: passes" step below.

---

## Task 1 — Request DTOs in `src/api/types.ts`

This is plumbing only — no tests yet. The schema tests in Task 3 are the first failing tests against these types.

**Files:**

- Modify: `src/api/types.ts` (anchor the additions after the existing `AdjustBalanceRequest` block at lines 166-174 and before the `TransactionResponse` block at lines 186-202, so the request and response sit next to each other).

- [ ] **Step 1.1: Add the three request interfaces**

Insert into `src/api/types.ts` right after the `AdjustBalanceRequest` block:

```ts
// Mirrors backend Web/Types.hs:349-380 (IncomeRequest and ExpenseRequest are
// structurally identical there). `category` is sent as JSON `Text` but the
// backend parses it to a `DictionaryEntryId` UUID via `parseCategoryId`
// (Web/Types.hs:1076-1080), so we type it as `UUID` (a string) on the wire.
export interface IncomeRequest {
  accountId: UUID;
  amount: number;
  currency: string;
  category: UUID; // wire type: string; must be a dictionary entry UUID
  description: string;
  date?: ISO8601; // omit → backend defaults to server time
  labels?: UUID[];
}

export type ExpenseRequest = IncomeRequest;

// Mirrors backend Web/Types.hs:406-422. `currency` here is the SOURCE
// account's currency (the form locks it to the source); the backend computes
// the target amount via `exchangeRate` (or its default if omitted).
export interface InternalTransferRequest {
  sourceAccountId: UUID;
  targetAccountId: UUID;
  amount: number;
  currency: string;
  description: string;
  exchangeRate?: number;
  date?: ISO8601;
  labels?: UUID[];
}
```

- [ ] **Step 1.2: Typecheck**

Run: `pnpm typecheck`
Expected: passes (no new code is using these types yet, but `tsc --noEmit` should not regress).

- [ ] **Step 1.3: Commit**

```bash
git add src/api/types.ts
git commit -m "feat(transactions): add IncomeRequest, ExpenseRequest, InternalTransferRequest DTOs"
```

---

## Task 2 — API methods in `src/api/transactions.ts`

**Files:**

- Modify: `src/api/transactions.ts`

- [ ] **Step 2.1: Extend the factory**

Replace the file contents with:

```ts
import type {
  ExpenseRequest,
  IncomeRequest,
  InternalTransferRequest,
  TransactionListResponse,
  TransactionResponse,
  UUID,
} from './types';
import type { ApiClient } from './client';

export const transactionsApi = (client: ApiClient) => ({
  list: async (params: { accountId: UUID }): Promise<TransactionResponse[]> => {
    const qs = new URLSearchParams({ accountId: params.accountId }).toString();
    const res = await client.get<TransactionListResponse>(`/api/transactions?${qs}`);
    return res.transactions;
  },
  createIncome: (body: IncomeRequest): Promise<TransactionResponse> =>
    client.post<TransactionResponse>('/api/transactions/income', body),
  createExpense: (body: ExpenseRequest): Promise<TransactionResponse> =>
    client.post<TransactionResponse>('/api/transactions/expense', body),
  createTransfer: (body: InternalTransferRequest): Promise<TransactionResponse> =>
    client.post<TransactionResponse>('/api/transactions/transfer', body),
});
```

(The `ApiClient.post` signature is `post<T>(path, body?)` — see `src/api/client.ts:30-32`. Body type-safety is enforced by the parameter type, not a second generic on the call.)

- [ ] **Step 2.2: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 2.3: Commit**

```bash
git add src/api/transactions.ts
git commit -m "feat(transactions): add createIncome, createExpense, createTransfer API methods"
```

---

## Task 3 — Zod schemas and DTO mappers

**Files:**

- Create: `src/features/transactions/schema.ts`
- Create: `src/features/transactions/schema.test.ts`

This is the first test task. TDD: write the failing tests in 3.1 (whole file in one shot — they are tightly coupled), then implement schema.ts to make them pass.

- [ ] **Step 3.1: Write `schema.test.ts` (failing)**

```ts
import { describe, expect, it } from 'vitest';
import {
  incomeExpenseFormSchema,
  transferFormSchema,
  toIncomeRequest,
  toExpenseRequest,
  toTransferRequest,
} from './schema';

const ACC_A = '11111111-1111-1111-1111-111111111111';
const ACC_B = '22222222-2222-2222-2222-222222222222';
const CAT = '33333333-3333-3333-3333-333333333333';
const LBL = '44444444-4444-4444-4444-444444444444';

describe('incomeExpenseFormSchema', () => {
  const valid = {
    accountId: ACC_A,
    amount: 12.5,
    currency: 'USD',
    category: CAT,
    description: 'Lunch',
    date: '2026-06-01',
    labels: [LBL],
  };

  it('parses a valid input', () => {
    expect(incomeExpenseFormSchema.parse(valid)).toMatchObject(valid);
  });

  it('rejects non-positive amounts', () => {
    expect(incomeExpenseFormSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
    expect(incomeExpenseFormSchema.safeParse({ ...valid, amount: -1 }).success).toBe(false);
  });

  it('rejects missing description', () => {
    expect(incomeExpenseFormSchema.safeParse({ ...valid, description: '' }).success).toBe(false);
  });

  it('accepts empty date (omitted) and empty labels', () => {
    const parsed = incomeExpenseFormSchema.parse({ ...valid, date: '', labels: [] });
    expect(parsed.date).toBeUndefined();
    expect(parsed.labels).toEqual([]);
  });

  it('defaults labels to empty when omitted', () => {
    const { labels: _l, ...without } = valid;
    const parsed = incomeExpenseFormSchema.parse(without);
    expect(parsed.labels).toEqual([]);
  });
});

describe('toIncomeRequest / toExpenseRequest', () => {
  const values = {
    accountId: ACC_A,
    amount: 12.5,
    currency: 'USD',
    category: CAT,
    description: 'Lunch',
    date: '2026-06-01',
    labels: [LBL],
  } as const;

  it('produces the full DTO with ISO timestamp', () => {
    expect(toIncomeRequest({ ...values })).toEqual({
      accountId: ACC_A,
      amount: 12.5,
      currency: 'USD',
      category: CAT,
      description: 'Lunch',
      date: '2026-06-01T00:00:00.000Z',
      labels: [LBL],
    });
  });

  it('omits date when undefined', () => {
    const dto = toIncomeRequest({ ...values, date: undefined });
    expect(dto.date).toBeUndefined();
    expect('date' in dto).toBe(true); // explicit undefined OK; backend treats as Nothing
  });

  it('omits labels when empty', () => {
    const dto = toIncomeRequest({ ...values, labels: [] });
    expect(dto.labels).toBeUndefined();
  });

  it('toExpenseRequest equals toIncomeRequest for the same input', () => {
    expect(toExpenseRequest({ ...values })).toEqual(toIncomeRequest({ ...values }));
  });
});

describe('transferFormSchema', () => {
  const valid = {
    sourceAccountId: ACC_A,
    targetAccountId: ACC_B,
    amount: 100,
    currency: 'USD',
    description: 'Top-up',
    exchangeRate: undefined,
    date: '2026-06-01',
    labels: [],
  };

  it('parses a valid input', () => {
    expect(transferFormSchema.parse(valid)).toMatchObject(valid);
  });

  it('rejects source === target', () => {
    const r = transferFormSchema.safeParse({ ...valid, targetAccountId: ACC_A });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'targetAccountId')).toBe(true);
    }
  });

  it('rejects non-positive exchangeRate', () => {
    expect(transferFormSchema.safeParse({ ...valid, exchangeRate: 0 }).success).toBe(false);
    expect(transferFormSchema.safeParse({ ...valid, exchangeRate: -0.5 }).success).toBe(false);
  });
});

describe('toTransferRequest', () => {
  const values = {
    sourceAccountId: ACC_A,
    targetAccountId: ACC_B,
    amount: 100,
    currency: 'USD',
    description: 'Top-up',
    exchangeRate: 1.25,
    date: '2026-06-01',
    labels: [LBL],
  } as const;

  it('drops exchangeRate when currencies match', () => {
    expect(toTransferRequest({ ...values }, 'USD', 'USD').exchangeRate).toBeUndefined();
  });

  it('keeps exchangeRate when currencies differ', () => {
    expect(toTransferRequest({ ...values }, 'USD', 'EUR').exchangeRate).toBe(1.25);
  });

  it('omits date when empty', () => {
    expect(toTransferRequest({ ...values, date: undefined }, 'USD', 'USD').date).toBeUndefined();
  });

  it('omits labels when empty', () => {
    expect(toTransferRequest({ ...values, labels: [] }, 'USD', 'USD').labels).toBeUndefined();
  });
});
```

- [ ] **Step 3.2: Run the failing tests**

Run: `pnpm exec vitest run src/features/transactions/schema.test.ts`
Expected: FAIL — `Cannot find module './schema'` (or similar).

- [ ] **Step 3.3: Write `schema.ts` to make them pass**

```ts
import { z } from 'zod';
import type { ExpenseRequest, IncomeRequest, InternalTransferRequest, UUID } from '@/api/types';

const uuid = z.string().uuid();
const positiveAmount = z.coerce.number().positive('Amount must be positive');
const description = z.string().min(1, 'Description is required').max(500);

// Either a YYYY-MM-DD string or empty string; normalized to undefined when
// empty. The transform runs after validation so an invalid string still fails.
const optionalIsoDate = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'), z.literal('')])
  .optional()
  .transform((v) => (v === '' || v === undefined ? undefined : v));

export const incomeExpenseFormSchema = z.object({
  accountId: uuid,
  amount: positiveAmount,
  currency: z.string().min(1),
  category: uuid,
  description,
  date: optionalIsoDate,
  labels: z.array(uuid).default([]),
});
export type IncomeExpenseFormValues = z.infer<typeof incomeExpenseFormSchema>;

export const transferFormSchema = z
  .object({
    sourceAccountId: uuid,
    targetAccountId: uuid,
    amount: positiveAmount,
    currency: z.string().min(1),
    description,
    exchangeRate: z.coerce.number().positive().optional(),
    date: optionalIsoDate,
    labels: z.array(uuid).default([]),
  })
  .refine((v) => v.sourceAccountId !== v.targetAccountId, {
    message: 'Source and target accounts must differ',
    path: ['targetAccountId'],
  });
export type TransferFormValues = z.infer<typeof transferFormSchema>;

const isoDay = (yyyyMmDd: string) => `${yyyyMmDd}T00:00:00.000Z`;
const labelsOrUndefined = (xs: UUID[]) => (xs.length === 0 ? undefined : xs);

export function toIncomeRequest(v: IncomeExpenseFormValues): IncomeRequest {
  return {
    accountId: v.accountId,
    amount: v.amount,
    currency: v.currency,
    category: v.category,
    description: v.description,
    date: v.date ? isoDay(v.date) : undefined,
    labels: labelsOrUndefined(v.labels),
  };
}

// Income and Expense share the same DTO shape; alias for call-site clarity.
export const toExpenseRequest: (v: IncomeExpenseFormValues) => ExpenseRequest = toIncomeRequest;

export function toTransferRequest(
  v: TransferFormValues,
  sourceCurrency: string,
  targetCurrency: string,
): InternalTransferRequest {
  return {
    sourceAccountId: v.sourceAccountId,
    targetAccountId: v.targetAccountId,
    amount: v.amount,
    currency: v.currency,
    description: v.description,
    exchangeRate: sourceCurrency === targetCurrency ? undefined : v.exchangeRate,
    date: v.date ? isoDay(v.date) : undefined,
    labels: labelsOrUndefined(v.labels),
  };
}
```

- [ ] **Step 3.4: Run the tests and confirm green**

Run: `pnpm exec vitest run src/features/transactions/schema.test.ts`
Expected: all pass.

- [ ] **Step 3.5: Commit**

```bash
git add src/features/transactions/schema.ts src/features/transactions/schema.test.ts
git commit -m "feat(transactions): add Zod schemas and DTO mappers"
```

---

## Task 4 — Labels text module

Tiny but lets every later file `import { TRANSACTION_KIND_LABELS } from './labels'` and avoid duplicating "Add income" / "Add expense" / "Add transfer" strings. No tests; pure constants.

**Files:**

- Create: `src/features/transactions/labels.ts`

- [ ] **Step 4.1: Write the constants**

```ts
export const TRANSACTION_KIND_LABELS = {
  income: { title: 'Add income', submit: 'Add income', aria: 'Add income' },
  expense: { title: 'Add expense', submit: 'Add expense', aria: 'Add expense' },
  transfer: { title: 'Add transfer', submit: 'Add transfer', aria: 'Add transfer' },
} as const;

export type TransactionKind = keyof typeof TRANSACTION_KIND_LABELS;
```

- [ ] **Step 4.2: Commit**

```bash
git add src/features/transactions/labels.ts
git commit -m "feat(transactions): add per-kind UI labels"
```

---

## Task 5 — MSW handlers and fixture extensions

Adds default success handlers for the three new POSTs and extends `configurationFixture` with a `labels` dictionary entry (`Trip`) used by the form tests. This must land before the dialog tests so MSW's `onUnhandledRequest: 'error'` doesn't reject the requests in unrelated test files.

**Files:**

- Modify: `src/test/fixtures.ts`
- Modify: `src/test/handlers.ts`

- [ ] **Step 5.1: Extend `fixtures.ts`**

Add to `src/test/fixtures.ts` (alongside `foodCategoryId`):

```ts
export const tripLabelId = '00000000-0000-0000-0000-0000000017a1';
```

Add a `labels` entry **inside the existing** `configurationFixture.dictionaries` object — do **not** redeclare the whole `dictionaries` block, just add a new key next to the existing `categories`:

```ts
// before
dictionaries: {
  categories: { entries: [{ id: foodCategoryId, name: 'Food' }] },
},

// after
dictionaries: {
  categories: { entries: [{ id: foodCategoryId, name: 'Food' }] },
  labels: { entries: [{ id: tripLabelId, name: 'Trip' }] },
},
```

- [ ] **Step 5.2: Extend `handlers.ts`**

Add three POST handlers in `src/test/handlers.ts`, right after the existing `http.put(...balance...)` handler:

```ts
http.post(`${apiBase}/api/transactions/income`, async ({ request }) => {
  const body = (await request.json()) as {
    accountId: string;
    amount: number;
    currency: string;
    description: string;
  };
  return HttpResponse.json({
    id: 'tx-new-income',
    sourceAccountId: 'external-1',
    targetAccountId: body.accountId,
    sourceAmount: body.amount,
    sourceCurrency: body.currency,
    targetAmount: body.amount,
    targetCurrency: body.currency,
    exchangeRate: null,
    description: body.description,
    status: 'Completed',
    failureReason: null,
    transferType: 'Income',
    category: null,
    date: '2026-06-01T00:00:00.000Z',
    labels: [],
  });
}),
http.post(`${apiBase}/api/transactions/expense`, async ({ request }) => {
  const body = (await request.json()) as {
    accountId: string;
    amount: number;
    currency: string;
    description: string;
  };
  return HttpResponse.json({
    id: 'tx-new-expense',
    sourceAccountId: body.accountId,
    targetAccountId: 'external-1',
    sourceAmount: -body.amount,
    sourceCurrency: body.currency,
    targetAmount: -body.amount,
    targetCurrency: body.currency,
    exchangeRate: null,
    description: body.description,
    status: 'Completed',
    failureReason: null,
    transferType: 'Expense',
    category: null,
    date: '2026-06-01T00:00:00.000Z',
    labels: [],
  });
}),
http.post(`${apiBase}/api/transactions/transfer`, async ({ request }) => {
  const body = (await request.json()) as {
    sourceAccountId: string;
    targetAccountId: string;
    amount: number;
    currency: string;
    description: string;
  };
  return HttpResponse.json({
    id: 'tx-new-transfer',
    sourceAccountId: body.sourceAccountId,
    targetAccountId: body.targetAccountId,
    sourceAmount: -body.amount,
    sourceCurrency: body.currency,
    targetAmount: body.amount,
    targetCurrency: body.currency,
    exchangeRate: null,
    description: body.description,
    status: 'Completed',
    failureReason: null,
    transferType: 'Transfer',
    category: null,
    date: '2026-06-01T00:00:00.000Z',
    labels: [],
  });
}),
```

- [ ] **Step 5.3: Re-run the existing test suite to verify no regressions**

Run: `pnpm exec vitest run`
Expected: all previously passing tests still pass. (No new tests yet — this step is a regression guard.)

- [ ] **Step 5.4: Commit**

```bash
git add src/test/fixtures.ts src/test/handlers.ts
git commit -m "chore(test): add default POST /api/transactions/* handlers and labels fixture"
```

---

## Task 6 — `LabelMultiSelect` component

Used by both forms. Renders a `DropdownMenu` with `DropdownMenuCheckboxItem` entries — accessible, keyboard-navigable, and avoids inventing a new primitive.

**Files:**

- Create: `src/features/transactions/LabelMultiSelect.tsx`

- [ ] **Step 6.1: Write the component**

```tsx
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { DictionaryEntryResponse, UUID } from '@/api/types';

export interface LabelMultiSelectProps {
  options: DictionaryEntryResponse[];
  value: UUID[];
  onChange: (ids: UUID[]) => void;
  buttonAriaLabel?: string;
}

export function LabelMultiSelect({
  options,
  value,
  onChange,
  buttonAriaLabel = 'Select labels',
}: LabelMultiSelectProps) {
  const summary =
    value.length === 0
      ? 'No labels'
      : value.length === 1
        ? (options.find((o) => o.id === value[0])?.name ?? '1 label')
        : `${value.length} labels`;

  const toggle = (id: UUID, checked: boolean) => {
    if (checked) onChange(value.includes(id) ? value : [...value, id]);
    else onChange(value.filter((x) => x !== id));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="w-full justify-between"
          aria-label={buttonAriaLabel}
        >
          {summary}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]">
        {options.length === 0 && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">No labels available</div>
        )}
        {options.map((opt) => (
          <DropdownMenuCheckboxItem
            key={opt.id}
            checked={value.includes(opt.id)}
            onCheckedChange={(checked) => toggle(opt.id, Boolean(checked))}
            onSelect={(e) => e.preventDefault()} // keep the menu open after a click
          >
            {opt.name}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
```

(No unit test for this component — it has no logic worth isolating; its behavior is exercised through the form tests in Tasks 8 and 9.)

- [ ] **Step 6.2: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 6.3: Commit**

```bash
git add src/features/transactions/LabelMultiSelect.tsx
git commit -m "feat(transactions): add LabelMultiSelect dropdown"
```

---

## Task 7 — `IncomeExpenseForm`

The shared form for income and expense. Pure presentational — receives accounts/categories/labels and a submit callback; doesn't talk to the network.

**Files:**

- Create: `src/features/transactions/IncomeExpenseForm.tsx`
- Create: `src/features/transactions/IncomeExpenseForm.test.tsx`

- [ ] **Step 7.1: Write the failing tests**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import type { AccountResponse, DictionaryEntryResponse } from '@/api/types';
import { IncomeExpenseForm, type IncomeExpenseFormApi } from './IncomeExpenseForm';

const accounts: AccountResponse[] = [
  {
    id: 'a1',
    name: 'Checking',
    balance: 100,
    currency: 'USD',
    overdraftLimit: null,
    subtype: null,
    version: 1,
  },
  {
    id: 'a2',
    name: 'Savings',
    balance: 0,
    currency: 'EUR',
    overdraftLimit: null,
    subtype: null,
    version: 1,
  },
];
const categories: DictionaryEntryResponse[] = [{ id: 'c1', name: 'Food' }];
const labels: DictionaryEntryResponse[] = [{ id: 'l1', name: 'Trip' }];

const defaults = {
  accountId: 'a1',
  amount: 0,
  currency: 'USD',
  category: '',
  description: '',
  date: '',
  labels: [] as string[],
};

describe('IncomeExpenseForm', () => {
  it('renders all expected fields', () => {
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        labels={labels}
        defaultValues={defaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/account/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
  });

  it('updates the locked currency badge when the account changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        labels={labels}
        defaultValues={defaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('currency-badge')).toHaveTextContent('USD');

    // Switch to the EUR account via the native <select> the form uses.
    await user.selectOptions(screen.getByLabelText(/account/i), 'a2');
    await waitFor(() => expect(screen.getByTestId('currency-badge')).toHaveTextContent('EUR'));
  });

  it('calls onSubmit with parsed values on submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        labels={labels}
        defaultValues={defaults}
        isSubmitting={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '12.5');
    await user.selectOptions(screen.getByLabelText(/category/i), 'c1');
    await user.type(screen.getByLabelText(/description/i), 'Lunch');
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      accountId: 'a1',
      amount: 12.5,
      currency: 'USD',
      category: 'c1',
      description: 'Lunch',
    });
  });

  it('exposes setFieldError via onReady so server errors render under fields', async () => {
    let api!: IncomeExpenseFormApi;
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        labels={labels}
        defaultValues={defaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        onReady={(a) => {
          api = a;
        }}
      />,
    );
    api.setFieldError('amount', 'Server says no');
    expect(await screen.findByText('Server says no')).toBeInTheDocument();
  });
});
```

- [ ] **Step 7.2: Run the failing tests**

Run: `pnpm exec vitest run src/features/transactions/IncomeExpenseForm.test.tsx`
Expected: FAIL with module-not-found.

- [ ] **Step 7.3: Implement `IncomeExpenseForm.tsx`**

```tsx
import { useEffect } from 'react';
import { useForm, FormProvider, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import type { AccountResponse, DictionaryEntryResponse } from '@/api/types';
import { incomeExpenseFormSchema, type IncomeExpenseFormValues } from './schema';
import { LabelMultiSelect } from './LabelMultiSelect';
import { TRANSACTION_KIND_LABELS, type TransactionKind } from './labels';

export interface IncomeExpenseFormApi {
  setFieldError: (field: string, message: string) => void;
}

export interface IncomeExpenseFormProps {
  kind: Extract<TransactionKind, 'income' | 'expense'>;
  mode: 'create' | 'edit';
  accounts: AccountResponse[];
  categories: DictionaryEntryResponse[];
  labels: DictionaryEntryResponse[];
  defaultValues: IncomeExpenseFormValues;
  isSubmitting: boolean;
  onSubmit: (values: IncomeExpenseFormValues) => void | Promise<void>;
  onCancel: () => void;
  onReady?: (api: IncomeExpenseFormApi) => void;
}

export function IncomeExpenseForm({
  kind,
  mode,
  accounts,
  categories,
  labels,
  defaultValues,
  isSubmitting,
  onSubmit,
  onCancel,
  onReady,
}: IncomeExpenseFormProps) {
  const form = useForm<IncomeExpenseFormValues>({
    resolver: zodResolver(incomeExpenseFormSchema) as Resolver<IncomeExpenseFormValues>,
    defaultValues,
  });

  // Keep currency in form state in sync with the selected account so the DTO
  // is well-formed and the read-only badge reflects the current account.
  const accountId = form.watch('accountId');
  useEffect(() => {
    const a = accounts.find((x) => x.id === accountId);
    if (a) form.setValue('currency', a.currency, { shouldDirty: false });
  }, [accountId, accounts, form]);

  useEffect(() => {
    onReady?.({
      setFieldError: (field, message) =>
        form.setError(field as keyof IncomeExpenseFormValues, { type: 'server', message }),
    });
  }, [form, onReady]);

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <FormProvider {...form}>
      <form
        role="form"
        onSubmit={(e) => {
          void submit(e);
        }}
        className="space-y-4"
      >
        <FormField
          control={form.control}
          name="accountId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account</FormLabel>
              <FormControl>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...field}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-end gap-2">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>Amount</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="any"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={
                      field.value === undefined ||
                      field.value === null ||
                      (typeof field.value === 'number' && Number.isNaN(field.value))
                        ? ''
                        : field.value
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '' || raw === '-') {
                        field.onChange(raw);
                        return;
                      }
                      const n = e.target.valueAsNumber;
                      field.onChange(Number.isNaN(n) ? raw : n);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div
            data-testid="currency-badge"
            className="inline-flex h-10 items-center rounded-md border bg-muted px-3 text-sm tabular-nums text-muted-foreground"
            aria-label="Currency"
          >
            {form.watch('currency') || '—'}
          </div>
        </div>

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <FormControl>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...field}
                >
                  <option value="">Select a category…</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">Defaults to today on the server.</p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="labels"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Labels</FormLabel>
              <FormControl>
                <LabelMultiSelect
                  options={labels}
                  value={field.value ?? []}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : TRANSACTION_KIND_LABELS[kind].submit}
          </Button>
        </DialogFooter>
        {/* mode is consumed only for label/disabling semantics later — referenced
            here so the prop is not flagged as unused in strict mode. */}
        <input type="hidden" value={mode} readOnly aria-hidden />
      </form>
    </FormProvider>
  );
}
```

- [ ] **Step 7.4: Run the tests and confirm green**

Run: `pnpm exec vitest run src/features/transactions/IncomeExpenseForm.test.tsx`
Expected: all pass.

- [ ] **Step 7.5: Commit**

```bash
git add src/features/transactions/IncomeExpenseForm.tsx src/features/transactions/IncomeExpenseForm.test.tsx
git commit -m "feat(transactions): add IncomeExpenseForm shared between income and expense"
```

---

## Task 8 — `TransferForm`

Structurally similar to `IncomeExpenseForm` but with two account pickers and a conditional `exchangeRate` field.

**Files:**

- Create: `src/features/transactions/TransferForm.tsx`
- Create: `src/features/transactions/TransferForm.test.tsx`

- [ ] **Step 8.1: Write the failing tests**

```tsx
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import type { AccountResponse, DictionaryEntryResponse } from '@/api/types';
import { TransferForm } from './TransferForm';

const accounts: AccountResponse[] = [
  {
    id: 'a1',
    name: 'USD acct',
    balance: 100,
    currency: 'USD',
    overdraftLimit: null,
    subtype: null,
    version: 1,
  },
  {
    id: 'a2',
    name: 'EUR acct',
    balance: 0,
    currency: 'EUR',
    overdraftLimit: null,
    subtype: null,
    version: 1,
  },
  {
    id: 'a3',
    name: 'USD2',
    balance: 0,
    currency: 'USD',
    overdraftLimit: null,
    subtype: null,
    version: 1,
  },
];
const labels: DictionaryEntryResponse[] = [];

const defaults = {
  sourceAccountId: 'a1',
  targetAccountId: 'a3',
  amount: 0,
  currency: 'USD',
  description: '',
  exchangeRate: undefined,
  date: '',
  labels: [] as string[],
};

describe('TransferForm', () => {
  it('hides exchangeRate when source/target share a currency', () => {
    renderWithProviders(
      <TransferForm
        mode="create"
        accounts={accounts}
        labels={labels}
        defaultValues={defaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/exchange rate/i)).not.toBeInTheDocument();
  });

  it('shows exchangeRate when source/target differ in currency', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TransferForm
        mode="create"
        accounts={accounts}
        labels={labels}
        defaultValues={defaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await user.selectOptions(screen.getByLabelText(/target account/i), 'a2');
    await waitFor(() => expect(screen.getByLabelText(/exchange rate/i)).toBeInTheDocument());
  });

  it('renders an inline error when source equals target', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TransferForm
        mode="create"
        accounts={accounts}
        labels={labels}
        defaultValues={defaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await user.selectOptions(screen.getByLabelText(/target account/i), 'a1');
    await user.click(screen.getByRole('button', { name: /add transfer/i }));
    expect(await screen.findByText(/must differ/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 8.2: Run the failing tests**

Run: `pnpm exec vitest run src/features/transactions/TransferForm.test.tsx`
Expected: FAIL with module-not-found.

- [ ] **Step 8.3: Implement `TransferForm.tsx`**

```tsx
import { useEffect } from 'react';
import { useForm, FormProvider, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import type { AccountResponse, DictionaryEntryResponse } from '@/api/types';
import { transferFormSchema, type TransferFormValues } from './schema';
import { LabelMultiSelect } from './LabelMultiSelect';
import { TRANSACTION_KIND_LABELS } from './labels';

export interface TransferFormApi {
  setFieldError: (field: string, message: string) => void;
}

export interface TransferFormProps {
  mode: 'create' | 'edit';
  accounts: AccountResponse[];
  labels: DictionaryEntryResponse[];
  defaultValues: TransferFormValues;
  isSubmitting: boolean;
  onSubmit: (values: TransferFormValues) => void | Promise<void>;
  onCancel: () => void;
  onReady?: (api: TransferFormApi) => void;
}

export function TransferForm({
  mode,
  accounts,
  labels,
  defaultValues,
  isSubmitting,
  onSubmit,
  onCancel,
  onReady,
}: TransferFormProps) {
  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema) as Resolver<TransferFormValues>,
    defaultValues,
  });

  const sourceAccountId = form.watch('sourceAccountId');
  const targetAccountId = form.watch('targetAccountId');
  const source = accounts.find((a) => a.id === sourceAccountId);
  const target = accounts.find((a) => a.id === targetAccountId);

  useEffect(() => {
    if (source) form.setValue('currency', source.currency, { shouldDirty: false });
  }, [source, form]);

  useEffect(() => {
    onReady?.({
      setFieldError: (field, message) =>
        form.setError(field as keyof TransferFormValues, { type: 'server', message }),
    });
  }, [form, onReady]);

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  const showExchangeRate = !!source && !!target && source.currency !== target.currency;

  return (
    <FormProvider {...form}>
      <form
        role="form"
        onSubmit={(e) => {
          void submit(e);
        }}
        className="space-y-4"
      >
        <FormField
          control={form.control}
          name="sourceAccountId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Source account</FormLabel>
              <FormControl>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...field}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="targetAccountId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Target account</FormLabel>
              <FormControl>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...field}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-end gap-2">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>Amount</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="any"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={
                      field.value === undefined ||
                      field.value === null ||
                      (typeof field.value === 'number' && Number.isNaN(field.value))
                        ? ''
                        : field.value
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '' || raw === '-') {
                        field.onChange(raw);
                        return;
                      }
                      const n = e.target.valueAsNumber;
                      field.onChange(Number.isNaN(n) ? raw : n);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div
            data-testid="currency-badge"
            className="inline-flex h-10 items-center rounded-md border bg-muted px-3 text-sm tabular-nums text-muted-foreground"
            aria-label="Currency"
          >
            {source?.currency ?? '—'}
          </div>
        </div>

        {showExchangeRate && (
          <FormField
            control={form.control}
            name="exchangeRate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Exchange rate</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="any"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ''}
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '') {
                        field.onChange(undefined);
                        return;
                      }
                      const n = e.target.valueAsNumber;
                      field.onChange(Number.isNaN(n) ? raw : n);
                    }}
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  Optional. Backend uses its default if omitted.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">Defaults to today on the server.</p>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="labels"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Labels</FormLabel>
              <FormControl>
                <LabelMultiSelect
                  options={labels}
                  value={field.value ?? []}
                  onChange={field.onChange}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : TRANSACTION_KIND_LABELS.transfer.submit}
          </Button>
        </DialogFooter>
        <input type="hidden" value={mode} readOnly aria-hidden />
      </form>
    </FormProvider>
  );
}
```

- [ ] **Step 8.4: Run tests and confirm green**

Run: `pnpm exec vitest run src/features/transactions/TransferForm.test.tsx`
Expected: all pass.

- [ ] **Step 8.5: Commit**

```bash
git add src/features/transactions/TransferForm.tsx src/features/transactions/TransferForm.test.tsx
git commit -m "feat(transactions): add TransferForm with conditional exchange rate"
```

---

## Task 9 — Mutation hooks (3 files, one commit)

The three hooks are nearly identical; group them in one commit. No dedicated unit test — they are covered through the dialog tests (Tasks 10–12) where MSW handlers + cache invalidation assertions live.

Verify the query-key shape before writing the hooks:

```bash
grep -n "queryKey" src/features/transactions/useTransactions.ts
```

Expected output line: `queryKey: ['transactions', accountId],`. If the key shape ever changes, the invalidation strings below must change to match — invalidation against a non-existent key is silently a no-op.

**Files:**

- Create: `src/features/transactions/useCreateIncome.ts`
- Create: `src/features/transactions/useCreateExpense.ts`
- Create: `src/features/transactions/useCreateTransfer.ts`

- [ ] **Step 9.1: Write `useCreateIncome.ts`**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '@/api/client';
import { transactionsApi } from '@/api/transactions';
import type { IncomeRequest, TransactionResponse } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

export function useCreateIncome() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<TransactionResponse, Error, IncomeRequest>({
    mutationFn: (body) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return transactionsApi(client).createIncome(body);
    },
    onSuccess: (_tx, body) => {
      void queryClient.invalidateQueries({ queryKey: ['transactions', body.accountId] });
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}
```

- [ ] **Step 9.2: Write `useCreateExpense.ts`** — same shape, swap `createIncome` for `createExpense` and `IncomeRequest` for `ExpenseRequest`. Use the same `['transactions', body.accountId]` + `['accounts']` invalidations.

- [ ] **Step 9.3: Write `useCreateTransfer.ts`**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '@/api/client';
import { transactionsApi } from '@/api/transactions';
import type { InternalTransferRequest, TransactionResponse } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

export function useCreateTransfer() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<TransactionResponse, Error, InternalTransferRequest>({
    mutationFn: (body) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return transactionsApi(client).createTransfer(body);
    },
    onSuccess: (_tx, body) => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['transactions', body.sourceAccountId] });
      void queryClient.invalidateQueries({ queryKey: ['transactions', body.targetAccountId] });
    },
  });
}
```

- [ ] **Step 9.4: Typecheck**

Run: `pnpm typecheck`
Expected: passes.

- [ ] **Step 9.5: Commit**

```bash
git add src/features/transactions/useCreateIncome.ts src/features/transactions/useCreateExpense.ts src/features/transactions/useCreateTransfer.ts
git commit -m "feat(transactions): add create-income/expense/transfer mutation hooks"
```

---

## Task 10 — `CreateIncomeDialog`

The dialog wires the form to the mutation, handles error banner + server field errors, and closes on success.

**Files:**

- Create: `src/features/transactions/CreateIncomeDialog.tsx`
- Create: `src/features/transactions/CreateIncomeDialog.test.tsx`

- [ ] **Step 10.1: Write the failing tests**

```tsx
import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { server } from '@/test/server';
import { CreateIncomeDialog } from './CreateIncomeDialog';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';

const apiBase = 'http://localhost:8080';

function renderDialog(selectedAccountId?: string) {
  return renderWithProviders(
    <AuthProvider>
      <CreateIncomeDialog
        open
        onOpenChange={() => undefined}
        selectedAccountId={selectedAccountId}
      />
    </AuthProvider>,
  );
}

describe('CreateIncomeDialog', () => {
  beforeEach(() => {
    // Same auth bootstrap pattern as src/features/accounts/CreateAccountDialog.test.tsx
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  });

  it('happy path: posts to /api/transactions/income and closes', async () => {
    const onOpenChange = vi.fn();
    renderWithProviders(
      <AuthProvider>
        <CreateIncomeDialog open onOpenChange={onOpenChange} selectedAccountId="a1" />
      </AuthProvider>,
    );

    const user = userEvent.setup();
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '50');
    await user.selectOptions(
      screen.getByLabelText(/category/i),
      /* foodCategoryId */ '00000000-0000-0000-0000-00000000f00d',
    );
    await user.type(screen.getByLabelText(/description/i), 'Salary');
    await user.click(screen.getByRole('button', { name: /add income/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('omits `date` from the request when the date field is empty', async () => {
    let received: any;
    server.use(
      http.post(`${apiBase}/api/transactions/income`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json(
          {
            /* minimal TransactionResponse */
          },
          { status: 200 },
        );
      }),
    );
    // ... fill amount/category/description without touching date, submit ...
    // expect(received.date).toBeUndefined();
  });

  it('surfaces ApiError.fieldErrors under the named field', async () => {
    server.use(
      http.post(`${apiBase}/api/transactions/income`, () =>
        HttpResponse.json(
          { message: 'Bad input', fieldErrors: { amount: 'Must be positive' } },
          { status: 422 },
        ),
      ),
    );
    // ... submit a form with amount=1 ...
    // expect(await screen.findByText('Must be positive')).toBeInTheDocument();
  });

  it('shows a banner on generic 500', async () => {
    server.use(
      http.post(`${apiBase}/api/transactions/income`, () =>
        HttpResponse.json({ message: 'Boom' }, { status: 500 }),
      ),
    );
    // ... submit, assert alert role with /boom/i text ...
  });
});
```

(Test bodies left semi-pseudo for the three branches — fill in following `CreateAccountDialog.test.tsx` patterns. The point of the failing-test step is the API surface: `selectedAccountId` is the only new prop beyond `open`/`onOpenChange`.)

- [ ] **Step 10.2: Run the failing tests**

Run: `pnpm exec vitest run src/features/transactions/CreateIncomeDialog.test.tsx`
Expected: FAIL with module-not-found.

- [ ] **Step 10.3: Implement `CreateIncomeDialog.tsx`**

```tsx
import { useCallback, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ApiError } from '@/api/client';
import type { UUID } from '@/api/types';
import { useAccounts } from '@/features/accounts/useAccounts';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { IncomeExpenseForm, type IncomeExpenseFormApi } from './IncomeExpenseForm';
import { useCreateIncome } from './useCreateIncome';
import { toIncomeRequest } from './schema';
import { TRANSACTION_KIND_LABELS } from './labels';

export interface CreateIncomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAccountId?: UUID;
}

export function CreateIncomeDialog({
  open,
  onOpenChange,
  selectedAccountId,
}: CreateIncomeDialogProps) {
  const { data: accounts } = useAccounts();
  const { data: config } = useConfiguration();
  const create = useCreateIncome();

  const categories = config?.dictionaries.categories?.entries ?? [];
  const labels = config?.dictionaries.labels?.entries ?? [];

  const defaultAccount = accounts?.find((a) => a.id === selectedAccountId) ?? accounts?.[0];

  const defaults = useMemo(
    () => ({
      accountId: defaultAccount?.id ?? '',
      amount: 0,
      currency: defaultAccount?.currency ?? '',
      category: '',
      description: '',
      date: '',
      labels: [] as UUID[],
    }),
    [defaultAccount?.id, defaultAccount?.currency],
  );

  const apiRef = useRef<IncomeExpenseFormApi | null>(null);
  const handleReady = useCallback((api: IncomeExpenseFormApi) => {
    apiRef.current = api;
  }, []);

  const handleSubmit = async (values: Parameters<typeof toIncomeRequest>[0]) => {
    try {
      await create.mutateAsync(toIncomeRequest(values));
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          apiRef.current?.setFieldError(field, message);
        }
      }
    }
  };

  const showBanner =
    create.isError && !(create.error instanceof ApiError && create.error.fieldErrors);
  const bannerMessage =
    create.error instanceof ApiError
      ? create.error.message
      : 'Something went wrong. Please try again.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{TRANSACTION_KIND_LABELS.income.title}</DialogTitle>
          <DialogDescription>
            Record an income transaction to one of your accounts.
          </DialogDescription>
        </DialogHeader>
        {showBanner && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{bannerMessage}</AlertDescription>
          </Alert>
        )}
        {accounts && accounts.length > 0 && (
          <IncomeExpenseForm
            kind="income"
            mode="create"
            accounts={accounts}
            categories={categories}
            labels={labels}
            defaultValues={defaults}
            isSubmitting={create.isPending}
            onSubmit={handleSubmit}
            onCancel={() => onOpenChange(false)}
            onReady={handleReady}
          />
        )}
        {(!accounts || accounts.length === 0) && (
          <div className="p-2 text-sm text-muted-foreground">
            Create an account first to record income.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 10.4: Run the dialog tests and confirm green**

Run: `pnpm exec vitest run src/features/transactions/CreateIncomeDialog.test.tsx`
Expected: all pass.

Auth bootstrap reference: `src/features/accounts/CreateAccountDialog.test.tsx` uses `saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 })` from `@/auth/storage` inside `beforeEach`, wraps the component in `<AuthProvider>` from `@/auth/AuthContext`, and uses `server` from `@/test/server` for per-test handler overrides. Follow that file exactly — no other helpers exist.

- [ ] **Step 10.5: Commit**

```bash
git add src/features/transactions/CreateIncomeDialog.tsx src/features/transactions/CreateIncomeDialog.test.tsx
git commit -m "feat(transactions): add CreateIncomeDialog"
```

---

## Task 11 — `CreateExpenseDialog`

Structurally identical to `CreateIncomeDialog`. Differences:

- Title: `TRANSACTION_KIND_LABELS.expense.title`.
- Mutation: `useCreateExpense`.
- Mapper: `toExpenseRequest`.
- Form prop `kind="expense"`.

**Files:**

- Create: `src/features/transactions/CreateExpenseDialog.tsx`
- Create: `src/features/transactions/CreateExpenseDialog.test.tsx`

- [ ] **Step 11.1: Write the failing tests** — mirror `CreateIncomeDialog.test.tsx`, asserting the POST hits `/api/transactions/expense`.
- [ ] **Step 11.2: Run failing tests**
- [ ] **Step 11.3: Implement `CreateExpenseDialog.tsx`** — copy the income dialog, swap the four differences listed above.
- [ ] **Step 11.4: Run tests, confirm green**
- [ ] **Step 11.5: Commit**

```bash
git add src/features/transactions/CreateExpenseDialog.tsx src/features/transactions/CreateExpenseDialog.test.tsx
git commit -m "feat(transactions): add CreateExpenseDialog"
```

---

## Task 12 — `CreateTransferDialog`

**Files:**

- Create: `src/features/transactions/CreateTransferDialog.tsx`
- Create: `src/features/transactions/CreateTransferDialog.test.tsx`

- [ ] **Step 12.1: Write the failing tests**

Cover:

1. Happy path posts to `/api/transactions/transfer` with both account IDs and closes the dialog.
2. When source and target currencies differ, the request body includes `exchangeRate` (when the user fills it).
3. When source and target currencies match, the request body has `exchangeRate: undefined` regardless of any earlier input.
4. Field errors and banner mirroring `CreateIncomeDialog.test.tsx`.

- [ ] **Step 12.2: Run failing tests** — expect module-not-found.

- [ ] **Step 12.3: Implement `CreateTransferDialog.tsx`**

Copy `CreateIncomeDialog.tsx`. Differences:

- Use `TransferForm` and `TransferFormValues`.
- Use `useCreateTransfer` and `toTransferRequest`.
- The form needs two currencies for the mapper. Compute them from the values in the submit handler:

```ts
const handleSubmit = async (values: TransferFormValues) => {
  const source = accounts!.find((a) => a.id === values.sourceAccountId);
  const target = accounts!.find((a) => a.id === values.targetAccountId);
  if (!source || !target) return; // schema guards make this unreachable
  try {
    await create.mutateAsync(toTransferRequest(values, source.currency, target.currency));
    onOpenChange(false);
  } catch (e) {
    if (e instanceof ApiError && e.fieldErrors) {
      for (const [field, message] of Object.entries(e.fieldErrors)) {
        apiRef.current?.setFieldError(field, message);
      }
    }
  }
};
```

- `defaultValues` should default `sourceAccountId` to `selectedAccountId ?? accounts[0].id` and `targetAccountId` to the first account that differs (`accounts.find(a => a.id !== sourceAccountId)`).
- Render the empty state "Create at least two accounts first to make a transfer." when fewer than 2 accounts exist.

- [ ] **Step 12.4: Run tests, confirm green**
- [ ] **Step 12.5: Commit**

```bash
git add src/features/transactions/CreateTransferDialog.tsx src/features/transactions/CreateTransferDialog.test.tsx
git commit -m "feat(transactions): add CreateTransferDialog"
```

---

## Task 13 — `ControlBar`

**Files:**

- Create: `src/features/transactions/ControlBar.tsx`
- Create: `src/features/transactions/ControlBar.test.tsx`

- [ ] **Step 13.1: Write the failing tests**

```tsx
import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { ControlBar } from './ControlBar';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';

describe('ControlBar', () => {
  it('renders three icon buttons', () => {
    renderWithProviders(
      <AuthProvider>
        <ControlBar selectedAccountId={undefined} />
      </AuthProvider>,
    );
    expect(screen.getByRole('button', { name: /add income/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add expense/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add transfer/i })).toBeInTheDocument();
  });

  it('opens the income dialog when the income button is clicked', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AuthProvider>
        <ControlBar selectedAccountId={undefined} />
      </AuthProvider>,
    );
    // NOTE: once the dialog is open there are TWO accessible elements with
    // name /add income/i — the trigger icon button (still in the DOM) and
    // the submit button inside the dialog. Click the trigger first, then
    // identify everything else by `within(dialog)`.
    await user.click(screen.getByRole('button', { name: /add income/i }));
    const dialog = await screen.findByRole('dialog', { name: /add income/i });
    expect(dialog).toBeInTheDocument();
  });

  it('opens expense and transfer dialogs independently', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <AuthProvider>
        <ControlBar selectedAccountId={undefined} />
      </AuthProvider>,
    );
    await user.click(screen.getByRole('button', { name: /add expense/i }));
    expect(await screen.findByRole('dialog', { name: /add expense/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 13.2: Run failing tests**

- [ ] **Step 13.3: Implement `ControlBar.tsx`**

```tsx
import { useState } from 'react';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { UUID } from '@/api/types';
import { CreateIncomeDialog } from './CreateIncomeDialog';
import { CreateExpenseDialog } from './CreateExpenseDialog';
import { CreateTransferDialog } from './CreateTransferDialog';

export interface ControlBarProps {
  selectedAccountId?: UUID;
}

export function ControlBar({ selectedAccountId }: ControlBarProps) {
  const [openIncome, setOpenIncome] = useState(false);
  const [openExpense, setOpenExpense] = useState(false);
  const [openTransfer, setOpenTransfer] = useState(false);
  return (
    <>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">Transactions</span>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label="Add income"
            onClick={() => setOpenIncome(true)}
            className="h-7 w-7"
          >
            <ArrowDownToLine className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Add expense"
            onClick={() => setOpenExpense(true)}
            className="h-7 w-7"
          >
            <ArrowUpFromLine className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="Add transfer"
            onClick={() => setOpenTransfer(true)}
            className="h-7 w-7"
          >
            <ArrowLeftRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <CreateIncomeDialog
        open={openIncome}
        onOpenChange={setOpenIncome}
        selectedAccountId={selectedAccountId}
      />
      <CreateExpenseDialog
        open={openExpense}
        onOpenChange={setOpenExpense}
        selectedAccountId={selectedAccountId}
      />
      <CreateTransferDialog
        open={openTransfer}
        onOpenChange={setOpenTransfer}
        selectedAccountId={selectedAccountId}
      />
    </>
  );
}
```

- [ ] **Step 13.4: Run tests, confirm green**
- [ ] **Step 13.5: Commit**

```bash
git add src/features/transactions/ControlBar.tsx src/features/transactions/ControlBar.test.tsx
git commit -m "feat(transactions): add ControlBar with three create buttons"
```

---

## Task 14 — Wire `ControlBar` into `TransactionsPane`

**Files:**

- Modify: `src/features/transactions/TransactionsPane.tsx`
- Modify: `src/features/transactions/TransactionsPane.test.tsx`

- [ ] **Step 14.1: Write the failing test**

In `TransactionsPane.test.tsx` add (or expand) cases:

```ts
it('renders the control bar even when no account is selected', () => {
  // render <TransactionsPane /> with no /:id route param
  expect(screen.getByRole('button', { name: /add income/i })).toBeInTheDocument();
});

it('passes the selected account id into the control bar dialogs', async () => {
  // render at /accounts/a1, click "Add income", verify the account selector
  // defaults to the account named "Checking" (the fixture account).
});
```

- [ ] **Step 14.2: Run the failing test**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx`
Expected: the new cases fail.

- [ ] **Step 14.3: Modify `TransactionsPane.tsx`**

The current file (lines 23–24) early-returns when no account is selected:

```tsx
if (!id) return <div className="p-6 text-muted-foreground">Select an account.</div>;
```

That branch must be **folded into the body** so the ControlBar still renders in the no-account case (spec §3.1 requires the bar even with no account selected; the new Task 14.1 test enforces this). Replace the early return with a body branch, and render `<ControlBar selectedAccountId={id} />` above everything:

```tsx
let body: ReactNode;
if (!id) {
  body = <div className="p-6 text-muted-foreground">Select an account.</div>;
} else if (isLoading) {
  body = /* unchanged */;
} else if (isError) {
  body = /* unchanged */;
} else if (!data || data.length === 0) {
  body = /* unchanged */;
} else {
  body = /* unchanged */;
}

return (
  <>
    <ControlBar selectedAccountId={id} />
    {header}
    {body}
  </>
);
```

(Add the import; the `header` calculation already guards on `account` so it stays the same.)

- [ ] **Step 14.4: Run the full transactions test suite, confirm green**

Run: `pnpm exec vitest run src/features/transactions`
Expected: all pass.

- [ ] **Step 14.5: Commit**

```bash
git add src/features/transactions/TransactionsPane.tsx src/features/transactions/TransactionsPane.test.tsx
git commit -m "feat(transactions): mount ControlBar in TransactionsPane"
```

---

## Task 15 — Playwright happy-path e2e

**Files:**

- Create: `e2e/create-transaction.spec.ts`

- [ ] **Step 15.1: Write the spec**

```ts
import { test, expect } from '@playwright/test';

// Smoke: a signed-in user creates an expense against an existing account.
// The dev server is auto-started by playwright.config.ts; this spec relies on
// the dev MSW/back-end being available. If the backend is down locally, this
// test will skip via the test.skip pattern below.
test('create expense from TransactionsPane', async ({ page }) => {
  await page.goto('/app/');
  // The MVP fixture login flow varies — follow the e2e bootstrap that other
  // specs use (see e2e/*.spec.ts). The point of this spec is the path:
  //   1. open an account
  //   2. click "Add expense"
  //   3. fill amount + category + description
  //   4. submit
  //   5. expect the new row in the transactions list
  await page.getByRole('link', { name: /checking/i }).click();
  await page.getByRole('button', { name: /add expense/i }).click();
  await page.getByLabel(/amount/i).fill('9.99');
  await page.getByLabel(/category/i).selectOption({ label: 'Food' });
  await page.getByLabel(/description/i).fill('Coffee');
  await page
    .getByRole('button', { name: /add expense/i })
    .last()
    .click();
  await expect(page.getByText('Coffee')).toBeVisible();
});
```

Reference for the auth bootstrap: `e2e/smoke.spec.ts` is the only existing e2e spec — copy its login/setup helpers (it walks through the sign-in UI; do the same here before the click-through). Do not invent a new pattern.

- [ ] **Step 15.2: Run the spec**

Run: `just e2e`
Expected: passes against the live dev server.

- [ ] **Step 15.3: Commit**

```bash
git add e2e/create-transaction.spec.ts
git commit -m "test(transactions): add Playwright happy path for creating an expense"
```

---

## Task 16 — Final verification

- [ ] **Step 16.1: Full lint + typecheck + format-check + tests**

Run: `just check && just test`
Expected: passes.

- [ ] **Step 16.2: Production build**

Run: `just build`
Expected: passes; assets emitted under `dist/`.

- [ ] **Step 16.3: Manual smoke (REQUIRED — UI feature)**

Per project CLAUDE.md: "For UI or frontend changes, start the dev server and use the feature in a browser before reporting the task as complete." Start dev server with `just run`, then:

1. Sign in.
2. Open an account in `TransactionsPane`.
3. Verify the new control bar renders with three icon buttons (income / expense / transfer) and that each button has a visible `title`/`aria-label`.
4. Click **Add expense**, fill the form (amount, category, description, optional date), submit. Confirm the dialog closes and the new transaction appears in the list.
5. Repeat for **Add income**.
6. **Add transfer**: switch the target account to one with a different currency; verify the **Exchange rate** field appears; switch back, verify it disappears. Submit a same-currency transfer and confirm the row appears for both source and target accounts.
7. Clear the date field, submit, verify backend accepts (server-time default).
8. Provoke a server error path (e.g., negative amount via DevTools) and verify the field-error vs banner branching.

- [ ] **Step 16.4: Push and update the draft PR**

Run: `git push`
Then on the PR (`#18`): walk down the test plan checklist, ticking each completed item, and remove the draft status when the human gives the OK.

---

## Out-of-scope reminders (do not implement)

These are explicitly deferred per the spec's §1.3:

- Editing existing transactions (description / date / allocations / labels / amendment endpoints).
- Cancelling/deleting transactions.
- Multi-allocation income/expense.
- Foreign-currency income/expense.
- Free-text categories.
- Playwright coverage of transfer/income (one spec — expense — is enough for MVP).

If any of these become attractive while implementing, log them as follow-up issues and resist scope creep.
