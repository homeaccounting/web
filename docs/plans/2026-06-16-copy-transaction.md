# Copy Transaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user create a new transaction pre-filled from an existing one (income / expense / transfer), editable before submit, launched from the transaction row.

**Architecture:** A new additive `CopyTransactionDialog` mirrors `EditTransactionDialog`'s structure but renders the existing create forms in `mode="create"`. It seeds form defaults from the source transaction via the existing `toIncomeExpenseFormValues` / `toTransferFormValues` helpers, overriding `date` with `nowDateTimeInput()`, and submits through the existing `useCreateIncome` / `useCreateExpense` / `useCreateTransfer` hooks and `toIncomeRequest` / `toExpenseRequest` / `toTransferRequest` mappers. `TransactionsPane` gains a "Duplicate" context-menu item and a hover copy icon, both for non-adjustment rows. The create dialogs and create flow are untouched.

**Tech Stack:** React 18 + TypeScript, react-hook-form + Zod, TanStack Query, shadcn/ui (Radix), Vitest + Testing Library + MSW. Run commands with `pnpm` (or `just`).

**Spec:** `docs/specs/2026-06-16-copy-transaction-design.md`

**Conventions to follow:**

- Tests live next to code (`*.test.tsx`). Render via `renderWithProviders` from `@/test/utils`; wrap in `AuthProvider` and call `saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 })` to authenticate (never mutate `localStorage` directly).
- Default MSW handlers in `src/test/handlers.ts` already mock `POST /api/transactions/{income,expense,transfer}`, `GET /api/transactions`, `GET /api/accounts`, and the configuration endpoint. Use `server.use(...)` for per-test overrides.
- Use the `@anthropic` TDD discipline: write the failing test first, watch it fail, implement minimally, watch it pass, commit. REQUIRED SUB-SKILL: superpowers:test-driven-development.

---

### Task 1: Add `copyTitle` labels

**Files:**

- Modify: `src/features/transactions/labels.ts`

- [ ] **Step 1: Add a `copyTitle` to each kind**

Edit `TRANSACTION_KIND_LABELS` so each kind gains a `copyTitle` (place it next to `editTitle`):

```ts
export const TRANSACTION_KIND_LABELS = {
  income: {
    title: 'Add income',
    submit: 'OK',
    aria: 'Add income',
    editTitle: 'Edit income',
    editSubmit: 'OK',
    copyTitle: 'Copy income',
  },
  expense: {
    title: 'Add expense',
    submit: 'OK',
    aria: 'Add expense',
    editTitle: 'Edit expense',
    editSubmit: 'OK',
    copyTitle: 'Copy expense',
  },
  transfer: {
    title: 'Add transfer',
    submit: 'OK',
    aria: 'Add transfer',
    editTitle: 'Edit transfer',
    editSubmit: 'OK',
    copyTitle: 'Copy transfer',
  },
} as const;
```

- [ ] **Step 2: Verify typecheck passes**

Run: `pnpm typecheck`
Expected: PASS (no errors).

- [ ] **Step 3: Commit**

```bash
git add src/features/transactions/labels.ts
git commit -m "feat(transactions): add copyTitle labels for copy dialog (#28)"
```

---

### Task 2: `CopyTransactionDialog` component

**Files:**

- Create: `src/features/transactions/CopyTransactionDialog.tsx`
- Test: `src/features/transactions/CopyTransactionDialog.test.tsx`

This task reuses the existing forms, create hooks, and schema mappers. Write the tests first.

- [ ] **Step 1: Write the failing test file**

Create `src/features/transactions/CopyTransactionDialog.test.tsx`:

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
import { foodCategoryId, tripLabelId, transactionFixture } from '@/test/fixtures';
import type { TransactionResponse } from '@/api/types';
import { CopyTransactionDialog } from './CopyTransactionDialog';

const apiBase = 'http://localhost:8080';

const accountA = '00000000-0000-0000-0000-000000000001';
const accountB = '00000000-0000-0000-0000-000000000002';

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  server.use(
    http.get(`${apiBase}/api/accounts`, () =>
      HttpResponse.json({
        accounts: [
          {
            id: accountA,
            name: 'Checking',
            balance: 1234.56,
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
  );
});

function Wrapper({ tx }: { tx: TransactionResponse }) {
  const [open, setOpen] = useState(true);
  return (
    <AuthProvider>
      <CopyTransactionDialog open={open} onOpenChange={setOpen} tx={tx} />
    </AuthProvider>
  );
}

const expenseSource: TransactionResponse = {
  ...transactionFixture,
  id: 'src-expense',
  sourceAccountId: accountA,
  targetAccountId: 'external-1',
  sourceAmount: -42,
  sourceCurrency: 'USD',
  targetAmount: -42,
  targetCurrency: 'USD',
  description: 'Lunch',
  transactionType: 'expense',
  category: foodCategoryId,
  date: '2026-01-15T08:00:00.000Z',
  labels: [tripLabelId],
};

describe('CopyTransactionDialog', () => {
  it('seeds an expense copy from the source and defaults the date to now', async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(`${apiBase}/api/transactions/expense`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...expenseSource, id: 'copy-1' });
      }),
    );

    renderWithProviders(<Wrapper tx={expenseSource} />, { initialPath: '/' });

    // Title reflects the copy action and the kind.
    expect(await screen.findByRole('dialog', { name: /copy expense/i })).toBeInTheDocument();
    await screen.findByLabelText(/account/i);

    // The description carried over from the source.
    expect(screen.getByLabelText(/description/i)).toHaveValue('Lunch');
    // The amount carried over as a positive value.
    expect(screen.getByLabelText(/amount/i)).toHaveValue(42);

    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(Object.keys(capturedBody).length).toBeGreaterThan(0));
    // Date is defaulted to "now", NOT the source's 2026-01-15 timestamp.
    expect(capturedBody.date).not.toContain('2026-01-15');
    expect(capturedBody.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
    // Closes after a successful submit.
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('copies a transfer using both legs', async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(`${apiBase}/api/transactions/transfer`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...transactionFixture, id: 'copy-transfer' });
      }),
    );

    const transferSource: TransactionResponse = {
      ...transactionFixture,
      id: 'src-transfer',
      sourceAccountId: accountA,
      targetAccountId: accountB,
      sourceAmount: 100,
      targetAmount: 100,
      sourceCurrency: 'USD',
      targetCurrency: 'USD',
      description: 'Move',
      transactionType: 'transfer',
      category: null,
      labels: [],
    };

    renderWithProviders(<Wrapper tx={transferSource} />, { initialPath: '/' });
    expect(await screen.findByRole('dialog', { name: /copy transfer/i })).toBeInTheDocument();
    await screen.findByLabelText(/amount/i);

    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(Object.keys(capturedBody).length).toBeGreaterThan(0));
    expect(capturedBody.sourceAccountId).toBe(accountA);
    expect(capturedBody.targetAccountId).toBe(accountB);
    expect(capturedBody.amount).toBe(100);
  });

  it('surfaces a field error on the named field', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${apiBase}/api/transactions/expense`, () =>
        HttpResponse.json(
          { message: 'Validation failed', fieldErrors: { description: 'Too long' } },
          { status: 422 },
        ),
      ),
    );

    renderWithProviders(<Wrapper tx={expenseSource} />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByText(/too long/i)).toBeInTheDocument();
  });

  it('shows a destructive banner for a generic error', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${apiBase}/api/transactions/expense`, () =>
        HttpResponse.json({ message: 'Boom' }, { status: 500 }),
      ),
    );

    renderWithProviders(<Wrapper tx={expenseSource} />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
  });

  it('refuses to copy an adjustment', async () => {
    const adjustment: TransactionResponse = {
      ...transactionFixture,
      id: 'src-adjustment',
      transactionType: 'adjustment',
      category: null,
    };
    renderWithProviders(<Wrapper tx={adjustment} />, { initialPath: '/' });
    expect(await screen.findByText(/balance adjustments can't be copied/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/CopyTransactionDialog.test.tsx`
Expected: FAIL — `CopyTransactionDialog` cannot be imported (module/export not found).

- [ ] **Step 3: Implement `CopyTransactionDialog`**

Create `src/features/transactions/CopyTransactionDialog.tsx`:

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
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/api/client';
import type { AccountResponse, TransactionResponse } from '@/api/types';
import { useAccounts } from '@/features/accounts/useAccounts';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { nowDateTimeInput } from '@/lib/dates';
import { IncomeExpenseForm, type IncomeExpenseFormApi } from './IncomeExpenseForm';
import { TransferForm, type TransferFormApi } from './TransferForm';
import {
  toIncomeExpenseFormValues,
  toTransferFormValues,
  toIncomeRequest,
  toExpenseRequest,
  toTransferRequest,
  type IncomeExpenseFormValues,
  type TransferFormValues,
} from './schema';
import { useCreateIncome } from './useCreateIncome';
import { useCreateExpense } from './useCreateExpense';
import { useCreateTransfer } from './useCreateTransfer';
import { TRANSACTION_KIND_LABELS, type TransactionKind } from './labels';

export interface CopyTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tx: TransactionResponse;
}

type Configuration = ReturnType<typeof useConfiguration>['data'];

export function CopyTransactionDialog({ open, onOpenChange, tx }: CopyTransactionDialogProps) {
  const { data: accounts } = useAccounts();
  const { data: config } = useConfiguration();

  const isTransfer = tx.transactionType === 'transfer';
  // Adjustments have no create flow (see EditTransactionDialog); copy is blocked.
  const isAdjustment = tx.transactionType === 'adjustment';
  const kind: TransactionKind = isTransfer
    ? 'transfer'
    : tx.transactionType === 'income'
      ? 'income'
      : 'expense';

  const title = isAdjustment ? 'Copy transaction' : TRANSACTION_KIND_LABELS[kind].copyTitle;
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  let body: React.ReactNode;
  if (isAdjustment) {
    body = <AdjustmentNotice onClose={close} />;
  } else if (!accounts) {
    // react-hook-form seeds defaultValues once; wait for accounts so the
    // account picker is populated for the dialog's lifetime.
    body = <BodyLoader />;
  } else if (isTransfer) {
    body = <CopyTransferBody tx={tx} accounts={accounts} config={config} onClose={close} />;
  } else {
    body = (
      <CopyIncomeExpenseBody
        tx={tx}
        kind={kind as 'income' | 'expense'}
        accounts={accounts}
        config={config}
        onClose={close}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Create a new transaction from an existing one.</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

function CopyIncomeExpenseBody({
  tx,
  kind,
  accounts,
  config,
  onClose,
}: {
  tx: TransactionResponse;
  kind: 'income' | 'expense';
  accounts: AccountResponse[];
  config: Configuration;
  onClose: () => void;
}) {
  // Both hooks are instantiated unconditionally (hooks can't be conditional);
  // only the one matching `kind` is invoked on submit.
  const createIncome = useCreateIncome();
  const createExpense = useCreateExpense();
  const create = kind === 'income' ? createIncome : createExpense;

  const categoryDictId = kind === 'income' ? 'income-category' : 'expense-category';
  const categories = config?.dictionaries[categoryDictId]?.entries ?? [];
  const labels = config?.dictionaries.labels?.entries ?? [];

  // Seed from the source, then: (1) default the date to now (a copy is a new
  // transaction recorded now, not a clone of the original's timestamp), and
  // (2) take the magnitude of the amount. Expense wire amounts are negative
  // (money leaving the source account), but the create form/schema requires a
  // positive amount (`positiveAmount` in schema.ts), so seed the magnitude.
  const defaultValues = useMemo(() => {
    const seed = toIncomeExpenseFormValues(tx, accounts);
    return { ...seed, amount: Math.abs(seed.amount), date: nowDateTimeInput() };
  }, [tx, accounts]);

  const apiRef = useRef<IncomeExpenseFormApi | null>(null);
  const handleReady = useCallback((api: IncomeExpenseFormApi) => {
    apiRef.current = api;
  }, []);

  const handleSubmit = async (values: IncomeExpenseFormValues) => {
    try {
      if (kind === 'income') {
        await createIncome.mutateAsync(toIncomeRequest(values));
      } else {
        await createExpense.mutateAsync(toExpenseRequest(values));
      }
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        // Create flow uses raw backend field names (unlike EditTransactionDialog,
        // which maps them); follow the create dialogs' pattern here.
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
    <>
      {showBanner && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{bannerMessage}</AlertDescription>
        </Alert>
      )}
      <IncomeExpenseForm
        kind={kind}
        mode="create"
        accounts={accounts}
        categories={categories}
        labels={labels}
        defaultValues={defaultValues}
        isSubmitting={create.isPending}
        onSubmit={handleSubmit}
        onCancel={onClose}
        onReady={handleReady}
      />
    </>
  );
}

function CopyTransferBody({
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
  const create = useCreateTransfer();
  const labels = config?.dictionaries.labels?.entries ?? [];

  const defaultValues = useMemo(
    () => ({ ...toTransferFormValues(tx, accounts), date: nowDateTimeInput() }),
    [tx, accounts],
  );

  const apiRef = useRef<TransferFormApi | null>(null);
  const handleReady = useCallback((api: TransferFormApi) => {
    apiRef.current = api;
  }, []);

  const handleSubmit = async (values: TransferFormValues) => {
    const source = accounts.find((a) => a.id === values.sourceAccountId);
    const target = accounts.find((a) => a.id === values.targetAccountId);
    if (!source || !target) return; // schema guards make this unreachable
    try {
      await create.mutateAsync(toTransferRequest(values, source.currency, target.currency));
      onClose();
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
    <>
      {showBanner && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{bannerMessage}</AlertDescription>
        </Alert>
      )}
      <TransferForm
        mode="create"
        accounts={accounts}
        labels={labels}
        defaultValues={defaultValues}
        isSubmitting={create.isPending}
        onSubmit={handleSubmit}
        onCancel={onClose}
        onReady={handleReady}
      />
    </>
  );
}

function AdjustmentNotice({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-3">
      <Alert role="alert">
        <AlertDescription>
          Balance adjustments can't be copied. Use “Adjust balance” to record a new adjustment.
        </AlertDescription>
      </Alert>
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          OK
        </Button>
      </div>
    </div>
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

Run: `pnpm exec vitest run src/features/transactions/CopyTransactionDialog.test.tsx`
Expected: PASS (all 5 tests).

- [ ] **Step 5: Typecheck and lint**

Run: `pnpm typecheck && pnpm exec eslint src/features/transactions/CopyTransactionDialog.tsx src/features/transactions/CopyTransactionDialog.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/transactions/CopyTransactionDialog.tsx src/features/transactions/CopyTransactionDialog.test.tsx
git commit -m "feat(transactions): add CopyTransactionDialog (#28)"
```

---

### Task 3: Wire the Duplicate triggers into `TransactionsPane`

**Files:**

- Modify: `src/features/transactions/TransactionsPane.tsx`
- Test: `src/features/transactions/TransactionsPane.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append these tests inside the `describe('TransactionsPane', ...)` block in `src/features/transactions/TransactionsPane.test.tsx` (the file already imports `transactionFixture`, `server`, `http`, `HttpResponse`, `userEvent`, etc.):

```tsx
it('opens CopyTransactionDialog via the context menu Duplicate item', async () => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  const user = userEvent.setup();
  renderWithProviders(ui(), { initialPath: '/accounts/a1' });
  const cell = await screen.findByText(transactionFixture.description);
  const row = cell.closest('tr')!;
  await user.pointer({ keys: '[MouseRight]', target: row });
  await user.click(await screen.findByRole('menuitem', { name: /duplicate/i }));
  expect(await screen.findByRole('dialog', { name: /copy expense/i })).toBeInTheDocument();
});

it('exposes a Duplicate icon control that opens the copy dialog (not edit)', async () => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  const user = userEvent.setup();
  renderWithProviders(ui(), { initialPath: '/accounts/a1' });
  await screen.findByText(transactionFixture.description);
  await user.click(screen.getByLabelText('Duplicate'));
  expect(await screen.findByRole('dialog', { name: /copy expense/i })).toBeInTheDocument();
  // It must not have opened the edit dialog.
  expect(screen.queryByRole('dialog', { name: /edit expense/i })).not.toBeInTheDocument();
});

it('hides the Duplicate control for adjustment rows', async () => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
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
  await screen.findByText('AdjustmentTx');
  expect(screen.queryByLabelText('Duplicate')).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the new tests to verify they fail**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx -t "Duplicate"`
Expected: FAIL — no Duplicate menu item / control exists yet.

- [ ] **Step 3: Add the `Copy` icon import and dialog import**

In `src/features/transactions/TransactionsPane.tsx`:

Change the lucide import to include `Copy`:

```ts
import { Ban, ChevronDown, ChevronRight, Copy, Pencil } from 'lucide-react';
```

Add the dialog import next to the other dialog imports:

```ts
import { CopyTransactionDialog } from './CopyTransactionDialog';
```

- [ ] **Step 4: Add copy state**

Below the existing `cancelTarget` state (around line 122-123), add:

```ts
const [copying, setCopying] = useState<TransactionResponse | null>(null);
const openCopy = (t: TransactionResponse) => setCopying(t);
```

- [ ] **Step 5: Widen the actions column header**

Change the trailing actions header cell so it fits two icons. Replace:

```tsx
<th className="w-8 px-2 py-2" />
```

with:

```tsx
<th className="w-20 px-2 py-2" />
```

- [ ] **Step 6: Render both icons in the actions cell**

Replace the entire trailing actions `<td>` (the block starting `<td className="w-8 px-2 py-2 text-right">` that wraps the Cancel button) with a flex container holding the Duplicate icon (non-adjustment) and the existing Cancel icon:

```tsx
<td className="px-2 py-2 text-right">
  <span className="flex items-center justify-end gap-1">
    {t.transactionType !== 'adjustment' && (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Duplicate"
              className="h-7 w-7 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                openCopy(t);
              }}
            >
              <Copy className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Duplicate</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )}
    {t.status !== 'Cancelled' && (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Cancel"
              className="h-7 w-7 opacity-0 focus-visible:opacity-100 group-hover:opacity-100"
              onClick={(e) => {
                e.stopPropagation();
                openCancel(t);
              }}
            >
              <Ban className="h-4 w-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Cancel</TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )}
  </span>
</td>
```

- [ ] **Step 7: Add the Duplicate context-menu item**

In `<ContextMenuContent>`, add a "Duplicate" item after the Edit item (and before the Cancel item), shown only for non-adjustment rows:

```tsx
<ContextMenuItem onSelect={() => openEdit(t)}>
  <Pencil className="mr-2 h-4 w-4" aria-hidden />
  Edit
</ContextMenuItem>;
{
  t.transactionType !== 'adjustment' && (
    <ContextMenuItem onSelect={() => openCopy(t)}>
      <Copy className="mr-2 h-4 w-4" aria-hidden />
      Duplicate
    </ContextMenuItem>
  );
}
{
  t.status !== 'Cancelled' && (
    <ContextMenuItem className="text-destructive" onSelect={() => openCancel(t)}>
      <Ban className="mr-2 h-4 w-4" aria-hidden />
      Cancel
    </ContextMenuItem>
  );
}
```

- [ ] **Step 8: Render the CopyTransactionDialog**

After the `{cancelTarget && ( ... )}` block near the end of the returned JSX, add:

```tsx
{
  copying && (
    <CopyTransactionDialog
      open
      onOpenChange={(o) => {
        if (!o) setCopying(null);
      }}
      tx={copying}
    />
  );
}
```

- [ ] **Step 9: Run the TransactionsPane tests**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx`
Expected: PASS — the three new tests pass and all pre-existing tests (Edit/Cancel context menu, Cancel control present/absent) still pass.

- [ ] **Step 10: Commit**

```bash
git add src/features/transactions/TransactionsPane.tsx src/features/transactions/TransactionsPane.test.tsx
git commit -m "feat(transactions): duplicate transaction via context menu and row icon (#28)"
```

---

### Task 4: Full verification

REQUIRED SUB-SKILL: superpowers:verification-before-completion — run the commands and confirm output before claiming done.

- [ ] **Step 1: Run the full check + test suite**

Run: `pnpm check && pnpm test`
(equivalently `just all` minus the build, or run `just check && just test`)
Expected: typecheck, lint, format-check, and all Vitest tests PASS.

- [ ] **Step 2: Fix any format issues if `format-check` fails**

Run: `pnpm format` then re-run `pnpm check`.

- [ ] **Step 3: Manual smoke (optional but recommended)**

REQUIRED SUB-SKILL: superpowers:requesting-code-review before merge. Optionally use the `/run` skill to launch the app, open an account with transactions, right-click a row → Duplicate (and the hover copy icon), confirm the form is pre-filled with the source data and the date is "now", edit a field, submit, and see the new transaction appear.

- [ ] **Step 4: Final commit (if any fixes were made)**

```bash
git add -A
git commit -m "chore(transactions): format/lint fixes for copy transaction (#28)"
```

---

## Out of scope (do not implement)

- No backend changes — reuses existing create endpoints.
- No bulk / multi-select copy.
- No copying of balance adjustments.
- No changes to the create dialogs or the create flow.
