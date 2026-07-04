---
status: draft
---

# Per-allocation comments (web)

## Context

The backend (server-infra `feat: multi-allocation NL expenses with per-allocation
comments (#27) (#120)`) added an optional free-text `comment` to every allocation
slice. It surfaces on both wire shapes:

- **Create request** — `CategoryAmount { category, amount, comment :: Maybe Text }`
  (`Web/Types.hs:347-352`).
- **Response / set-allocations / amend** — `AllocationResponse { categoryId, amount,
comment :: Maybe Text }` (`Web/Types.hs:541-546`), mirroring the domain
  `Allocation { categoryId, amount, comment :: Maybe Text }`
  (`Domain/Core/Types.hs:1047-1051`).

The domain smart constructor `mkAllocation` **trims** the comment and normalizes
blank/whitespace-only to `Nothing` (`normalizeComment`, `Domain/Core/Types.hs:1077`).
There is no server-side length cap.

The comment carries the item-level "what exactly" (e.g. `milk`, `eggs`) as opposed
to the transaction-level `description` and the `category`. It is populated today by
the NL-prompt path; the web app currently drops it on both read and write.

This spec brings the web app to parity: **edit/create allocations with comments**,
and **surface comments in the transaction list's description column**.

## Goals

1. Round-trip `comment` through the allocation API types.
2. Let users read and edit a per-allocation comment anywhere the shared allocation
   editor appears — Edit, Create expense/income, Copy, and Convert. All four route
   through `AllocationsEditor` + `IncomeExpenseFormValues`, so the field is inherited
   uniformly; there is no per-dialog branching.
3. Show existing comments in the transaction list description column, de-emphasized.

## Non-goals

- Transfers / adjustments (they carry no allocations).
- Filtering or searching transactions by comment.
- Any backend change (already shipped).

## Design

### 1. API types (`src/api/types.ts`)

Add an optional, nullable `comment` to both allocation shapes, citing the backend
source per the repo convention:

```ts
// Web/Types.hs:347-352 — CategoryAmount.comment :: Maybe Text (trimmed; blank → null server-side).
export interface CategoryAmount {
  category: UUID;
  amount: number;
  comment?: string | null;
}

// Domain/Core/Types.hs:1047-1051 — Allocation.comment :: Maybe Text.
export interface Allocation {
  categoryId: UUID;
  amount: Money;
  comment?: string | null;
}
```

`?`/`| null` keeps every existing caller valid and matches `Maybe Text` on the wire.

### 2. Form schema (`src/features/transactions/schema.ts`)

- `sliceSchema` gains `comment: z.string().max(500).optional()`. 500 matches the
  `description` field's client cap (backend enforces no length; it trims + nullifies).
- `IncomeExpenseFormValues`' slice type gains `comment?: string` (kept **optional** so
  existing form-value literals that omit it stay valid — see the optionality note in
  §3).
- `toReqSlices` (schema.ts:143 — widen its inline `{ category; amount }[]` param to
  include `comment?: string`) carries `comment` into `CategoryAmount`. A
  blank/whitespace-only comment is trimmed and normalized to `undefined` (omitted) so
  it matches the server's `normalizeComment` behavior and never sends `""`.

### 3. Editor (`src/features/transactions/AllocationsEditor.tsx`)

- The editor-local row `Slice` type (AllocationsEditor.tsx:27) gains
  `comment: string` — **required** here: every RHF field-array row carries a string
  comment (seeded `''`), never `undefined`. This intentionally differs from the
  exported `IncomeExpenseFormValues` slice, where `comment?: string` stays optional so
  seed literals elsewhere can omit it. The two types are distinct by design.
- Each row renders an additional optional comment `Input` (`aria-label="Comment"`),
  placed as a secondary, full-width field beneath the category + amount line so it
  stays visually subordinate and does not crowd the primary controls.
- `append(...)` seeds `comment: ''` alongside `category`/`amount`.
- **Seed sites** that build initial rows must also seed `comment: ''` for parity
  (they typecheck without it thanks to the optional exported type, but seed it for
  consistency): `CreateIncomeDialog.tsx:50`, `CreateExpenseDialog.tsx:48`, and
  `toConvertIncomeExpenseDefaults` (`convertTransaction.ts:33`).
- No new validation UI — comment is free-text and always optional.

Because the editor is shared, comments become available in Edit, Create
expense/income, Copy, and Convert dialogs uniformly (the agreed scope).

### 4. Load + diff (`allocations.ts`, `diffTransaction.ts`)

- `Slice` (in `allocations.ts`) gains `comment: string`.
- `sliceArraysFromTx` maps `s.comment ?? ''` into the form slices so an existing
  comment is shown when editing.
- `dropEmptySlices`' "blank row" test is unchanged (a row is empty only when both
  category is `''` and amount is `NaN`; a comment alone does not make a row
  submittable — it has no category).
- `toMoneySlices` (diffTransaction.ts:24 — widen its inline `{ category; amount }[]`
  param) carries `comment` into `Allocation`, trimming and normalizing blank →
  `undefined`.
- `sameSlices` (diffTransaction.ts:42 — widen both inline params) compares `comment`
  too. Both sides are **trimmed before comparing**, and blank/`undefined`/`null` all
  compare equal, so `"milk "` vs `"milk"` is not a spurious change. A genuine
  comment-only edit registers as a split change; since the total is unchanged,
  `diffIncomeExpense` routes it through the existing `PATCH /allocations` path
  (`diff.allocations`) — never a spurious amendment. (In practice both sides are
  strings — baseline from `sliceArraysFromTx` maps `s.comment ?? ''`, `next` from the
  form is always a string — so the undefined/null arm is defensive.)

### 5. List description column (`TransactionsPane.tsx` + `allocations.ts`)

- New helper `allocationComments(tx): string[]` — non-empty, trimmed comments across
  `incomes` then `expenses`, in order.
- Render in the description `<td>`:
  - `description` in normal weight (as today).
  - Then, when comments exist, a separator `·` and the comments joined by `, ` in
    `text-muted-foreground`.
  - The whole line clips to one row (existing behavior) with the full
    `description · comments` string in the `title` attribute — same
    "clip + full-in-title" pattern as `CategoryChips`.
  - **Empty description** → comments become the primary text, no leading separator.
  - **No comments** → renders exactly as today.
  - **Dedup**: if the joined comments string exactly equals the description, the
    comment tail is suppressed (NL-created rows often set `description` to the joined
    comments).
- `LabelChips` placement is unchanged; `leadingGap` keys off whether any text (desc
  or comments) precedes it.

## Testing

- `types.ts`: covered by `tsc` — new optional fields must not break existing usage.
- `schema.test.ts`: comment round-trips through `toReqSlices`; blank comment omitted.
- `allocations.test.ts`: `sliceArraysFromTx` carries comment; `allocationComments`
  collects/orders/trims and drops blanks.
- `diffTransaction.test.ts`: comment-only edit → `diff.allocations` (PATCH path), no
  amendment; blank vs null comment produces no diff.
- `AllocationsEditor.test.tsx`: comment input renders, edits, and appends seeded.
- `TransactionsPane.test.tsx`: description + muted comments render; empty-description
  fallback; dedup when comments equal description; no-comment rows unchanged.
- Update MSW handlers / fixtures where allocation shapes are asserted so responses
  include representative `comment` values.

## Open questions

None. Comment length cap chosen as 500 (client-side sanity, matches `description`);
revisit only if the backend later enforces a different limit.
