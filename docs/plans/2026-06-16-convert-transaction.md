# Convert Transaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user change a completed transaction's kind in place (Income ↔ Expense ↔ Transfer) via a "Convert to" context-menu submenu, issuing a single cross-kind amendment.

**Architecture:** A new additive `ConvertTransactionDialog` mirrors `CopyTransactionDialog`'s structure but submits through the existing `useEditTransaction` mutation (`amend` endpoint) instead of the create hooks. Pure helpers in a new `convertTransaction.ts` seed the target-kind form from the source transaction (per the §4 conversion table) and build the `AmendTransactionRequest` (with `newAllocations` carried **inline**, as a true cross-kind change requires). The backend derives the new kind structurally from the `(source, target)` account-type pair, so "convert" is just an amend with a new leg pair. `TransactionsPane` gains a `ContextMenuSub` listing the two valid target kinds. The amend field-error mappers currently private to `EditTransactionDialog` are extracted to a shared module so both dialogs reuse them.

**Tech Stack:** React 18 + TypeScript, react-hook-form + Zod, TanStack Query, shadcn/ui (Radix), Vitest + Testing Library + MSW. Run commands with `pnpm` (or `just`).

**Spec:** `docs/specs/2026-06-16-convert-transaction-design.md`

**Conventions to follow:**

- Tests live next to code (`*.test.ts[x]`). Render via `renderWithProviders` from `@/test/utils`; wrap in `AuthProvider` and call `saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 })` to authenticate (never mutate `localStorage` directly).
- Default MSW handlers in `src/test/handlers.ts` already mock `PUT /api/transactions/:id/amendment`, `PATCH /api/transactions/:id/allocations`, `GET /api/transactions`, `GET /api/accounts`, `GET /api/users/me` (returns `profileFixture`, `externalAccountId: 'ext-1'`), and `GET /api/users/me/configuration` (returns `configurationFixture`, whose `banking.defaultIncomeCategory`/`defaultExpenseCategory` are `null`). Use `server.use(...)` for per-test overrides.
- REQUIRED SUB-SKILL: superpowers:test-driven-development — write the failing test first, watch it fail, implement minimally, watch it pass, commit.

**Key backend facts (verified against `server-infra`):**

- Kind is derived from `(source, target)` account types: `Regular→External`=Expense, `External→Regular`=Income, `Regular→Regular`=Transfer (`Domain/Core/Types.hs` `deriveTransactionKind`).
- On a cross-kind change the backend requires `newAllocations` **inside** the amend request (`AmendTransactionRequest.newAllocations`), not via the separate `PATCH /allocations`. For Income the allocations sum/currency must match the **target** amount; for Expense the **source** amount.
- `Adjustment` cannot be an amendment source or target; amendment requires `Completed` status.

---

### Task 1: Add `convertTitle` labels

**Files:**

- Modify: `src/features/transactions/labels.ts`

- [ ] **Step 1: Add a `convertTitle` to each kind**

Edit `TRANSACTION_KIND_LABELS` so each kind gains a `convertTitle` (place it next to `copyTitle`):

```ts
export const TRANSACTION_KIND_LABELS = {
  income: {
    title: 'Add income',
    submit: 'OK',
    aria: 'Add income',
    editTitle: 'Edit income',
    editSubmit: 'OK',
    copyTitle: 'Copy income',
    convertTitle: 'Convert to income',
  },
  expense: {
    title: 'Add expense',
    submit: 'OK',
    aria: 'Add expense',
    editTitle: 'Edit expense',
    editSubmit: 'OK',
    copyTitle: 'Copy expense',
    convertTitle: 'Convert to expense',
  },
  transfer: {
    title: 'Add transfer',
    submit: 'OK',
    aria: 'Add transfer',
    editTitle: 'Edit transfer',
    editSubmit: 'OK',
    copyTitle: 'Copy transfer',
    convertTitle: 'Convert to transfer',
  },
} as const;
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/features/transactions/labels.ts
git commit -m "feat(transactions): add convertTitle labels for convert dialog (#20)"
```

---

### Task 2: Extract shared amend field-error mappers

`EditTransactionDialog` defines `mapIncomeExpenseFieldError` and `mapTransferFieldError` privately. The convert dialog needs the exact same mapping (the amend endpoint returns the same backend field names). Move them to a shared module and re-import in Edit so there is a single source of truth.

**Files:**

- Create: `src/features/transactions/amendmentFieldErrors.ts`
- Test: `src/features/transactions/amendmentFieldErrors.test.ts`
- Modify: `src/features/transactions/EditTransactionDialog.tsx` (remove the two local functions; import them instead)

- [ ] **Step 1: Write the failing test**

Create `src/features/transactions/amendmentFieldErrors.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mapIncomeExpenseFieldError, mapTransferFieldError } from './amendmentFieldErrors';

describe('mapIncomeExpenseFieldError', () => {
  it('maps amount-bearing backend fields to the amount field', () => {
    for (const f of [
      'sourceAmount',
      'targetAmount',
      'sourceCurrency',
      'targetCurrency',
      'exchangeRate',
    ]) {
      expect(mapIncomeExpenseFieldError(f, 'expense')).toBe('amount');
    }
  });
  it('maps allocations to category and dates/labels/description through', () => {
    expect(mapIncomeExpenseFieldError('newAllocations', 'income')).toBe('category');
    expect(mapIncomeExpenseFieldError('at', 'income')).toBe('date');
    expect(mapIncomeExpenseFieldError('labels', 'income')).toBe('labels');
    expect(mapIncomeExpenseFieldError('description', 'income')).toBe('description');
  });
  it('maps the account leg per kind', () => {
    expect(mapIncomeExpenseFieldError('sourceAccountId', 'expense')).toBe('accountId');
    expect(mapIncomeExpenseFieldError('sourceAccountId', 'income')).toBeNull();
    expect(mapIncomeExpenseFieldError('targetAccountId', 'income')).toBe('accountId');
    expect(mapIncomeExpenseFieldError('targetAccountId', 'expense')).toBeNull();
  });
});

describe('mapTransferFieldError', () => {
  it('maps transfer leg and rate fields', () => {
    expect(mapTransferFieldError('sourceAccountId')).toBe('sourceAccountId');
    expect(mapTransferFieldError('targetAccountId')).toBe('targetAccountId');
    expect(mapTransferFieldError('exchangeRate')).toBe('exchangeRate');
    expect(mapTransferFieldError('sourceAmount')).toBe('amount');
    expect(mapTransferFieldError('nope')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/amendmentFieldErrors.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the shared module**

Create `src/features/transactions/amendmentFieldErrors.ts` by moving the two functions verbatim from `EditTransactionDialog.tsx` (lines ~317-365):

```ts
// Maps backend amend/allocation field names to the matching form field. Shared
// by EditTransactionDialog and ConvertTransactionDialog (both submit `amend`).

export function mapIncomeExpenseFieldError(
  field: string,
  kind: 'income' | 'expense',
): string | null {
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

export function mapTransferFieldError(field: string): string | null {
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

- [ ] **Step 4: Update `EditTransactionDialog.tsx` to import instead of define**

Delete the two `function mapIncomeExpenseFieldError(...)` and `function mapTransferFieldError(...)` definitions at the bottom of `EditTransactionDialog.tsx`, and add to its imports (next to the other `./` imports):

```ts
import { mapIncomeExpenseFieldError, mapTransferFieldError } from './amendmentFieldErrors';
```

- [ ] **Step 5: Run the new test and the existing edit tests**

Run: `pnpm exec vitest run src/features/transactions/amendmentFieldErrors.test.ts src/features/transactions/EditTransactionDialog.test.tsx`
Expected: PASS (the move is behavior-preserving; edit tests still pass).

- [ ] **Step 6: Typecheck + commit**

```bash
pnpm typecheck
git add src/features/transactions/amendmentFieldErrors.ts src/features/transactions/amendmentFieldErrors.test.ts src/features/transactions/EditTransactionDialog.tsx
git commit -m "refactor(transactions): extract shared amend field-error mappers (#20)"
```

---

### Task 3: Conversion helpers (`convertTransaction.ts`)

Pure, fully unit-testable functions: seed the target-kind form from the source, and build the cross-kind `AmendTransactionRequest`. This is where the §4 table lives.

**Files:**

- Create: `src/features/transactions/convertTransaction.ts`
- Test: `src/features/transactions/convertTransaction.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/transactions/convertTransaction.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { AccountResponse, TransactionResponse } from '@/api/types';
import {
  toConvertIncomeExpenseDefaults,
  toConvertTransferDefaults,
  toIncomeExpenseAmendment,
  toTransferAmendment,
} from './convertTransaction';

const EXT = 'ext-1';
const A = 'acc-A';
const B = 'acc-B';

const accounts: AccountResponse[] = [
  {
    id: A,
    name: 'A',
    balance: 0,
    currency: 'USD',
    overdraftLimit: null,
    subtype: { type: 'cash' },
    status: 'Opened',
    version: 1,
  },
  {
    id: B,
    name: 'B',
    balance: 0,
    currency: 'EUR',
    overdraftLimit: null,
    subtype: { type: 'cash' },
    status: 'Opened',
    version: 1,
  },
];

const base: TransactionResponse = {
  id: 'tx-1',
  sourceAccountId: A,
  targetAccountId: EXT,
  sourceAmount: -42,
  sourceCurrency: 'USD',
  targetAmount: -42,
  targetCurrency: 'USD',
  exchangeRate: null,
  description: 'Lunch',
  status: 'Completed',
  failureReason: null,
  transactionType: 'expense',
  category: 'cat-x',
  date: '2026-01-15T08:00:00.000Z',
  labels: ['lbl-1'],
  amendmentCount: 0,
};

describe('toConvertIncomeExpenseDefaults', () => {
  it('expense → income keeps the source (regular) leg and seeds the default category', () => {
    const d = toConvertIncomeExpenseDefaults(base, 'income', accounts, 'def-income');
    expect(d.accountId).toBe(A);
    expect(d.amount).toBe(42); // magnitude
    expect(d.currency).toBe('USD');
    expect(d.category).toBe('def-income');
    expect(d.description).toBe('Lunch');
    expect(d.labels).toEqual(['lbl-1']);
  });

  it('income → expense keeps the target (regular) leg', () => {
    const income: TransactionResponse = {
      ...base,
      transactionType: 'income',
      sourceAccountId: EXT,
      targetAccountId: B,
      sourceAmount: 100,
      targetAmount: 100,
      sourceCurrency: 'EUR',
      targetCurrency: 'EUR',
    };
    const d = toConvertIncomeExpenseDefaults(income, 'expense', accounts, 'def-expense');
    expect(d.accountId).toBe(B);
    expect(d.amount).toBe(100);
    expect(d.currency).toBe('EUR');
    expect(d.category).toBe('def-expense');
  });

  it('transfer → income keeps the "to" leg; transfer → expense keeps the "from" leg', () => {
    const transfer: TransactionResponse = {
      ...base,
      transactionType: 'transfer',
      sourceAccountId: A,
      targetAccountId: B,
      sourceAmount: 30,
      targetAmount: 30,
      sourceCurrency: 'USD',
      targetCurrency: 'EUR',
      category: null,
    };
    expect(toConvertIncomeExpenseDefaults(transfer, 'income', accounts, null).accountId).toBe(B);
    expect(toConvertIncomeExpenseDefaults(transfer, 'expense', accounts, null).accountId).toBe(A);
  });

  it('falls back to an empty category when no default is configured', () => {
    expect(toConvertIncomeExpenseDefaults(base, 'income', accounts, null).category).toBe('');
  });
});

describe('toConvertTransferDefaults', () => {
  it('expense → transfer keeps the source leg and leaves the target empty', () => {
    const d = toConvertTransferDefaults(base, accounts);
    expect(d.sourceAccountId).toBe(A);
    expect(d.targetAccountId).toBe('');
    expect(d.amount).toBe(42);
    expect(d.currency).toBe('USD');
  });

  it('income → transfer keeps the target leg and leaves the source empty', () => {
    const income: TransactionResponse = {
      ...base,
      transactionType: 'income',
      sourceAccountId: EXT,
      targetAccountId: B,
      sourceAmount: 100,
      targetAmount: 100,
      sourceCurrency: 'EUR',
      targetCurrency: 'EUR',
    };
    const d = toConvertTransferDefaults(income, accounts);
    expect(d.sourceAccountId).toBe('');
    expect(d.targetAccountId).toBe(B);
    expect(d.amount).toBe(100);
  });
});

describe('toIncomeExpenseAmendment', () => {
  it('income orients External→Regular and puts the slice in the incomes bucket', () => {
    const a = toIncomeExpenseAmendment(
      'income',
      {
        accountId: A,
        amount: 42,
        currency: 'USD',
        category: 'c',
        description: '',
        date: undefined,
        labels: [],
      },
      EXT,
    );
    expect(a.sourceAccountId).toBe(EXT);
    expect(a.targetAccountId).toBe(A);
    expect(a.targetAmount).toBe(42);
    expect(a.newAllocations).toEqual({
      incomes: [{ categoryId: 'c', amount: { amount: 42, currency: 'USD' } }],
      expenses: [],
    });
  });

  it('expense orients Regular→External and puts the slice in the expenses bucket', () => {
    const a = toIncomeExpenseAmendment(
      'expense',
      {
        accountId: A,
        amount: 42,
        currency: 'USD',
        category: 'c',
        description: '',
        date: undefined,
        labels: [],
      },
      EXT,
    );
    expect(a.sourceAccountId).toBe(A);
    expect(a.targetAccountId).toBe(EXT);
    expect(a.newAllocations).toEqual({
      incomes: [],
      expenses: [{ categoryId: 'c', amount: { amount: 42, currency: 'USD' } }],
    });
  });
});

describe('toTransferAmendment', () => {
  it('same-currency transfer omits the exchange rate', () => {
    const a = toTransferAmendment(
      {
        sourceAccountId: A,
        targetAccountId: B,
        amount: 50,
        currency: 'USD',
        exchangeRate: undefined,
        description: '',
        date: undefined,
        labels: [],
      },
      'USD',
      'USD',
    );
    expect(a).toMatchObject({
      sourceAccountId: A,
      targetAccountId: B,
      sourceAmount: 50,
      targetAmount: 50,
    });
    expect(a.exchangeRate).toBeUndefined();
    expect(a.newAllocations).toBeUndefined();
  });

  it('cross-currency transfer applies the exchange rate to the target amount', () => {
    const a = toTransferAmendment(
      {
        sourceAccountId: A,
        targetAccountId: B,
        amount: 50,
        currency: 'USD',
        exchangeRate: 2,
        description: '',
        date: undefined,
        labels: [],
      },
      'USD',
      'EUR',
    );
    expect(a.sourceAmount).toBe(50);
    expect(a.targetAmount).toBe(100);
    expect(a.exchangeRate).toBe(2);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/convertTransaction.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `convertTransaction.ts`**

Create `src/features/transactions/convertTransaction.ts`:

```ts
import type {
  AccountResponse,
  AmendTransactionRequest,
  TransactionResponse,
  UUID,
} from '@/api/types';
import { wireToDateInput } from '@/lib/dates';
import type { IncomeExpenseFormValues, TransferFormValues } from './schema';
import { isExpense, isIncome } from './transactionType';

// Seed a target-kind income/expense form from a source transaction. The "kept"
// regular leg follows the §4 table:
//   expense → income : keep source ; transfer → income : keep target ("to")
//   income  → expense: keep target ; transfer → expense: keep source ("from")
// Category seeds from the target-kind default (banking default for now, see #41);
// a categorised source's own category is NOT carried across (different dictionary).
export function toConvertIncomeExpenseDefaults(
  tx: TransactionResponse,
  targetKind: 'income' | 'expense',
  accounts: AccountResponse[],
  defaultCategory: UUID | null,
): IncomeExpenseFormValues {
  const keepSource =
    targetKind === 'income' ? isExpense(tx.transactionType) : !isIncome(tx.transactionType);
  const accountId = keepSource ? tx.sourceAccountId : tx.targetAccountId;
  const amount = Math.abs(keepSource ? tx.sourceAmount : tx.targetAmount);
  const currency =
    accounts.find((a) => a.id === accountId)?.currency ??
    (keepSource ? tx.sourceCurrency : tx.targetCurrency);
  return {
    accountId,
    amount,
    currency,
    category: defaultCategory ?? '',
    description: tx.description,
    date: wireToDateInput(tx.date),
    labels: tx.labels,
  };
}

// Seed a transfer form from an income/expense source. The kept regular leg
// becomes the source (from expense) or target (from income); the counterparty is
// left empty for the user to pick. Only income/expense can convert to transfer.
export function toConvertTransferDefaults(
  tx: TransactionResponse,
  accounts: AccountResponse[],
): TransferFormValues {
  const fromExpense = isExpense(tx.transactionType);
  const keptId = fromExpense ? tx.sourceAccountId : tx.targetAccountId;
  const amount = Math.abs(fromExpense ? tx.sourceAmount : tx.targetAmount);
  const currency =
    accounts.find((a) => a.id === keptId)?.currency ??
    (fromExpense ? tx.sourceCurrency : tx.targetCurrency);
  return {
    sourceAccountId: fromExpense ? keptId : '',
    targetAccountId: fromExpense ? '' : keptId,
    amount,
    currency,
    exchangeRate: undefined,
    description: tx.description,
    date: wireToDateInput(tx.date),
    labels: tx.labels,
  };
}

// Build a cross-kind amend request for an income/expense target. `newAllocations`
// is carried INLINE (a true cross-kind change requires it; the separate
// PATCH /allocations is only for within-kind edits). Income/expense are
// single-currency, so both legs share the account amount/currency.
export function toIncomeExpenseAmendment(
  targetKind: 'income' | 'expense',
  v: IncomeExpenseFormValues,
  externalAccountId: UUID,
): AmendTransactionRequest {
  const income = targetKind === 'income';
  const slice = { categoryId: v.category, amount: { amount: v.amount, currency: v.currency } };
  return {
    sourceAccountId: income ? externalAccountId : v.accountId,
    targetAccountId: income ? v.accountId : externalAccountId,
    sourceAmount: v.amount,
    sourceCurrency: v.currency,
    targetAmount: v.amount,
    targetCurrency: v.currency,
    newAllocations: income
      ? { incomes: [slice], expenses: [] }
      : { incomes: [], expenses: [slice] },
  };
}

// Build a cross-kind amend request for a transfer target. Like diffTransfer, the
// target amount is the source amount scaled by the rate when cross-currency —
// but here cross-currency is keyed off the PICKED accounts' currencies (passed
// in by the dialog), not the source tx's, since the source is a single-currency
// income/expense.
export function toTransferAmendment(
  v: TransferFormValues,
  sourceCurrency: string,
  targetCurrency: string,
): AmendTransactionRequest {
  const crossCurrency = sourceCurrency !== targetCurrency;
  return {
    sourceAccountId: v.sourceAccountId,
    targetAccountId: v.targetAccountId,
    sourceAmount: v.amount,
    sourceCurrency,
    targetAmount: crossCurrency ? v.amount * (v.exchangeRate ?? 1) : v.amount,
    targetCurrency,
    ...(crossCurrency && v.exchangeRate !== undefined ? { exchangeRate: v.exchangeRate } : {}),
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/convertTransaction.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + lint + commit**

```bash
pnpm typecheck && pnpm exec eslint src/features/transactions/convertTransaction.ts src/features/transactions/convertTransaction.test.ts
git add src/features/transactions/convertTransaction.ts src/features/transactions/convertTransaction.test.ts
git commit -m "feat(transactions): add convert seeding + amendment builders (#20)"
```

---

### Task 4: `ConvertTransactionDialog` component

**Files:**

- Create: `src/features/transactions/ConvertTransactionDialog.tsx`
- Test: `src/features/transactions/ConvertTransactionDialog.test.tsx`

- [ ] **Step 1: Write the failing test file**

Create `src/features/transactions/ConvertTransactionDialog.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import {
  configurationFixture,
  foodCategoryId,
  salaryCategoryId,
  tripLabelId,
} from '@/test/fixtures';
import type { TransactionResponse } from '@/api/types';
import type { TransactionKind } from './labels';
import { ConvertTransactionDialog } from './ConvertTransactionDialog';

const apiBase = 'http://localhost:8080';
const accountA = '00000000-0000-0000-0000-000000000001';
const accountB = '00000000-0000-0000-0000-000000000002';
const external = 'ext-1'; // matches profileFixture.externalAccountId

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  server.use(
    http.get(`${apiBase}/api/accounts`, () =>
      HttpResponse.json({
        accounts: [
          {
            id: accountA,
            name: 'Checking',
            balance: 1000,
            currency: 'USD',
            overdraftLimit: null,
            subtype: { type: 'bankAccount', bankName: 'ACME' },
            status: 'Opened',
            version: 1,
          },
          {
            id: accountB,
            name: 'Savings',
            balance: 50,
            currency: 'USD',
            overdraftLimit: null,
            subtype: { type: 'bankAccount', bankName: 'ACME' },
            status: 'Opened',
            version: 1,
          },
        ],
        totalCount: 2,
      }),
    ),
    // Default config has null banking defaults; override with a default expense category.
    http.get(`${apiBase}/api/users/me/configuration`, () =>
      HttpResponse.json({
        ...configurationFixture,
        banking: {
          ...configurationFixture.banking,
          defaultExpenseCategory: foodCategoryId,
          defaultIncomeCategory: salaryCategoryId,
        },
      }),
    ),
  );
});

const expenseSource: TransactionResponse = {
  id: 'src-expense',
  sourceAccountId: accountA,
  targetAccountId: external,
  sourceAmount: -42,
  sourceCurrency: 'USD',
  targetAmount: -42,
  targetCurrency: 'USD',
  exchangeRate: null,
  description: 'Lunch',
  status: 'Completed',
  failureReason: null,
  transactionType: 'expense',
  category: foodCategoryId,
  date: '2026-01-15T08:00:00.000Z',
  labels: [tripLabelId],
  amendmentCount: 0,
};

function Wrapper({ tx, targetKind }: { tx: TransactionResponse; targetKind: TransactionKind }) {
  const [open, setOpen] = useState(true);
  return (
    <AuthProvider>
      <ConvertTransactionDialog
        open={open}
        onOpenChange={setOpen}
        tx={tx}
        targetKind={targetKind}
      />
    </AuthProvider>
  );
}

describe('ConvertTransactionDialog', () => {
  it('converts an expense to income: External→Regular legs + income allocations, seeded default category', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> = {};
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...expenseSource, transactionType: 'income' });
      }),
    );

    renderWithProviders(<Wrapper tx={expenseSource} targetKind="income" />, { initialPath: '/' });

    expect(await screen.findByRole('dialog', { name: /convert to income/i })).toBeInTheDocument();
    await screen.findByLabelText(/account/i);
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(Object.keys(body).length).toBeGreaterThan(0));
    expect(body.sourceAccountId).toBe(external);
    expect(body.targetAccountId).toBe(accountA);
    expect(body.targetAmount).toBe(42);
    expect((body.newAllocations as { incomes: unknown[] }).incomes).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('does not send description/date/labels when the user only converts', async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, () => {
        calls.push('amend');
        return HttpResponse.json({ ...expenseSource, transactionType: 'income' });
      }),
      http.put(`${apiBase}/api/transactions/:id/description`, () => {
        calls.push('description');
        return HttpResponse.json(expenseSource);
      }),
      http.put(`${apiBase}/api/transactions/:id/date`, () => {
        calls.push('date');
        return HttpResponse.json(expenseSource);
      }),
      http.put(`${apiBase}/api/transactions/:id/labels`, () => {
        calls.push('labels');
        return HttpResponse.json(expenseSource);
      }),
    );
    renderWithProviders(<Wrapper tx={expenseSource} targetKind="income" />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(calls).toContain('amend'));
    expect(calls).toEqual(['amend']);
  });

  it('leaves the category empty (required) when no banking default is set', async () => {
    server.use(
      http.get(`${apiBase}/api/users/me/configuration`, () =>
        HttpResponse.json(configurationFixture),
      ),
    );
    renderWithProviders(<Wrapper tx={expenseSource} targetKind="income" />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);
    // Category combobox shows its placeholder, not a selected value.
    expect(await screen.findByText(/select a category/i)).toBeInTheDocument();
  });

  it('converts a transfer to expense keeping the "from" leg', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> = {};
    const transferSource: TransactionResponse = {
      ...expenseSource,
      id: 'src-transfer',
      transactionType: 'transfer',
      sourceAccountId: accountA,
      targetAccountId: accountB,
      sourceAmount: 30,
      targetAmount: 30,
      category: null,
    };
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...transferSource, transactionType: 'expense' });
      }),
    );
    renderWithProviders(<Wrapper tx={transferSource} targetKind="expense" />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(Object.keys(body).length).toBeGreaterThan(0));
    expect(body.sourceAccountId).toBe(accountA); // kept "from"
    expect(body.targetAccountId).toBe(external);
    expect((body.newAllocations as { expenses: unknown[] }).expenses).toHaveLength(1);
  });

  it('surfaces a generic error in a destructive banner', async () => {
    const user = userEvent.setup();
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, () =>
        HttpResponse.json({ message: 'Boom' }, { status: 500 }),
      ),
    );
    renderWithProviders(<Wrapper tx={expenseSource} targetKind="income" />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
  });
});
```

> Note: the category-placeholder assertion (`/select a category/i`) must match `CategoryCombobox`'s actual placeholder text — open `src/features/transactions/CategoryCombobox.tsx` and use its real placeholder string if it differs.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/ConvertTransactionDialog.test.tsx`
Expected: FAIL — `ConvertTransactionDialog` cannot be imported.

- [ ] **Step 3: Implement `ConvertTransactionDialog.tsx`**

Create `src/features/transactions/ConvertTransactionDialog.tsx`:

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
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/api/client';
import type { AccountResponse, TransactionResponse, UUID } from '@/api/types';
import { useAccounts } from '@/features/accounts/useAccounts';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { useUserProfile } from '@/features/profile/useUserProfile';
import { dateInputToWire } from '@/lib/dates';
import { IncomeExpenseForm, type IncomeExpenseFormApi } from './IncomeExpenseForm';
import { TransferForm, type TransferFormApi } from './TransferForm';
import type { IncomeExpenseFormValues, TransferFormValues } from './schema';
import {
  toConvertIncomeExpenseDefaults,
  toConvertTransferDefaults,
  toIncomeExpenseAmendment,
  toTransferAmendment,
} from './convertTransaction';
import type { TransactionEditDiff } from './diffTransaction';
import { useEditTransaction } from './useEditTransaction';
import { TRANSACTION_KIND_LABELS, type TransactionKind } from './labels';
import { mapIncomeExpenseFieldError, mapTransferFieldError } from './amendmentFieldErrors';

export interface ConvertTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tx: TransactionResponse;
  targetKind: TransactionKind;
}

type Configuration = ReturnType<typeof useConfiguration>['data'];

// account ids whose ['transactions', id] cache must refresh: old legs + new legs.
function affectedAccountIds(tx: TransactionResponse, source: UUID, target: UUID): UUID[] {
  return [...new Set([tx.sourceAccountId, tx.targetAccountId, source, target])];
}

const sameLabels = (a: readonly UUID[], b: readonly UUID[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

// Scalar edits (description/date/labels) the user made on top of the conversion,
// diffed against the seeded baseline — same fields Edit sends.
function scalarDiff(
  baseline: { description: string; date?: string; labels: UUID[] },
  next: { description: string; date?: string; labels: UUID[] },
): Pick<TransactionEditDiff, 'description' | 'date' | 'labels'> {
  const diff: Pick<TransactionEditDiff, 'description' | 'date' | 'labels'> = {};
  if (next.description !== baseline.description) diff.description = next.description;
  if (next.date && next.date !== baseline.date) diff.date = dateInputToWire(next.date);
  if (!sameLabels(baseline.labels, next.labels)) diff.labels = [...next.labels];
  return diff;
}

export function ConvertTransactionDialog({
  open,
  onOpenChange,
  tx,
  targetKind,
}: ConvertTransactionDialogProps) {
  const { data: accounts } = useAccounts();
  const { data: config } = useConfiguration();
  const { data: profile } = useUserProfile();

  const title = TRANSACTION_KIND_LABELS[targetKind].convertTitle;
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  let body: React.ReactNode;
  if (!accounts || !profile) {
    // react-hook-form seeds defaultValues once; wait for accounts (picker) and
    // profile before mounting. Profile is only strictly needed for the
    // income/expense branch (external account id for the External leg), but we
    // gate on both here for a single, simple loading guard.
    body = <BodyLoader />;
  } else if (targetKind === 'transfer') {
    body = <ConvertTransferBody tx={tx} accounts={accounts} config={config} onClose={close} />;
  } else {
    body = (
      <ConvertIncomeExpenseBody
        tx={tx}
        targetKind={targetKind}
        accounts={accounts}
        config={config}
        externalAccountId={profile.externalAccountId}
        onClose={close}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Change this transaction&apos;s type.</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

function ConvertIncomeExpenseBody({
  tx,
  targetKind,
  accounts,
  config,
  externalAccountId,
  onClose,
}: {
  tx: TransactionResponse;
  targetKind: 'income' | 'expense';
  accounts: AccountResponse[];
  config: Configuration;
  externalAccountId: UUID;
  onClose: () => void;
}) {
  const edit = useEditTransaction();
  const categoryDictId = targetKind === 'income' ? 'income-category' : 'expense-category';
  const categories = config?.dictionaries[categoryDictId]?.entries ?? [];
  const labels = config?.dictionaries.labels?.entries ?? [];
  const defaultCategory =
    (targetKind === 'income'
      ? config?.banking.defaultIncomeCategory
      : config?.banking.defaultExpenseCategory) ?? null;

  const defaultValues = useMemo(
    () => toConvertIncomeExpenseDefaults(tx, targetKind, accounts, defaultCategory),
    [tx, targetKind, accounts, defaultCategory],
  );
  const baselineRef = useRef(defaultValues);
  baselineRef.current = defaultValues;

  const apiRef = useRef<IncomeExpenseFormApi | null>(null);
  const handleReady = useCallback((api: IncomeExpenseFormApi) => {
    apiRef.current = api;
  }, []);

  const handleSubmit = async (values: IncomeExpenseFormValues) => {
    const amendment = toIncomeExpenseAmendment(targetKind, values, externalAccountId);
    const diff: TransactionEditDiff = { amendment, ...scalarDiff(baselineRef.current, values) };
    try {
      await edit.mutateAsync({
        id: tx.id,
        accountIds: affectedAccountIds(tx, amendment.sourceAccountId, amendment.targetAccountId),
        diff,
        onSubCallApplied: () => {},
      });
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          const target = mapIncomeExpenseFieldError(field, targetKind);
          if (target) apiRef.current?.setFieldError(target, message);
        }
      }
    }
  };

  return (
    <>
      <ErrorBanner edit={edit} />
      <IncomeExpenseForm
        kind={targetKind}
        mode="create"
        // Pass the full account list unfiltered (unlike EditTransactionDialog,
        // which filters by currency): a conversion may legitimately switch the
        // account/currency, so all accounts must be selectable.
        accounts={accounts}
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

function ConvertTransferBody({
  tx,
  accounts,
  config,
  onClose,
}: {
  tx: TransactionResponse;
  accounts: AccountResponse[];
  config: Configuration;
  onClose: () => void;
}) {
  const edit = useEditTransaction();
  const labels = config?.dictionaries.labels?.entries ?? [];

  const defaultValues = useMemo(() => toConvertTransferDefaults(tx, accounts), [tx, accounts]);
  const baselineRef = useRef(defaultValues);
  baselineRef.current = defaultValues;

  const apiRef = useRef<TransferFormApi | null>(null);
  const handleReady = useCallback((api: TransferFormApi) => {
    apiRef.current = api;
  }, []);

  const handleSubmit = async (values: TransferFormValues) => {
    const source = accounts.find((a) => a.id === values.sourceAccountId);
    const target = accounts.find((a) => a.id === values.targetAccountId);
    if (!source || !target) return; // schema guards make this unreachable
    const amendment = toTransferAmendment(values, source.currency, target.currency);
    const diff: TransactionEditDiff = { amendment, ...scalarDiff(baselineRef.current, values) };
    try {
      await edit.mutateAsync({
        id: tx.id,
        accountIds: affectedAccountIds(tx, amendment.sourceAccountId, amendment.targetAccountId),
        diff,
        onSubCallApplied: () => {},
      });
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

  return (
    <>
      <ErrorBanner edit={edit} />
      <TransferForm
        mode="create"
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

function ErrorBanner({ edit }: { edit: ReturnType<typeof useEditTransaction> }) {
  const show = edit.isError && !(edit.error instanceof ApiError && edit.error.fieldErrors);
  if (!show) return null;
  const message =
    edit.error instanceof ApiError ? edit.error.message : 'Something went wrong. Please try again.';
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}

function BodyLoader() {
  return (
    <div className="space-y-3" aria-busy>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/ConvertTransactionDialog.test.tsx`
Expected: PASS (all cases). If the category-placeholder test fails, correct the expected text to `CategoryCombobox`'s real placeholder.

- [ ] **Step 5: Typecheck + lint**

Run: `pnpm typecheck && pnpm exec eslint src/features/transactions/ConvertTransactionDialog.tsx src/features/transactions/ConvertTransactionDialog.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/transactions/ConvertTransactionDialog.tsx src/features/transactions/ConvertTransactionDialog.test.tsx
git commit -m "feat(transactions): add ConvertTransactionDialog (#20)"
```

---

### Task 5: Wire the "Convert to" submenu into `TransactionsPane`

**Files:**

- Modify: `src/features/transactions/TransactionsPane.tsx`
- Test: `src/features/transactions/TransactionsPane.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append inside the `describe('TransactionsPane', ...)` block in `src/features/transactions/TransactionsPane.test.tsx` (it already imports `transactionFixture`, `server`, `http`, `HttpResponse`, `userEvent`, `screen`, the `ui()`/render helpers, and `apiBase`):

```tsx
it('offers the two other kinds in the Convert submenu and opens the dialog', async () => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  const user = userEvent.setup();
  renderWithProviders(ui(), { initialPath: '/accounts/a1' });
  const cell = await screen.findByText(transactionFixture.description); // an expense fixture
  const row = cell.closest('tr')!;
  await user.pointer({ keys: '[MouseRight]', target: row });
  await user.click(await screen.findByRole('menuitem', { name: /convert to/i }));
  // expense source → offers Income and Transfer, not Expense
  expect(await screen.findByRole('menuitem', { name: /^income$/i })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /^transfer$/i })).toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: /^expense$/i })).not.toBeInTheDocument();
  await user.click(screen.getByRole('menuitem', { name: /^income$/i }));
  expect(await screen.findByRole('dialog', { name: /convert to income/i })).toBeInTheDocument();
});

it('hides the Convert submenu for adjustment rows', async () => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  const user = userEvent.setup();
  server.use(
    http.get(`${apiBase}/api/transactions`, () =>
      HttpResponse.json({
        transactions: [
          {
            ...transactionFixture,
            id: 'adj-1',
            description: 'AdjustmentTx',
            transactionType: 'adjustment',
            category: null,
          },
        ],
        totalCount: 1,
      }),
    ),
  );
  renderWithProviders(ui(), { initialPath: '/accounts/a1' });
  const row = (await screen.findByText('AdjustmentTx')).closest('tr')!;
  await user.pointer({ keys: '[MouseRight]', target: row });
  await screen.findByRole('menuitem', { name: /edit/i });
  expect(screen.queryByRole('menuitem', { name: /convert to/i })).not.toBeInTheDocument();
});

it('hides the Convert submenu for non-completed rows', async () => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  const user = userEvent.setup();
  server.use(
    http.get(`${apiBase}/api/transactions`, () =>
      HttpResponse.json({
        transactions: [
          { ...transactionFixture, id: 'pend-1', description: 'PendingTx', status: 'Pending' },
        ],
        totalCount: 1,
      }),
    ),
  );
  renderWithProviders(ui(), { initialPath: '/accounts/a1' });
  const row = (await screen.findByText('PendingTx')).closest('tr')!;
  await user.pointer({ keys: '[MouseRight]', target: row });
  await screen.findByRole('menuitem', { name: /edit/i });
  expect(screen.queryByRole('menuitem', { name: /convert to/i })).not.toBeInTheDocument();
});
```

> Confirm `transactionFixture.transactionType` is `'expense'` (it is, per `src/test/fixtures.ts`) so the "offers Income and Transfer" assertion holds. If it differs, adjust the expected target kinds.

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx -t "Convert"`
Expected: FAIL — no Convert submenu exists yet.

- [ ] **Step 3: Add imports**

In `src/features/transactions/TransactionsPane.tsx`:

Add the submenu primitives to the existing context-menu import:

```ts
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
```

Add the lucide icon to the existing import (it is not yet imported):

```ts
import { ArrowLeftRight, Ban, ChevronDown, ChevronRight, Copy, Pencil } from 'lucide-react';
```

Add the dialog + helpers imports next to the other dialog imports:

```ts
import { ConvertTransactionDialog } from './ConvertTransactionDialog';
import { isAdjustment, transactionKind, transactionTypeMeta } from './transactionType';
import type { TransactionKind } from './labels';
```

> If `isAdjustment` / `transactionKind` / `transactionTypeMeta` are already imported from `./transactionType`, just extend that import rather than duplicating it.

- [ ] **Step 4: Add convert state and the target helper**

Below the existing `copying` state (added by the copy feature), add:

```ts
const [converting, setConverting] = useState<{
  tx: TransactionResponse;
  targetKind: TransactionKind;
} | null>(null);
```

Add this module-scope helper near the top of the file (outside the component):

```ts
// The two kinds a transaction can convert to (everything but its current kind;
// Adjustment is never a source or target).
const CONVERT_KINDS = ['income', 'expense', 'transfer'] as const;
function convertTargets(type: string): TransactionKind[] {
  const current = transactionKind(type);
  return CONVERT_KINDS.filter((k) => k !== current);
}
```

- [ ] **Step 5: Add the Convert submenu to the context menu**

In `<ContextMenuContent>`, add the submenu between the Duplicate item and the Cancel item, rendered only for completed, non-adjustment rows:

```tsx
{
  t.status === 'Completed' && !isAdjustment(t.transactionType) && (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <ArrowLeftRight className="mr-2 h-4 w-4" aria-hidden />
        Convert to
      </ContextMenuSubTrigger>
      <ContextMenuSubContent>
        {convertTargets(t.transactionType).map((k) => (
          <ContextMenuItem key={k} onSelect={() => setConverting({ tx: t, targetKind: k })}>
            {transactionTypeMeta(k).label}
          </ContextMenuItem>
        ))}
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
```

- [ ] **Step 6: Render the ConvertTransactionDialog**

After the `{copying && ( ... )}` block near the end of the returned JSX, add:

```tsx
{
  converting && (
    <ConvertTransactionDialog
      open
      onOpenChange={(o) => {
        if (!o) setConverting(null);
      }}
      tx={converting.tx}
      targetKind={converting.targetKind}
    />
  );
}
```

- [ ] **Step 7: Run the TransactionsPane tests**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx`
Expected: PASS — the three new Convert tests pass and all pre-existing tests (Edit/Duplicate/Cancel) still pass.

- [ ] **Step 8: Commit**

```bash
git add src/features/transactions/TransactionsPane.tsx src/features/transactions/TransactionsPane.test.tsx
git commit -m "feat(transactions): convert transaction via context-menu submenu (#20)"
```

---

### Task 6: Full verification

REQUIRED SUB-SKILL: superpowers:verification-before-completion — run the commands and confirm output before claiming done.

- [ ] **Step 1: Run the full check + test suite**

Run: `pnpm check && pnpm test`
Expected: typecheck, lint, format-check, and all Vitest tests PASS.

- [ ] **Step 2: Fix any format issues if `format-check` fails**

Run: `pnpm format` then re-run `pnpm check`.

- [ ] **Step 3: Manual smoke (recommended)**

REQUIRED SUB-SKILL: superpowers:requesting-code-review before merge. Optionally launch the app, open an account with a completed expense, right-click → Convert to → Income, confirm the form is pre-filled (account = the spending account, amount positive, category = the configured default), submit, and confirm the row now shows as Income in both the source account list and the affected account. Repeat for Transfer (counterparty account must be picked).

- [ ] **Step 4: Final commit (if any fixes were made)**

```bash
git add -A
git commit -m "chore(transactions): format/lint fixes for convert transaction (#20)"
```

---

## Out of scope (do not implement)

- No backend changes — reuses the existing `amend` endpoint.
- No global default-category setting — uses the existing banking defaults as the interim source (issue #41 tracks promoting these to a global Dictionaries setting; only the `defaultCategory` lookup in `ConvertTransactionDialog` changes then).
- No conversion to or from `Adjustment`.
- No conversion of non-`Completed` transactions.
- No bulk / multi-select convert.
