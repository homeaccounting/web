# Fixed Target Total for Multi-Allocation Entry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users pin an optional target total in the multi-allocation editor and guide the split to reach it, blocking submit until the slices sum to the target.

**Architecture:** Two non-submitted form fields (`targetMode`, `targetTotal`) added to the shared income/expense form. `AllocationsEditor` renders a toggle + target input + live diff indicator and a per-row "Fill remaining" helper; the existing zod resolver (`refineAllocations`) gates submit. No API/DTO change — request mappers read only known fields, so the target is dropped on submit.

**Tech Stack:** React 18, react-hook-form, zod (`@hookform/resolvers`), Vitest + Testing Library, Tailwind, shadcn/ui.

**Spec:** `docs/specs/2026-07-06-fixed-target-total-design.md`

---

## File Structure

| File                                                   | Responsibility                                  | Change                                                                                                                                                                              |
| ------------------------------------------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/features/transactions/schema.ts`                  | Form schema, types, request mappers, refinement | Add `targetMode`/`targetTotal` to zod schema + explicit type; export `round2`; extend `refineAllocations` with the target gate; seed the two fields in `toIncomeExpenseFormValues`. |
| `src/features/transactions/AllocationsEditor.tsx`      | Presentational allocation editor                | Toggle + target input, live diff indicator, per-row Fill-remaining button.                                                                                                          |
| `src/features/transactions/CreateIncomeDialog.tsx`     | Create-income defaults                          | Seed `targetMode: false, targetTotal: ''`.                                                                                                                                          |
| `src/features/transactions/CreateExpenseDialog.tsx`    | Create-expense defaults                         | Seed `targetMode: false, targetTotal: ''`.                                                                                                                                          |
| `src/features/transactions/schema.test.ts`             | Schema/refinement tests                         | Target-gate cases.                                                                                                                                                                  |
| `src/features/transactions/AllocationsEditor.test.tsx` | Editor component tests                          | Toggle, diff states, fill-remaining.                                                                                                                                                |

**Why optional in the type:** `IncomeExpenseFormValues` is hand-declared (`schema.ts:48-56`) and constructed in several places (`convertTransaction.ts`, `CopyTransactionDialog` via `toIncomeExpenseFormValues`, etc.). Declaring the two fields **optional** (`targetMode?`, `targetTotal?`) with zod `.default()` means only the edit seeding and the two create dialogs need touching; `convertTransaction.ts`/`diffTransaction.ts` compile unchanged (`undefined` → target mode off).

---

## Task 1: Schema fields, `round2`, and the target gate

**Files:**

- Modify: `src/features/transactions/schema.ts`
- Test: `src/features/transactions/schema.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the `describe('makeIncomeExpenseFormSchema (allocation refinement)')` block in `schema.test.ts` (the shared `base` object at `schema.test.ts:309` has no `targetMode`, so target mode is off there — existing tests are unaffected):

```ts
describe('target total gate', () => {
  const t = { ...base, currency: 'USD' };

  it('passes when sum equals the target', () => {
    const schema = makeIncomeExpenseFormSchema(null, 'expense');
    const res = schema.safeParse({
      ...t,
      incomes: [],
      expenses: [{ category: CAT, amount: 80 }],
      targetMode: true,
      targetTotal: 80,
    });
    expect(res.success).toBe(true);
  });

  it('rejects (issue at expenses) when sum is short of the target', () => {
    const schema = makeIncomeExpenseFormSchema(null, 'expense');
    const res = schema.safeParse({
      ...t,
      incomes: [],
      expenses: [{ category: CAT, amount: 55 }],
      targetMode: true,
      targetTotal: 80,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues.find((i) => i.path[0] === 'expenses');
      expect(issue?.message).toContain('short');
      expect(issue?.message).toContain('$25.00');
    }
  });

  it('rejects (issue at expenses) when sum is over the target', () => {
    const schema = makeIncomeExpenseFormSchema(null, 'expense');
    const res = schema.safeParse({
      ...t,
      incomes: [],
      expenses: [{ category: CAT, amount: 90 }],
      targetMode: true,
      targetTotal: 80,
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues.find((i) => i.path[0] === 'expenses');
      expect(issue?.message).toContain('over');
      expect(issue?.message).toContain('$10.00');
    }
  });

  it('rejects (issue at targetTotal) when target mode is on but target is blank', () => {
    const schema = makeIncomeExpenseFormSchema(null, 'expense');
    const res = schema.safeParse({
      ...t,
      incomes: [],
      expenses: [{ category: CAT, amount: 55 }],
      targetMode: true,
      targetTotal: '',
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path[0] === 'targetTotal')).toBe(true);
    }
  });

  it('treats a sub-cent difference as balanced', () => {
    const schema = makeIncomeExpenseFormSchema(null, 'expense');
    const res = schema.safeParse({
      ...t,
      incomes: [],
      expenses: [
        { category: CAT, amount: 26.66 },
        { category: CAT2, amount: 26.67 },
        { category: CAT, amount: 26.67 },
      ],
      targetMode: true,
      targetTotal: 80,
    });
    expect(res.success).toBe(true);
  });

  it('ignores the target when target mode is off', () => {
    const schema = makeIncomeExpenseFormSchema(null, 'expense');
    const res = schema.safeParse({
      ...t,
      incomes: [],
      expenses: [{ category: CAT, amount: 55 }],
      targetMode: false,
      targetTotal: 80,
    });
    expect(res.success).toBe(true);
  });

  it('defaults targetMode to false when omitted', () => {
    const parsed = incomeExpenseFormSchema.parse({
      accountId: ACC_A,
      currency: 'USD',
      incomes: [{ category: CAT, amount: 12.5 }],
      expenses: [],
      description: '',
      date: '',
      labels: [],
    });
    expect(parsed.targetMode).toBe(false);
    expect(parsed.targetTotal).toBe('');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/features/transactions/schema.test.ts -t "target total gate"`
Expected: FAIL (fields not in schema; refinement does not add the issues).

- [ ] **Step 3: Add `round2`, the schema fields, and the gate**

In `schema.ts`:

1. Add and export a rounding helper near the top (after imports):

```ts
// Round to 2-decimal money precision. Used by the target-total gate and the
// editor's diff indicator so both agree on "balanced".
export const round2 = (n: number): number => Math.round(n * 100) / 100;
```

2. Add the two fields to `incomeExpenseFormSchema` (after `labels`):

```ts
  // Client-side authoring aid for multi-allocation entry (tracker#32). Never
  // sent to the backend — request mappers read only their known fields.
  targetMode: z.boolean().default(false),
  // Blank stays blank; a typed value coerces to a number. The empty-vs-mismatch
  // distinction is validated in refineAllocations.
  targetTotal: z.union([z.coerce.number(), z.literal('')]).default(''),
```

3. Add the fields to the explicit `IncomeExpenseFormValues` type (optional so existing construction sites compile unchanged):

```ts
  targetMode?: boolean;
  targetTotal?: number | '';
```

4. Extend `refineAllocations` — append inside the returned function, after the existing checks:

```ts
if (v.targetMode) {
  if (
    v.targetTotal === '' ||
    v.targetTotal === undefined ||
    !Number.isFinite(Number(v.targetTotal))
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['targetTotal'],
      message: 'Enter a target total',
    });
  } else {
    const sum = round2(
      v.incomes.reduce((s, r) => s + r.amount, 0) + v.expenses.reduce((s, r) => s + r.amount, 0),
    );
    const target = round2(Number(v.targetTotal));
    const diff = round2(target - sum);
    if (Math.abs(diff) >= 0.005) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expenses'],
        message:
          diff > 0
            ? `Allocations are ${formatMoney(diff, v.currency)} short of the target`
            : `Allocations are ${formatMoney(-diff, v.currency)} over the target`,
      });
    }
  }
}
```

Note: `formatMoney` is already imported in `schema.ts`. `v.currency` is on the form values.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/features/transactions/schema.test.ts`
Expected: PASS (new block + all pre-existing refinement tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/schema.ts src/features/transactions/schema.test.ts
git commit -m "feat(transactions): target-total form fields and submit gate (tracker#32)"
```

---

## Task 2: Seed the two fields at the form's entry points

**Files:**

- Modify: `src/features/transactions/schema.ts` (`toIncomeExpenseFormValues`)
- Modify: `src/features/transactions/CreateIncomeDialog.tsx`
- Modify: `src/features/transactions/CreateExpenseDialog.tsx`
- Test: `src/features/transactions/schema.test.ts`

- [ ] **Step 1: Write the failing test AND fix the existing exact-match assertion**

The `toIncomeExpenseFormValues` describe block (schema.test.ts:253) builds fixtures inline via `baseTx({...})` and `acc('a1')` — there are no shared `tx`/`accounts` bindings. Add a new test using those helpers:

```ts
it('seeds target mode off when editing an existing transaction', () => {
  const values = toIncomeExpenseFormValues(baseTx({ transactionType: 'income' }), [acc('a1')]);
  expect(values.targetMode).toBe(false);
  expect(values.targetTotal).toBe('');
});
```

**Also update the existing exact-match test** at `schema.test.ts:255` ("income → regular leg is the target…"). It asserts `expect(v).toEqual({...})` with a full object literal; once Task 2 seeds the two fields, that exact match fails. Add the two fields to that literal:

```ts
expect(v).toEqual({
  accountId: 'a1',
  currency: 'USD',
  incomes: [{ category: 'cat-1', amount: 10, comment: '' }],
  expenses: [],
  description: 'd',
  date: '2026-03-04T15:00',
  labels: ['l1'],
  targetMode: false,
  targetTotal: '',
});
```

(The other two tests in the block use `.toBe`/property `.toEqual` on sub-fields, so they are unaffected.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/schema.test.ts -t "seeds target mode off"`
Expected: FAIL (`targetMode`/`targetTotal` undefined).

- [ ] **Step 3: Seed the fields**

In `schema.ts`, `toIncomeExpenseFormValues` return object — add:

```ts
    targetMode: false,
    targetTotal: '',
```

In `CreateIncomeDialog.tsx` and `CreateExpenseDialog.tsx`, add to each `defaults` object literal:

```ts
      targetMode: false,
      targetTotal: '' as number | '',
```

(`CopyTransactionDialog` and `EditTransactionDialog` route through `toIncomeExpenseFormValues`, so they inherit the seed. `ConvertTransactionDialog` uses `convertTransaction.ts`, which leaves the fields undefined → target mode off; no change needed.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/features/transactions/schema.test.ts -t "seeds target mode off"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/schema.ts src/features/transactions/CreateIncomeDialog.tsx src/features/transactions/CreateExpenseDialog.tsx
git commit -m "feat(transactions): seed target-total defaults in create/edit forms (tracker#32)"
```

---

## Task 3: Toggle, target input, and live diff indicator

**Files:**

- Modify: `src/features/transactions/AllocationsEditor.tsx`
- Test: `src/features/transactions/AllocationsEditor.test.tsx`

- [ ] **Step 1: Update the test Host and write failing tests**

In `AllocationsEditor.test.tsx`, extend `HostValues` and `Host` so target fields can be seeded:

```ts
interface HostValues {
  incomes: Slice[];
  expenses: Slice[];
  targetMode?: boolean;
  targetTotal?: number | '';
}

function Host({
  sections,
  currency = 'USD',
  incomes = [],
  expenses = [],
  targetMode = false,
  targetTotal = '',
}: {
  sections: AllocationSection[];
  currency?: string;
  incomes?: Slice[];
  expenses?: Slice[];
  targetMode?: boolean;
  targetTotal?: number | '';
}) {
  const form = useForm<HostValues>({ defaultValues: { incomes, expenses, targetMode, targetTotal } });
  return (
    <FormProvider {...form}>
      <AllocationsEditor sections={sections} currency={currency} />
    </FormProvider>
  );
}
```

Add a new describe block:

```ts
describe('target total mode', () => {
  it('is off by default: no target input, plain total shown', () => {
    render(<Host sections={[expenseSection]} expenses={[{ category: C1, amount: 100 }]} />);
    expect(screen.queryByLabelText('Target total')).not.toBeInTheDocument();
    expect(screen.getByTestId('allocations-total')).toHaveTextContent(formatMoney(100, 'USD'));
  });

  it('reveals the target input when the toggle is switched on', () => {
    render(<Host sections={[expenseSection]} expenses={[{ category: C1, amount: 100 }]} />);
    fireEvent.click(screen.getByLabelText('Set target total'));
    expect(screen.getByLabelText('Target total')).toBeInTheDocument();
  });

  it('shows "left to allocate" when under target', () => {
    render(
      <Host
        sections={[expenseSection]}
        expenses={[{ category: C1, amount: 55 }]}
        targetMode
        targetTotal={80}
      />,
    );
    const diff = screen.getByTestId('allocations-diff');
    expect(diff).toHaveTextContent(/left to allocate/i);
    expect(diff).toHaveTextContent(formatMoney(25, 'USD'));
  });

  it('shows "over target" with destructive styling when over', () => {
    render(
      <Host
        sections={[expenseSection]}
        expenses={[{ category: C1, amount: 90 }]}
        targetMode
        targetTotal={80}
      />,
    );
    const diff = screen.getByTestId('allocations-diff');
    expect(diff).toHaveTextContent(/over target/i);
    expect(diff).toHaveTextContent(formatMoney(10, 'USD'));
    expect(diff.className).toContain('text-destructive');
  });

  it('shows "Balanced" with emerald styling when exact', () => {
    render(
      <Host
        sections={[expenseSection]}
        expenses={[{ category: C1, amount: 80 }]}
        targetMode
        targetTotal={80}
      />,
    );
    const diff = screen.getByTestId('allocations-diff');
    expect(diff).toHaveTextContent(/balanced/i);
    expect(diff.className).toContain('text-emerald-600');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/features/transactions/AllocationsEditor.test.tsx -t "target total mode"`
Expected: FAIL (no toggle / target input / diff indicator).

- [ ] **Step 3: Implement toggle + input + indicator**

In `AllocationsEditor.tsx`:

1. Import `round2` from `./schema` and `Checkbox` from `@/components/ui/checkbox` (confirm the component exists with `ls src/components/ui/checkbox.tsx`; if absent, use a native `<input type="checkbox">` with the same `aria-label`).

2. In the `AllocationsEditor` component, watch the new fields and compute the diff:

```ts
const { watch, setValue } = useFormContext();
const incomes = watch('incomes') as Slice[] | undefined;
const expenses = watch('expenses') as Slice[] | undefined;
const targetMode = Boolean(watch('targetMode'));
const targetTotalRaw = watch('targetTotal') as number | '' | undefined;
const sum = sumSlices(incomes) + sumSlices(expenses);
const total = sum;
const hasTarget =
  targetMode &&
  targetTotalRaw !== '' &&
  targetTotalRaw !== undefined &&
  Number.isFinite(Number(targetTotalRaw));
const remaining = hasTarget ? round2(Number(targetTotalRaw) - sum) : 0;
const balanced = hasTarget && Math.abs(remaining) < 0.005;
const money = (n: number) => (currency ? formatMoney(n, currency) : String(n));
```

3. Render the toggle above the sections (or between sections and the total — keep it near the total). Use a `FormField` for `targetTotal` so its `FormMessage` ("Enter a target total") surfaces:

```tsx
<div className="space-y-2">
  <label className="flex items-center gap-2 text-sm font-medium">
    <input
      type="checkbox"
      aria-label="Set target total"
      checked={targetMode}
      onChange={(e) =>
        setValue('targetMode', e.target.checked, { shouldDirty: true, shouldValidate: true })
      }
    />
    Set target total
  </label>
  {targetMode && (
    <FormField
      control={control}
      name="targetTotal"
      render={({ field: f }) => (
        <FormItem className="w-40">
          <FormControl>
            <Input
              type="number"
              step="any"
              aria-label="Target total"
              placeholder="Target"
              name={f.name}
              ref={f.ref}
              onBlur={f.onBlur}
              value={f.value === undefined || f.value === null ? '' : (f.value as number | string)}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === '') {
                  f.onChange('');
                  return;
                }
                const n = e.target.valueAsNumber;
                f.onChange(Number.isNaN(n) ? '' : n);
              }}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  )}
</div>
```

(`control` comes from `useFormContext()`; add it to the destructure.)

4. Replace/extend the total block to add the diff indicator when in target mode:

```tsx
<div data-testid="allocations-total" className="flex justify-end text-sm font-medium tabular-nums">
  Total: {money(total)}
</div>;
{
  hasTarget && (
    <div
      data-testid="allocations-diff"
      className={cn(
        'flex justify-end text-sm font-medium tabular-nums',
        balanced
          ? 'text-emerald-600'
          : remaining < 0
            ? 'text-destructive'
            : 'text-muted-foreground',
      )}
    >
      {balanced
        ? 'Balanced'
        : remaining > 0
          ? `${money(remaining)} left to allocate`
          : `${money(-remaining)} over target`}
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/features/transactions/AllocationsEditor.test.tsx`
Expected: PASS (new block + all pre-existing editor tests still green).

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/AllocationsEditor.tsx src/features/transactions/AllocationsEditor.test.tsx
git commit -m "feat(transactions): target-total toggle and live diff indicator (tracker#32)"
```

---

## Task 4: Per-row "Fill remaining" helper

**Files:**

- Modify: `src/features/transactions/AllocationsEditor.tsx` (`AllocationSectionRows`)
- Test: `src/features/transactions/AllocationsEditor.test.tsx`

- [ ] **Step 1: Write failing tests**

Add to the `target total mode` describe block:

```ts
it('fills an empty row to the outstanding diff', () => {
  render(
    <Host
      sections={[expenseSection]}
      expenses={[
        { category: C1, amount: 55 },
        { category: C2, amount: NaN },
      ]}
      targetMode
      targetTotal={80}
    />,
  );
  // second row is empty; remaining is 25
  const fill = screen.getByRole('button', { name: /fill/i });
  fireEvent.click(fill);
  const amounts = screen.getAllByRole('spinbutton');
  expect(amounts[1]).toHaveValue(25);
});

it('tops up a partial row so the total reaches the target', () => {
  render(
    <Host
      sections={[expenseSection]}
      expenses={[
        { category: C1, amount: 55 },
        { category: C2, amount: 10 },
      ]}
      targetMode
      targetTotal={80}
    />,
  );
  // sum 65, remaining 15; filling row 2 (10) tops it to 25
  const fills = screen.getAllByRole('button', { name: /fill/i });
  fireEvent.click(fills[1]!);
  const amounts = screen.getAllByRole('spinbutton');
  expect(amounts[1]).toHaveValue(25);
});

it('hides Fill when already balanced', () => {
  render(
    <Host
      sections={[expenseSection]}
      expenses={[{ category: C1, amount: 80 }]}
      targetMode
      targetTotal={80}
    />,
  );
  expect(screen.queryByRole('button', { name: /fill/i })).not.toBeInTheDocument();
});

it('does not render Fill when target mode is off', () => {
  render(<Host sections={[expenseSection]} expenses={[{ category: C1, amount: 55 }]} />);
  expect(screen.queryByRole('button', { name: /fill/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm exec vitest run src/features/transactions/AllocationsEditor.test.tsx -t "fill"`
Expected: FAIL (no Fill button).

- [ ] **Step 3: Implement Fill-remaining in `AllocationSectionRows`**

`AllocationSectionRows` currently receives only `section`. It reads target state itself via `useFormContext` (matching how the editor watches fields) and computes `remaining`:

```ts
const { control, watch, setValue, getValues } = useFormContext();
const targetMode = Boolean(watch('targetMode'));
const targetTotalRaw = watch('targetTotal') as number | '' | undefined;
const incomes = watch('incomes') as Slice[] | undefined;
const expenses = watch('expenses') as Slice[] | undefined;
const hasTarget =
  targetMode &&
  targetTotalRaw !== '' &&
  targetTotalRaw !== undefined &&
  Number.isFinite(Number(targetTotalRaw));
const remaining = hasTarget
  ? round2(Number(targetTotalRaw) - (sumSlices(incomes) + sumSlices(expenses)))
  : 0;
```

Inside the row's action area (next to the Remove `X`), render the button when it would produce a positive amount:

```tsx
{
  hasTarget &&
    Math.abs(remaining) >= 0.005 &&
    (() => {
      const currentRaw = getValues(`${section.name}.${i}.amount`);
      const current = Number.isFinite(Number(currentRaw)) ? Number(currentRaw) : 0;
      const next = round2(current + remaining);
      if (next <= 0) return null;
      return (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-1 shrink-0"
          onClick={() =>
            setValue(`${section.name}.${i}.amount`, next, {
              shouldDirty: true,
              shouldValidate: true,
            })
          }
        >
          Fill {currency ? formatMoney(next, currency) : String(next)}
        </Button>
      );
    })();
}
```

Note: `AllocationSectionRows` does not currently receive `currency`. Add a `currency` prop to `AllocationSectionRows` and pass it from `Section` → from the top-level `AllocationsEditor` (thread `currency` through `Section` and `AllocationSectionRows`). This is a small prop addition; `sumSlices` and `round2` are already in scope / imported in Task 3.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm exec vitest run src/features/transactions/AllocationsEditor.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/AllocationsEditor.tsx src/features/transactions/AllocationsEditor.test.tsx
git commit -m "feat(transactions): per-row fill-remaining helper for target total (tracker#32)"
```

---

## Task 5: Full verification

- [ ] **Step 1: Typecheck, lint, format, full test suite**

Run: `just check && just test`
Expected: all green. If `just` is unavailable, run `pnpm typecheck && pnpm lint && pnpm exec prettier --check . && pnpm test`.

- [ ] **Step 2: Manual smoke (optional but recommended)**

Use the `verify` skill or `just run`, open a create-expense dialog, toggle "Set target total", set 80, add two rows, confirm the diff indicator and Fill button behave, and that submit is blocked until balanced.

- [ ] **Step 3: Confirm no unintended request payload change**

Grep the request mappers to confirm `targetMode`/`targetTotal` never reach the wire:
Run: `grep -n "target" src/features/transactions/schema.ts`
Expected: matches only in the schema/type/gate/seed — none inside `toIncomeRequest`/`toExpenseRequest`.

- [ ] **Step 4: Commit any format fixes**

```bash
git add -A && git commit -m "chore(transactions): formatting for target total feature (tracker#32)" || echo "nothing to commit"
```

---

## Notes for the implementer

- **TDD throughout** (@superpowers:test-driven-development): red → green → commit per task.
- **Currency `''` fallback**: the editor already renders `String(total)` when `currency` is empty; the diff indicator and Fill label follow the same `money()` helper.
- **Existing tests must stay green** — the shared `base`/`Host` fixtures omit target fields, so target mode is off there by default; adding the fields must not change their outcomes.
- **Do not** add `targetMode`/`targetTotal` to `toIncomeRequest`/`toExpenseRequest` — they must not reach the backend.
- **Income-form error placement (expected, not a bug):** the target-mismatch issue is on `['expenses']`, and on the income form `<SectionError name="expenses">` sits inside the reimbursements section, which is **collapsed by default**. So on the income form the "short/over target" resolver message may be hidden until reimbursements is expanded. This mirrors the pre-existing "Add at least one category" placement and is acceptable for v1 — the always-visible diff indicator still shows the state. Don't treat the hidden message as a regression during smoke testing.
