# Transaction Balance Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Block creating an expense or transfer whose debit exceeds the source account's available funds (balance + overdraft limit), in the create dialog, before it reaches the backend.

**Architecture:** Add opt-in Zod schema factories in `schema.ts` that close over the live `accounts` list and `superRefine` the `amount` field. The two affected forms build their resolver from the factory when a new `enforceBalance` prop is set; only the create expense/transfer dialogs pass it. Income, edit, the request mappers, and existing tests are untouched (strictly additive).

**Tech Stack:** React + react-hook-form + Zod (`@hookform/resolvers/zod`), Vitest + Testing Library + MSW.

**Spec:** `docs/specs/2026-06-18-transaction-balance-validation-design.md`

**Validation rule:** `available = balance + overdraftLimit`; block when `overdraftLimit !== null && amount > available`. `overdraftLimit === null` ⇒ unlimited (no check). Boundary is inclusive (`amount === available` allowed), mirroring backend `balance - amount >= -limit`. The form's `amount` is already in the source account's currency (the form locks `currency` to the selected source), so no FX conversion.

---

## File Structure

- **Modify** `src/features/transactions/schema.ts` — add `makeIncomeExpenseFormSchema(accounts, kind)` and `makeTransferFormSchema(accounts)` factories plus a shared `balanceIssue` helper. Leave the existing `incomeExpenseFormSchema` / `transferFormSchema` exports and all mappers untouched.
- **Modify** `src/features/transactions/IncomeExpenseForm.tsx` — add optional `enforceBalance?: boolean` prop; build the resolver from the factory (memoized) when set.
- **Modify** `src/features/transactions/TransferForm.tsx` — same `enforceBalance?: boolean` wiring.
- **Modify** `src/features/transactions/CreateExpenseDialog.tsx` — pass `enforceBalance` to the form.
- **Modify** `src/features/transactions/CreateTransferDialog.tsx` — pass `enforceBalance` to the form.
- **Test** `src/features/transactions/schema.test.ts` — factory unit tests.
- **Test** `src/features/transactions/CreateExpenseDialog.test.tsx` — dialog blocks over-balance submit.

---

## Task 1: Schema factories with balance refinement

**Files:**

- Modify: `src/features/transactions/schema.ts`
- Test: `src/features/transactions/schema.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `src/features/transactions/schema.test.ts`. The existing file already defines `ACC_A`, `ACC_B`, `CAT`, `LBL` and imports from `./schema` and `AccountResponse` from `@/api/types` — add `makeIncomeExpenseFormSchema, makeTransferFormSchema` to the existing import from `./schema`.

```ts
function acc(id: string, balance: number, overdraftLimit: number | null): AccountResponse {
  return {
    id,
    name: 'Acc',
    balance,
    currency: 'USD',
    overdraftLimit,
    subtype: null,
    status: 'active',
    version: 1,
  };
}

describe('makeIncomeExpenseFormSchema (expense balance check)', () => {
  const base = {
    accountId: ACC_A,
    currency: 'USD',
    category: CAT,
    description: '',
    date: '',
    labels: [] as string[],
  };

  it('passes when amount is below available (balance + overdraftLimit)', () => {
    const schema = makeIncomeExpenseFormSchema([acc(ACC_A, 100, 0)], 'expense');
    expect(schema.safeParse({ ...base, amount: 50 }).success).toBe(true);
  });

  it('passes at the inclusive boundary (amount === available)', () => {
    const schema = makeIncomeExpenseFormSchema([acc(ACC_A, 100, 20)], 'expense');
    expect(schema.safeParse({ ...base, amount: 120 }).success).toBe(true);
  });

  it('fails when amount exceeds available, with the error on the amount path', () => {
    const schema = makeIncomeExpenseFormSchema([acc(ACC_A, 100, 20)], 'expense');
    const res = schema.safeParse({ ...base, amount: 120.01 });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path[0] === 'amount')).toBe(true);
    }
  });

  it('skips the check when overdraftLimit is null (unlimited)', () => {
    const schema = makeIncomeExpenseFormSchema([acc(ACC_A, 0, null)], 'expense');
    expect(schema.safeParse({ ...base, amount: 999999 }).success).toBe(true);
  });

  it('skips the check when the source account is not in the snapshot', () => {
    const schema = makeIncomeExpenseFormSchema([acc(ACC_B, 0, 0)], 'expense');
    expect(schema.safeParse({ ...base, amount: 999999 }).success).toBe(true);
  });

  it('never adds the check for income', () => {
    const schema = makeIncomeExpenseFormSchema([acc(ACC_A, 0, 0)], 'income');
    expect(schema.safeParse({ ...base, amount: 999999 }).success).toBe(true);
  });
});

describe('makeTransferFormSchema (source balance check)', () => {
  const base = {
    sourceAccountId: ACC_A,
    targetAccountId: ACC_B,
    currency: 'USD',
    description: '',
    date: '',
    labels: [] as string[],
  };

  it('fails when amount exceeds the source available balance', () => {
    const schema = makeTransferFormSchema([acc(ACC_A, 100, 0), acc(ACC_B, 0, 0)]);
    const res = schema.safeParse({ ...base, amount: 150 });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path[0] === 'amount')).toBe(true);
    }
  });

  it('passes when amount is within the source available balance', () => {
    const schema = makeTransferFormSchema([acc(ACC_A, 100, 50), acc(ACC_B, 0, 0)]);
    expect(schema.safeParse({ ...base, amount: 120 }).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/features/transactions/schema.test.ts`
Expected: FAIL — `makeIncomeExpenseFormSchema` / `makeTransferFormSchema` are not exported.

- [ ] **Step 3: Implement the factories**

In `src/features/transactions/schema.ts`:

1. Add `import { formatMoney } from '@/lib/format';` near the top imports.
2. Ensure `AccountResponse` is imported (a late `import type { AccountResponse, TransactionResponse } from '@/api/types';` already exists at the bottom — type imports hoist, so it covers the factories; no change needed).
3. Add, after the `transferFormSchema` definition:

```ts
// Issue #46: client-side guard mirroring the backend debit rule
// (server-infra/src/Domain/Account/CommandHandler.hs): a debit is rejected when
// `balance - amount < -overdraftLimit`. `overdraftLimit === null` means no limit
// (no check). The boundary is inclusive. `amount` is already in the source
// account's currency (the form locks `currency` to the selected source), so no
// FX conversion is needed.
function balanceIssue(
  accounts: AccountResponse[],
  accountId: string,
  amount: number,
): string | null {
  const acc = accounts.find((a) => a.id === accountId);
  if (!acc || acc.overdraftLimit === null || !Number.isFinite(amount)) return null;
  const available = acc.balance + acc.overdraftLimit;
  if (amount <= available) return null;
  return `Exceeds available balance (${formatMoney(available, acc.currency)})`;
}

// Create-only: expense debits `accountId`; income only credits, so it is never
// funds-constrained and the refine is a no-op for it.
export function makeIncomeExpenseFormSchema(
  accounts: AccountResponse[],
  kind: 'income' | 'expense',
) {
  return incomeExpenseFormSchema.superRefine((v, ctx) => {
    if (kind === 'income') return;
    const message = balanceIssue(accounts, v.accountId, v.amount);
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message });
  });
}

// Create-only: transfer debits `sourceAccountId`. `transferFormSchema` is a
// `ZodEffects` (it carries the source ≠ target refine), so chain `.superRefine`
// — `.extend` is not available on effects.
export function makeTransferFormSchema(accounts: AccountResponse[]) {
  return transferFormSchema.superRefine((v, ctx) => {
    const message = balanceIssue(accounts, v.sourceAccountId, v.amount);
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['amount'], message });
  });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/features/transactions/schema.test.ts`
Expected: PASS (all existing + new cases).

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/transactions/schema.ts src/features/transactions/schema.test.ts
git commit -m "feat(transactions): balance/overdraft schema factories for create (#46)"
```

---

## Task 2: Wire `enforceBalance` into the forms

**Files:**

- Modify: `src/features/transactions/IncomeExpenseForm.tsx`
- Modify: `src/features/transactions/TransferForm.tsx`

No new tests here — behavior is exercised by Task 1 (schema) and Task 3 (dialog). This task is pure wiring; rely on typecheck + the existing form tests staying green.

- [ ] **Step 1: Add the prop and resolver to `IncomeExpenseForm`**

In `src/features/transactions/IncomeExpenseForm.tsx`:

1. Update the `useMemo` import: `import { useEffect, useMemo } from 'react';`
2. Update the schema import: `import { incomeExpenseFormSchema, makeIncomeExpenseFormSchema, type IncomeExpenseFormValues } from './schema';`
3. Add to `IncomeExpenseFormProps`: `enforceBalance?: boolean;`
4. Destructure `enforceBalance = false` in the component params.
5. Replace the `useForm` resolver wiring:

```ts
const resolver = useMemo<Resolver<IncomeExpenseFormValues>>(
  () =>
    zodResolver(
      enforceBalance ? makeIncomeExpenseFormSchema(accounts, kind) : incomeExpenseFormSchema,
    ) as Resolver<IncomeExpenseFormValues>,
  [enforceBalance, accounts, kind],
);

const form = useForm<IncomeExpenseFormValues>({
  resolver,
  defaultValues,
});
```

- [ ] **Step 2: Add the prop and resolver to `TransferForm`**

In `src/features/transactions/TransferForm.tsx`:

1. Update the React import: `import { useEffect, useMemo } from 'react';`
2. Update the schema import: `import { transferFormSchema, makeTransferFormSchema, type TransferFormValues } from './schema';`
3. Add to `TransferFormProps`: `enforceBalance?: boolean;`
4. Destructure `enforceBalance = false` in the component params.
5. Replace the `useForm` resolver wiring:

```ts
const resolver = useMemo<Resolver<TransferFormValues>>(
  () =>
    zodResolver(
      enforceBalance ? makeTransferFormSchema(accounts) : transferFormSchema,
    ) as Resolver<TransferFormValues>,
  [enforceBalance, accounts],
);

const form = useForm<TransferFormValues>({
  resolver,
  defaultValues,
});
```

- [ ] **Step 3: Typecheck and run the existing form tests**

Run: `pnpm exec tsc --noEmit`
Expected: no errors.

Run: `pnpm exec vitest run src/features/transactions/IncomeExpenseForm.test.tsx src/features/transactions/TransferForm.test.tsx`
Expected: PASS (unchanged — `enforceBalance` defaults to off).

- [ ] **Step 4: Commit**

```bash
git add src/features/transactions/IncomeExpenseForm.tsx src/features/transactions/TransferForm.tsx
git commit -m "feat(transactions): opt-in enforceBalance prop on create forms (#46)"
```

---

## Task 3: Enable the check in the create dialogs + dialog test

**Files:**

- Modify: `src/features/transactions/CreateExpenseDialog.tsx`
- Modify: `src/features/transactions/CreateTransferDialog.tsx`
- Test: `src/features/transactions/CreateExpenseDialog.test.tsx`

- [ ] **Step 1: Write the failing dialog test**

Open `src/features/transactions/CreateExpenseDialog.test.tsx` and inspect the existing setup (how it renders the dialog, signs in, seeds accounts via MSW handlers, and selects an account). Add a test that mirrors that setup, ensuring at least one seeded account has a known `balance` and `overdraftLimit` (e.g. `balance: 100, overdraftLimit: 0`). The test:

```ts
it('blocks submitting an expense that exceeds the account available balance', async () => {
  // ...render the dialog and ensure the low-balance account is selected,
  // following the existing test's helpers/handlers...
  const user = userEvent.setup();

  const amount = screen.getByLabelText(/amount/i);
  await user.clear(amount);
  await user.type(amount, '150'); // account has balance 100, overdraftLimit 0

  await user.click(screen.getByRole('button', { name: TRANSACTION_KIND_LABELS.expense.submit }));

  expect(await screen.findByText(/exceeds available balance/i)).toBeInTheDocument();
  // The create mutation must not have fired — assert no success side effect
  // (e.g. dialog stays open / onOpenChange(false) not called), per the
  // existing test's assertion style.
});
```

Match the existing file's import style, render helper (`src/test/utils.tsx`), MSW account handlers, and the way it asserts submission. If the existing accounts fixture has no suitable low-balance account, add/override one via `server.use(...)` within this test.

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/CreateExpenseDialog.test.tsx`
Expected: FAIL — the "exceeds available balance" message is not rendered (dialog doesn't yet enforce the check).

- [ ] **Step 3: Pass `enforceBalance` in both create dialogs**

In `src/features/transactions/CreateExpenseDialog.tsx`, add `enforceBalance` to the `<IncomeExpenseForm ... />` props:

```tsx
<IncomeExpenseForm
  kind="expense"
  mode="create"
  enforceBalance
  accounts={accounts}
  ...
/>
```

In `src/features/transactions/CreateTransferDialog.tsx`, add `enforceBalance` to the `<TransferForm ... />` props:

```tsx
<TransferForm
  mode="create"
  enforceBalance
  accounts={accounts}
  ...
/>
```

(Leave `CreateIncomeDialog.tsx` unchanged.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/CreateExpenseDialog.test.tsx`
Expected: PASS.

- [ ] **Step 5: Run the full transactions suite + checks**

Run: `pnpm exec vitest run src/features/transactions`
Expected: PASS.

Run: `pnpm check` (typecheck + lint + format-check)
Expected: clean. If format-check flags files, run `just format` and re-stage.

- [ ] **Step 6: Commit**

```bash
git add src/features/transactions/CreateExpenseDialog.tsx src/features/transactions/CreateTransferDialog.tsx src/features/transactions/CreateExpenseDialog.test.tsx
git commit -m "feat(transactions): enforce source balance in create expense/transfer dialogs (#46)"
```

---

## Final verification

- [ ] Run `just check && pnpm exec vitest run` — all green.
- [ ] Manually confirm in the UI (optional): create an expense exceeding a regular (overdraftLimit 0) account's balance → blocked inline under Amount; within balance → succeeds; an account with `overdraftLimit: null` (e.g. loan/external) is never blocked.
