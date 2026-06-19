---
status: draft
date: 2026-06-19
issue: 45
depends_on:
  - ../../../server-infra/docs/specs/2026-06-11-contra-expense-allocations-design.md
---

# Multiple Allocations per Transaction (issue #45)

## Problem

A transaction can model only **one** category today. The create/edit
Income & Expense forms expose a single `category` + `amount` pair, and the
client wraps it into a one-slice allocation bucket
(`schema.ts` `toAllocationsRequest`, `diffTransaction.ts` `bucketAllocation`).

The backend already models richer allocations. Per the backend
[contra-expense spec](../../../server-infra/docs/specs/2026-06-11-contra-expense-allocations-design.md),
`Allocations` is a **two-bucket** record — `incomes` (income-dictionary
categories) and `expenses` (expense-dictionary categories) — and the create,
set-allocations, and amend endpoints all accept both buckets. The wire DTOs in
`src/api/types.ts` (`AllocationsRequest`, `Allocations`, `CategoryAmount`,
`Allocation`, `Money`) already mirror that shape.

Two user-facing capabilities are blocked purely by the UI:

1. **Split a transaction across multiple categories** that sum to its total
   (e.g. one store charge → Groceries + Medication).
2. **Compensations / reimbursements** — an inbound (Income) transaction that
   carries expense-dictionary slices which _net down_ an expense category
   rather than inflating income (the contra-expense case). Example: a $5500
   inflow = $5000 Salary (income) + $500 Rent reimbursement (reduces expense).

This spec is the **web** slice that surfaces both, plus the **one backend
change** required to make it round-trip.

## The blocking constraint

The backend **response** (`TransactionResponse`, returned by list, create, and
`GET /:id`) is still flattened: it carries only `category :: Maybe Text` — the
_first_ allocation's id via `transactionTypeCategoryText = listToMaybe …`
(`server-infra/src/Web/Types.hs:1037-1038`). There is **no endpoint that
returns the full two-bucket allocations** of an existing transaction (the
history endpoint returns audit events, not current state).

Therefore: the client can _send_ multiple allocations on create, but cannot
_read them back_. A full read → edit → save round-trip is impossible without a
backend change. The backend [contra-expense spec §4] explicitly **deferred**
widening the response; this spec does that widening.

## Goals

1. Backend: widen `TransactionResponse` to surface the full two-bucket
   `allocations`; **drop** the transitional flattened `category` field and its
   `transactionTypeCategoryText` accessor.
2. Web: a row-based allocation editor — add/remove `(category, amount)` rows
   with a live running total — replacing the single `amount`+`category` fields
   on the Income/Expense create and edit forms.
3. Web: the Income form exposes a second, collapsed **Reimbursements (reduces
   an expense)** section (expense-dictionary slices). The Expense form has only
   one section (contra-income is rejected by the backend).
4. Web: edit round-trips faithfully from `tx.allocations`; re-splitting at the
   same total goes through `SetAllocations`, changing the total goes through an
   amendment carrying explicit allocations.
5. Web: derive category display and the client-side category filter from
   `allocations` (fixing a latent bug where the filter matches only the first
   slice).

## Non-goals

- **Bank-import "fixed total + remaining" reconciliation.** For an imported
  line the amount is an externally-fixed fact; YNAB-style "assign splits until
  remaining is zero" is the right model there. This spec uses the
  _computed-total_ model (total = Σ rows), correct for manual create/edit.
  Layering the fixed-total mode onto imported transactions is deferred.
- **Server-side per-category reporting / netting.** Out of scope per the
  backend spec; this spec is data-entry + display only.
- **New backend endpoints or validation.** Create/set/amend already accept both
  buckets; the only backend change is the response shape.
- **Cross-currency reimbursements.** Every slice in both buckets is in the
  transaction's (account's) currency — the backend anchors currency to the
  transaction `Money` (backend spec §2, "Currency anchoring"). A reimbursement
  denominated in another currency is not supported.
- **Transfer / Adjustment.** Uncategorised; their `allocations` is two empty
  buckets and their edit forms are unchanged.

## Design

### 1. Backend (`server-infra`) — surface the allocations

`TransactionResponse` (`src/Web/Types.hs`, builders at `:949` and `:981`):

- **Add** `allocations :: AllocationsResponse`, where `AllocationsResponse`
  carries `incomes :: [AllocationResponse]` and `expenses :: [AllocationResponse]`,
  and `AllocationResponse = { categoryId :: Text, amount :: Money }` (Money
  serialises as `{ amount, currency }`). Build it from `allocationsOf
tx.transactionType` (already imported at `Web/Types.hs:117`) — **not** the
  text accessors. `Transfer` / `Adjustment` → both buckets empty.
- **Remove** the `category :: Maybe Text` field from `TransactionResponse` and
  delete the now-unused `transactionTypeCategoryText` accessor
  (`:1037-1038`). `transactionTypeAllocationsText` stays if other callers use
  it; otherwise remove too.
- No route, request-DTO, validation, saga, or read-model changes. Update
  backend response-shape tests/fixtures.

Wire result (web `Allocations` type already matches):

```jsonc
"allocations": {
  "incomes":  [{ "categoryId": "…", "amount": { "amount": 5000, "currency": "USD" } }],
  "expenses": [{ "categoryId": "…", "amount": { "amount": 500,  "currency": "USD" } }]
}
```

### 2. Web — wire types (`src/api/types.ts`)

- `TransactionResponse`: **remove** `category: string | null`; **add**
  `allocations: Allocations` (the existing `Allocations` interface —
  `{ incomes: Allocation[]; expenses: Allocation[] }`, `Allocation =
{ categoryId: UUID; amount: Money }`). Update the source-reference comment.
- No change to `AllocationsRequest` / `Allocation` / `Money` (already present).

### 3. Web — the allocation editor (`AllocationsEditor`)

New presentational component under `src/features/transactions/`:

- Renders a labelled **section** = a list of rows; each row is
  `CategoryCombobox` (from the section's dictionary) + an amount `Input` +
  a remove button, plus an `+ Add <noun>` button.
- A section is driven by a `useFieldArray` over a form path
  (`incomes` / `expenses`).
- Shows a **live total** for the whole editor (Σ all rows across all sections),
  formatted with the locked account currency.
- Props: `{ sections: { name, title, dictionary, addLabel, collapsible? }[],
currency, control }`. The Income form passes two sections (income +
  collapsible reimbursements); the Expense form passes one.
- Currency is locked to the selected account (as today); all slices inherit it.
  There is **no per-row currency picker** — a reimbursement in a different
  currency than the inflow is not supported (it would violate the backend's
  `AllocationCurrencyMismatch`; see Non-goals).

**Initial rows (create).** **[decision]** The primary section seeds **one
row** whose `category` is the kind's default
(`config.defaultIncomeCategory` / `defaultExpenseCategory`, '' if unset) and
whose `amount` is blank — matching today's single-category create feel. The
collapsible reimbursement section seeds **zero rows** (and stays collapsed)
until the user expands it and adds one. Edit seeds rows from `tx.allocations`
(§4).

**Empty-row handling.** **[decision]** A fully-empty trailing row (no category
_and_ blank amount) is **dropped before validation/submit**, so "click Add,
change your mind" never blocks submit and an expanded-but-empty reimbursement
section is harmless. After dropping empties, the remaining rows are validated
(category required, amount positive) and the "≥1 slice across both buckets"
rule applies. A row with a category but blank amount (or vice-versa) is a
normal validation error on that row.

### 4. Web — form schema (`schema.ts`)

Form values change from `{ amount, category, … }` to two slice arrays:

```ts
type Slice = { category: UUID; amount: number };
incomeExpenseFormSchema = {
  accountId, currency, description, date, labels,  // unchanged
  incomes:  Slice[],   // income-dict slices
  expenses: Slice[],   // expense-dict slices (reimbursements on Income; the
                       // sole bucket on Expense)
}
```

Zod rules:

- each present slice: `category` is a uuid, `amount` is a positive number;
- **at least one slice across both buckets** (mirrors backend `AllocationsEmpty`);
- on the **Expense** form, `incomes` must be empty (the form simply never
  renders that section; the schema enforces it as a guard);
- **total** = Σ all slice amounts (no "must equal X" check — the total _is_ the
  sum). Balance check (issue #46) runs against the total for the Expense kind
  via `makeIncomeExpenseFormSchema`.

Mappers:

- `toIncomeRequest` / `toExpenseRequest`: build `AllocationsRequest` from the
  two arrays directly (generalises the current one-slice `toAllocationsRequest`).
- `toIncomeExpenseFormValues(tx)`: seed `incomes`/`expenses` from
  `tx.allocations` (maps each `Allocation` → `{ category: a.categoryId,
amount: a.amount.amount }`). The account/currency derivation is unchanged.

### 5. Web — edit diff (`diffTransaction.ts`)

**Backend contract (verified, merged):** the amend handler
`synthesiseAmendmentTransactionType`
(`server-infra/src/Application/Services/TransactionService.hs:794-812`) keys
_only_ on `(cmd.newAllocations, derivedKind)` and rejects **every** categorised
amend that omits allocations — `(Nothing, IncomeKind)` and
`(Nothing, ExpenseKind)` → `AllocationsRequiredForCategorisedKind`. There is
**no** within-kind / cross-kind distinction: any Income/Expense amend **must**
carry `newAllocations`. (This corrects a stale belief in the codebase — see
§5a.)

Generalise `diffIncomeExpense`:

- Compute new total = Σ all slices; old total from the baseline.
- **Total changed** (or account changed) → emit **one** `diff.amendment` whose
  `newAllocations` **carries the two new buckets**, with leg math
  (`sourceAmount`/`targetAmount` = new total). Do **not** also emit a separate
  `diff.allocations` — the allocations ride _inside_ the amend request, matching
  the merged backend. (This mirrors the existing cross-kind path
  `toIncomeExpenseAmendment` in `convertTransaction.ts:75-93`, which is the
  correct pattern.)
- **Total unchanged, split changed** → `diff.allocations` only → `PATCH
…/allocations` (no money moves), exactly as today's category-only edit.
- Bucket builders take the arrays instead of a single slice.

`useEditTransaction` is unchanged in _structure_ (it applies `amendment` then,
only if present, `allocations`); the change is that the total-changed path no
longer sets `diff.allocations`, so the redundant second call disappears.

> **Note — pre-existing bug fixed in passing.** The current
> `diffIncomeExpense` (`diffTransaction.ts:51-60`) sends an amend _without_
> `newAllocations` and then a separate `setAllocations`. Against the merged
> backend the bare amend is already rejected with
> `AllocationsRequiredForCategorisedKind`, so within-kind amount edits are
> broken today. Folding allocations into the amend request fixes this.

### 5a. Correct the stale "cross-kind only" assumption

Three places encode the false belief that amend `newAllocations` is required
only on a _cross-kind_ amendment; per §5 it is required on **all** categorised
amends. Update the comments (and any guard logic) so they no longer omit
allocations for within-kind edits:

- `src/api/types.ts:285-288` (`AmendTransactionRequest.newAllocations` comment).
- `src/features/transactions/convertTransaction.ts:72-73`.

### 5b. Web — Copy & Convert dialogs (consumers of the reshaped helpers)

Reshaping `toIncomeExpenseFormValues` / `toIncomeRequest` / `toExpenseRequest`
(§4) and the `TransactionResponse` shape (§2) breaks two other callers; both
must be updated in this change:

- **`CopyTransactionDialog`** (`CopyTransactionDialog.tsx:117,129,131`) uses all
  three helpers. It must keep compiling against the new array shape **and**
  preserve _all_ slices of a split it copies (today it would carry only the
  first). Seeds the editor from the copied `tx.allocations`.
- **`ConvertTransactionDialog`** / `convertTransaction.ts` build the
  cross-kind amendment (`toIncomeExpenseAmendment`,
  `toConvertIncomeExpenseDefaults`). These already populate `newAllocations`
  (the correct pattern). Update them to the array-based form values; **[decision]**
  Convert keeps a **single seeded row** (target-kind default category) for now —
  multi-allocation on convert is out of scope, but it must compile and round-trip
  through the new editor.

### 6. Web — list display & filter

- **Category column** (`TransactionsPane.tsx:249`): derive from
  `t.allocations`. Single slice → category name (as today). Multiple slices →
  first category name + `+N` (e.g. `Salary +1`), with the full breakdown in the
  cell `title`. Transfer/Adjustment (empty buckets) → blank (as today).
- **Client-side filter** (`transactionFilters.ts:24`): match if **any**
  allocation's `categoryId` equals the filter — fixes the current bug where a
  split transaction is missed because only the first slice was compared.
- A small helper (e.g. `allocationCategoryIds(tx)` / `primaryCategory(tx)`)
  centralises the flatten so the column and filter share one definition.

### 7. Error handling

- These backend errors are **domain errors with an `errorContext`**, not
  per-index `fieldErrors`, so per-row mapping is infeasible. **Default to the
  form-level banner** (reuse the existing banner path in the dialogs); do not
  over-invest in per-row mapping. Errors to surface:
  `AllocationCurrencyMismatch`, `AllocationsEmpty`,
  `AllocationsDoNotSumToTotal` (shouldn't occur — total is the sum),
  `ContraIncomeNotSupported` (shouldn't occur — Expense form has no income
  section; surfaced defensively).

## Testing

- **schema.test.ts**: multi-row income; income + reimbursement; expense
  multi-row; empty (no rows) rejected; expense with an income slice rejected;
  per-row positive-amount; total = sum; `toIncomeExpenseFormValues` round-trips
  both buckets from `tx.allocations`.
- **AllocationsEditor.test.tsx**: add/remove rows, running total updates,
  collapsible reimbursement section, currency display.
- **diffTransaction.test.ts**: same-total re-split → `allocations` only;
  total change → `amendment` + `allocations`; reimbursement round-trip; account
  change.
- **CreateIncomeDialog / CreateExpenseDialog / EditTransactionDialog**: create a
  2-category expense; create a salary+reimbursement income; edit a split.
- **transactionFilters.test.ts**: filter matches a non-first slice.
- **TransactionsPane**: split row shows `first +N` and tooltip.
- Backend: `TransactionResponse` JSON carries both buckets and no `category`.
- **E2E** smoke: create a 2-category expense end-to-end.

## Migration / compatibility

No back-compat phase (per project policy). Removing `category` and adding
`allocations` is a breaking response-shape change; update web wire types,
fixtures, MSW handlers, and backend tests together. Single-category
transactions are the degenerate one-row case — no special path.
