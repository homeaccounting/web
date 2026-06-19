# Multiple Allocations per Transaction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a single Income/Expense transaction carry multiple category allocations summing to its total, and let an Income transaction carry expense-category "reimbursement" slices (contra-expense).

**Architecture:** A small **backend** change widens `TransactionResponse` to surface the full two-bucket `allocations` (dropping the flattened `category`). The **web** form values move from a single `{amount, category}` to two slice arrays `{incomes[], expenses[]}`; a new row-based `AllocationsEditor` renders them. The total is defined as the sum of the rows (no top-level amount field). Edit folds new allocations into the amend request on total change, and uses `PATCH /allocations` for same-total re-splits. List display and the client-side category filter derive from `allocations`.

**Tech Stack:** Backend: Haskell (servant, Aeson, `Web/Types.hs`). Web: React 18 + TypeScript, react-hook-form + Zod, TanStack Query, Vitest + Testing Library + MSW, Playwright.

**Spec:** `docs/specs/2026-06-19-multiple-allocations-design.md`

**Branch:** `feat/multiple-allocations` (already created; spec committed).

---

## Conventions for every task

- **Web tests:** `pnpm exec vitest run <path>` (filter with `-t "<name>"`). Component tests render via `src/test/utils.tsx`; HTTP via MSW handlers in `src/test/handlers.ts`.
- **Web gate before any commit that touches TS:** `pnpm exec tsc --noEmit` must pass (the form-value reshape is a compile-wide change — expect many call-site errors until Phase 6 is done; do not commit a red typecheck except where a task explicitly says "expected to fail to compile until Task N").
- **Backend tests:** in `../server-infra`, `nix develop -c cabal test` (or the project's `just test`). Run from the server-infra repo root.
- **Commit cadence:** one commit per task (after its tests are green). Conventional Commits, scope `transactions`.
- The web reshape is intentionally sequenced so the codebase only compiles again at the end of **Task 6.3**. Tasks 2–6 form one logical unit; commit each but treat them as a chain.

---

## File map

### Backend (`../server-infra`)

- Modify: `src/Web/Types.hs` — add `AllocationResponse`/`AllocationsResponse`; add `allocations` to `TransactionResponse`; remove `category`; delete `transactionTypeCategoryText`.
- Modify/verify tests: `test/**` response-shape specs (grep for `category =` / `TransactionResponse`).

### Web (`.`)

- Modify: `src/api/types.ts` — `TransactionResponse` (drop `category`, add `allocations`).
- Create: `src/features/transactions/allocations.ts` — pure helpers (`allocationsTotal`, `primaryCategoryId`, `allocationCategoryIds`, `sliceArraysFromTx`, `dropEmptySlices`).
- Create: `src/features/transactions/allocations.test.ts`.
- Modify: `src/features/transactions/schema.ts` — form-value shape, Zod, mappers.
- Create: `src/features/transactions/AllocationsEditor.tsx` + `.test.tsx`.
- Modify: `src/features/transactions/IncomeExpenseForm.tsx` — render editor sections.
- Modify: `src/features/transactions/diffTransaction.ts` — array diff + amend-carries-allocations fix.
- Modify: `src/features/transactions/convertTransaction.ts` — array form values (single seeded row).
- Modify: `src/features/transactions/CopyTransactionDialog.tsx`, `CreateIncomeDialog.tsx`, `CreateExpenseDialog.tsx`, `ConvertTransactionDialog.tsx`, `EditTransactionDialog.tsx` — seed array defaults / pass `reimbursementCategories`.
- Modify: `src/features/transactions/amendmentFieldErrors.ts` + `.test.ts` — `amount`/`category` are no longer valid RHF field paths; redirect allocation/amount server errors to the form-level banner.
- Modify: `src/features/transactions/transactionFilters.ts` — match any allocation.
- Modify: `src/features/transactions/TransactionsPane.tsx` — `first +N` category cell.
- Modify: `src/test/handlers.ts` + fixtures — new response shape.
- Modify: affected `*.test.tsx` / `*.test.ts`.
- Modify: `e2e/` — 2-category expense smoke (optional, Task 8).

---

## Phase 0 — Backend: widen the response

### Task 0.1: Add `allocations` to `TransactionResponse`, drop `category`

**Repo:** `../server-infra`

**Files:**

- Modify: `src/Web/Types.hs` (record at ~`:557-578`; builders at ~`:949`, `:981`; accessor at ~`:1037-1038` — re-grep, line numbers drift)
- Test: existing response specs under `test/`

- [ ] **Step 1: Find the exact sites**

```bash
cd ../server-infra
rg -n "category = transactionTypeCategoryText|transactionTypeCategoryText|data TransactionResponse|allocationsOf|allAllocations" src/Web/Types.hs
```

- [ ] **Step 2: Write/extend a failing backend test** asserting the JSON of a posted income/expense carries `allocations.incomes` / `allocations.expenses` (each slice `{categoryId, amount:{amount,currency}}`) and **no** `category` key.

Find the existing response-encoding test:

```bash
rg -n "TransactionResponse|\"category\"|allocations" test/ | head
```

Add a case for a two-slice expense and a salary+reimbursement income (incomes + expenses both populated). Run, expect FAIL.

- [ ] **Step 3: Implement the type changes** in `src/Web/Types.hs`:

```haskell
data AllocationResponse = AllocationResponse
  { categoryId :: Text
  , amount :: Money
  }
  deriving (Show, Eq, Generic)

instance ToJSON AllocationResponse where
  toJSON = genericToJSON defaultOptions   -- match the module's existing options
instance FromJSON AllocationResponse where
  parseJSON = genericParseJSON defaultOptions

data AllocationsResponse = AllocationsResponse
  { incomes :: [AllocationResponse]
  , expenses :: [AllocationResponse]
  }
  deriving (Show, Eq, Generic)
-- ToJSON/FromJSON likewise
```

Add `allocations :: AllocationsResponse` to `TransactionResponse`; **remove** `category :: Maybe Text`. Build `allocations` from `allocationsOf tx.transactionType` (already imported; `Transfer`/`Adjustment` yield empty buckets), mapping each domain `Allocation { categoryId, amount }` → `AllocationResponse { categoryId = toText categoryId, amount }`. Apply at **both** builders (`:949`, `:981`). Delete the now-dead `transactionTypeCategoryText`; if `transactionTypeAllocationsText` has no other callers, delete it too (`rg transactionTypeAllocationsText src` to confirm).

> Match the module's existing `ToJSON` derivation style (field labels are camelCase already — `categoryId`, `sourceAccountId`). Re-use the `Money` instance already in the module.

- [ ] **Step 4: Run backend tests**

```bash
cd ../server-infra && nix develop -c cabal test 2>&1 | tail -30
```

Expected: the new response cases PASS; fix any other specs that referenced `category`.

- [ ] **Step 5: Commit** (in server-infra)

```bash
git add -A && git commit -m "feat(transaction)!: surface full two-bucket allocations in TransactionResponse (#45)

Drop the transitional flattened 'category' field; add 'allocations' with
incomes/expenses buckets. Breaking response-shape change (no upcasters)."
```

> The rest of the plan is in the **web** repo (`monorepo`). Push/PR the backend separately when both sides are green (see Task 8).

---

## Phase 1 — Web wire types + pure helpers

### Task 1.1: Reshape `TransactionResponse` in `types.ts`

**Files:** Modify `src/api/types.ts` (`TransactionResponse` ~`:321-340`)

- [ ] **Step 1: Edit the type.** Remove `category: string | null;`. Add `allocations: Allocations;` (the existing `Allocations` interface already declares `{ incomes: Allocation[]; expenses: Allocation[] }`). Update the leading comment to cite `Web/Types.hs` `TransactionResponse` with the new `allocations` field and note `category` was removed (spec §2).

- [ ] **Step 2: Typecheck (expected red downstream)**

```bash
pnpm exec tsc --noEmit 2>&1 | head -40
```

Expected: errors at `schema.ts:180`, `transactionFilters.ts:24`, `TransactionsPane.tsx:249` (and tests). These are fixed in later tasks. **Do not commit yet** — fold this into Task 1.2's commit (helpers + type together compile cleanly in isolation only after Task 1.2). Actually commit after Task 1.2.

### Task 1.2: Pure allocation helpers

**Files:** Create `src/features/transactions/allocations.ts` + `allocations.test.ts`

- [ ] **Step 1: Write failing tests** (`allocations.test.ts`):

```ts
import { describe, it, expect } from 'vitest';
import {
  allocationsTotal,
  primaryCategoryId,
  allocationCategoryIds,
  sliceArraysFromTx,
  dropEmptySlices,
} from './allocations';
import type { TransactionResponse } from '@/api/types';

const tx = (incomes: [string, number][], expenses: [string, number][]) =>
  ({
    allocations: {
      incomes: incomes.map(([categoryId, a]) => ({
        categoryId,
        amount: { amount: a, currency: 'USD' },
      })),
      expenses: expenses.map(([categoryId, a]) => ({
        categoryId,
        amount: { amount: a, currency: 'USD' },
      })),
    },
  }) as unknown as TransactionResponse;

describe('allocation helpers', () => {
  it('sums all slices across both buckets', () => {
    expect(allocationsTotal(tx([['salary', 5000]], [['rent', 500]]))).toBe(5500);
  });
  it('primary category is the first slice (income bucket first)', () => {
    expect(primaryCategoryId(tx([['salary', 5000]], [['rent', 500]]))).toBe('salary');
    expect(primaryCategoryId(tx([], [['rent', 500]]))).toBe('rent');
    expect(primaryCategoryId(tx([], []))).toBeNull();
  });
  it('collects all category ids across buckets', () => {
    expect(allocationCategoryIds(tx([['salary', 5000]], [['rent', 500]]))).toEqual([
      'salary',
      'rent',
    ]);
  });
  it('extracts slice arrays as {category, amount}', () => {
    expect(sliceArraysFromTx(tx([['salary', 5000]], [['rent', 500]]))).toEqual({
      incomes: [{ category: 'salary', amount: 5000 }],
      expenses: [{ category: 'rent', amount: 500 }],
    });
  });
  it('drops fully-empty rows but keeps partial rows', () => {
    expect(
      dropEmptySlices([
        { category: 'a', amount: 10 },
        { category: '', amount: NaN }, // fully empty → dropped
        { category: 'b', amount: NaN }, // partial → kept (will error in zod)
      ]),
    ).toEqual([
      { category: 'a', amount: 10 },
      { category: 'b', amount: NaN },
    ]);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `pnpm exec vitest run src/features/transactions/allocations.test.ts`

- [ ] **Step 3: Implement** `allocations.ts`:

```ts
import type { Allocations, TransactionResponse, UUID } from '@/api/types';

export interface Slice {
  category: UUID | '';
  amount: number; // NaN while the input is blank
}

const allSlices = (a: Allocations) => [...a.incomes, ...a.expenses];

export function allocationsTotal(tx: Pick<TransactionResponse, 'allocations'>): number {
  return allSlices(tx.allocations).reduce((sum, s) => sum + s.amount.amount, 0);
}

export function primaryCategoryId(tx: Pick<TransactionResponse, 'allocations'>): UUID | null {
  return allSlices(tx.allocations)[0]?.categoryId ?? null;
}

export function allocationCategoryIds(tx: Pick<TransactionResponse, 'allocations'>): UUID[] {
  return allSlices(tx.allocations).map((s) => s.categoryId);
}

export function sliceArraysFromTx(tx: Pick<TransactionResponse, 'allocations'>): {
  incomes: Slice[];
  expenses: Slice[];
} {
  const map = (xs: Allocations['incomes']): Slice[] =>
    xs.map((s) => ({ category: s.categoryId, amount: s.amount.amount }));
  return { incomes: map(tx.allocations.incomes), expenses: map(tx.allocations.expenses) };
}

// A row is "fully empty" only when BOTH category and amount are blank.
export function dropEmptySlices(slices: Slice[]): Slice[] {
  return slices.filter((s) => !(s.category === '' && Number.isNaN(s.amount)));
}
```

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/api/types.ts src/features/transactions/allocations.ts src/features/transactions/allocations.test.ts
git commit -m "feat(transactions): allocation helpers + TransactionResponse.allocations (#45)"
```

(Typecheck will still be red at the three downstream call sites; they are fixed in Phase 2/5/7. Note this in the commit body if desired.)

---

## Phase 2 — Schema reshape

### Task 2.1: Reshape `IncomeExpenseFormValues` + Zod + mappers

**Files:** Modify `src/features/transactions/schema.ts`; modify `schema.test.ts`

- [ ] **Step 1: Update `schema.test.ts`** to the new shape. Key cases:
  - valid income with two income rows → `toIncomeRequest` produces `allocations.incomes` length 2, `expenses` empty;
  - income with one income + one expense (reimbursement) row → both buckets populated; total = sum;
  - expense with two expense rows → `allocations.expenses` length 2;
  - empty (no rows after dropping empties) → schema invalid (`AllocationsEmpty` analogue);
  - row with category but blank amount → invalid on that row;
  - balance superRefine: expense whose **total** exceeds available → amount issue;
  - `toIncomeExpenseFormValues(tx)` seeds `incomes`/`expenses` from `tx.allocations`.

```ts
// representative
it('maps a two-row expense to an expense bucket', () => {
  const v = {
    accountId: A,
    currency: 'USD',
    incomes: [],
    expenses: [
      { category: C1, amount: 30 },
      { category: C2, amount: 70 },
    ],
    description: '',
    date: undefined,
    labels: [],
  };
  const req = toExpenseRequest(v);
  expect(req.allocations.expenses).toHaveLength(2);
  expect(req.allocations.incomes).toEqual([]);
});
it('maps salary + reimbursement income to both buckets', () => {
  const v = {
    accountId: A,
    currency: 'USD',
    incomes: [{ category: SAL, amount: 5000 }],
    expenses: [{ category: RENT, amount: 500 }],
    description: '',
    date: undefined,
    labels: [],
  };
  const req = toIncomeRequest(v);
  expect(req.allocations.incomes).toHaveLength(1);
  expect(req.allocations.expenses).toHaveLength(1);
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** the schema. Replace the `amount`/`category` fields with slice arrays and a `kind`-aware factory. Core:

```ts
const sliceSchema = z.object({
  category: uuid,
  amount: z.coerce.number().positive('Amount must be positive'),
});

// Base object — rows already have empties dropped by the form before submit
// (see AllocationsEditor / handleSubmit), so every row here must be valid.
export const incomeExpenseFormSchema = z.object({
  accountId: uuid,
  currency: z.string().min(1),
  incomes: z.array(sliceSchema),
  expenses: z.array(sliceSchema),
  description,
  date: optionalIsoDate,
  labels: z.array(uuid).default([]),
});
export type Slice = z.infer<typeof sliceSchema>;
export type IncomeExpenseFormValues = {
  accountId: string;
  currency: string;
  incomes: { category: string; amount: number }[];
  expenses: { category: string; amount: number }[];
  description: string;
  date?: string;
  labels: string[];
};
```

Add a `kind`-aware refinement used by **all** call sites (create _and_ edit), not just balance:

```ts
function refineAllocations(kind: 'income' | 'expense', accounts: AccountResponse[] | null) {
  return (v: IncomeExpenseFormValues, ctx: z.RefinementCtx) => {
    const rows = [...v.incomes, ...v.expenses];
    if (rows.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expenses'],
        message: 'Add at least one category',
      });
    }
    if (kind === 'expense' && v.incomes.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['incomes'],
        message: 'An expense cannot carry income categories',
      });
    }
    if (kind === 'expense' && accounts) {
      const total = v.expenses.reduce((s, r) => s + r.amount, 0);
      const msg = balanceIssue(accounts, v.accountId, total);
      if (msg) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expenses'], message: msg });
    }
  };
}

export function makeIncomeExpenseFormSchema(
  accounts: AccountResponse[] | null,
  kind: 'income' | 'expense',
) {
  return incomeExpenseFormSchema.superRefine(refineAllocations(kind, accounts));
}
```

> `IncomeExpenseForm` always builds its resolver via `makeIncomeExpenseFormSchema` now (pass `accounts: null` when balance enforcement is off — the empty/contra checks still run). This replaces the bare `incomeExpenseFormSchema` resolver branch.

Mappers:

```ts
const toReqSlices = (rows: { category: string; amount: number }[]) =>
  rows.map((r) => ({ category: r.category, amount: r.amount }));

export function toIncomeRequest(v: IncomeExpenseInput): IncomeRequest {
  return {
    accountId: v.accountId,
    currency: v.currency,
    allocations: { incomes: toReqSlices(v.incomes), expenses: toReqSlices(v.expenses) },
    description: v.description,
    date: v.date ? dateInputToWire(v.date) : undefined,
    labels: labelsOrUndefined(v.labels),
  };
}
export const toExpenseRequest = toIncomeRequest; // structurally identical (incomes empty by construction)
```

Round-trip seed:

```ts
export function toIncomeExpenseFormValues(
  tx: TransactionResponse,
  accounts: AccountResponse[],
): IncomeExpenseFormValues {
  const income = isIncome(tx.transactionType);
  const accountId = income ? tx.targetAccountId : tx.sourceAccountId;
  const currency =
    accounts.find((a) => a.id === accountId)?.currency ??
    (income ? tx.targetCurrency : tx.sourceCurrency);
  const { incomes, expenses } = sliceArraysFromTx(tx); // from allocations.ts
  return {
    accountId,
    currency,
    incomes,
    expenses,
    description: tx.description,
    date: wireToDateInput(tx.date),
    labels: tx.labels,
  };
}
```

- [ ] **Step 4: Run schema tests, expect PASS** — `pnpm exec vitest run src/features/transactions/schema.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/schema.ts src/features/transactions/schema.test.ts
git commit -m "feat(transactions): slice-array form values + two-bucket mappers (#45)"
```

---

## Phase 3 — AllocationsEditor

### Task 3.1: The editor component

**Files:** Create `src/features/transactions/AllocationsEditor.tsx` + `AllocationsEditor.test.tsx`

- [ ] **Step 1: Write failing component tests** (`AllocationsEditor.test.tsx`). Render inside a host that provides a `react-hook-form` context (use `FormProvider` with a tiny wrapper, mirroring `IncomeExpenseForm.test.tsx`). Cases:
  - renders one row per slice in a section;
  - `+ Add` appends an empty row;
  - remove button drops a row;
  - the running total reflects the sum of all rows in all sections and shows the currency;
  - the collapsible section is collapsed by default and expands on click.

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement** `AllocationsEditor.tsx`. Use `useFieldArray` per section. Sketch:

```tsx
import { useFieldArray, useFormContext } from 'react-hook-form';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, FormItem, FormControl, FormMessage } from '@/components/ui/form';
import { CategoryCombobox } from './CategoryCombobox';
import { formatMoney } from '@/lib/format';
import type { DictionaryEntryResponse } from '@/api/types';

export interface AllocationSection {
  name: 'incomes' | 'expenses';
  title: string;
  addLabel: string;
  categories: DictionaryEntryResponse[];
  collapsible?: boolean;
}

export interface AllocationsEditorProps {
  sections: AllocationSection[];
  currency: string;
}

export function AllocationsEditor({ sections, currency }: AllocationsEditorProps) {
  const { control, watch } = useFormContext();
  const incomes = watch('incomes') ?? [];
  const expenses = watch('expenses') ?? [];
  const total = [...incomes, ...expenses]
    .reduce((s, r) => s + (Number.isFinite(r?.amount) ? r.amount : 0), 0);

  return (
    <div className="space-y-4">
      {sections.map((section) => (
        <Section key={section.name} section={section} />
      ))}
      <div className="flex justify-end text-sm font-medium" data-testid="allocations-total">
        Total: {formatMoney(total, currency)}
      </div>
    </div>
  );
}

function Section({ section }: { section: AllocationSection }) {
  const { control } = useFormContext();
  const { fields, append, remove } = useFieldArray({ control, name: section.name });
  const [open, setOpen] = useState(!section.collapsible);
  // header (button toggles `open` when collapsible); body renders rows:
  //   <CategoryCombobox options={section.categories} ... /> + amount <Input> + remove btn
  //   + <Button onClick={() => append({ category: '', amount: NaN })}>{section.addLabel}</Button>
  // Each row binds via FormField name={`${section.name}.${i}.category`} and `.amount`.
  // Render nothing/collapsed body when !open.
  ...
}
```

> Reuse the **amount `<Input>` pattern** from `IncomeExpenseForm.tsx:120-150` (the `''`/`'-'`/`valueAsNumber` handling) so blank amounts stay `NaN`/`''` rather than `0`. Extract that into a small `AmountInput` if it helps DRY; otherwise inline.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/AllocationsEditor.tsx src/features/transactions/AllocationsEditor.test.tsx
git commit -m "feat(transactions): AllocationsEditor row-based split editor (#45)"
```

---

## Phase 4 — Wire the editor into the form

### Task 4.1: `IncomeExpenseForm` renders sections; drop single amount/category

**Files:** Modify `src/features/transactions/IncomeExpenseForm.tsx`; modify `IncomeExpenseForm.test.tsx`

- [ ] **Step 1: Update `IncomeExpenseForm.test.tsx`** for the new shape: assert the income form shows an "Income categories" section and a collapsed "Reimbursements" section; the expense form shows only "Expense categories"; submitting yields the slice arrays.

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement.** Remove the `amount` and `category` `FormField`s. Add:
  - props: replace `categories` with what each section needs. The form now needs **both** dictionaries for income (income-category + expense-category for reimbursements). Change the prop to `incomeCategories?` / `expenseCategories` (or pass the `config.dictionaries` slice). Simplest: pass `categories` (the kind's primary dict) **and** `reimbursementCategories?` (expense dict, income form only).
  - build `sections`:
    ```tsx
    const sections: AllocationSection[] =
      kind === 'income'
        ? [
            {
              name: 'incomes',
              title: 'Income categories',
              addLabel: '+ Add income category',
              categories,
            },
            {
              name: 'expenses',
              title: 'Reimbursements (reduces an expense)',
              addLabel: '+ Add reimbursement',
              categories: reimbursementCategories ?? [],
              collapsible: true,
            },
          ]
        : [
            {
              name: 'expenses',
              title: 'Expense categories',
              addLabel: '+ Add category',
              categories,
            },
          ];
    ```
  - render `<AllocationsEditor sections={sections} currency={form.watch('currency') || ''} />` where the amount/category fields used to be.
  - resolver: always `makeIncomeExpenseFormSchema(enforceBalance ? accounts : null, kind)`. **Remove** the now-unused bare `incomeExpenseFormSchema` import (`noUnusedLocals` will flag it at the Task 6.4 typecheck gate).
  - **handleSubmit**: drop fully-empty rows before calling `onSubmit`:
    ```tsx
    const submit = form.handleSubmit(async (values) => {
      await onSubmit({
        ...values,
        incomes: dropEmptySlices(values.incomes),
        expenses: dropEmptySlices(values.expenses),
      });
    });
    ```
    (Empty-row drop happens here so Zod sees only real rows — matches schema Task 2.1 assumption.)

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/IncomeExpenseForm.tsx src/features/transactions/IncomeExpenseForm.test.tsx
git commit -m "feat(transactions): render allocation sections in IncomeExpenseForm (#45)"
```

---

## Phase 5 — Edit diff (fixes the amend contract)

### Task 5.1: Array-based diff; allocations ride inside the amend

**Files:** Modify `src/features/transactions/diffTransaction.ts`; modify `diffTransaction.test.ts`

- [ ] **Step 1: Update `diffTransaction.test.ts`**:
  - same total, different split → `diff.allocations` set, `diff.amendment` **undefined**;
  - total changed → `diff.amendment.newAllocations` set to the new buckets, `diff.allocations` **undefined**;
  - account changed (same total) → `diff.amendment.newAllocations` set;
  - reimbursement round-trip: income with income+expense rows, change a reimbursement amount (total changes) → amendment carries both buckets;
  - no categorised change → neither set.

```ts
it('total change folds allocations into the amendment, no separate setAllocations', () => {
  const base = fv({ expenses: [{ category: C, amount: 100 }] });
  const next = fv({ expenses: [{ category: C, amount: 120 }] });
  const diff = diffIncomeExpense(base, next, expenseTx);
  expect(diff.amendment?.newAllocations?.expenses).toHaveLength(1);
  expect(diff.allocations).toBeUndefined();
});
it('same-total re-split uses setAllocations only', () => {
  const base = fv({ expenses: [{ category: C, amount: 100 }] });
  const next = fv({
    expenses: [
      { category: C, amount: 60 },
      { category: D, amount: 40 },
    ],
  });
  const diff = diffIncomeExpense(base, next, expenseTx);
  expect(diff.amendment).toBeUndefined();
  expect(diff.allocations?.expenses).toHaveLength(2);
});
```

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement.** Replace `bucketAllocation`/single-slice logic with array builders and the corrected branch:

```ts
const toMoneySlices = (
  rows: { category: UUID; amount: number }[],
  currency: string,
): Allocation[] =>
  rows.map((r) => ({ categoryId: r.category, amount: { amount: r.amount, currency } }));

const buildAllocations = (v: IncomeExpenseFormValues, currency: string): Allocations => ({
  incomes: toMoneySlices(v.incomes, currency),
  expenses: toMoneySlices(v.expenses, currency),
});

const sumSlices = (v: IncomeExpenseFormValues) =>
  [...v.incomes, ...v.expenses].reduce((s, r) => s + r.amount, 0);

const sameSlices = (
  a: { category: string; amount: number }[],
  b: { category: string; amount: number }[],
) =>
  a.length === b.length &&
  a.every((s, i) => s.category === b[i].category && s.amount === b[i].amount);

export function diffIncomeExpense(initial, next, tx): TransactionEditDiff {
  const diff: TransactionEditDiff = {};
  if (next.description !== initial.description) diff.description = next.description;
  if (next.date !== initial.date && next.date) diff.date = dateInputToWire(next.date);
  if (!sameLabels(initial.labels, next.labels)) diff.labels = [...next.labels];

  const income = isIncome(tx.transactionType);
  const externalLeg = income ? tx.sourceAccountId : tx.targetAccountId;
  const externalCurrency = income ? tx.sourceCurrency : tx.targetCurrency;
  const accountChanged = next.accountId !== initial.accountId;
  const newTotal = sumSlices(next);
  const oldTotal = sumSlices(initial);
  const totalChanged = newTotal !== oldTotal;
  const splitChanged =
    !sameSlices(initial.incomes, next.incomes) || !sameSlices(initial.expenses, next.expenses);

  if (accountChanged || totalChanged) {
    diff.amendment = {
      sourceAccountId: income ? externalLeg : next.accountId,
      targetAccountId: income ? next.accountId : externalLeg,
      sourceAmount: newTotal,
      sourceCurrency: income ? externalCurrency : next.currency,
      targetAmount: newTotal,
      targetCurrency: income ? next.currency : externalCurrency,
      newAllocations: buildAllocations(next, next.currency), // <-- allocations ride INSIDE amend
    };
  } else if (splitChanged) {
    diff.allocations = buildAllocations(next, next.currency); // same total → PATCH /allocations
  }
  return diff;
}
```

> This corrects the pre-existing bug (bare amend was rejected by the merged backend) per spec §5.

- [ ] **Step 4: Run, expect PASS**

- [ ] **Step 5: Update stale comments (spec §5a)** in `src/api/types.ts:285-288` (`AmendTransactionRequest.newAllocations`) and `src/features/transactions/convertTransaction.ts:72-73` to say allocations are required on **all** categorised amends, not just cross-kind.

- [ ] **Step 6: Run, commit**

```bash
git add src/features/transactions/diffTransaction.ts src/features/transactions/diffTransaction.test.ts src/api/types.ts src/features/transactions/convertTransaction.ts
git commit -m "fix(transactions): fold allocations into categorised amend; array diff (#45)"
```

---

## Phase 6 — Consumers: dialogs (restore compile)

### Task 6.1: Create dialogs seed one row

**Files:** Modify `CreateIncomeDialog.tsx`, `CreateExpenseDialog.tsx` (+ their tests)

- [ ] **Step 1: Update tests** to expect the new defaults (one seeded row with the default category, blank amount; reimbursement section present+collapsed on income).

- [ ] **Step 2: Implement.** Change `defaults` from `{ amount, category }` to slice arrays:

```ts
const defaults = useMemo(
  () => ({
    accountId: defaultAccount?.id ?? '',
    currency: defaultAccount?.currency ?? '',
    incomes: [{ category: config?.defaultIncomeCategory ?? '', amount: NaN }],
    expenses: [],
    description: '',
    date: nowDateTimeInput(),
    labels: [] as UUID[],
  }),
  [defaultAccount?.id, defaultAccount?.currency, config?.defaultIncomeCategory],
);
```

Expense dialog: `incomes: []`, `expenses: [{ category: config?.defaultExpenseCategory ?? '', amount: NaN }]`. Pass `reimbursementCategories={config?.dictionaries['expense-category']?.entries ?? []}` to the income form; the expense form needs only its own `categories`. Keep `enforceBalance` wiring as today (the create flow already passes balance enforcement for expense — verify against current `CreateExpenseDialog.tsx`).

- [ ] **Step 3: Run dialog tests, expect PASS**

- [ ] **Step 4: Commit**

```bash
git add src/features/transactions/CreateIncomeDialog.tsx src/features/transactions/CreateExpenseDialog.tsx src/features/transactions/*Dialog.test.tsx
git commit -m "feat(transactions): seed create dialogs with slice rows (#45)"
```

### Task 6.2: Copy dialog preserves all slices

**Files:** Modify `CopyTransactionDialog.tsx` (+ test)

- [ ] **Step 1: Update test** — copying a split transaction preserves all slices (uses `toIncomeExpenseFormValues`, which now reads `tx.allocations`). Add a fixture tx with 2 expense slices; assert the copy submits 2 slices.

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement.** `CopyTransactionDialog` already calls `toIncomeExpenseFormValues`/`toIncomeRequest`/`toExpenseRequest`; once those are array-based (Task 2.1) it should largely work. Pass `reimbursementCategories` to the income form. **Explicitly delete the `amount: Math.abs(seed.amount)` override** (`CopyTransactionDialog.tsx:116-119`): `seed` no longer has an `amount` field, and allocation slice amounts in `tx.allocations` are already **positive magnitudes** (spec wire example), so no sign-correction is needed. Confirm the copied slices seed positive amounts; remove the obsolete negative-expense comment.

- [ ] **Step 4: Run, expect PASS; commit**

```bash
git add src/features/transactions/CopyTransactionDialog.tsx src/features/transactions/CopyTransactionDialog.test.tsx
git commit -m "feat(transactions): copy preserves all allocation slices (#45)"
```

### Task 6.3: Edit dialog wiring + server field-error mapping

**Files:** Modify `EditTransactionDialog.tsx`, `amendmentFieldErrors.ts` (+ `amendmentFieldErrors.test.ts`)

- [ ] **Step 1: Update `amendmentFieldErrors.test.ts`.** The current mapping maps backend `sourceAmount`/`targetAmount` → `'amount'` and `newAllocations`/`allocations` → `'category'`. Neither `amount` nor `category` is a valid RHF field path after the reshape. Change the expectations so allocation/amount server errors map to a **form-level target** (return `null`/`'root'` so the dialog shows its banner) rather than a dead field.

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement `amendmentFieldErrors.ts`.** For income/expense, map `sourceAmount`/`targetAmount`/`newAllocations`/`allocations` to the form-level banner path (the dialog already renders `edit.error` as a banner when no field error is set — confirm in `EditTransactionDialog.tsx:223-225`). Keep `accountId`/account mappings if any remain valid. Update the comment.

- [ ] **Step 4: Wire `EditTransactionDialog`** (`EditIncomeExpenseBody`, ~`:234-245`): pass `reimbursementCategories={config?.dictionaries['expense-category']?.entries ?? []}` to `IncomeExpenseForm` (income path only; harmless to always pass and let the form ignore it for the expense kind). The seed side (`toIncomeExpenseFormValues(tx, accounts)` at `:199`) is already array-based from Task 2.1.

- [ ] **Step 5: Run, expect PASS; commit**

```bash
git add src/features/transactions/EditTransactionDialog.tsx src/features/transactions/amendmentFieldErrors.ts src/features/transactions/amendmentFieldErrors.test.ts
git commit -m "fix(transactions): edit reimbursement section + form-level alloc error mapping (#45)"
```

### Task 6.4: Convert dialog — single seeded row; full typecheck green

**Files:** Modify `convertTransaction.ts`, `ConvertTransactionDialog.tsx` (+ tests)

- [ ] **Step 1: Update `convertTransaction.test.ts`** — `toConvertIncomeExpenseDefaults` returns slice arrays (one seeded row in the target-kind bucket); `toIncomeExpenseAmendment` builds `newAllocations` from the form's slice arrays.

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement.** `toConvertIncomeExpenseDefaults` returns:

```ts
return {
  accountId,
  currency,
  incomes: targetKind === 'income' ? [{ category: defaultCategory ?? '', amount }] : [],
  expenses: targetKind === 'expense' ? [{ category: defaultCategory ?? '', amount }] : [],
  description: tx.description,
  date: wireToDateInput(tx.date),
  labels: tx.labels,
};
```

`toIncomeExpenseAmendment(targetKind, v, externalAccountId)` builds `newAllocations` from `v.incomes`/`v.expenses` (reuse the `diffTransaction` `buildAllocations` helper — export it, or duplicate the small mapper) and `sourceAmount`/`targetAmount` = `sumSlices(v)`.

- [ ] **Step 4: Run convert tests, expect PASS**

- [ ] **Step 5: FULL TYPECHECK — must be green now**

```bash
pnpm exec tsc --noEmit
```

Expected: **no errors**. Fix any stragglers (search `\.category\b`, `\.amount\b` on form values, and `tx.category`).

- [ ] **Step 6: Commit**

```bash
git add src/features/transactions/convertTransaction.ts src/features/transactions/ConvertTransactionDialog.tsx src/features/transactions/convertTransaction.test.ts
git commit -m "feat(transactions): convert seeds single slice row; typecheck green (#45)"
```

---

## Phase 7 — Display + filter

### Task 7.1: Category column shows `first +N`

**Files:** Modify `src/features/transactions/TransactionsPane.tsx` (~`:249`) (+ `TransactionsPane.test.tsx`)

- [ ] **Step 1: Add a test** — a row with 2 allocations renders `<firstName> +1` and a `title` listing all category names; a single-allocation row renders just the name.

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement.** Replace `{t.category ? (categoryNameById.get(t.category) ?? '') : ''}` with a small inline render using `allocationCategoryIds(t)`:

```tsx
const ids = allocationCategoryIds(t);
const names = ids.map((id) => categoryNameById.get(id) ?? '').filter(Boolean);
const cell =
  names.length === 0 ? '' : names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
// render <span title={names.join(', ')}>{cell}</span>
```

(`categoryNameById` already merges both dictionaries — `TransactionsPane.tsx:84-90`.)

- [ ] **Step 4: Run, expect PASS; commit**

```bash
git add src/features/transactions/TransactionsPane.tsx src/features/transactions/TransactionsPane.test.tsx
git commit -m "feat(transactions): show split categories as 'first +N' (#45)"
```

### Task 7.2: Filter matches any allocation

**Files:** Modify `src/features/transactions/transactionFilters.ts` (`:24`) (+ `transactionFilters.test.ts`)

- [ ] **Step 1: Add a test** — a transaction split `[A, B]` matches a filter for `B` (the non-first slice). A transfer/adjustment (empty buckets) is excluded when any category filter is set.

- [ ] **Step 2: Run, expect FAIL**

- [ ] **Step 3: Implement.** Replace line 24:

```ts
if (filters.categoryId && !allocationCategoryIds(row).includes(filters.categoryId)) return false;
```

Update the doc comment (no longer "head allocation").

- [ ] **Step 4: Run, expect PASS; commit**

```bash
git add src/features/transactions/transactionFilters.ts src/features/transactions/transactionFilters.test.ts
git commit -m "fix(transactions): category filter matches any allocation slice (#45)"
```

---

## Phase 8 — Fixtures, integration, E2E, verification

### Task 8.1: MSW handlers & shared fixtures

**Files:** Modify `src/test/handlers.ts`, any shared transaction fixtures

- [ ] **Step 1:** Grep for `category:` in test fixtures/handlers:

```bash
rg -n "category:\s*'" src/test src/features/transactions -g '*.ts' -g '*.tsx'
```

- [ ] **Step 2:** Replace flattened `category` in transaction fixtures with `allocations: { incomes: [...], expenses: [...] }`. Provide a fixture helper (e.g. `makeTxAllocations(incomes, expenses)`) to avoid repetition.
- [ ] **Step 3:** Run the **full** web suite: `pnpm exec vitest run`. Fix any remaining fixture drift.
- [ ] **Step 4: Commit**

```bash
git add src/test
git commit -m "test(transactions): fixtures carry two-bucket allocations (#45)"
```

### Task 8.2: E2E smoke — 2-category expense

**Files:** Modify/extend `e2e/` (an existing transactions spec)

- [ ] **Step 1:** Add a Playwright flow: open Create Expense, add a second category row, fill both amounts, submit, assert the row appears with `first +1` in the Category column.
- [ ] **Step 2:** `pnpm exec playwright test` (or `just e2e`). Expected: PASS.
- [ ] **Step 3: Commit**

### Task 8.3: Final verification gate

- [ ] **Step 1:** `just check` (typecheck + lint + format-check) — must pass.
- [ ] **Step 2:** `just test` (vitest run) — must pass.
- [ ] **Step 3:** `just build` — must pass.
- [ ] **Step 4 (backend):** in `../server-infra`, `nix develop -c cabal test` — must pass.
- [ ] **Step 5:** Use superpowers:requesting-code-review before opening PRs.
- [ ] **Step 6:** Two PRs (backend first, then web) — title `feat(transactions): multiple allocations per transaction (#45)`; web PR depends on the backend response shape, so merge backend first (or coordinate). Note the breaking response-shape change in both PR bodies.

---

## Risk notes for the implementer

- **Compile stays red Tasks 1.1 → 6.4.** This is expected and called out; the typecheck gate is at Task 6.4 Step 5. Don't "fix" intermediate red by hacking — follow the chain.
- **Why per-task vitest still passes while `tsc` is red:** Vitest runs through esbuild (`@vitejs/plugin-react`), which **strips types** rather than type-checking — so type errors don't block test runs. But esbuild _does_ fail on genuine **syntax** errors and on **runtime** imports of symbols that don't exist yet. Each task only edits modules that stay syntactically valid and only imports symbols already created in an earlier task, so the chain holds. If a mid-chain test fails to _load_ (not assert), suspect a real missing runtime export, not a type error.
- **`NaN` amounts** flow from blank inputs. The form drops fully-empty rows before submit (Task 4.1); Zod's `positive()` rejects a `NaN` amount on a partially-filled row (category set, amount blank) — that's the intended per-row error.
- **`toExpenseRequest === toIncomeRequest`** is intentional: the expense form guarantees `incomes: []` (no income section rendered + the schema `incomes`-empty guard), so the shared mapper is safe.
- **Backend/web ordering:** the web tests run against MSW (new shape) and pass independently, but the deployed web build requires the backend response change — merge backend first.
- **`formatMoney`** signature: confirm it is `formatMoney(amount, currency)` (`src/lib/format.ts`) before using it in the editor total.
