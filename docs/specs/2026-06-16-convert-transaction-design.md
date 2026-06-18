---
status: draft
issue: 20
---

# Convert Transaction — Design

## Problem

> As a user I want to be able to convert a transaction (cross-kind amendment).
> Expense → Income or Transfer, Income → Expense or Transfer, Transfer → Income
> or Expense. Should be accessible via the context menu on an existing
> transaction.
> — GitHub issue #20

A "conversion" changes a completed transaction's **kind** in place — it amends
the same transaction (same id), it does not create a new one (that is what Copy
does, see `2026-06-16-copy-transaction-design.md`).

## Context & existing infrastructure

The backend already supports cross-kind amendment end to end; this feature is a
web-only UI on top of the existing `amend` endpoint.

- **Kind is structurally derived** from the `(source, target)` account-type
  pair (`server-infra/src/Domain/Core/Types.hs` `deriveTransactionKind`):
  - `Regular → External` ⇒ **Expense**
  - `External → Regular` ⇒ **Income**
  - `Regular → Regular` ⇒ **Transfer**
  - `External → External` is unreachable.
- **Amendment endpoint**: `PUT /api/transactions/:id/amendment`
  (`AmendTransactionRequest`, `src/api/transactions.ts` `amend`). The backend
  command docs (`Domain/Transaction/Commands.hs` `AmendTransaction`) state
  cross-kind amendment is supported and the new kind is derived from the new
  leg pair. `Adjustment` is explicitly **out of scope**
  (`CannotAmendToAdjustmentKind`); amendment also requires the transaction to be
  in the `Completed` state.
- **External account id** is always obtainable: it is the External leg of an
  existing Income/Expense (`tx.sourceAccountId` for income, `tx.targetAccountId`
  for expense), and for Transfers (which have two Regular legs) it comes from
  `useUserProfile().data.externalAccountId` (`UserProfileResponse.externalAccountId`,
  `src/api/types.ts`).
- **Forms to reuse**: `IncomeExpenseForm` and `TransferForm`
  (`src/features/transactions/`), already driven by `CopyTransactionDialog` from
  a source transaction.
- **Mutation to reuse**: `useEditTransaction` (`src/features/transactions/useEditTransaction.ts`)
  applies a `TransactionEditDiff`; when `diff.amendment` is set it calls
  `api.amend(id, diff.amendment)` and patches the cache for `accountIds`.
- **Context menu**: `TransactionsPane.tsx` already renders a per-row
  `ContextMenu` with Edit / Copy / Cancel items.
- **Default categories (interim seed source)**: `useConfiguration()` exposes
  `banking.defaultIncomeCategory` / `banking.defaultExpenseCategory`
  (`BankingConfigurationDTO`, `src/api/types.ts`). These are the bank-import
  defaults; we reuse them here as the interim default-category source. Issue #41
  tracks promoting these to global defaults under the Dictionaries tab, after
  which Convert should read the new global fields.

## Goals

- Convert a `Completed` Income / Expense / Transfer to either of the other two
  kinds, in place, via the row context menu.
- Reuse the existing per-kind forms and the `amend` mutation.
- Preserve the transaction's date, description, and labels across the
  conversion (only the legs / amount / category change).

## Non-goals

- Converting **to or from** `Adjustment` (backend out of scope).
- Converting non-`Completed` transactions.
- The global default-category setting (issue #41) — this spec uses the existing
  banking defaults as an interim source.

## Design

### 1. Semantics

Conversion issues a single cross-kind `amend` against the existing transaction
id. The new kind follows structurally from the new `(source, target)` leg pair
the dialog submits. The amendment carries `newAllocations` **inline** when the
target kind is categorised (Income/Expense) — see §5. Date, description, and
labels are never part of the amendment payload, so the kind change alone leaves
them untouched. They are pre-filled from the source and remain editable in the
shared forms; if the user changes one, it is applied via the same
`setDescription` / `setDate` / `setLabels` sub-calls Edit uses
(`useEditTransaction` diffs them). An untouched convert therefore issues only the
amendment request.

### 2. Entry point — context-menu submenu

In `TransactionsPane.tsx`, add a `ContextMenuSub` ("Convert to ▸") between the
Duplicate and Cancel items (the copy action's menu item is labelled
"Duplicate"). It is rendered only for rows whose transaction is
`Completed` and whose kind is not `Adjustment`. The submenu lists the **two
kinds other than the current one** (drawn from Income / Expense / Transfer);
each item opens a `ConvertTransactionDialog` pre-targeted to that kind.

### 3. Dialog — `ConvertTransactionDialog.tsx`

Closely mirrors `CopyTransactionDialog`, reusing `IncomeExpenseForm` /
`TransferForm`, `useAccounts`, `useConfiguration`, and (for the External id on
transfers) `useUserProfile`. Differences from Copy:

- Props: `{ open, onOpenChange, tx, targetKind }` where
  `targetKind ∈ { income, expense, transfer }`.
- Seeds the matching form from the source transaction per §4.
- On submit, builds an `AmendTransactionRequest` (§4/§5) and calls the existing
  `useEditTransaction` mutation with a diff of the form
  `{ amendment: { …legs, newAllocations? }, description?, date?, labels? }` (the
  scalar fields included only when the user changed them, diffed against the
  seeded baseline exactly as Edit does), and `accountIds` covering **both the old
  and the new legs** so the row leaves its old account list(s) and appears in the
  new one(s).
- Loading guard: like Copy/Edit, wait for `accounts` (and, for transfers,
  `profile`) before mounting the form, because react-hook-form seeds
  `defaultValues` once.

Title: "Convert to Income" / "Convert to Expense" / "Convert to Transfer".

### 4. Per-conversion seeding

Let `E` = external account id, `S`/`T` = the source/target legs of the current
transaction, `R` = a user-picked regular account. The amend request's
`(sourceAccountId, targetAccountId)` is chosen so `deriveTransactionKind` yields
the target kind:

| From → To                 | amend source      | amend target    | allocations    |
| ------------------------- | ----------------- | --------------- | -------------- |
| Expense (`S→E`) → Income  | `E`               | `S` (keep)      | income bucket  |
| Expense → Transfer        | `S` (keep)        | `R` (pick)      | none           |
| Income (`E→T`) → Expense  | `T` (keep)        | `E`             | expense bucket |
| Income → Transfer         | `R` (pick)        | `T` (keep)      | none           |
| Transfer (`S→T`) → Income | `E`               | `T` (keep "to") | income bucket  |
| Transfer → Expense        | `S` (keep "from") | `E`             | expense bucket |

- **Amount / currency** seed as the magnitude of the kept leg and that
  account's currency. For a cross-currency transfer collapsing to
  income/expense, the kept leg's amount/currency is used and the dropped leg's
  amount is intentionally discarded — the resulting income/expense is
  single-currency, so there is no exchange rate to reconstruct.
- **Account is a sensible default but editable**: the kept/derived regular
  account is pre-selected; the form's account picker stays fully editable so the
  user can choose a different account (including the other transfer leg).
- **Category** (Income/Expense targets only): seed from the target-kind banking
  default — `banking.defaultIncomeCategory` for → Income,
  `banking.defaultExpenseCategory` for → Expense. The source transaction's
  category is **not** carried across (income and expense categories are separate
  dictionaries and a source category is invalid for the new kind). If the
  banking default is `null`, the field stays empty and is required by the form
  schema.
- **Multiple source allocations collapse into a single slice**: a categorised
  source may have several allocation slices, but the web only ever models a
  single category (the wire `TransactionResponse.category` is just the _first_
  allocation — `Web/Types.hs` `transactionTypeCategoryText = listToMaybe …`).
  Convert therefore always emits **one** allocation slice carrying the full
  kept-leg amount under the target-kind default category; it does not attempt to
  preserve or map individual source slices. This is sound because the backend
  guarantees a categorised transaction's allocations sum to its leg total, so
  one slice for the full amount is balanced.

### 5. Cross-kind allocations: inline in the amend request

On a true cross-kind change the backend requires `newAllocations` **inside** the
amend request (unlike within-kind edits, which use the separate
`PATCH /allocations` endpoint via `diff.allocations`). `AmendTransactionRequest`
already declares `newAllocations?: Allocations`. The convert path therefore
builds:

```
diff = { amendment: { sourceAccountId, targetAccountId, sourceAmount,
                      sourceCurrency, targetAmount, targetCurrency,
                      exchangeRate?, newAllocations? } }
```

and reuses `useEditTransaction` unchanged: it sends `amend` and, because
`diff.allocations` is undefined, skips the allocations PATCH. The single-slice
allocation bucket is built the same way as `diffTransaction.ts`/`schema.ts`
(one slice in the bucket matching the new kind, the other bucket empty).

A small dedicated request builder (e.g. `toConvertAmendment(tx, targetKind,
values, …)`) encapsulates the §4 table and lives alongside `diffTransaction.ts`.

### 6. Error handling

Copied from `CopyTransactionDialog`: `ApiError.fieldErrors` are mapped onto the
matching form fields; any other error renders a destructive `Alert` banner. The
form's submit is disabled while the mutation is pending.

### 7. Testing

- `ConvertTransactionDialog.test.tsx`: for each of the six conversions, assert
  the `amend` request payload (legs, amounts, `newAllocations`) is correct;
  assert the category seeds from the banking default and that an unset default
  leaves the field empty/required; assert an untouched convert sends only the
  amendment (no `setDescription`/`setDate`/`setLabels` calls), and that editing a
  scalar field does fire its sub-call.
- `TransactionsPane` test: the "Convert to" submenu shows exactly the two valid
  target kinds for each source kind, and is absent for `Adjustment` and
  non-`Completed` rows.

## Open questions / future work

- Issue #41 will replace the interim banking-default seed source with a global
  default-category setting; only the seed lookup in `ConvertTransactionDialog`
  changes at that point.
