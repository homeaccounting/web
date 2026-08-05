---
status: draft
---

# Selection-driven transaction actions: checkbox column + floating action bar (web)

## Context

The transactions list (`src/features/transactions/TransactionsPane.tsx`) exposes two
multi-transaction flows through each row's right-click `ContextMenu`:

- **Link** (`ContextMenuItem` → `LinkTransactionDialog`) — creates a typed relation
  (`associated` or retroactive `refund`) from the right-clicked row to **one** counterpart
  chosen from a `<Select>` dropdown. The dropdown is populated by
  `useAllAccountsWindowedTransactions` over a wide window (acting date − 1yr … today) across
  **all** accounts, because association's core use case is linking rows on _different_ accounts.
- **Merge into this…** (`ContextMenuItem` → `MergeTransactionsDialog`) — folds **N**
  compatible rows (same account/kind/currency, Completed, non-conflicting contact) into the
  right-clicked survivor. Sources are chosen from a **checkbox list** inside the dialog, drawn
  from the account's loaded window (`data ?? []`).

### The problem

Both flows make the user pick "the other transaction(s)" from a picker **inside a dialog**,
and the two pickers are inconsistent (single-select `<Select>` vs. multi-select checkbox
list). You are already looking at the transactions you want to act on in the list, but you
have to re-find them in a modal. This is the UX friction being addressed.

### Relevant existing code

- `TransactionsPane.tsx` — renders the table; each `<tr>` is wrapped in a `ContextMenu`.
  The leftmost `<th className="w-8">`/first `<td>` today holds only the type/status icons'
  spacer. Dialog open-state lives in `useState` hooks (`linkTarget`, `mergeTarget`, …);
  dialogs render at the bottom keyed off those.
- `MergeTransactionsDialog.tsx` — props `{ acting, candidates, onMerged? }`; derives
  `compatible` from `candidates`, holds `selectedIds: Set<UUID>`, submits via
  `useMergeTransactions(acting.id)`. Eligibility helpers in `mergeEligibility.ts`
  (`checkMergeEligibility`, `combinedTotal`, `categorisedTotal`, `mergeCurrency`).
- `LinkTransactionDialog.tsx` — props `{ acting }`; helpers `availableKinds(tx)`,
  `isIncomeWithContra(tx)`, `accountIdOf(tx)`; submits via `useLinkRelation(acting.id)`;
  refund over-refund guard via `useRefundSummary`.
- Pagination/filter state: `filtered`, `pageRows`, `clampedPage`, `appliedWindow`, `filters`,
  `id` (account from route params).

### Future direction (out of scope, but shapes this design)

A future **all-accounts transactions list** (no account filter) will exist. Cross-account
linking naturally belongs there: selection will span accounts for free. Therefore this
feature does **not** need to preserve the current dialog's cross-account counterpart search —
that search is retired here, and cross-account linking returns with the all-accounts list.

## Decisions (locked)

1. **Trigger pattern = floating action bar** (not a context menu, not an inline toolbar).
   It appears bottom-center when ≥1 row is selected, is immediately visible/discoverable, and
   does not collide with the existing per-row context menu.

2. **Link is purely selection-driven and same-account-only for now.** The counterpart-search
   dropdown and the all-accounts window query are **removed**. Cross-account linking is
   intentionally unavailable until the all-accounts list ships ("accept the gap").

3. **Merge survivor is chosen in the dialog** via radios (default = most recent by date),
   because selection — not a right-click — now picks the rows, so there is no implicit survivor.

4. **The per-row context-menu "Link" and "Merge into this…" items are removed.** All other
   context items stay (Edit, Duplicate, Convert to, category/label/contact quick-pickers,
   Refund, Cancel). Note: the context-menu **Refund** item is a _distinct_ flow (creates a new
   refund transaction) and is unrelated to Link's retroactive `refund` relation — it is kept.

5. **No new bulk actions** beyond Link/Merge (no bulk-cancel, bulk-label). The bar is
   structured to allow them later, but they are out of scope.

6. **No new API or backend changes.** Reuses `useMergeTransactions`, `useLinkRelation`,
   `useRefundSummary`, and existing eligibility helpers.

## Design

### Selection state — `useTransactionSelection.ts` (new)

A small hook owning selection so it is unit-testable and keeps `TransactionsPane` lean.

```
useTransactionSelection(resetKey: string): {
  selectedIds: Set<UUID>;
  isSelected(id): boolean;
  toggle(id): void;
  setMany(ids: UUID[], selected: boolean): void;   // header select-all / clear-all on a page
  clear(): void;
  count: number;
}
```

- Internally a `Set<UUID>`. `resetKey` is a string derived by the caller from
  `id + appliedWindow.from + appliedWindow.to + JSON.stringify(filters)`; when it changes the
  hook clears selection (via `useEffect` on `resetKey`). This enforces "clear on account /
  date-window / filter change" while **persisting across pagination** (page index is not part
  of the key).
- The caller resolves selected rows from the loaded window:
  `selectedRows = (data ?? []).filter(t => selectedIds.has(t.id))`. Resolving from `data` (the
  whole window) rather than `pageRows` is what makes cross-page selection work for Merge.

### Checkbox column — `TransactionsPane.tsx`

- Replace the current leftmost spacer `<th className="w-8 px-4 py-2" />` with a header
  containing a **select-all checkbox** for the current page. Its state:
  - checked when every `pageRows` id is selected,
  - indeterminate when some (not all) are selected,
  - unchecked otherwise.
    Toggling calls `setMany(pageRows.map(r => r.id), nextChecked)`.
- Add a leading `<td>` per row with a checkbox bound to `isSelected(t.id)` / `toggle(t.id)`.
  - `onClick`/`onChange` calls `stopPropagation()` so the row's `onDoubleClick`/`onKeyDown`
    (edit) and the context menu are not triggered.
  - `aria-label={`Select ${t.description || 'transaction'}`}`.
- Selected rows get a subtle highlight (e.g. `bg-muted/60`) consistent with the design-system
  tokens, layered under the existing `hover:bg-muted/50` and `deEmphasized` styles.
- The type/status icons move into their own (now second) column; the rest of the columns are
  unchanged. Verify the `colSpan`/header alignment still holds.

### Floating action bar — `SelectionActionBar.tsx` (new)

Presentational; all logic passed in as props.

```
interface SelectionActionBarProps {
  count: number;
  canLink: boolean;         // exactly 2 selected
  canMerge: boolean;        // >= 2 selected AND checkMergeEligibility(selectedRows).eligible
  mergeDisabledReason?: string;  // ineligibility message when >=2 but not eligible
  onLink(): void;
  onMerge(): void;
  onClear(): void;
}
```

- Rendered (fixed, bottom-center, above pagination) only when `count > 0`.
- Shows `"{count} selected"`, a **Clear (✕)**, and:
  - **Link** button — rendered only when exactly 2 selected **and both rows are Completed**
    (`canLink`). This preserves the old context-menu constraint (`t.status === 'Completed'`),
    which the pure "exactly 2 selected" rule would otherwise drop — a Cancelled row must not be
    linkable. (Refund additionally requires the expense be non-cancelled, guarded in the dialog.)
  - **Merge** button — rendered when ≥2 selected; disabled with a tooltip carrying
    `mergeDisabledReason` (from `INELIGIBILITY_MESSAGE`) when `!canMerge`.
  - When `count === 1`: neither action button; show a muted hint "Select 2 to link or merge".
- Uses existing UI primitives (`Button`, `Tooltip`); keyboard-reachable; `role="region"` with
  an `aria-label` like "Selection actions".

Wiring in `TransactionsPane`: `selectedRows` feeds `checkMergeEligibility` to compute
`canMerge`/`mergeDisabledReason`; `count === 2` computes `canLink`. `onLink`/`onMerge` set new
open-state (`linkPair` / `mergeSelection`) that render the dialogs; a successful action clears
the selection.

### Merge dialog rework — `MergeTransactionsDialog.tsx`

- Props change from `{ acting, candidates, onMerged? }` to `{ selected: TransactionResponse[],
onMerged? }` (plus `open`/`onOpenChange`).
- Internal `survivorId: UUID`, defaulting to the **most recent** selected row (max `date`;
  ties broken by `selected` array order, i.e. the first such row wins — deterministic for tests).
  Radios let the user pick a different survivor; the survivor is badged and highlighted.
- The old "Merge in" checkbox list is removed — `selected` already _is_ the set. The dialog
  still lists all selected rows (survivor + to-be-cancelled) for confirmation, with the
  merged total and "N will be cancelled".
- Submit: `useMergeTransactions(survivorId)` with
  `sourceTransactionIds = selected.filter(s => s.id !== survivorId).map(s => s.id)`.
- Eligibility is re-checked on `selected` (defense in depth; the bar already gated it). If
  somehow ineligible, show the existing `INELIGIBILITY_MESSAGE` alert and disable Merge.

### Link dialog rework — `LinkTransactionDialog.tsx` (pair mode)

- Props change from `{ acting }` to `{ pair: [TransactionResponse, TransactionResponse] }`
  (plus `open`/`onOpenChange`). The `useAllAccountsWindowedTransactions`,
  `useTransactionRelations`, counterpart `<Select>`, and account-name lookup are removed.
- **Kind + direction inference** from the pair, reusing `isIncomeWithContra`/`accountIdOf`:
  - Both kinds start from `associated`, which is always available (owner picked deterministically,
    e.g. the more recent row).
  - **Refund** is offered _only_ when exactly one row is income-with-contra and the other is a
    non-cancelled expense on the **same account**. In that case owner = the income-with-contra
    row, counterpart = the expense; `useRefundSummary` guards over-refunding.
  - If the two rows are already related, surface a message and disable Link. Check by scanning
    **each pair member's own `.relations`** for an edge whose `relatedTransactionId` is the other
    member (either direction). (Inbound relations are no longer queried via
    `useTransactionRelations`; the outbound edges carried on the two loaded rows are sufficient
    for the same-account pair case.)
- Kind toggle UI: a two-option segmented control (Association / Refund) when both apply;
  Association-only (no toggle, or a single disabled Refund) when the pair doesn't qualify.
- Submit: `useLinkRelation(owner.id).mutateAsync({ relatedTransactionId: counterpart.id,
relationKind })`.

## Error handling

- Merge/Link dialogs keep their current `ApiError` → `fieldErrors`/message handling and inline
  `Alert`.
- Bar-level gating prevents most invalid submissions; dialogs still guard as defense in depth.
- A failed mutation leaves the selection intact so the user can retry.

## Testing

Unit:

- `useTransactionSelection`: toggle, `setMany`, `clear`, resets when `resetKey` changes but
  survives page-only changes.
- Survivor default = most recent; survivor switch recomputes sources.
- Link kind/direction inference across pair shapes (income-with-contra + expense →
  Refund offered with correct owner; otherwise Association-only; already-related → disabled).
- Merge-eligibility gating feeding `canMerge`/`mergeDisabledReason`.

Component (Testing Library + MSW, via `src/test/utils.tsx`):

- Checkbox toggles selection without opening the edit dialog / context menu.
- Header checkbox select-all / indeterminate / clear on current page.
- Bar appears at `count > 0`; Link visible only at exactly 2 Completed rows (not when one is
  Cancelled); Merge disabled-with-tooltip when ≥2 but ineligible; hint at count 1.
- Bar Link/Merge open the dialogs with the correct props; success clears selection.
- Adapt existing `MergeTransactionsDialog.test.tsx`, `LinkTransactionDialog.test.tsx`, and
  `TransactionsPane.merge.test.tsx` to the new prop shapes and selection entry point.

## Out of scope

- Other bulk actions (bulk-cancel, bulk-label) — bar is structured to allow them later.
- Cross-account linking — returns with the future all-accounts list.
- Shift-click range selection — possible later enhancement.
