---
status: draft
---

# Bulk-assign labels & category to selected transactions (web)

## Context

The transactions pane already supports **multi-selection**: a checkbox column plus a header
select-all, backed by `useTransactionSelection` (`src/features/transactions/useTransactionSelection.ts`),
whose selection survives pagination and clears when the scope (`account + date window + filters`)
changes. When rows are selected a floating `SelectionActionBar`
(`src/features/transactions/SelectionActionBar.tsx`) appears at the bottom with **Link** (exactly 2
linkable rows) and **Merge** (≥ 2 merge-eligible rows), plus count and a clear button.

Independently, **every row is wrapped in a `ContextMenu`** (`TransactionsPane.tsx:495`) whose content
offers Edit / Copy / Convert / Category ▸ / Labels ▸ / Contact ▸ / Refund / Cancel. The Category and
Labels submenus are `TxCategoryQuickPicker` and `TxLabelQuickPicker` — both `ContextMenuSub`
components built on the shared `MenuSearchList` (a search box + option list designed to live inside a
Radix menu popup). These commit to a **single** transaction via the parent's `assignCategory` /
`commitLabels`, which call `useEditTransaction` (`useEditTransaction.ts`) — a mutation that patches the
`['transactions', accountId]` cache and invalidates on settle.

### The problems

1. **Double surface.** When 2+ rows are selected, right-clicking a row *still* opens that row's
   single-row context menu, *while* the floating selection bar is also visible. Two competing action
   surfaces for what the user perceives as one multi-selection.
2. **No bulk label/category.** Bulk actions are limited to Link and Merge. There is no way to apply a
   label or a category to all selected rows at once — the user must open each row's menu individually.

## Goals

- Applying a **label** to a multi-selection adds/removes it across all selected rows in one gesture.
- Applying a **category** to a (compatible) multi-selection sets it on all selected rows at once.
- Eliminate the double-surface confusion: with a multi-selection active, right-click acts on the
  **selection**, not a lone row.

## Non-goals

- No backend change. Bulk apply is a client-side fan-out over the existing per-transaction edit
  endpoints.
- No bulk Contact, Convert, Refund, Cancel, Edit, or Copy in v1 (labels + category only).
- No new bulk-action buttons on the floating bar; the bar keeps its current role (count + Link/Merge +
  clear). Bulk label/category live in the right-click menu, where the existing menu-based pickers fit
  verbatim.

## Design

### 1. Right-click routing (fixes the double surface)

`TransactionsPane` chooses the menu content per row at right-click time, based on the selection at that
moment:

- Right-click a row that **is part of a 2+ selection** → open a **bulk** `ContextMenuContent`
  (`BulkTransactionMenu`) acting on all selected rows.
- Right-click a row that is **not** in the selection → collapse the selection to just that row, then
  open the normal single-row menu (standard file-manager behavior; avoids acting on rows the user
  can't see are targeted).
- With **0 or 1** rows selected → behavior is exactly as today (single-row menu).

The floating `SelectionActionBar` is unchanged in role and remains the discoverable entry point for a
selection; the bulk right-click menu mirrors its Link/Merge and adds the two pickers. The bar currently
wires Link/Merge as **inline** handlers — `onLink={() => canLink && setLinkPair([selectedRows[0]!, selectedRows[1]!])}`
(`TransactionsPane.tsx:912`) and `onMerge={() => selectedRows.length >= 2 && setMergeSelection(selectedRows)}`
(`:915`). These are extracted into named `handleLink` / `handleMerge` so both the bar and the bulk menu
share one implementation, alongside the existing `canLink` / `canMerge` / `mergeDisabledReason`
(`:338-344`). The bulk menu **shows Link only when `canLink`** (matching the bar,
`SelectionActionBar.tsx:45`) and shows Merge disabled-with-reason when `!canMerge`.

**Collapse-to-row mechanism.** Radix `ContextMenuTrigger` opens on right-click with no pre-open hook to
mutate selection, and the content is chosen at render. So the collapse runs from an `onContextMenu`
handler on the row `<tr>` (which fires before the menu opens): if the row is **not** selected, call a
new `selection.setOnly(id)` (clear + select just this row) synchronously; React re-renders and the
`ContextMenu` for that row then renders single-row content. `useTransactionSelection` gains
`setOnly(id: UUID)` (`= new Set([id])`) since it currently exposes only `toggle`/`setMany`/`clear`/`isSelected`.
Each row stays wrapped in its own `ContextMenu`; the content it renders is chosen by
`selection.isSelected(t.id) && selection.count >= 2` (bulk) vs. single-row.

### 2. Bulk labels — tri-state add/remove

New `BulkLabelPicker` (`ContextMenuSub` → `MenuSearchList`), reused for the selection. Because labels
are multi-valued and the selection is heterogeneous, each label renders one of three states derived
across the selected rows:

- on **all** selected rows → checked (Check icon)
- on **some** → indeterminate (Minus icon)
- on **none** → empty

Interaction (the pivot is "on all rows?", so the `some`/indeterminate case adds):

- Pick a label that is **not on all** rows (i.e. `none` or `some`) → **add** it to every selected row.
- Pick a label that **is on all** rows → **remove** it from every selected row.

Icon precedence in `MenuSearchList`: a label is shown checked (Check + bold) only when it is on **all**
rows; `indeterminate` (Minus) takes precedence for the `some` case and suppresses the bold/Check
styling. `isSelected` therefore means "on all rows" for this caller.

The submenu stays open for multiple edits and the **selection is preserved** (unlike Link/Merge, which
clear on success). State re-derives from live `data` after the edit invalidation settles.

`MenuSearchList` gains **one optional, additive prop** — `indeterminate?: (id: UUID) => boolean` —
used only to render the Minus icon; single-row callers pass nothing and are unchanged.

Create-a-label-then-apply is supported the same way the single-row picker supports it (via the existing
`onCreate` path), with the created id added to all selected rows.

### 3. Status gating (both pickers)

The single-row pickers only render for `status === 'Completed'` rows (`TransactionsPane.tsx:731,744`).
Bulk must match this to avoid fanning edits at rows the single-row UI would never touch. Rule: **both
Set labels and Set category are enabled only when every selected row is `Completed`**; otherwise both
items are disabled with the reason "Only completed transactions can be edited." This is checked before
the type/allocation gating below.

### 4. Bulk category — gated, reuses `TxCategoryQuickPicker`

Category is type-dependent (income vs expense are distinct dictionaries; transfers/adjustments have no
category) and the single-row picker only appears for single-allocation rows. Bulk "Set category" is
therefore **gated** — the menu item is enabled only when every selected row is `Completed` (§3) AND
same-type AND single-allocation; otherwise disabled with an explanatory label (mirroring the Merge
button's `mergeDisabledReason` pattern):

- any row is neither income nor expense (transfer/adjustment) → "These transactions have no category"
- mixed income/expense → "Select transactions of one type to set a category"
- any multi-allocation (split) row → "Can't set a category on split transactions"

Per-row type is read from `TransactionResponse.transactionType` (`types.ts:413`) via `isIncome` /
`isExpense` (`transactionType.tsx`), exactly as the single-row picker does (`TransactionsPane.tsx:731-739`).
When enabled, options come from that type's dictionary (`incomeCategoryEntries` / `expenseCategoryEntries`,
already computed at `TransactionsPane.tsx:256-257`) and picking sets the category on every selected row
via `allocationsWithCategory`. **Note:** `allocationsWithCategory` is currently a module-local helper in
`TransactionsPane.tsx:108-114` (not exported from `allocations.ts`); the category fan-out lives in the
pane so no move is required — do not create a duplicate helper.

**Close-on-commit (applies to single-row category too).** A single-select pick is terminal, so picking
a category **closes the whole context menu** (then the toast confirms). A multi-select labels submenu
**stays open** for more edits and dismisses on Escape/outside-click — the current `TxLabelQuickPicker`
behavior, kept. Today *neither* closes on pick because `MenuSearchList` commits via `onMouseDown` +
`preventDefault()` (to beat the input blur), which also suppresses Radix's built-in select-closes-menu.
So category needs an **explicit close** after commit. Because Radix `ContextMenu.Root` is uncontrolled
(no `open` prop), the plan closes the menu by **force-remounting the affected row's `<ContextMenu>`**
(bumping a per-row nonce in its React `key`) from a pane-level `requestCloseMenu(rowId)` that the
category `onSelect` calls alongside the commit. This needs no change to `MenuSearchList` and applies to
the **single-row** category picker too (the pane's `onSelect` calls `requestCloseMenu`), so both
category pickers stop being sticky. Labels never call it, so the labels submenu stays open.

### 5. Commit & feedback

Each bulk apply fans out per-row `edit.mutateAsync({ id, accountIds: affectedAccountIds(t), diff })`
(reusing `useEditTransaction`; cache patch + invalidation already handled per row) using
`Promise.allSettled`. On completion a toast (via the app wrapper `import { toast } from '@/lib/toast'`,
already the convention across `src/features/profile/*`) reports the outcome:

- all succeeded → `toast.success('Updated N transactions.')`
- partial → `toast.error('Updated X of N; Y failed.')`

This is a deliberate improvement over the single-row silent fire-and-forget: with N rows the user needs
confirmation of what landed.

**Re-entrancy.** A pending flag (`isApplying`) is held while a batch is in flight; picker items are
disabled during that window so rapid successive picks can't overlap two `Promise.allSettled` batches
against the shared `edit` mutation. This is simpler than the single-row `commitChain` serialization and
sufficient because each batch here is a discrete gesture rather than a stream of toggles.

**Selection persistence.** Selection is **preserved** after a label/category apply (the submenu stays
open for more edits, and the failed rows remain selected for a retry-by-re-pick). Only Link/Merge clear
the selection, unchanged. There is no automatic retry in v1; the partial-failure toast is the recovery
signal.

### 6. Pure helpers (`bulkLabels.ts`)

Extract the array math so it is unit-testable independent of React/Radix. `rowLabels` transforms are
per-row (the pane maps them over `selectedRows`, using each row's `t.labels` (`types.ts:420`) and
`affectedAccountIds(t)` (`TransactionsPane.tsx:98`) for the fan-out):

- `allCompleted(selectedRows): boolean` — the shared §3 status gate, consumed by both the labels item
  and by `bulkCategoryEligibility`.
- `labelState(selectedRows, labelId): 'all' | 'some' | 'none'`
- `withLabelAdded(rowLabels, labelId): UUID[]` / `withLabelRemoved(rowLabels, labelId): UUID[]`
  (dedup on add; no-op when already absent on remove)
- `bulkCategoryEligibility(selectedRows): { enabled: boolean; reason?: string; type?: 'income' | 'expense' }`
  — encodes §3 status gating (via `allCompleted`) + §4 type/allocation gating, in that order.

## Components & files

**New**

- `src/features/transactions/bulkLabels.ts` — pure state/derivation + category-eligibility helpers.
- `src/features/transactions/BulkLabelPicker.tsx` — tri-state labels submenu over `MenuSearchList`.
- `src/features/transactions/BulkTransactionMenu.tsx` — the bulk `ContextMenuContent`
  (Set category ▸ / Set labels ▸ / Link / Merge), presentational; eligibility + handlers passed in.

**Touched**

- `src/features/transactions/TransactionsPane.tsx` — right-click routing (bulk vs single vs
  collapse-to-row via row `onContextMenu`), extract `handleLink` / `handleMerge`, bulk commit fan-out
  (`Promise.allSettled`) + `isApplying` guard + toast, wiring `BulkTransactionMenu`.
- `src/features/transactions/useTransactionSelection.ts` — add `setOnly(id: UUID)` (collapse selection
  to a single row) to the returned interface.
- `src/features/transactions/MenuSearchList.tsx` — add optional `indeterminate?: (id) => boolean` prop
  and Minus-icon rendering (additive; existing callers untouched, Minus takes precedence over Check).
  (Menu close is orchestrated by the pane via a remount nonce — no `closeOnPick` prop needed.)
- `src/features/transactions/TxCategoryQuickPicker.tsx` — unchanged; the pane's `onSelect` gains the
  `requestCloseMenu` call so single-row category also closes on commit (consistency fix).

## Testing

**Unit (Vitest + Testing Library + MSW)**

- `bulkLabels.test.ts` — `allCompleted` true only when all rows `Completed`; `labelState` all/some/none; add dedups; remove is no-op when absent;
  category eligibility ordering: any non-`Completed` → disabled w/ status reason; transfer/adjustment
  in selection → "no category"; mixed income/expense → type reason; multi-allocation → split reason;
  same-type single-allocation all-`Completed` → enabled with `type`.
- `useTransactionSelection.test.ts` — `setOnly` replaces the set with a single id.
- `MenuSearchList.test.tsx` — indeterminate renders Minus and suppresses Check; absent prop → no Minus
  (regression).
- `BulkLabelPicker.test.tsx` — tri-state icons; pick-`none`/`some` adds to all; pick-`all` removes from
  all; submenu stays open; selection preserved.
- `TransactionsPane` tests — right-click routing: selected row (2+) opens bulk menu; unselected row
  collapses selection (`setOnly`) and opens single-row menu; 0–1 selected unchanged. Category item
  disabled for mixed-type, split, and non-`Completed` selections (each reason). Labels item disabled
  when any row non-`Completed`. Toast on all-success and on partial failure. Bulk pickers disabled
  while `isApplying`.

**E2E (Playwright `@local`)**

- Select 3 transactions, right-click, Set labels ▸, apply a label, verify all three show the label and
  a success toast appears.

## Resolved decisions

- **Status gating:** bulk label/category require every selected row to be `Completed`, matching the
  single-row pickers. A mixed-status selection disables both with a reason (no silent partial apply).
- **Transfers/adjustments:** included in a selection, they disable Set category ("no category"); labels
  are unaffected by type but still require `Completed`.
- **Close-on-commit:** single-select category closes the menu on pick (bulk *and* single-row); labels
  stay open, dismiss on Escape/outside-click.

## Open questions / risks

- Tri-state relies on refetch-after-invalidate to update icon state; there is a small round-trip lag
  while the submenu stays open. Acceptable for v1 (matches the existing invalidation model, which writes
  the server response into cache so the re-derive actually re-renders); optimistic local state can be
  added later if the lag is noticeable.
- Right-click "collapse to this row" changes selection as a side effect of opening a menu; this matches
  common file-manager UX but is a behavior change worth calling out in the PR.
