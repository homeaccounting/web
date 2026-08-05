# Selection-driven Transaction Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two mismatched in-dialog transaction pickers (Link's dropdown, Merge's checkbox list) with a single row-selection model: a narrow checkbox column drives a floating action bar that fires Link (2 rows) and Merge (≥2 rows).

**Architecture:** A `useTransactionSelection` hook owns a `Set<UUID>` (persists across pages, clears on account/window/filter change). `TransactionsPane` gains a checkbox column + header select-all and renders a `SelectionActionBar` when rows are selected. The bar opens the reworked `MergeTransactionsDialog` (now takes the pre-selected rows + a survivor radio) and `LinkTransactionDialog` (now takes the 2-row pair; the all-accounts counterpart search is retired). No API/backend changes.

**Tech Stack:** React 18, TypeScript (strict), TanStack Query, shadcn/ui (Button, Tooltip, Dialog, RadioGroup), Tailwind, Vitest + Testing Library + MSW, Playwright.

**Spec:** `docs/specs/2026-07-24-transaction-multiselect-actions-design.md`

---

### Task 1: `useTransactionSelection` hook

**Files:**

- Create: `src/features/transactions/useTransactionSelection.ts`
- Test: `src/features/transactions/useTransactionSelection.test.ts`

- [ ] **Step 1:** Write failing tests (`renderHook` from `@testing-library/react`): `toggle` adds/removes an id; `setMany(ids, true/false)` bulk sets; `isSelected`/`count` reflect state; changing `resetKey` clears selection; a stable `resetKey` preserves it across rerenders.
- [ ] **Step 2:** Run `pnpm exec vitest run src/features/transactions/useTransactionSelection` → FAIL.
- [ ] **Step 3:** Implement:

```ts
import { useCallback, useEffect, useRef, useState } from 'react';
import type { UUID } from '@/api/types';

// Owns the transaction multi-selection. `resetKey` is any string the caller
// derives from account + date-window + filters; when it changes the selection
// clears (so we never act on rows hidden by a different scope). Page index is
// deliberately NOT part of the key, so a selection survives pagination.
export function useTransactionSelection(resetKey: string) {
  const [selectedIds, setSelectedIds] = useState<Set<UUID>>(() => new Set());
  const prevKey = useRef(resetKey);
  useEffect(() => {
    if (prevKey.current !== resetKey) {
      prevKey.current = resetKey;
      setSelectedIds(new Set());
    }
  }, [resetKey]);

  const toggle = useCallback((id: UUID) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const setMany = useCallback((ids: UUID[], selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (selected) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelectedIds(new Set()), []);
  const isSelected = useCallback((id: UUID) => selectedIds.has(id), [selectedIds]);

  return { selectedIds, isSelected, toggle, setMany, clear, count: selectedIds.size };
}
```

- [ ] **Step 4:** Run tests → PASS. Then `pnpm exec tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(transactions): add useTransactionSelection hook`.

---

### Task 2: `SelectionActionBar` component

**Files:**

- Create: `src/features/transactions/SelectionActionBar.tsx`
- Test: `src/features/transactions/SelectionActionBar.test.tsx`

- [ ] **Step 1:** Write failing tests: bar renders `"N selected"`; **Link** button present only when `canLink`; **Merge** present when `count>=2`, disabled when `!canMerge` (tooltip via `title`/`aria` carrying `mergeDisabledReason`); count===1 shows the "Select 2 to link or merge" hint and no action buttons; Clear calls `onClear`; Link/Merge call their handlers.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement a presentational bar. Props:

```ts
interface SelectionActionBarProps {
  count: number;
  canLink: boolean; // exactly 2 selected AND both Completed
  canMerge: boolean; // >=2 selected AND checkMergeEligibility(rows).eligible
  mergeDisabledReason?: string;
  onLink: () => void;
  onMerge: () => void;
  onClear: () => void;
}
```

Fixed, bottom-center container (`fixed inset-x-0 bottom-4 z-40 mx-auto w-fit`), dark rounded bar using `Button` primitives; `role="region"` + `aria-label="Selection actions"`. Render **Link** only when `canLink`; render **Merge** whenever `count>=2`, `disabled={!canMerge}` wrapped in `Tooltip` showing `mergeDisabledReason`. When `count===1`, show only the hint text + Clear.

- [ ] **Step 4:** Run tests → PASS; `tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(transactions): add SelectionActionBar`.

---

### Task 3: Rework `MergeTransactionsDialog` (survivor picker)

**Files:**

- Modify: `src/features/transactions/MergeTransactionsDialog.tsx`
- Modify: `src/features/transactions/MergeTransactionsDialog.test.tsx`

- [ ] **Step 1:** Update tests to the new prop shape `{ open, onOpenChange, selected, onMerged? }`:
  - default survivor = most recent by `date` (tie → first in `selected` order), badged "Survivor";
  - picking a different survivor radio recomputes `sourceTransactionIds`;
  - merged total reflects all selected rows;
  - `merge` posts `{ sourceTransactionIds }` to `useMergeTransactions(survivorId)` (survivor excluded from sources);
  - ineligible selection (e.g. conflicting contacts) disables Merge + shows the `INELIGIBILITY_MESSAGE`;
  - server error surfaces inline, dialog stays open.
- [ ] **Step 2:** Run `pnpm exec vitest run src/features/transactions/MergeTransactionsDialog` → FAIL.
- [ ] **Step 3:** Replace `{ acting, candidates }` with `selected: TransactionResponse[]`. Add `survivorId` state defaulting to `mostRecentId(selected)`. Render a shadcn `RadioGroup` of `selected` rows (survivor highlighted + badged, others show amount). Keep total/`data-testid="merge-total"`, "N will be cancelled", eligibility guard (`checkMergeEligibility(selected)`), and `ApiError` handling. Submit `useMergeTransactions(survivorId).mutateAsync({ sourceTransactionIds: selected.filter(s => s.id !== survivorId).map(s => s.id) })`.
- [ ] **Step 4:** Run tests → PASS; `tsc --noEmit`.
- [ ] **Step 5:** Commit `refactor(transactions): merge dialog takes selected rows + survivor picker`.

---

### Task 4: Rework `LinkTransactionDialog` (pair mode)

**Files:**

- Modify: `src/features/transactions/LinkTransactionDialog.tsx`
- Modify: `src/features/transactions/LinkTransactionDialog.test.tsx`

- [ ] **Step 1:** Rewrite tests to prop shape `{ open, onOpenChange, pair: [TransactionResponse, TransactionResponse] }` (no MSW list/accounts/relations mocks needed for the pair itself):
  - income-with-contra + same-account non-cancelled expense → Refund + Association both offered, Refund default; posts `{ relatedTransactionId: <expenseId>, relationKind: 'refund' }` to `useLinkRelation(<incomeId>)`;
  - two plain rows → Association only; posts `relationKind: 'associated'` with the more-recent row as owner;
  - already-related pair (one row's `.relations` references the other) → Link disabled + message;
  - refund over-refund guard still disables Link and shows "already fully refunded" (keep `useRefundSummary`, MSW mocks the expense's relations);
  - `ApiError` surfaces inline, dialog stays open.
- [ ] **Step 2:** Run `pnpm exec vitest run src/features/transactions/LinkTransactionDialog` → FAIL.
- [ ] **Step 3:** Remove `useAllAccountsWindowedTransactions`, `useTransactionRelations`, `useAccounts`, the counterpart `<Select>`, and the wide-window memo. Derive from the pair:
  - `refundPairing(pair)`: returns `{ owner, expense }` when exactly one row `isIncomeWithContra` and the other is a non-cancelled `expense` with `accountIdOf` equal — else `null`.
  - `kinds` = `refundPairing ? ['refund','associated'] : ['associated']`.
  - association owner = the more recent row (stable tie-break by array order); counterpart = the other.
  - `alreadyRelated` = either row's `.relations` has an edge whose `relatedTransactionId` is the other's id.
  - Keep the kind toggle (segmented/Select), the refund remaining-amount hint via `useRefundSummary(expense, open && kind==='refund')`, and `ApiError` handling. Submit `useLinkRelation(owner.id).mutateAsync({ relatedTransactionId: counterpart.id, relationKind: kind })`.
- [ ] **Step 4:** Run tests → PASS; `tsc --noEmit`.
- [ ] **Step 5:** Commit `refactor(transactions): link dialog takes a 2-row pair (retire counterpart search)`.

---

### Task 5: Wire selection into `TransactionsPane`

**Files:**

- Modify: `src/features/transactions/TransactionsPane.tsx`
- Modify: `src/features/transactions/TransactionsPane.test.tsx`, `TransactionsPane.merge.test.tsx`

- [ ] **Step 1:** Add/adapt component tests (via `renderWithProviders`, MSW):
  - a checkbox column renders; clicking a checkbox selects the row WITHOUT opening the edit dialog or context menu; checkbox has `aria-label` `Select <description>`;
  - header checkbox selects all page rows, goes indeterminate when partial, clears all;
  - the action bar appears when ≥1 selected; Link shown at exactly 2 Completed rows; Merge disabled-with-tooltip when ≥2 incompatible; hint at 1;
  - bar Merge opens the merge dialog with the selected rows; bar Link opens the link dialog with the pair; a successful action clears selection;
  - the per-row context menu no longer has "Link" or "Merge into this…".
- [ ] **Step 2:** Run `pnpm exec vitest run src/features/transactions/TransactionsPane` → FAIL.
- [ ] **Step 3:** Implement:
  - `const selection = useTransactionSelection(`${id}|${appliedWindow.from}|${appliedWindow.to}|${JSON.stringify(filters)}`);`
  - Replace the leftmost spacer `<th>` with a header select-all checkbox over `pageRows`; move type/status icons into a second column. Add a leading `<td>` per row with a `stopPropagation` checkbox bound to `selection`.
  - Selected-row highlight class (e.g. `selection.isSelected(t.id) && 'bg-muted/60'`).
  - `const selectedRows = (data ?? []).filter(t => selection.isSelected(t.id));`
  - Compute `canLink` (exactly 2 selected, both `status==='Completed'`), `canMerge`/`mergeDisabledReason` (from `checkMergeEligibility(selectedRows)` when ≥2).
  - Render `<SelectionActionBar …>` when `selection.count>0`; `onMerge`/`onLink` set new open-state (`mergeSelection`, `linkPair`); `onClear` = `selection.clear`.
  - Render `MergeTransactionsDialog` with `selected={mergeSelection}` and `LinkTransactionDialog` with `pair={linkPair}`; both call `selection.clear()` via `onMerged`/on success close. Remove `mergeTarget`/`linkTarget` single-row state, `openLink`, `openMerge`, and the two `ContextMenuItem`s.
- [ ] **Step 4:** Run the transactions test suite → PASS; `pnpm exec tsc --noEmit`.
- [ ] **Step 5:** Commit `feat(transactions): checkbox selection + floating action bar for Link/Merge`.

---

### Task 6: Full verification + Playwright smoke

- [ ] **Step 1:** `just check` (typecheck + lint + format-check) → clean. `just test` → all green.
- [ ] **Step 2:** Update `e2e/merge-transaction.spec.ts` to the new flow (select two rows via their checkboxes → bar **Merge** → pick survivor → Merge) and add an association smoke (select two → bar **Link** → Association → Link, assert the relation badge). Keep `@local`.
- [ ] **Step 3:** Run `pnpm exec playwright test merge-transaction` against the live backend (already up on :8080) → PASS. Capture a screenshot of the bar with 2 rows selected.
- [ ] **Step 4:** Commit `test(transactions): e2e for selection-driven merge + link`.

---

### Task 7: PR

- [ ] Push `feat/transaction-multiselect-actions`; open a PR (base `master`) titled `feat(transactions): selection-driven Link/Merge (checkbox column + floating action bar)` summarizing the UX change, the retired cross-account search (returns with the all-accounts list), and the verification done.
