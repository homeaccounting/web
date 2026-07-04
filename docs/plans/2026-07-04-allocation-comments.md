# Per-allocation Comments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Round-trip the backend's optional per-allocation `comment` through the web app — editable in the shared allocation editor and surfaced (muted) in the transaction list's description column.

**Architecture:** Additive. A nullable/optional `comment` is threaded through the allocation API DTOs, the shared RHF form slice, the load/diff helpers, and the list column. A single shared `normalizeComment` helper (trim → blank becomes `undefined`) keeps the client behavior aligned with the backend's `normalizeComment` and prevents phantom diffs.

**Tech Stack:** TypeScript (strict), React 18 + react-hook-form + Zod, TanStack Query, Vitest + Testing Library + happy-dom + MSW, Tailwind + shadcn/ui.

**Spec:** `docs/specs/2026-07-04-allocation-comments-design.md`

**Conventions:**

- Run a single test file: `pnpm exec vitest run <path>`; by name: `pnpm exec vitest run -t "<name>"`.
- Typecheck: `pnpm exec tsc --noEmit`. Full gate: `just check && just test`.
- Commit after each green task (Conventional Commits). Branch `feat/allocation-comments` already exists and holds the spec commits.

---

### Task 1: Add `comment` to the allocation API types

**Files:**

- Modify: `src/api/types.ts` (`CategoryAmount` ~197-200, `Allocation` ~251-254)

- [ ] **Step 1: Add the field to both DTOs**

In `CategoryAmount` (mirrors backend `Web/Types.hs:347-352`):

```ts
export interface CategoryAmount {
  category: UUID; // dictionary entry UUID
  amount: number;
  // Web/Types.hs:350 — comment :: Maybe Text. Free-text item note; trimmed and
  // blank → null server-side (Domain/Core/Types.hs:1077 normalizeComment).
  comment?: string | null;
}
```

In `Allocation` (mirrors backend `Domain/Core/Types.hs:1047-1051`, surfaced by
`AllocationResponse` `Web/Types.hs:541-546`):

```ts
export interface Allocation {
  categoryId: UUID;
  amount: Money;
  // Domain/Core/Types.hs:1050 — comment :: Maybe Text.
  comment?: string | null;
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: PASS (fields are optional; no existing caller breaks).

- [ ] **Step 3: Commit**

```bash
git add src/api/types.ts
git commit -m "feat(transactions): add comment to allocation API types"
```

---

### Task 2: `normalizeComment` helper + carry comment through `allocations.ts`

**Files:**

- Modify: `src/features/transactions/allocations.ts`
- Test: `src/features/transactions/allocations.test.ts`

- [ ] **Step 1: Extend the existing `tx` builder to accept a comment, then write failing tests**

The file's existing builder is `tx(incomes: [string, number][], expenses: [string, number][])`
(allocations.test.ts:5-17). Widen its tuples to an optional third element so tests
can attach comments; keep the two existing call sites working (a 2-tuple leaves
`comment` `undefined`):

```ts
type Row = [categoryId: string, amount: number, comment?: string];
const tx = (incomes: Row[], expenses: Row[]) =>
  ({
    allocations: {
      incomes: incomes.map(([categoryId, a, comment]) => ({
        categoryId,
        amount: { amount: a, currency: 'USD' },
        comment,
      })),
      expenses: expenses.map(([categoryId, a, comment]) => ({
        categoryId,
        amount: { amount: a, currency: 'USD' },
        comment,
      })),
    },
  }) as unknown as TransactionResponse;
```

Update imports to add `allocationComments`, `normalizeComment`. Then add tests:

```ts
describe('normalizeComment', () => {
  it('trims and turns blank/whitespace into undefined', () => {
    expect(normalizeComment('  milk ')).toBe('milk');
    expect(normalizeComment('   ')).toBeUndefined();
    expect(normalizeComment('')).toBeUndefined();
    expect(normalizeComment(undefined)).toBeUndefined();
    expect(normalizeComment(null)).toBeUndefined();
  });
});

describe('sliceArraysFromTx (comments)', () => {
  it('carries each slice comment as a string, blank when absent', () => {
    const { incomes, expenses } = sliceArraysFromTx(tx([['c1', 10, 'salary']], [['c2', 5]]));
    expect(incomes[0]!.comment).toBe('salary');
    expect(expenses[0]!.comment).toBe('');
  });
});

describe('allocationComments', () => {
  it('collects non-empty trimmed comments, incomes then expenses, in order', () => {
    expect(
      allocationComments(
        tx(
          [['c1', 10, ' salary ']],
          [
            ['c2', 5, 'milk'],
            ['c3', 2, '  '],
            ['c4', 1],
          ],
        ),
      ),
    ).toEqual(['salary', 'milk']);
  });

  it('returns [] when no slice has a comment', () => {
    expect(allocationComments(tx([], [['c2', 5]]))).toEqual([]);
  });
});
```

- [ ] **Step 1b: Fix the EXISTING `sliceArraysFromTx` test that this change breaks**

allocations.test.ts:37-41 asserts a full `.toEqual` on slices with no `comment`.
Because Step 3 makes `map` emit a **defined** `comment: ''` (not `undefined`, which
`toEqual` would ignore), that assertion now fails. Update its expected objects:

```ts
expect(sliceArraysFromTx(tx([['inc', 5000]], [['exp', 500]]))).toEqual({
  incomes: [{ category: 'inc', amount: 5000, comment: '' }],
  expenses: [{ category: 'exp', amount: 500, comment: '' }],
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/features/transactions/allocations.test.ts`
Expected: FAIL (`normalizeComment`/`allocationComments` not exported; `comment` undefined on slices).

- [ ] **Step 3: Implement in `allocations.ts`**

```ts
export interface Slice {
  category: UUID; // UUID is string; '' represents a blank/unselected row
  amount: number; // amount NaN while blank
  comment: string; // free-text note; '' when none
}

// Client mirror of backend Domain/Core/Types.hs:1077 normalizeComment: trim and
// treat blank/whitespace-only as absent. Used on submit and in diff comparison so
// a stray space never counts as a change or gets sent as "".
export function normalizeComment(c: string | null | undefined): string | undefined {
  const t = (c ?? '').trim();
  return t === '' ? undefined : t;
}
```

Update `sliceArraysFromTx`'s `map` to carry the comment:

```ts
const map = (xs: Allocations['incomes']): Slice[] =>
  xs.map((s) => ({ category: s.categoryId, amount: s.amount.amount, comment: s.comment ?? '' }));
```

Add the collector (place after `dropEmptySlices`):

```ts
// Non-empty allocation comments across both buckets, incomes first then expenses,
// in slice order. Used by the transactions list description column.
export function allocationComments(tx: Pick<TransactionResponse, 'allocations'>): string[] {
  return allSlices(tx.allocations)
    .map((s) => normalizeComment(s.comment))
    .filter((c): c is string => c !== undefined);
}
```

`dropEmptySlices` is unchanged — a blank row is still only `category === '' && Number.isNaN(amount)`; a lone comment does not make a row submittable.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/features/transactions/allocations.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/allocations.ts src/features/transactions/allocations.test.ts
git commit -m "feat(transactions): carry allocation comments through slice helpers"
```

---

### Task 3: Thread `comment` through the form schema

**Files:**

- Modify: `src/features/transactions/schema.ts`
- Test: `src/features/transactions/schema.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `schema.test.ts`:

```ts
describe('toIncomeRequest (comments)', () => {
  it('carries trimmed comments and omits blank ones', () => {
    const req = toIncomeRequest({
      accountId: ACC,
      currency: 'USD',
      incomes: [{ category: CAT, amount: 10, comment: '  salary ' }],
      expenses: [{ category: CAT2, amount: 5, comment: '   ' }],
      description: '',
      labels: [],
    });
    expect(req.allocations.incomes[0].comment).toBe('salary');
    expect(req.allocations.expenses[0].comment).toBeUndefined();
  });
});
```

> Reuse existing UUID constants in the test file (e.g. `ACC`, `CAT`); if none,
> declare valid uuids with `crypto.randomUUID()` at the top of the block.

- [ ] **Step 2: Run to verify fail**

Run: `pnpm exec vitest run src/features/transactions/schema.test.ts`
Expected: FAIL (`comment` not on request slices).

- [ ] **Step 3: Implement**

Extend `sliceSchema`:

```ts
const sliceSchema = z.object({
  category: uuid,
  amount: z.coerce.number().positive('Amount must be positive'),
  comment: z.string().max(500).optional(),
});
```

Extend the explicit `IncomeExpenseFormValues` slice arrays:

```ts
  incomes: { category: string; amount: number; comment?: string }[];
  expenses: { category: string; amount: number; comment?: string }[];
```

Import `normalizeComment` and update `toReqSlices` (widen its param + carry comment):

```ts
import { normalizeComment, sliceArraysFromTx } from './allocations';

const toReqSlices = (
  rows: { category: string; amount: number; comment?: string }[],
): AllocationsRequest['incomes'] =>
  rows.map((r) => ({
    category: r.category,
    amount: r.amount,
    comment: normalizeComment(r.comment),
  }));
```

(`sliceArraysFromTx` in `toIncomeExpenseFormValues` now returns slices with
`comment`, so the form is seeded with existing comments automatically — no change
needed there beyond the import already present.)

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run src/features/transactions/schema.test.ts`
Expected: PASS

- [ ] **Step 5: Typecheck + commit**

Run: `pnpm exec tsc --noEmit` (Expected: PASS)

```bash
git add src/features/transactions/schema.ts src/features/transactions/schema.test.ts
git commit -m "feat(transactions): thread allocation comment through form schema"
```

---

### Task 4: Comment-aware diff (comment-only edit → PATCH /allocations)

**Files:**

- Modify: `src/features/transactions/diffTransaction.ts`
- Test: `src/features/transactions/diffTransaction.test.ts`

- [ ] **Step 1: Write failing tests**

The file has fixed fixtures `expenseInitial` and `expenseTx` (diffTransaction.test.ts:39-49);
there is no `makeValues` builder and the category id used throughout is `'cat-1'`.
Build the initial/next values inline by spreading `expenseInitial`:

```ts
describe('diffIncomeExpense (comments)', () => {
  const withExpense = (comment: string): IncomeExpenseFormValues => ({
    ...expenseInitial,
    expenses: [{ category: 'cat-1', amount: 100, comment }],
  });

  it('treats a comment-only change as a re-split (PATCH /allocations, no amendment)', () => {
    const diff = diffIncomeExpense(withExpense('old'), withExpense('new'), expenseTx);
    expect(diff.amendment).toBeUndefined();
    expect(diff.allocations?.expenses[0]!.comment).toBe('new');
  });

  it('does not diff when only trailing whitespace differs', () => {
    const diff = diffIncomeExpense(withExpense('milk'), withExpense('milk '), expenseTx);
    expect(diff.allocations).toBeUndefined();
    expect(diff.amendment).toBeUndefined();
  });

  it('normalizes blank comment to undefined on the built allocation', () => {
    const diff = diffIncomeExpense(withExpense('milk'), withExpense('   '), expenseTx);
    expect(diff.allocations?.expenses[0]!.comment).toBeUndefined();
  });
});
```

> Note `expenseInitial.expenses` currently has `[{ category: 'cat-1', amount: 100 }]`
> (no comment) — the optional `comment?: string` added to the form-values type in
> Task 3 makes the spread + inline override above typecheck.

- [ ] **Step 2: Run to verify fail**

Run: `pnpm exec vitest run src/features/transactions/diffTransaction.test.ts`
Expected: FAIL (comment ignored; `sameSlices` returns true → no `diff.allocations`).

- [ ] **Step 3: Implement**

Import the helper and carry comment in `toMoneySlices`:

```ts
import { normalizeComment } from './allocations';

const toMoneySlices = (
  rows: { category: string; amount: number; comment?: string }[],
  currency: string,
): Allocation[] =>
  rows.map((r) => ({
    categoryId: r.category,
    amount: { amount: r.amount, currency },
    comment: normalizeComment(r.comment),
  }));
```

Compare comment in `sameSlices` (normalized both sides so whitespace/blank noise is ignored):

```ts
const sameSlices = (
  a: { category: string; amount: number; comment?: string }[],
  b: { category: string; amount: number; comment?: string }[],
) =>
  a.length === b.length &&
  a.every(
    (s, i) =>
      s.category === b[i]!.category &&
      s.amount === b[i]!.amount &&
      normalizeComment(s.comment) === normalizeComment(b[i]!.comment),
  );
```

No change to the routing logic: total is unchanged for a comment-only edit, so
`splitChanged` (via `sameSlices`) drives `diff.allocations` — the existing PATCH path.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run src/features/transactions/diffTransaction.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/diffTransaction.ts src/features/transactions/diffTransaction.test.ts
git commit -m "feat(transactions): detect allocation comment-only edits in diff"
```

---

### Task 5: Comment input in the shared editor

**Files:**

- Modify: `src/features/transactions/AllocationsEditor.tsx`
- Test: `src/features/transactions/AllocationsEditor.test.tsx`

- [ ] **Step 1: Extend the `Host` harness's Slice type, then write failing tests**

The file's harness is the `Host` component (AllocationsEditor.test.tsx:26-43) with a
local `type Slice = { category: string; amount: number }` (line 20) and section
fixtures `expenseSection` / `incomeSection` (singular, lines 45-56). Tests use
`fireEvent`, not `userEvent`. First widen the harness Slice type:

```ts
type Slice = { category: string; amount: number; comment?: string };
```

Then add tests (note `expenseSection.addLabel` is `'+ Add expense category'` in this
file):

```ts
it('renders a comment input per row seeded from form values', () => {
  render(<Host sections={[expenseSection]} expenses={[{ category: C1, amount: 5, comment: 'milk' }]} />);
  expect(screen.getByLabelText('Comment')).toHaveValue('milk');
});

it('appends a blank-comment row when Add is clicked', () => {
  render(<Host sections={[expenseSection]} expenses={[]} />);
  fireEvent.click(screen.getByRole('button', { name: '+ Add expense category' }));
  expect(screen.getByLabelText('Comment')).toHaveValue('');
});
```

- [ ] **Step 2: Run to verify fail**

Run: `pnpm exec vitest run src/features/transactions/AllocationsEditor.test.tsx`
Expected: FAIL (no Comment input).

- [ ] **Step 3: Implement**

Update the local `Slice` type:

```ts
type Slice = { category: string; amount: number; comment: string };
```

Change the row layout in `AllocationSectionRows` so the category+amount stay on the
first line and the comment sits beneath as a subordinate full-width input. Wrap the
existing `flex` row and add the comment field. Replace the row `<div>` contents:

```tsx
<div key={field.id} className="space-y-1.5">
  <div className="flex items-start gap-2">
    {/* existing CategoryCombobox FormField, Amount FormField, and Remove button
        stay exactly as-is here */}
  </div>
  <FormField
    control={control}
    name={`${section.name}.${i}.comment`}
    render={({ field: f }) => (
      <FormItem>
        <FormControl>
          <Input
            type="text"
            aria-label="Comment"
            placeholder="Comment (optional)"
            className="h-8 text-sm"
            {...f}
            value={(f.value as string) ?? ''}
          />
        </FormControl>
      </FormItem>
    )}
  />
</div>
```

Update the append seed:

```ts
onClick={() => append({ category: '', amount: NaN, comment: '' })}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run src/features/transactions/AllocationsEditor.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/AllocationsEditor.tsx src/features/transactions/AllocationsEditor.test.tsx
git commit -m "feat(transactions): add per-allocation comment input to editor"
```

---

### Task 6: Seed `comment: ''` at the initial-row sites

**Files:**

- Modify: `src/features/transactions/CreateIncomeDialog.tsx:50`
- Modify: `src/features/transactions/CreateExpenseDialog.tsx:48`
- Modify: `src/features/transactions/convertTransaction.ts:33`

- [ ] **Step 1: Update the seeds**

`CreateIncomeDialog.tsx:50` →

```ts
      incomes: [{ category: defaultCategory, amount: NaN, comment: '' }],
```

`CreateExpenseDialog.tsx:48` →

```ts
      expenses: [{ category: defaultCategory, amount: NaN, comment: '' }],
```

`convertTransaction.ts:33` →

```ts
const slice = { category: defaultCategory ?? '', amount, comment: '' };
```

(All three typecheck without the change thanks to the optional field, but seed it so
initial rows match the append seed and the editor never reads `undefined`.)

- [ ] **Step 2: Typecheck + run affected tests**

Run: `pnpm exec tsc --noEmit`
Run: `pnpm exec vitest run src/features/transactions/CreateIncomeDialog.test.tsx src/features/transactions/CreateExpenseDialog.test.tsx src/features/transactions/convertTransaction.test.ts`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add src/features/transactions/CreateIncomeDialog.tsx src/features/transactions/CreateExpenseDialog.tsx src/features/transactions/convertTransaction.ts
git commit -m "feat(transactions): seed blank comment on initial allocation rows"
```

---

### Task 7: Show comments in the list description column

**Files:**

- Modify: `src/features/transactions/TransactionsPane.tsx` (description `<td>` ~250-257)
- Test: `src/features/transactions/TransactionsPane.test.tsx`

- [ ] **Step 1: Write failing tests**

`TransactionsPane.test.tsx` seeds data by inlining `server.use(...)` per test (there
is no `renderPane` helper) and renders the pane directly. Follow that existing style;
seed a transactions list whose allocations carry comments (allocation slice shape:
`{ categoryId, amount: { amount, currency }, comment }`). Sketch:

```ts
it('shows allocation comments after the description, muted', async () => {
  // seed one tx: description 'Groceries', expenses comments ['milk','eggs']
  // (server.use(http.get('.../transactions', () => HttpResponse.json([tx]))))
  renderThePane();
  const cell = (await screen.findByText('Groceries')).closest('td')!;
  expect(cell).toHaveTextContent('Groceries · milk, eggs');
});

it('shows comments as the primary text when description is empty', async () => {
  // tx: description '', comments ['milk','eggs']
  expect(await screen.findByText('milk, eggs')).toBeInTheDocument();
});

it('suppresses the comment tail when it equals the description', async () => {
  // tx: description 'milk, eggs', comments ['milk','eggs'] → no '·', single copy
  const cell = (await screen.findByText('milk, eggs')).closest('td')!;
  expect(cell.textContent).not.toContain('·');
});
```

> `renderThePane()` above stands in for whatever render call the existing tests use —
> copy their exact setup (query client, auth, MSW seeding). If asserting on `·` is
> brittle, assert on the muted comment `<span>`'s text directly.

- [ ] **Step 2: Run to verify fail**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx`
Expected: FAIL (comments not rendered).

- [ ] **Step 3: Implement**

Import the helper (top of `TransactionsPane.tsx`, alongside `allocationCategoryIds`):

```ts
import { allocationCategoryIds, allocationComments } from './allocations';
```

Replace the description `<td>` body (currently the `<span>{t.description}</span>` +
`LabelChips`). Compute the muted comment tail, deduped against the description:

The current markup (TransactionsPane.tsx:250-257) is:

```tsx
<td className="px-4 py-2">
  <span className={cn(deEmphasized && 'line-through')}>{t.description}</span>
  <LabelChips labelIds={t.labels} nameById={labelNameById} leadingGap={!!t.description} />
</td>
```

Replace its body with (the `<td>` and its classes stay exactly as-is; only the inner
span + LabelChips change):

```tsx
<td className="px-4 py-2">
  {(() => {
    const comments = allocationComments(t).join(', ');
    const showComments = comments !== '' && comments !== t.description;
    const hasText = !!t.description || showComments;
    return (
      <>
        <span
          className={cn(deEmphasized && 'line-through')}
          title={[t.description, showComments ? comments : ''].filter(Boolean).join(' · ')}
        >
          {t.description}
          {showComments && (
            <span className="text-muted-foreground">
              {t.description ? ' · ' : ''}
              {comments}
            </span>
          )}
        </span>
        <LabelChips labelIds={t.labels} nameById={labelNameById} leadingGap={hasText} />
      </>
    );
  })()}
</td>
```

Notes:

- Only the span's _content_ and the `leadingGap`/`title` change; the span's existing
  `cn(deEmphasized && 'line-through')` class is preserved verbatim (no new
  overflow/ellipsis styling — the column's one-line clipping is unchanged).
- `showComments` handles both the empty-description case (comments become primary, no
  leading separator) and the dedup case (comment string equals description).
- `deEmphasized` line-through now spans description + comments together — matches the
  cancelled-transaction treatment already applied to the description.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/TransactionsPane.tsx src/features/transactions/TransactionsPane.test.tsx
git commit -m "feat(transactions): show allocation comments in list description column"
```

---

### Task 8: Update MSW fixtures/handlers to carry comments

**Files:**

- Modify: `src/test/fixtures.ts` (the transaction/allocation fixture, `transactionFixture`
  ~line 74-76). `src/test/handlers.ts` only has a bare `PATCH .../allocations` handler
  (~line 213) with no allocation bodies, so the concrete target is `fixtures.ts`.

- [ ] **Step 1: Add representative comments to fixture allocations**

In `src/test/fixtures.ts`, wherever the fixture builds `allocations`
(`{ incomes, expenses }` with `Allocation` slices), include a `comment` on at least
one representative slice so list/edit tests can assert round-tripping. Keep most
slices comment-free to preserve existing assertions. Do NOT change amounts/categories
that other tests depend on.

- [ ] **Step 2: Run the full suite**

Run: `just test`
Expected: PASS (no unhandled-request errors; existing tests unaffected).

> MSW must stay on ~2.13.3 (see CLAUDE.md) — do not bump it.

- [ ] **Step 3: Commit**

```bash
git add src/test
git commit -m "test(transactions): seed allocation comments in shared fixtures"
```

---

### Task 9: Full verification gate

- [ ] **Step 1: Run the complete gate**

Run: `just check && just test`
Expected: typecheck, lint, format-check, and all unit/component tests PASS.

- [ ] **Step 2: (Optional) manual smoke via the `verify` skill**

Create an expense with two categories and a comment on each, save, confirm the
comments appear muted in the list; edit one comment only and confirm it persists
(a `PATCH /allocations` call, not an amendment).

- [ ] **Step 3: Final commit if any lint/format fixups were needed**

```bash
just format && git add -A && git commit -m "style(transactions): formatting for allocation comments" || true
```

---

## File-change summary

| File                                                                                                     | Change                                                                                         |
| -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `src/api/types.ts`                                                                                       | `comment?: string \| null` on `CategoryAmount` + `Allocation`                                  |
| `src/features/transactions/allocations.ts`                                                               | `Slice.comment`; `sliceArraysFromTx` carries it; new `normalizeComment` + `allocationComments` |
| `src/features/transactions/schema.ts`                                                                    | `sliceSchema.comment`; form-values slice type; `toReqSlices`                                   |
| `src/features/transactions/diffTransaction.ts`                                                           | `toMoneySlices` + `sameSlices` comment-aware (normalized)                                      |
| `src/features/transactions/AllocationsEditor.tsx`                                                        | comment `Input` per row; local `Slice` type; append seed                                       |
| `src/features/transactions/CreateIncomeDialog.tsx` / `CreateExpenseDialog.tsx` / `convertTransaction.ts` | seed `comment: ''`                                                                             |
| `src/features/transactions/TransactionsPane.tsx`                                                         | muted, deduped comment tail in description column                                              |
| `src/test/fixtures.ts` (`transactionFixture`)                                                            | representative comments                                                                        |
