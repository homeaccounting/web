# Refund a transaction — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a guided "Refund" flow to the transactions UI: on a completed Expense, open a dialog that creates an Income-with-contra-allocations transaction carrying a `Refund` relation to the original, then surface the linkage on both rows.

**Architecture:** A refund is _not_ a new primitive — it's an ordinary Income with expense-bucket (contra) allocations plus a `Refund` relation edge (backend#88, merged). We reuse the existing `IncomeExpenseForm` / `AllocationsEditor` and the tracker#32 fixed-target-total UX, extending them with two small, generic props (`extraRefine`, `lockTarget`). A new `RefundTransactionDialog` seeds the form from the original (defaults = remaining refundable per category), a new `useRefundSummary` hook computes remaining from prior refunds, and the create goes through a new `useRefundTransaction` hook. Linkage badges read from a pure `buildRefundIndex` over the loaded window (originals) and each refund's own outbound relation.

**Tech Stack:** React 18 + TypeScript (strict), TanStack Query, react-hook-form + Zod, shadcn/ui, Vitest + Testing Library + MSW.

**Spec:** `docs/specs/2026-07-06-refund-transaction-design.md`

---

## File Structure

**Create:**

- `src/features/transactions/useTransactionRelations.ts` — query `GET /:id/relations`.
- `src/features/transactions/useRefundSummary.ts` — remaining refundable per category + total.
- `src/features/transactions/useRefundTransaction.ts` — create Income + `Refund` relation.
- `src/features/transactions/refundIndex.ts` — pure `buildRefundIndex` for list badges.
- `src/features/transactions/RefundTransactionDialog.tsx` — the dialog.
- `src/features/transactions/RefundBadge.tsx` — the two linkage badges.
- Test siblings: `*.test.ts(x)` for each of the above.

**Modify:**

- `src/api/types.ts` — relation DTOs; `relation?` on `IncomeRequest`; `relations` on `TransactionResponse`; split `ExpenseRequest`.
- `src/api/transactions.ts` — add `get` + `relations` methods.
- `src/features/transactions/schema.ts` — export `refundAllocationCaps` superRefine factory.
- `src/features/transactions/IncomeExpenseForm.tsx` — optional `extraRefine` + `lockTarget` props.
- `src/features/transactions/AllocationsEditor.tsx` — optional `lockTarget` (target on, toggle hidden, target read-only).
- `src/features/transactions/TransactionsPane.tsx` — `refundTarget` state, guarded "Refund" menu item, render dialog, badges in the row.
- `src/test/handlers.ts` — MSW handlers for `GET /:id`, `GET /:id/relations`, and `relation` on income create.

---

## Task 1: API types + client methods

**Files:**

- Modify: `src/api/types.ts`
- Modify: `src/api/transactions.ts`
- Test: `src/api/types.test.ts`, `src/api/transactions.test.ts`

- [ ] **Step 1: Write failing test** for the new client methods in `src/api/transactions.test.ts` (follow the existing pattern in that file — a fake `ApiClient` capturing method + path):

```ts
it('get() fetches a single transaction by id', async () => {
  const calls: string[] = [];
  const client = {
    get: async (p: string) => {
      calls.push(p);
      return {} as never;
    },
  } as unknown as ApiClient;
  await transactionsApi(client).get('abc');
  expect(calls).toEqual(['/api/transactions/abc']);
});

it('relations() fetches the relations endpoint', async () => {
  const calls: string[] = [];
  const client = {
    get: async (p: string) => {
      calls.push(p);
      return {} as never;
    },
  } as unknown as ApiClient;
  await transactionsApi(client).relations('abc');
  expect(calls).toEqual(['/api/transactions/abc/relations']);
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm exec vitest run src/api/transactions.test.ts` — Expected: FAIL (`get`/`relations` not a function).

- [ ] **Step 3: Add the DTOs to `src/api/types.ts`.** Place near the other transaction types (cite backend lines in comments):

```ts
// Typed transaction relationships. Mirrors backend Web/Types.hs:649
// (TransactionRelation) — used for BOTH request and response. relationKind wire
// tokens come from Domain/Core/Types.hs renderRelationKind.
export type RelationKind = 'refund' | 'merge' | 'split' | 'associated';

export interface TransactionRelation {
  relatedTransactionId: UUID;
  relationKind: RelationKind;
}

// Mirrors backend Web/Types.hs:661 (GET /api/transactions/:id/relations).
export interface TransactionRelationsResponse {
  outbound: TransactionRelation[];
  inbound: TransactionRelation[];
}
```

Add `relation?: TransactionRelation;` to `IncomeRequest` (cite `Web/Types.hs:389`). **Split the alias**: change `export type ExpenseRequest = IncomeRequest;` to a standalone interface **without** `relation` (backend `ExpenseRequest` has no relation field). Since `IncomeRequest` and `ExpenseRequest` are now structurally different only by `relation?`, define `ExpenseRequest` as the base and `IncomeRequest = ExpenseRequest & { relation?: TransactionRelation }` — or two explicit interfaces. Add `relations: TransactionRelation[];` to `TransactionResponse` (cite `Web/Types.hs:633`).

- [ ] **Step 4: Add the client methods to `src/api/transactions.ts`** (inside the returned object):

```ts
get: (id: UUID): Promise<TransactionResponse> =>
  client.get<TransactionResponse>(`/api/transactions/${id}`),
relations: (id: UUID): Promise<TransactionRelationsResponse> =>
  client.get<TransactionRelationsResponse>(`/api/transactions/${id}/relations`),
```

Import `TransactionRelationsResponse` in the type import block.

- [ ] **Step 5: Run tests + typecheck** — `pnpm exec vitest run src/api/transactions.test.ts` (PASS) and `just typecheck` (green; fixes any `toExpenseRequest` fallout from the split — it should still compile since `toIncomeRequest` produces a superset).

- [ ] **Step 6: Commit** — `git commit -m "feat(transactions): relation DTOs + get/relations client methods (tracker#33)"`

---

## Task 2: `buildRefundIndex` pure helper

**Files:**

- Create: `src/features/transactions/refundIndex.ts`
- Test: `src/features/transactions/refundIndex.test.ts`

- [ ] **Step 1: Write failing tests.** The helper folds a loaded window's income outbound `refund` edges onto the referenced original id, summing the refund's own total (sum of its allocation slices across both buckets):

```ts
import { buildRefundIndex } from './refundIndex';
import type { TransactionResponse } from '@/api/types';

const tx = (over: Partial<TransactionResponse>): TransactionResponse => ({
  id: 'x',
  sourceAccountId: 'a',
  targetAccountId: 'b',
  sourceAmount: 0,
  sourceCurrency: 'EUR',
  targetAmount: 0,
  targetCurrency: 'EUR',
  exchangeRate: null,
  description: '',
  status: 'Completed',
  failureReason: null,
  transactionType: 'income',
  allocations: { incomes: [], expenses: [] },
  date: '2026-07-06T00:00:00Z',
  labels: [],
  amendmentCount: 0,
  relations: [],
  ...over,
});

it('sums refund edges per original', () => {
  const original = tx({ id: 'O', transactionType: 'expense' });
  const refund = tx({
    id: 'R',
    transactionType: 'income',
    allocations: {
      incomes: [],
      expenses: [{ categoryId: 'c', amount: { amount: 30, currency: 'EUR' } }],
    },
    relations: [{ relatedTransactionId: 'O', relationKind: 'refund' }],
  });
  const idx = buildRefundIndex([original, refund]);
  expect(idx.get('O')).toEqual({ count: 1, total: 30 });
});

it('ignores non-refund relations and empty edges', () => {
  const idx = buildRefundIndex([
    tx({ id: 'R', relations: [{ relatedTransactionId: 'O', relationKind: 'associated' }] }),
  ]);
  expect(idx.get('O')).toBeUndefined();
});
```

- [ ] **Step 2: Run to verify fail** — `pnpm exec vitest run src/features/transactions/refundIndex.test.ts` — Expected: FAIL (module not found).

- [ ] **Step 3: Implement `refundIndex.ts`:**

```ts
import type { TransactionResponse } from '@/api/types';
import { roundMoney } from '@/lib/money';

export interface RefundStat {
  count: number;
  total: number;
}

const txTotal = (t: TransactionResponse): number =>
  roundMoney(
    [...t.allocations.incomes, ...t.allocations.expenses].reduce((s, a) => s + a.amount.amount, 0),
  );

/** Map originalId → aggregate of refunds pointing at it, from the loaded window. */
export function buildRefundIndex(transactions: TransactionResponse[]): Map<string, RefundStat> {
  const idx = new Map<string, RefundStat>();
  for (const t of transactions) {
    for (const rel of t.relations) {
      if (rel.relationKind !== 'refund') continue;
      const prev = idx.get(rel.relatedTransactionId) ?? { count: 0, total: 0 };
      idx.set(rel.relatedTransactionId, {
        count: prev.count + 1,
        total: roundMoney(prev.total + txTotal(t)),
      });
    }
  }
  return idx;
}
```

- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(transactions): buildRefundIndex helper for linkage badges (tracker#33)"`

---

## Task 3: `useTransactionRelations` + `useRefundSummary` hooks

**Files:**

- Create: `src/features/transactions/useTransactionRelations.ts`, `src/features/transactions/useRefundSummary.ts`
- Test: `src/features/transactions/useRefundSummary.test.tsx`
- Modify: `src/test/handlers.ts`

- [ ] **Step 1: Add MSW handlers** in `src/test/handlers.ts` for `GET /api/transactions/:id/relations` and `GET /api/transactions/:id` (return fixtures per-test via `server.use(...)`).

- [ ] **Step 2: Write failing test** for `useRefundSummary` (render via `src/test/utils.tsx`; sign in per conventions). Original expense `O` = Groceries 60 + Fuel 40 (total 100). One prior refund `R1` against `O` = Groceries 30. Expect:

```ts
// remainingByCategory: { Groceries: 30, Fuel: 40 }, remainingTotal: 70, refundedTotal: 30
```

Set up: `GET /O/relations` → `{ outbound: [], inbound: [{ relatedTransactionId: 'R1', relationKind: 'refund' }] }`; `GET /R1` → refund tx with `expenses: [{ categoryId: 'Groceries', amount: { amount: 30 } }]`.

- [ ] **Step 3: Run to verify fail** — Expected: FAIL (module not found).

- [ ] **Step 4: Implement `useTransactionRelations.ts`** — TanStack query keyed `['transaction-relations', id]`, calls `transactionsApi(client).relations(id)`, `enabled: Boolean(id) && enabled`. Follow the `ApiClient` construction pattern from `useCreateIncome.ts`.

- [ ] **Step 5: Implement `useRefundSummary.ts`.** Given `original: TransactionResponse` and `enabled`: query relations → take `inbound` refund edges → fetch each prior refund via `transactionsApi(client).get(id)` (a `useQueries` fan-out or a single async queryFn that `Promise.all`s the gets). Compute from the **original's** `allocations.expenses` slices:
  - `originalByCategory` = per-category original amount.
  - `refundedByCategory` = per-category sum across prior refunds' `expenses` slices.
  - `remainingByCategory[c] = roundMoney(original[c] - refunded[c])` (floor at 0).
  - `remainingTotal = roundMoney(originalTotal - refundedTotal)`.
  - Expose `{ isLoading, isError, refundedTotal, refundedByCategory, remainingTotal, remainingByCategory }`. `isError` true if the relations query OR any prior-refund fetch fails (do **not** seed against partial data — spec §Hooks).

  Use `roundMoney` from `@/lib/money`.

- [ ] **Step 6: Run tests** — PASS.
- [ ] **Step 7: Commit** — `git commit -m "feat(transactions): useTransactionRelations + useRefundSummary hooks (tracker#33)"`

---

## Task 4: `useRefundTransaction` hook

**Files:**

- Create: `src/features/transactions/useRefundTransaction.ts`
- Test: `src/features/transactions/useRefundTransaction.test.tsx`

- [ ] **Step 1: Write failing test** — mutate with an `IncomeRequest` carrying `relation`, assert (via MSW spy on `POST /api/transactions/income`) the posted body includes `relation: { relatedTransactionId, relationKind: 'refund' }`, and that on success it invalidates `['transactions', accountId]` and `['transaction-relations', originalId]`.

- [ ] **Step 2: Run to verify fail** — FAIL (module not found).

- [ ] **Step 3: Implement.** Model on `useCreateIncome.ts`. Signature: `useRefundTransaction(originalId: UUID)`. `mutationFn: (body: IncomeRequest) => transactionsApi(client).createIncome(body)`. `onSuccess`: invalidate `['transactions', body.accountId]`, `['accounts']`, and `['transaction-relations', originalId]`.

- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(transactions): useRefundTransaction hook (tracker#33)"`

---

## Task 5: `refundAllocationCaps` schema refinement

**Files:**

- Modify: `src/features/transactions/schema.ts`
- Test: `src/features/transactions/schema.test.ts`

- [ ] **Step 1: Write failing tests.** `refundAllocationCaps(remainingByCategory, remainingTotal)` returns a `(v: IncomeExpenseFormValues, ctx) => void` that adds issues when: a per-category expense slice exceeds its remaining, OR the expenses total exceeds `remainingTotal`. Test both violations and the clean case (drive it through a small `z.object(...).superRefine(fn).safeParse(...)` harness, or call the fn with a stub `ctx` collecting issues — match the style already used in `schema.test.ts`).

```ts
// remaining: { Groceries: 30, Fuel: 40 }, remainingTotal: 70
// expenses [{category:'Groceries', amount: 40}]  → issue on ['expenses'] ("$10 over what's left to refund for this category" or similar)
// expenses summing to 80                          → issue on ['expenses'] (total over remaining)
// expenses [{Groceries:30},{Fuel:40}]             → no issue
```

- [ ] **Step 2: Run to verify fail** — FAIL (not exported).

- [ ] **Step 3: Implement** in `schema.ts`:

```ts
export function refundAllocationCaps(
  remainingByCategory: Record<string, number>,
  remainingTotal: number,
) {
  return (v: IncomeExpenseFormValues, ctx: z.RefinementCtx) => {
    let total = 0;
    for (const row of v.expenses) {
      total += row.amount;
      const cap = roundMoney(remainingByCategory[row.category] ?? 0);
      if (roundMoney(row.amount) - cap > 0.005) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['expenses'],
          message: `Refund for a category can't exceed ${formatMoney(cap, v.currency)} left to refund`,
        });
      }
    }
    if (roundMoney(total) - roundMoney(remainingTotal) > 0.005) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expenses'],
        message: `Refund can't exceed ${formatMoney(remainingTotal, v.currency)} left on this transaction`,
      });
    }
  };
}
```

- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(transactions): refund per-slice/total cap refinement (tracker#33)"`

---

## Task 6: Extend `IncomeExpenseForm` + `AllocationsEditor` (`extraRefine`, `lockTarget`)

**Files:**

- Modify: `src/features/transactions/IncomeExpenseForm.tsx`, `src/features/transactions/AllocationsEditor.tsx`
- Test: `src/features/transactions/AllocationsEditor.test.tsx`, `src/features/transactions/IncomeExpenseForm.test.tsx`

- [ ] **Step 1: Write failing test** for `AllocationsEditor` `lockTarget`: when `lockTarget` is true, the "Target" toggle checkbox is **not** rendered, and the target amount is shown as a static read-only readout (assert the toggle `role`/label is absent and the target value text is present).

- [ ] **Step 2: Run to verify fail** — FAIL.

- [ ] **Step 3: Implement `lockTarget` in `AllocationsEditor`.** Add `lockTarget?: boolean` to `AllocationsEditorProps`. When true: skip rendering the toggle `<input type="checkbox">` (lines ~296) and render the target as read-only text instead of the editable `targetTotal` input (lines ~309). `targetMode`/`targetTotal` still come from form state (the dialog seeds them), so the diff/remaining readout is unchanged.

- [ ] **Step 4: Implement `extraRefine` + `lockTarget` in `IncomeExpenseForm`.** Add optional props `extraRefine?: (v: IncomeExpenseFormValues, ctx: z.RefinementCtx) => void` and `lockTarget?: boolean`. In the resolver `useMemo`, when `extraRefine` is set, chain it: `makeIncomeExpenseFormSchema(...).superRefine(extraRefine)`. Forward `lockTarget` to `AllocationsEditor`. Add `extraRefine` to the `useMemo` dependency array.

- [ ] **Step 5: Write + run a test** for `IncomeExpenseForm` with an `extraRefine` that always errors on `['expenses']` — submit is blocked and the message shows. PASS.

- [ ] **Step 6: Run the full transactions test dir** — `pnpm exec vitest run src/features/transactions` — ensure no regression in existing form/editor tests. PASS.

- [ ] **Step 7: Commit** — `git commit -m "feat(transactions): extraRefine + lockTarget props on income form/editor (tracker#33)"`

---

## Task 7: `RefundTransactionDialog`

**Files:**

- Create: `src/features/transactions/RefundTransactionDialog.tsx`
- Test: `src/features/transactions/RefundTransactionDialog.test.tsx`

- [ ] **Step 1: Write failing tests** (render via `src/test/utils.tsx`, sign in, MSW handlers for relations/get/create):
  - **default (full) seed**: original Groceries 60 + Fuel 40, no prior refunds → dialog opens with two expense rows pre-filled 60 and 40, target readout = 100.
  - **partial edit + submit**: edit Groceries to 20 → posts `createIncome` with `allocations.expenses = [{Groceries:20},{Fuel:40}]`, `relation = { relatedTransactionId: O, relationKind: 'refund' }`, `date` defaulting to today, `accountId` = original's account.
  - **per-slice cap**: with prior refund leaving Groceries remaining 30, typing 40 into Groceries blocks submit with the cap message.
  - **over-total**: sum over remaining blocks submit.
  - **archived category**: an original slice whose category id is not in the dictionary renders a read-only label and still posts.

- [ ] **Step 2: Run to verify fail** — FAIL (module not found).

- [ ] **Step 2a: Implement the archived-category fallback in `CategoryCombobox`** (confirmed missing today: an id not in `options` renders an empty editable combobox). Add a read-only label path — when the current value is an id not present in `options`, render it as static text (e.g. the raw id or a "(archived)" label) instead of an editable trigger. Write a focused `CategoryCombobox` test first (value = unknown id → read-only label, no editable trigger), verify fail, implement, pass.

- [ ] **Step 3: Implement `RefundTransactionDialog.tsx`.** Props: `{ open; onOpenChange; original: TransactionResponse }`. Compose:
  - `useRefundSummary(original, open)` for remaining data; show a loading state until ready and an error alert if `isError`.
  - Build `defaultValues: IncomeExpenseFormValues`:
    - `kind = 'income'`, `mode = 'create'`, `enforceBalance = false`.
    - `accountId` = original's account (the account the money returns to; use the original expense's debited account — `sourceAccountId`), `currency` = original's `sourceCurrency`.
    - `incomes: []`; `expenses` = original's `allocations.expenses` mapped to `{ category, amount: remainingByCategory[category], comment: '' }` (skip categories already fully refunded, i.e. remaining ≤ 0).
    - `description` = `Refund: ${original.description}`; `date` = `nowDateTimeInput()`.
    - `targetMode: true`, `targetTotal: remainingTotal`.
  - Pass `lockTarget` and `extraRefine={refundAllocationCaps(remainingByCategory, remainingTotal)}` to `IncomeExpenseForm`.
  - Provide `categories` = expense-category dictionary (contra allocations are expense categories). For **archived** categories not present in the dictionary, ensure the row still renders (read-only label) — the AllocationsEditor already renders by id; verify the combobox degrades to a read-only label for unknown ids (implement that fallback in `CategoryCombobox` if missing — small sub-task budgeted in the spec).
  - `handleSubmit`: `toIncomeRequest(values)` then attach `relation`, call `useRefundTransaction(original.id).mutateAsync(...)`, close on success, map `ApiError.fieldErrors` via the `IncomeExpenseFormApi` (mirror `CreateIncomeDialog`).
  - Show an "already refunded" readout when `refundedTotal > 0` (e.g. `${formatMoney(refundedTotal)} of ${formatMoney(originalTotal)} already refunded · ${formatMoney(remainingTotal)} left`).

- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Run `just check`** — typecheck/lint/format green.
- [ ] **Step 6: Commit** — `git commit -m "feat(transactions): RefundTransactionDialog (tracker#33)"`

---

## Task 8: Wire the guarded "Refund" action into `TransactionsPane`

**Files:**

- Modify: `src/features/transactions/TransactionsPane.tsx`
- Test: `src/features/transactions/TransactionsPane.test.tsx`

- [ ] **Step 1: Write failing tests:**
  - A completed **Expense** row's context menu shows a "Refund" item; selecting it opens the dialog.
  - An **Income** row shows **no** "Refund" item.
  - A **Cancelled** expense row shows **no** "Refund" item.

- [ ] **Step 2: Run to verify fail** — FAIL.

- [ ] **Step 3: Implement.** Add `refundTarget` state (mirror `copying`): `const [refundTarget, setRefundTarget] = useState<TransactionResponse | null>(null);` and `openRefund`. Add a guarded `ContextMenuItem` after "Convert to":

```tsx
{
  t.status === 'Completed' && t.transactionType === 'expense' && (
    <ContextMenuItem onSelect={() => openRefund(t)}>
      <Undo2 className="mr-2 h-4 w-4" aria-hidden />
      Refund
    </ContextMenuItem>
  );
}
```

(import `Undo2` from `lucide-react`). Render the dialog near the others (~line 462):

```tsx
{
  refundTarget && (
    <RefundTransactionDialog
      open
      onOpenChange={(o) => {
        if (!o) setRefundTarget(null);
      }}
      original={refundTarget}
    />
  );
}
```

- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit** — `git commit -m "feat(transactions): guarded Refund row action (tracker#33)"`

---

## Task 9: Linkage badges on rows

**Files:**

- Create: `src/features/transactions/RefundBadge.tsx`
- Modify: `src/features/transactions/TransactionsPane.tsx`
- Test: `src/features/transactions/RefundBadge.test.tsx`, extend `TransactionsPane.test.tsx`

- [ ] **Step 1: Write failing tests** for `RefundBadge`:
  - Given an expense id present in a `buildRefundIndex` map with `total < originalTotal` → renders `partially refunded ($30 of $100)`.
  - With `total ≈ originalTotal` (via `roundMoney`) → renders `refunded in full`.
  - A refund income row (has an outbound `refund` relation) → renders `refund of <original description>`, or generic `refund` when the original isn't in the window.

- [ ] **Step 2: Run to verify fail** — FAIL.

- [ ] **Step 3: Implement `RefundBadge.tsx`** — a small presentational component with two modes: `origin` (expense; reads a `RefundStat` + original total) and `refund` (income; reads the resolved original description or undefined). Use the existing badge/`cn` styling. Threshold via `roundMoney` (no bespoke epsilon).

- [ ] **Step 4: Wire into `TransactionsPane`.** Compute `const refundIndex = useMemo(() => buildRefundIndex(transactions), [transactions])` once. In the row's description cell (~line 290): render `<RefundBadge>` in `origin` mode when `refundIndex.has(t.id)`, and in `refund` mode when `t` has an outbound `refund` relation (resolve the original's description from the loaded window by id).

- [ ] **Step 5: Run tests** — PASS.
- [ ] **Step 6: Commit** — `git commit -m "feat(transactions): both-direction refund linkage badges (tracker#33)"`

---

## Task 10: Full verification pass

- [ ] **Step 1:** `just check` — typecheck + lint + format-check all green.
- [ ] **Step 2:** `just test` — full unit suite green.
- [ ] **Step 3:** Manually confirm (or add a Playwright smoke if the suite covers dialogs) the end-to-end: refund a completed expense → income-with-contra posts with the relation → both badges appear. Use @superpowers:verification-before-completion before claiming done.
- [ ] **Step 4: Commit** any formatting — `git commit -m "chore(transactions): formatting for refund feature (tracker#33)"` (or skip if clean).

---

## Notes for the implementer

- **DRY:** reuse `roundMoney` (`@/lib/money`), `formatMoney` (`@/lib/format`), `nowDateTimeInput` (`@/lib/dates`), and the existing `IncomeExpenseForm`/`AllocationsEditor` — do not re-implement allocation totals or target math.
- **The `relation` field rides through the existing create path** — no change to `createIncome` itself.
- **Never seed the dialog against partial data** — if `useRefundSummary.isError`, show an error, not a form.
- **`ExpenseRequest` split (Task 1)** may ripple into `toExpenseRequest`/`ConvertTransactionDialog`; `just typecheck` will surface any site — fix by keeping `toIncomeRequest` as the superset producer.
- Keep DTO comments citing backend `Web/Types.hs` line numbers per CLAUDE.md.
