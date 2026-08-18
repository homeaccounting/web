---
status: draft
date: 2026-08-17
---

# Bulk "Set contact" in the transaction context menu — web

## Problem

The transaction context menu already supports **bulk** assignment over a 2+
selection: right-clicking a selected row swaps the single-row menu for
`BulkTransactionMenu`, which offers "Set category" (single-select) and "Set
labels" (tri-state), fanned out per-row via `runBulk` in `TransactionsPane.tsx`.

The per-transaction **contact** (counterparty) can already be assigned one row at
a time through `TxContactQuickPicker` in the single-row menu, but there is **no
bulk equivalent**. A user re-tagging many rows with the same counterparty must
open each row's menu individually.

This adds a bulk "Set contact" submenu that assigns (or clears) a single contact
across every selected row. No backend or DTO change — the assignment reuses the
existing edit seam (`useEditTransaction` with a `{ contactId }` diff, which
drives the `PUT /:id/contact` endpoint).

## Semantics

A contact is a **single-select nullable** attribute (unlike multi-valued labels),
so bulk contact mirrors bulk **Set category** rather than bulk labels:

- Picking a contact applies it to **all** selected rows and **closes** the menu
  (single-select commit, exactly like `bulkSetCategory`).
- A **"— none —"** row clears the contact on all selected rows.
- **Create-then-assign**: typing a new name in the search list creates the
  dictionary entry (`createEntry('contact', name)`) and assigns the new id to all
  rows in one gesture.
- **No per-contact checkmarks** — `isSelected={() => false}`, matching bulk Set
  category. (Shared-state indication was considered and rejected as inconsistent
  with the sibling bulk category picker.)

### Eligibility

Contact is a counterparty attribute independent of allocation shape, so — unlike
category — it does **not** require a single natural allocation, and a **mixed
income+expense** selection is allowed. The gate is computed by `bulkContactEligibility(rows)` (below), which is
enabled when `allCompleted(rows)` **and** every row is income or expense.

This mirrors the single-row picker's gate in `TransactionsPane.tsx`:
`t.status === 'Completed' && (isIncome(t.transactionType) || isExpense(t.transactionType))`.

When disabled, the menu shows a greyed "Set contact" item with a muted reason
(same shape as the disabled category/labels branches):

- A non-completed row present → `"Only completed transactions can be edited"`.
- Otherwise (a transfer/adjustment row present) → `"Contacts apply only to income and expense"`.

## Components

### `bulkLabels.ts` — new pure helper

```ts
// Whether "Set contact" is offered for the selection, and if not, why. Contact
// is valid on any Completed income/expense row regardless of allocation shape
// (it is a counterparty attribute), so mixed income+expense is fine.
export interface BulkContactEligibility {
  enabled: boolean;
  reason?: string;
}
export function bulkContactEligibility(rows: TransactionResponse[]): BulkContactEligibility;
```

Gating order: status (`allCompleted`) → all rows income/expense. Reuses the
existing `allCompleted`, `isIncome`, `isExpense`.

### `BulkContactPicker.tsx` — new component

Single-select nullable submenu, structurally a bulk-fanout twin of
`TxContactQuickPicker`:

```ts
export interface BulkContactPickerProps {
  options: DictionaryEntryResponse[];
  onSelect: (id: UUID | null) => void; // apply to every selected row (null = clear)
  onCreate: (name: string) => Promise<UUID | null>;
  disabled?: boolean; // true while a batch is applying
}
```

- `Store` icon + "Set contact" trigger.
- `ContextMenuSub` → `ContextMenuSubContent className="p-0"`.
- A "— none —" `ContextMenuItem` → `onSelect(null)`.
- `MenuSearchList` with `isSelected={() => false}`, `onPick={onSelect}`, and
  `onCreate` that creates then assigns (`const id = await onCreate(name); if (id) onSelect(id);`).
- Guards on `disabled` (no-op while a batch is in flight), matching
  `BulkLabelPicker`.

### `BulkTransactionMenu.tsx` — new props

Add, alongside the existing label/category props:

```ts
contactOptions: DictionaryEntryResponse[];
contactEligibility: BulkContactEligibility;
onSetContact: (contactId: UUID | null) => void;
onCreateContact: (name: string) => Promise<UUID | null>;
```

Render, positioned **between "Set labels" and the Link/Merge separator**: when
`contactEligibility.enabled`, a `BulkContactPicker`; otherwise a disabled
"Set contact" `ContextMenuItem` with the muted `contactEligibility.reason`
subtitle (identical shape to the disabled category branch).

### `TransactionsPane.tsx` — wiring

- New fan-out handler mirroring `bulkSetCategory`:

  ```ts
  const bulkSetContact = (rowId: UUID, contactId: UUID | null) => {
    void runBulk(
      selectedRows.map((t) =>
        edit.mutateAsync({
          id: t.id,
          accountIds: accountsOf(t),
          diff: { contactId },
          onSubCallApplied: () => {},
        }),
      ),
    );
    requestCloseMenu(rowId); // single-select → close the menu
  };
  ```

- Pass to `BulkTransactionMenu`:
  `contactOptions={contactOptions}` (already computed via `useMemo`),
  `contactEligibility={bulkContactEligibility(selectedRows)}`,
  `onSetContact={(id) => bulkSetContact(t.id, id)}`,
  `onCreateContact={(name) => createEntry('contact', name)}`.

## Data flow

Right-click selected row (count ≥ 2) → `BulkTransactionMenu` →
`BulkContactPicker` → pick/none/create → `onSetContact(id | null)` →
`bulkSetContact(rowId, id)` → `runBulk` fans `edit.mutateAsync({ diff: { contactId } })`
over `selectedRows` via `Promise.allSettled` → toast summary
(`Updated N transactions.` / partial-failure) → `requestCloseMenu(rowId)`
force-remounts the row's `ContextMenu` to close it. Selection is preserved; the
query refetch updates each row's `contactId`.

## Error handling

Reuses `runBulk`: `Promise.allSettled` never rejects; failures are counted and
surfaced via the existing toast (`Updated ok of N; failed failed.`). `isApplying`
guards re-entrancy and disables the picker while a batch is in flight (passed as
`BulkContactPicker.disabled` through `BulkTransactionMenu`'s existing `isApplying`).

## Testing

Mirrors the existing bulk-label test suite:

- **`bulkLabels.test.ts`** — `bulkContactEligibility` truth table: completed
  income ✓; completed expense ✓; mixed completed income+expense ✓; a pending row
  → disabled with "Only completed…"; a completed transfer/adjustment row →
  disabled with "Contacts apply only to income and expense"; empty selection →
  disabled with "Only completed transactions can be edited" (`allCompleted([])`
  is false — though the menu only renders at count ≥ 2, so this is unreachable in the UI).
- **`BulkContactPicker.test.tsx`** — pick calls `onSelect(id)`; "— none —" calls
  `onSelect(null)`; create calls `onCreate` then `onSelect(newId)`; `disabled`
  suppresses picks.
- **`BulkTransactionMenu.test.tsx`** — enabled renders the picker; disabled
  renders the greyed item + reason.
- **`TransactionsPane.bulk.test.tsx`** — right-click a 2+ selection → open
  "Set contact" → pick → `edit.mutateAsync` fires per selected row with a
  `{ contactId }` diff; success toast shown; menu closes (selection preserved).

## Out of scope / YAGNI

- No shared-state checkmarks or tri-state (contact is single-valued).
- No allocation-shape gating (splits/refunds keep contact editability).
- No backend, DTO, or endpoint change.
- No change to the single-row `TxContactQuickPicker`.
