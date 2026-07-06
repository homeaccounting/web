---
status: draft
---

# Fixed target total for multi-allocation entry (web)

Tracker: homeaccounting/tracker#32

## Context

When creating or editing a transaction with **multiple allocations**, the total is
implicit — it is whatever the allocation slices happen to sum to. The shared
`AllocationsEditor` (`src/features/transactions/AllocationsEditor.tsx`) already
watches the `incomes`/`expenses` field arrays and renders a live **Total**:

```ts
const total = sumSlices(incomes) + sumSlices(expenses); // AllocationsEditor.tsx:197
```

Users, however, often know the total first (an €80 receipt) and then break it down.
Without a pinned target it is easy to fumble the last slice or leave the split not
adding up to the intended amount.

This feature adds an **optional, client-side target total**. When set, the editor
shows the running sum, the target, and the remaining diff, and blocks submit until
the slices sum to the target. It is a pure form-authoring aid.

### Backend constraint (no change)

The backend has no separate amount field — the categorised total _is_ the sum of
allocation slices. On submit the request mappers (`toIncomeRequest` /
`toExpenseRequest`, `schema.ts`) read only their known fields (`accountId`,
`currency`, `allocations`, `description`, `date`, `labels`), so any extra
target-related form fields are naturally dropped. **No API/DTO change.**

For edit, `PATCH /:id/allocations` already requires the new allocations to sum to
the transaction total; target mode simply makes hitting that sum easier. It is not
required for a valid edit — it is opt-in.

## Goals

1. Add an optional **"Set target total"** toggle to the multi-allocation editor.
   When on, reveal a target-amount input.
2. Show a live indicator with **current sum**, **target**, and **remaining =
   target − sum**, with distinct over / under / exact states.
3. **Gate submit** in target mode: block until `sum == target` (within money
   precision), using the existing zod resolver so errors surface like other
   section errors.
4. Add a per-row **"Fill remaining"** helper that tops the row up so the grand
   total reaches the target.
5. When target mode is **off**, the editor behaves exactly as it does today.

## Non-goals

- Persisting the target. It is never sent to the backend and is not restored on
  edit (edit opens with target mode **off**).
- Auto-suggesting the last row's amount (the issue's second nice-to-have). Out of
  scope for v1.
- Any change to the transfer form (it has a single `amount`, not allocations).
- Multi-currency reconciliation. The editor already enforces a single currency
  across allocations; the target is in that same currency.

## Design

### State & data flow

The target lives in **react-hook-form state**, not local `useState`, so the submit
gate can reuse the existing resolver. Two non-submitted fields are added to
`IncomeExpenseFormValues` and `incomeExpenseFormSchema` (`schema.ts`):

- `targetMode: boolean` — default `false`.
- `targetTotal: number | ''` — the input value; `''` when blank.

Both are seeded in `defaultValues` for **create and edit** as
`targetMode: false, targetTotal: ''`. In `toIncomeExpenseFormValues` (edit
seeding) they are set to the same defaults — target mode does **not** auto-enable
on edit.

Zod shapes (added to `incomeExpenseFormSchema`):

```ts
targetMode: z.boolean().default(false),
// Blank stays blank; a typed value coerces to a number. Validated in the refinement.
targetTotal: z.union([z.coerce.number(), z.literal('')]).default(''),
```

Because `toIncomeRequest`/`toExpenseRequest` never read these fields, they are
dropped on submit with no extra plumbing.

### Combined-total semantics

Target mode compares against the **same combined total the editor already shows**:
`sumSlices(incomes) + sumSlices(expenses)`. For the income form (incomes section +
collapsible reimbursements section) there is a single target for the whole editor,
consistent with the existing "Total" line. No per-section targets.

### Money precision & comparison

A shared `round2(n) = Math.round(n * 100) / 100` helper avoids float noise.

- `remaining = round2(target − sum)`
- "balanced" ⇔ `Math.abs(remaining) < 0.005` (i.e. rounds to `0.00`).

This matches the app's 2-decimal money display (`formatMoney`).

### Live diff indicator (`AllocationsEditor`)

The editor already watches `incomes`/`expenses`. It additionally watches
`targetMode`/`targetTotal`. Rendering:

- **Target mode off** → unchanged: the plain `Total: …` line only.
- **Target mode on** → the target input (revealed by the toggle) plus an indicator
  showing **Sum** and **Target**, and a remaining line with three states:
  - `remaining > 0` → "€X left to allocate" — muted/info styling
    (`text-muted-foreground`).
  - `remaining < 0` → "€X over target" — `text-destructive`.
  - `remaining === 0` (balanced) → "Balanced" — `text-emerald-600`.

The toggle is a checkbox/switch labelled "Set target total", rendered at the top of
the editor. Amounts are rendered with `formatMoney(_, currency)` when a currency is
present, matching the existing Total line's fallback (`String(n)` when `currency`
is `''`).

### Submit gating (`refineAllocations` in `schema.ts`)

`refineAllocations` runs for both create and edit. Add, at the end:

```ts
if (v.targetMode) {
  if (v.targetTotal === '' || !Number.isFinite(Number(v.targetTotal))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetTotal'],
      message: 'Enter a target total' });
  } else {
    const sum = round2(v.incomes.reduce(...) + v.expenses.reduce(...));
    const target = round2(Number(v.targetTotal));
    const diff = round2(target - sum);
    if (Math.abs(diff) >= 0.005) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['expenses'],
        message: diff > 0
          ? `Allocations are ${formatMoney(diff, ...)} short of the target`
          : `Allocations are ${formatMoney(-diff, ...)} over the target` });
    }
  }
}
```

- The sum-mismatch issue is placed on `['expenses']` so it surfaces through the
  existing `<SectionError name="expenses">`, matching how "Add at least one
  category" and the balance error already appear.
- The "Enter a target total" issue is placed on `['targetTotal']` and surfaces via
  a `<FormMessage>` on the target field.
- The refinement reads `v.currency` (present on `IncomeExpenseFormValues`) and
  formats amounts with `formatMoney(diff, v.currency)`, e.g. "Allocations are €5.00
  short of the target". `schema.test.ts` asserts against that formatted string.

Because these are resolver issues, `form.handleSubmit` short-circuits and `onSubmit`
is never called — no new button-disable logic. The existing
`disabled={isSubmitting || (isEdit && !isDirty)}` on the submit button is unchanged.

### Fill-remaining helper (`AllocationSectionRows`)

`AllocationSectionRows` currently receives only `section`. It needs `targetMode`,
`targetTotal`, and the combined sum to compute `remaining`. To stay consistent with
how the editor already reads form state, `AllocationSectionRows` reads these itself
via `useFormContext().watch(...)` (rather than threading new props) and computes
`remaining = round2(target − sum)` locally.

A per-row button, shown only when **`targetMode` is on** and the fill would yield a
positive amount:

- `newAmount = round2(thisRowAmount + remaining)`.
- For an empty row (`amount` blank/NaN, treated as `0`), this equals the outstanding
  diff — matching the issue's wording. For a row that already has a value, it tops
  the row up so the grand total reaches the target.
- Hidden/disabled when `remaining === 0` (nothing to fill) or when `newAmount <= 0`
  (an over-target fill that would zero/negative the row — not a valid slice).
- On click it calls the field's `onChange` with `newAmount` (via
  `useFormContext().setValue` on `${section.name}.${i}.amount`, `shouldDirty: true`,
  `shouldValidate: true`).

The button label shows the amount it will apply, e.g. "Fill €25.00", so the action
is predictable. It sits inline in the row's action area (next to the remove `X`).

## Components touched

| File                         | Change                                                                                                                                                                                                    |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.ts`                  | Add `targetMode`/`targetTotal` to schema + `IncomeExpenseFormValues`; seed defaults in `toIncomeExpenseFormValues`; extend `refineAllocations` with the target gate; add `round2` (or import from `lib`). |
| `AllocationsEditor.tsx`      | "Set target total" toggle + target input; live diff indicator (over/under/balanced); per-row "Fill remaining" button; `round2` diff logic.                                                                |
| `IncomeExpenseForm.tsx`      | Seed `targetMode: false, targetTotal: ''` in create `defaultValues` (edit path seeds via `toIncomeExpenseFormValues`); no other change.                                                                   |
| `AllocationsEditor.test.tsx` | Component tests (below).                                                                                                                                                                                  |
| `schema.test.ts`             | Resolver/refinement tests (below).                                                                                                                                                                        |

Callers of `IncomeExpenseForm` (Create expense/income, Edit, Copy, Convert) inherit
the feature with no per-dialog branching, since they all route through
`IncomeExpenseFormValues` + `AllocationsEditor`.

## Testing

**`schema.test.ts`**

- Target mode off → any allocation sum submits (no new issue).
- Target mode on, `sum == target` → no issue.
- Target mode on, `sum < target` → issue on `expenses` ("… short …").
- Target mode on, `sum > target` → issue on `expenses` ("… over …").
- Target mode on, `targetTotal === ''` → issue on `targetTotal` ("Enter a target total").
- Rounding: `sum` and `target` differ by < 0.005 → treated as balanced.

**`AllocationsEditor.test.tsx`**

- Toggle off by default; editor shows only the plain Total.
- Toggle on reveals the target input and the diff indicator.
- Diff states: over (`text-destructive` / "over target"), under
  ("left to allocate"), exact ("Balanced" / `text-emerald-600`).
- Fill-remaining on an empty row sets it to the diff; on a partial row tops it up so
  the total equals the target.
- Fill-remaining hidden when `remaining === 0` and when the fill would be ≤ 0.

## Open questions

None. Decisions locked during brainstorming:

- Toggle → field (off by default), not an always-visible field.
- Ship the fill-remaining helper in v1; no auto-suggest.
- Edit opens with target mode off.
- Fill = top-up (row + remaining).
- Balanced state uses `text-emerald-600`.
