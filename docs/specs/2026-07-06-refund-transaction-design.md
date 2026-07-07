---
status: draft
---

# Refund a transaction (web)

Tracker: homeaccounting/tracker#33
Depends on: homeaccounting/backend#88 (merged — typed transaction relationships)

## Context

A **refund** records money coming back from a completed purchase — a full or
partial return. The correct accounting (see backend#88) is _new economic
activity posted on the day the money returns_, not an amendment or cancellation
of the original: back-dating a reversal would misstate cash flow. The two
transactions are linked by a typed `Refund` relation so reports can net them.

The decisive simplification is that **a refund needs no new primitive**. It is
an ordinary **Income** transaction whose allocations sit in the **expense
(contra) bucket** — a reimbursement that _reduces_ an expense category rather
than counting as ordinary income — carrying a `Refund` relation to the original.
Everything required already exists:

- The backend accepts an optional `relation` on the income-create endpoint and
  returns `relations` on every `TransactionResponse` (backend#88, merged).
- `AllocationsEditor` (`src/features/transactions/AllocationsEditor.tsx`) already
  renders the two-bucket (contra) allocation model.
- The **fixed target total** authoring aid shipped in tracker#32 (merged, PR #53)
  gives us the live "diff to a pinned total" UX this flow needs.

So this feature is a **guided assembly** of existing parts: seed the contra
allocations from the original, pin the target to the remaining refundable amount,
attach the `Refund` edge on submit, and surface the linkage on both sides.

### Backend contract (no change required)

All of the following already exist in `../server-infra/src/Web/Types.hs` and
`Web/API/TransactionAPI.hs`:

- `IncomeRequest` carries `relation :: Maybe TransactionRelation`
  (`Web/Types.hs:389`). `ExpenseRequest` does **not** — an original purchase is
  an originator and declares no edge.
- `TransactionRelation { relatedTransactionId :: UUID, relationKind :: Text }`
  (`Web/Types.hs:649`) — used for **both** request and response. `relationKind`
  wire tokens: `"refund" | "merge" | "split" | "associated"` (per
  `renderRelationKind`).
- `TransactionResponse.relations :: [TransactionRelation]` (`Web/Types.hs:633`) —
  outbound edges declared by that transaction. Empty for plain purchases.
- `GET /api/transactions/:id/relations → TransactionRelationsResponse
{ outbound, inbound }` (`Web/Types.hs:661`, route at `TransactionAPI.hs:196`).
- `GET /api/transactions/:id → TransactionResponse` (`TransactionAPI.hs:203`) —
  fetch a single transaction (used to resolve prior refund amounts).
- The service enforces per-kind rules: `Refund` is Income → Expense, many→1,
  and the `relTo` (original) **must not be cancelled**.

## Decisions

Resolved during brainstorming (the issue's open questions):

1. **Partial-refund cap: per-slice.** Each contra slice must be ≤ that category's
   original slice, and the total ≤ the original total. Stricter and safer than a
   total-only cap — a refund of category X can never exceed what was spent on X.
2. **Cumulative refunds: cap against remaining.** When the original already has
   prior partial refunds, caps and defaults reflect the _remaining_ refundable
   amount (original − prior refunds), per slice and in total. Over-refund is
   blocked client-side with a clear readout. Requires resolving prior refunds
   (see §Hooks).
3. **Linkage display: both directions, summary badges.** The original expense row
   shows `refunded in full` / `partially refunded ($30 of $100)`; the refund
   income row shows `refund of <original>`.
4. **Archived / deleted category at refund time: keep & allow.** The slice is
   pre-filled and posts against the original category as-is (rendered read-only
   if not re-selectable). No forced re-pick — accounting stays consistent with
   the original.
5. **Target total in the refund dialog: always on, locked to remaining.** Unlike
   the create/edit form (where tracker#32's target is an off-by-default toggle),
   the refund dialog pins the target to the remaining refundable amount with no
   toggle — a fixed target is the whole point of a refund.

## Design

### 1. API / types layer (`src/api/`) — additive, mirrors backend

`types.ts`:

- `export type RelationKind = 'refund' | 'merge' | 'split' | 'associated';`
  (lowercase wire tokens, per backend `renderRelationKind`).
- `export interface TransactionRelation { relatedTransactionId: UUID; relationKind: RelationKind; }`
  — request **and** response, mirroring `Web/Types.hs:649`.
- `export interface TransactionRelationsResponse { outbound: TransactionRelation[]; inbound: TransactionRelation[]; }`
  — mirrors `Web/Types.hs:661`.
- Add `relation?: TransactionRelation;` to **`IncomeRequest`** (cite
  `Web/Types.hs:389`). This **splits the `ExpenseRequest = IncomeRequest` alias**:
  `ExpenseRequest` becomes its own interface without `relation`, matching the
  backend where `ExpenseRequest` has no relation field.
- Add `relations: TransactionRelation[];` to `TransactionResponse` (cite
  `Web/Types.hs:633`).

`transactions.ts`:

- `get: (id: UUID) => client.get<TransactionResponse>(\`/api/transactions/${id}\`)`.
- `relations: (id: UUID) => client.get<TransactionRelationsResponse>(\`/api/transactions/${id}/relations\`)`.
- `createIncome` is unchanged — it already forwards the request body, so an
  attached `relation` rides along.

### 2. Hooks (`src/features/transactions/`)

- **`useTransactionRelations(originalId)`** — TanStack Query wrapping
  `GET /:id/relations`; enabled while the refund dialog is open.
- **`useRefundSummary(originalId)`** — composes the original's **inbound**
  `refund` edges with `GET /:id` on each prior refund to compute:
  `{ refundedTotal, refundedByCategory, remainingTotal, remainingByCategory }`.
  Drives the dialog's defaults and per-slice caps. This is an N+1 fan-out (one
  `GET /:id` per prior refund); the combined loading **and error** state gates
  the form seed — the dialog shows a loading state until all prior-refund fetches
  resolve, and surfaces an error (rather than seeding against incomplete data) if
  any fails.
- **`useRefundTransaction()`** — mutation wrapping the existing `createIncome`
  with `relation: { relatedTransactionId, relationKind: 'refund' }` attached;
  invalidates the transactions list query and the original's relations query on
  success.
- **`buildRefundIndex(transactions): Map<UUID, { count: number; total: number }>`**
  — pure helper folding the loaded window's income outbound `refund` edges onto
  the referenced original id, for the list badges. No extra network calls
  (Choice 2A). **Caveat:** undercounts a badge if a refund lives outside the
  loaded page — acceptable for an informational badge; the dialog's cap math uses
  the accurate `useRefundSummary` fetch, never this index.

### 3. `RefundTransactionDialog`

**Trigger + guard.** A "Refund" `ContextMenuItem` in the `TransactionsPane` row
menu (beside Edit / Cancel / Copy / Convert), added via a new `refundTarget`
state mirroring the existing `copying` / `converting` pattern
(`TransactionsPane.tsx:462-479`). Shown only when
`transactionType === 'expense' && status === 'Completed'`; hidden on income,
absent/disabled on cancelled (the backend forbids a `Refund` edge to a cancelled
`relTo`).

**Seeded form.** Reuses `IncomeExpenseForm` / `AllocationsEditor`, seeded from
`useRefundSummary`:

- kind = income; `allocations.expenses` = the original's slices, each **default**
  = that category's `remainingByCategory`, each **capped** at that remaining
  (per-slice cap, Decision 1 & 2).
- target total **on and locked** to `remainingTotal`; no toggle (Decision 5).
- account defaults to the original's account (money returns to where it left),
  editable; date defaults to **today**, editable; description defaults to
  `Refund: <original description>`.
- **Archived category** (Decision 4): keep the slice; posts against the original
  category id as-is. `CategoryCombobox` has no read-only/archived affordance
  today, so this is a small sub-task the plan must budget — either extend the
  combobox or render a plain read-only label beside the amount for a
  non-selectable category.

**Validation.** Extends the existing `refineAllocations` / schema
(`schema.ts`): per-slice ≤ remaining slice, total ≤ remaining, plus the
tracker#32 balanced-to-target gate. Over-refund is blocked client-side with a
readout, e.g. `$70 of $100 already refunded · $30 left`.

**Submit.** `useRefundTransaction` → `createIncome` with the `Refund` relation to
the original. On success the dialog closes and the list refreshes with both
linkage badges populated.

### 4. Linkage badges

- **Expense row:** from `buildRefundIndex` — `refunded in full` when
  `remaining ≈ 0`, else `partially refunded ($30 of $100)`. The threshold reuses
  the money helper extracted in tracker#32 (`lib/money` `roundMoney`) rather than
  a bespoke epsilon, to stay consistent with the target-total diff math.
- **Refund income row:** from its own outbound `refund` relation —
  `refund of <original description>`. If the original is not in the loaded
  window, fall back to a generic `refund` label (caveat documented; the badge is
  informational).

### 5. Testing

- **Component** (`RefundTransactionDialog.test.tsx`): default (full) seed;
  partial edit; per-slice cap enforced; total cap enforced; over-refund blocked
  with readout; guard (no Refund action on income or cancelled); archived
  category kept and posted; both badges render.
- **Schema** (`schema.test.ts`): the new refund validation refinements
  (per-slice ≤ remaining, total ≤ remaining, balanced gate).
- **MSW** (`handlers.ts`): `createIncome` receives and posts `relation`;
  `GET /:id/relations` + `GET /:id` drive `useRefundSummary`; `buildRefundIndex`
  from a windowed list.

## Out of scope (per issue)

- Cross-currency refunds (refund in the original's currency only; backend defers
  report handling).
- Refund of an Income (originals are Expense originators).
- Automatic refund detection from bank imports.
- Merge / split lineage (tracker#30 / #31 — same relation substrate, separate
  features).

## Acceptance criteria

- "Refund" action appears only on completed Expense rows; absent on income and
  cancelled.
- Dialog inherits the original's categories as contra allocations, defaulting to
  remaining amounts, editable down with per-slice and total caps against
  remaining; over-refund blocked.
- Target total is pinned to remaining with the tracker#32 live diff.
- Account and date are selectable; date defaults to today.
- Submit creates an Income (contra) transaction with a `Refund` relation to the
  original; the list shows the linkage badge on both the original and the refund.
- `types.ts` mirrors the backend relation shapes; `ExpenseRequest` no longer
  aliases `IncomeRequest`.
- Tests cover defaults, partial, caps, guards, archived category, create-with-
  relation, and badges.
