---
status: draft
---

# Quick-assign Category & Labels from the transaction context menu (web)

## Context

The transactions list (`src/features/transactions/TransactionsPane.tsx`) wraps each
row in a shadcn `ContextMenu` (right-click). Current items: Edit, Duplicate, a
"Convert to" `ContextMenuSub`, Refund, Link, Cancel. Every category/label change
today requires opening the full `EditTransactionDialog`.

This feature adds two convenience submenus — **Category** and **Labels** — so a user
can reassign a category or toggle labels inline without the dialog.

### Data model (from `src/api/types.ts`)

- Categories are **not** a direct field. They live inside `allocations`:
  `Allocation { categoryId: UUID; amount: Money; comment?: string | null }`,
  grouped as `Allocations { incomes: Allocation[]; expenses: Allocation[] }`
  (`types.ts:303,314`). The old flat `category` field was removed (`types.ts:395-398`).
  A category id is a dictionary-entry UUID from `income-category` / `expense-category`.
- Labels are first-class and simple: `labels: UUID[]` directly on the transaction
  (`types.ts:401`); ids come from the `labels` dictionary.

### Write path (from `src/api/transactions.ts`, `useEditTransaction.ts`)

- `api.setAllocations(id, { newAllocations })` → **PATCH** `/api/transactions/:id/allocations`
  (pure re-split, preserves total).
- `api.setLabels(id, { labels })` → **PUT** `/api/transactions/:id/labels` (full replacement;
  empty array clears).
- `useEditTransaction()` is a mutation taking `{ id, accountIds, diff, onSubCallApplied }`
  where `diff: TransactionEditDiff` may carry `allocations` and/or `labels`. It issues the
  scoped sub-calls, patches the `['transactions', accountId]` cache after each, and
  invalidates on settle. **Both submenus reuse this hook** — no new API code.

## Decisions (locked)

1. **Split transactions** — Category quick-assign is **disabled** (item not rendered) when
   the transaction has more than one allocation slice. Reassigning a split from a single
   tap would destroy the split and its per-slice comments. Split txns keep using the dialog.
   Note: "more than one slice" counts **both buckets** (`incomes` + `expenses`). An
   income/expense that carries its own category slice _plus_ a reimbursement slice (a
   cross-bucket slice, as introduced by the reimbursements work) therefore has ≥2 slices
   and is treated as split — hidden from quick-assign. This is acceptable.
2. **Transfers / adjustments** — the Category item is **hidden** (they have no category).
3. **Submenu UI** — a searchable list (search box + scrollable options), not a flat menu.
4. **Current category** is marked with a check; there is **no "clear category"** option
   (a transaction always needs a category for its amount).
5. **Menu close behaviour** — Radix `ContextMenu` (the row menu) has an **uncontrolled**
   root `open` state (unlike `DropdownMenu`, `ContextMenu.Root` accepts no `open` prop), and
   the pickers render a custom searchable list rather than native `ContextMenuItem`s, so a
   pick cannot programmatically force the root menu closed without hacks. Therefore **both**
   submenus behave the same way: a pick commits immediately, and the menu closes on
   Escape / outside-click. (Earlier drafts said Category "commits and closes the whole menu";
   that is dropped as technically unclean — the consistent behaviour is better anyway.)

## Gating

Both items are gated on `t.status === 'Completed'` (consistent with Convert/Refund/Link,
and because the edit dialog is read-only for non-completed transactions).

- **Category** — rendered only when: `t.status === 'Completed'` AND the transaction is
  income or expense — use a **positive** gate `isIncome(t.transactionType) || isExpense(t.transactionType)`
  rather than `!isTransfer && !isAdjustment`, because `TransactionTypeText` is an open union
  and a negative gate would let an unknown type through — AND it is a single, non-split slice:
  `allocationCategoryIds(t).length === 1`. (`allocationCategoryIds` is the exported flattener
  over both buckets in `allocations.ts`; `allSlices` itself is private, so use the exported
  helper.)
- **Labels** — rendered for **all** transaction types when `t.status === 'Completed'`
  (labels are type-independent).

(Predicate signatures: `isIncome`/`isExpense`/`isTransfer`/`isAdjustment` take a
`TransactionTypeText`, i.e. `isIncome(t.transactionType)`, not the transaction object.)

## Components

Two new files under `src/features/transactions/`:

- `TxCategoryQuickPicker.tsx`
- `TxLabelQuickPicker.tsx`

### Why not reuse `CategoryCombobox` / `LabelMultiSelect`

Those existing widgets are **self-popping**: each renders its own `<Input>` plus an
absolutely-positioned `<ul>` and registers a `document` mousedown outside-click listener
to close itself. Nesting a self-popping widget inside a Radix `ContextMenuSubContent`
(itself a popup) causes popup-in-popup focus fights, z-index layering issues, and the
outside-click listener firing on legitimate in-menu interactions. So the new pickers are
**menu-native**: they render the search input + option list **directly as the body of
`ContextMenuSubContent`** (which already is the popup), reusing the same
filter-and-keyboard-nav pattern the combobox internals use, minus the outer popup wrapper.

### Picker behaviour

Both render, inside `ContextMenuSubContent`:

- An autofocused search `<Input>` at the top; typing filters options by case-insensitive
  substring.
- A scrollable list of option rows, each showing a `Check` when selected; keyboard
  ArrowUp/ArrowDown/Enter navigate/commit an active row (mirrors the existing combobox logic).

**Key + focus isolation (the one real technical risk):**

- **Keyboard:** the search input's `onKeyDown` calls `stopPropagation()` so Radix Menu's
  built-in typeahead and roving-focus do not hijack typed characters and arrow keys.
- **Focus:** Radix `MenuSubContent` already prevents open-auto-focus by default (it hardcodes
  its own `onOpenAutoFocus` that calls `preventDefault`, and `onOpenAutoFocus` is not part of
  the public `SubContent` prop type — passing it fails typecheck and is a runtime no-op). So
  the sub-content does not steal focus to a menu item; the picker's search `<Input>` takes
  focus via its own `ref` + mount `useEffect`. (Implementation confirmed against
  `@radix-ui/react-menu@2.1.16`.)
- **Accessibility:** the option list uses `role="listbox"` / `role="option"` rows (as the
  existing comboboxes do) nested inside the Radix `menu`. This mixed model is deliberate —
  the search input owns keyboard focus, not the menu. The input carries an `aria-label`
  ("Search categories" / "Search labels"); selected/current rows convey state via
  `aria-selected` plus the visible `Check`. An empty filter result renders a
  "No matches" row (mirroring `CategoryCombobox` / `LabelMultiSelect`); an empty dictionary
  renders the same empty state.

- **`TxCategoryQuickPicker`** — single-select. Options = `config.dictionaries['income-category' | 'expense-category'].entries`
  chosen by `transactionKind(t.transactionType)`. Picking an option commits immediately
  (menu closes on Escape/outside-click, per decision 5). The currently-assigned `categoryId`
  is marked; if the current category is
  archived (id no longer in the dictionary) no row is marked — acceptable, the picker only
  offers currently-valid entries and does not need `CategoryCombobox`'s archived branch.
- **`TxLabelQuickPicker`** — multi-select. Options = `config.dictionaries.labels.entries`.
  Clicking a row toggles it and **keeps the submenu open** so several can be changed in one
  pass. Selected labels are marked. To avoid a last-write-wins race across rapid toggles
  (each toggle is a full-array PUT and `t.labels` only refreshes asynchronously after the
  cache patch/invalidation settles), the picker seeds **local `UUID[]` state from `t.labels`
  on open**, updates it **synchronously** on each toggle, and bases every PUT on that local
  state — never re-reading the possibly-stale `t.labels` prop between clicks.

## Write path details

`accountIds` is derived with the same rule as `EditTransactionDialog`
(`EditTransactionDialog.tsx:54-60`):

```
transfer || adjustment → [sourceAccountId, targetAccountId]
income                 → [targetAccountId]
expense                → [sourceAccountId]
```

- **Category:** rebuild `t.allocations` by replacing `categoryId` on the transaction's
  single slice — located by scanning **both buckets** (there is exactly one, per the gate),
  **not** by assuming the kind's bucket — while **preserving that slice's `amount` and
  `comment` verbatim** and leaving the other (empty) bucket untouched. Call
  `mutateAsync({ id: t.id, accountIds, diff: { allocations: rebuilt }, onSubCallApplied: () => {} })`.
  No-op (skip the mutation entirely) if the chosen category equals the current one.
- **Labels:** derive the next `UUID[]` from the picker's **local** state (see above), then
  call `mutateAsync({ id: t.id, accountIds, diff: { labels: next }, onSubCallApplied: () => {} })`.

`useEditTransaction` handles cache patching + invalidation; the row updates live.

**Error handling:** the transactions pane has no mutation-error UI today (the comparable
`useUnlinkRelation` call is fire-and-forget). This feature does **not** add toast
infrastructure, but it must **not** leave an unhandled promise rejection: each `mutateAsync`
is wrapped so a failure is caught. On failure the picker keeps the menu open and does not
mutate local state optimistically past what the server confirmed (for labels, revert the
local toggle if the PUT rejects); a follow-up could add a visible error surface but that is
out of scope here. This is called out explicitly rather than deferring to a non-existent
"existing list-level error surface."

## Icons

`Tag` for Category and `Tags` for Labels (lucide), matching the existing
icon-per-item style (`ArrowLeftRight`, `Undo2`, etc.). Final choice may be adjusted at
implementation to whatever reads best alongside the current set.

## Testing

Unit/component tests (Vitest + Testing Library + happy-dom + MSW), co-located as
`*.test.tsx`:

- Open the context menu on a completed income row → open **Category** → type to filter →
  pick an option → assert PATCH `/api/transactions/:id/allocations` fired with a body that
  **preserves amount + currency** and swaps only `categoryId`.
- Open **Labels** → toggle one on and one off → assert PUT `/api/transactions/:id/labels`
  body equals the expected full array; submenu stays open across toggles.
- Assert **Category** item is **absent** for: a transfer, an adjustment, a split (multi-slice)
  transaction, and any non-`Completed` transaction.
- Assert **Labels** item is present for a transfer but **absent** when non-`Completed`.
- Assert the current category / current labels render with a check.
- **Key/focus isolation (the stated primary risk):** typing a letter and pressing arrow
  keys in the search input filters/navigates the list and does **not** move focus to a
  sibling Radix menu item (no typeahead jump); ArrowUp/ArrowDown/Enter navigate and commit
  an option.
- **No-op path:** picking the already-assigned category fires **no** PATCH.
- **Error path:** a rejected PATCH/PUT (MSW override returning 500) is caught (no unhandled
  rejection), the submenu stays open, and for labels the local toggle reverts.
- **Empty state:** an empty category/label dictionary renders the "No matches"/empty row and
  fires no request.

Extend `src/test/handlers.ts` with handlers for the two endpoints if not already present
(MSW `onUnhandledRequest: 'error'` requires them); per-test 500s via `server.use(...)`.

## Out of scope (YAGNI)

- Reassigning individual slices of a split transaction (dialog handles this).
- Clearing a category.
- Creating new dictionary entries (categories/labels) from the menu.
- Any change to the backend or `src/api/` wire types.
