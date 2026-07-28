# Bulk-assign labels & category to selected transactions — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user bulk-assign labels (tri-state add/remove) and a category (gated) to multiple selected transactions via a right-click bulk context menu that replaces the single-row menu when a 2+ selection is active, ending the double-surface confusion.

**Architecture:** Pure helpers (`bulkLabels.ts`) own all selection math and gating. A `BulkLabelPicker` and a `BulkTransactionMenu` are presentational, built from the existing `MenuSearchList` / Radix `ContextMenu` primitives. `TransactionsPane` orchestrates: it swaps each row's menu content on `isSelected(id) && count >= 2`, fans bulk edits out over `useEditTransaction` with `Promise.allSettled` + a sonner toast, and closes the menu on a single-select (category) commit.

**Tech Stack:** React 18, TypeScript (strict), Radix `ContextMenu`, TanStack Query, Vitest + Testing Library + MSW, Playwright.

---

## Design decision: how the menu closes on category commit

Radix `ContextMenu.Root` is **uncontrolled** — its props are only `children / onOpenChange / dir / modal` (verified in `node_modules/@radix-ui/react-context-menu/dist/index.d.ts`), so there is no `open` prop to flip to `false`. `MenuSearchList` also commits via `onMouseDown` + `preventDefault()` (to beat the input blur), which suppresses Radix's built-in "select closes the menu."

**Chosen mechanism: force-remount the affected row's menu by bumping its React `key`.** The pane keeps a per-row nonce map; `requestCloseMenu(rowId)` increments that row's nonce, changing only that `<ContextMenu>`'s key so it unmounts and remounts closed. This is deterministic and testable (menu content leaves the DOM), touches only one row, and needs **no** change to `MenuSearchList` (superseding the spec's tentative `closeOnPick` prop — the spec explicitly left the mechanism to this plan). Labels never request close, so the labels submenu stays open as today.

## File structure

**New**
- `src/features/transactions/bulkLabels.ts` — pure helpers: `allCompleted`, `labelState`, `withLabelAdded`, `withLabelRemoved`, `bulkCategoryEligibility`.
- `src/features/transactions/bulkLabels.test.ts`
- `src/features/transactions/BulkLabelPicker.tsx` — tri-state labels submenu over `MenuSearchList`.
- `src/features/transactions/BulkLabelPicker.test.tsx`
- `src/features/transactions/BulkTransactionMenu.tsx` — the bulk `ContextMenuContent` body (Set category / Set labels / Link / Merge), presentational.
- `src/features/transactions/BulkTransactionMenu.test.tsx`
- `e2e/bulk-label-category.spec.ts`

**Modified**
- `src/features/transactions/useTransactionSelection.ts` — add `setOnly(id)`.
- `src/features/transactions/useTransactionSelection.test.ts` — cover `setOnly`.
- `src/features/transactions/MenuSearchList.tsx` — add optional `indeterminate?: (id) => boolean` + Minus icon.
- `src/features/transactions/MenuSearchList.test.tsx` — cover indeterminate.
- `src/features/transactions/TransactionsPane.tsx` — right-click routing, remount nonce, bulk fan-out + toast + `isApplying`, extract `handleLink`/`handleMerge`, single-row category close.

---

## Task 1: Pure helpers (`bulkLabels.ts`)

**Files:**
- Create: `src/features/transactions/bulkLabels.ts`
- Test: `src/features/transactions/bulkLabels.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/features/transactions/bulkLabels.test.ts
import { describe, it, expect } from 'vitest';
import type { TransactionResponse, UUID } from '@/api/types';
import {
  allCompleted,
  labelState,
  withLabelAdded,
  withLabelRemoved,
  bulkCategoryEligibility,
} from './bulkLabels';

// Minimal row factory — only the fields the helpers read.
// NOTE: Allocation.amount is a Money object ({ amount, currency }), NOT a bare
// number (src/api/types.ts:305-319) — a bare number fails `tsc --noEmit`.
const slice = (categoryId: string) => ({
  categoryId: categoryId as UUID,
  amount: { amount: 1, currency: 'USD' },
  comment: null,
});
function row(partial: Partial<TransactionResponse>): TransactionResponse {
  return {
    status: 'Completed',
    transactionType: 'expense',
    labels: [],
    allocations: { incomes: [], expenses: [slice('c1')] },
    ...partial,
  } as TransactionResponse;
}

describe('allCompleted', () => {
  it('is true only when every row is Completed and there is at least one', () => {
    expect(allCompleted([row({}), row({})])).toBe(true);
    expect(allCompleted([row({}), row({ status: 'Pending' })])).toBe(false);
    expect(allCompleted([])).toBe(false);
  });
});

describe('labelState', () => {
  const a = row({ labels: ['x' as UUID] });
  const b = row({ labels: ['x' as UUID, 'y' as UUID] });
  const c = row({ labels: [] });
  it('returns all / some / none across the selection', () => {
    expect(labelState([a, b], 'x' as UUID)).toBe('all');
    expect(labelState([a, c], 'x' as UUID)).toBe('some');
    expect(labelState([a, b], 'z' as UUID)).toBe('none');
    expect(labelState([], 'x' as UUID)).toBe('none');
  });
});

describe('withLabelAdded / withLabelRemoved', () => {
  it('adds without duplicating and removes when present', () => {
    expect(withLabelAdded(['x'] as UUID[], 'y' as UUID)).toEqual(['x', 'y']);
    expect(withLabelAdded(['x'] as UUID[], 'x' as UUID)).toEqual(['x']);
    expect(withLabelRemoved(['x', 'y'] as UUID[], 'x' as UUID)).toEqual(['y']);
    expect(withLabelRemoved(['x'] as UUID[], 'z' as UUID)).toEqual(['x']);
  });
});

describe('bulkCategoryEligibility', () => {
  it('disables (status) when any row is not Completed', () => {
    const r = bulkCategoryEligibility([row({}), row({ status: 'Pending' })]);
    expect(r.enabled).toBe(false);
    expect(r.reason).toMatch(/completed/i);
  });
  it('disables (no category) when a transfer/adjustment is present', () => {
    const r = bulkCategoryEligibility([row({}), row({ transactionType: 'transfer' })]);
    expect(r.enabled).toBe(false);
    expect(r.reason).toMatch(/no category/i);
  });
  it('disables (mixed type) when income and expense are mixed', () => {
    const inc = row({ transactionType: 'income', allocations: { incomes: [slice('c2')], expenses: [] } });
    const r = bulkCategoryEligibility([row({}), inc]);
    expect(r.enabled).toBe(false);
    expect(r.reason).toMatch(/one type/i);
  });
  it('disables (split) when a row has more than one allocation slice', () => {
    const split = row({ allocations: { incomes: [], expenses: [slice('c1'), slice('c3')] } });
    const r = bulkCategoryEligibility([row({}), split]);
    expect(r.enabled).toBe(false);
    expect(r.reason).toMatch(/split/i);
  });
  it('enables with the type when all rows are same-type single-allocation Completed', () => {
    expect(bulkCategoryEligibility([row({}), row({})])).toEqual({ enabled: true, type: 'expense' });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/bulkLabels.test.ts`
Expected: FAIL — module `./bulkLabels` not found.

- [ ] **Step 3: Write the implementation**

```ts
// src/features/transactions/bulkLabels.ts
import type { TransactionResponse, UUID } from '@/api/types';
import { isIncome, isExpense } from './transactionType';
import { allocationCategoryIds } from './allocations';

// Shared status gate for bulk label & category, mirroring the single-row
// pickers which only render for Completed rows (TransactionsPane.tsx).
export function allCompleted(rows: TransactionResponse[]): boolean {
  return rows.length > 0 && rows.every((t) => t.status === 'Completed');
}

export type LabelState = 'all' | 'some' | 'none';

// How a label sits across the selection: on all rows, on some, or none.
export function labelState(rows: TransactionResponse[], labelId: UUID): LabelState {
  if (rows.length === 0) return 'none';
  const count = rows.filter((t) => t.labels.includes(labelId)).length;
  if (count === 0) return 'none';
  return count === rows.length ? 'all' : 'some';
}

// Per-row array transforms. Add dedups; remove is a no-op when absent.
export function withLabelAdded(labels: UUID[], labelId: UUID): UUID[] {
  return labels.includes(labelId) ? labels : [...labels, labelId];
}
export function withLabelRemoved(labels: UUID[], labelId: UUID): UUID[] {
  return labels.filter((l) => l !== labelId);
}

export interface BulkCategoryEligibility {
  enabled: boolean;
  reason?: string;
  type?: 'income' | 'expense';
}

// Gating order: status → has-category → single-type → single-allocation.
export function bulkCategoryEligibility(rows: TransactionResponse[]): BulkCategoryEligibility {
  if (!allCompleted(rows)) {
    return { enabled: false, reason: 'Only completed transactions can be edited' };
  }
  if (rows.some((t) => !isIncome(t.transactionType) && !isExpense(t.transactionType))) {
    return { enabled: false, reason: 'These transactions have no category' };
  }
  const allIncome = rows.every((t) => isIncome(t.transactionType));
  const allExpense = rows.every((t) => isExpense(t.transactionType));
  if (!allIncome && !allExpense) {
    return { enabled: false, reason: 'Select transactions of one type to set a category' };
  }
  if (rows.some((t) => allocationCategoryIds(t).length !== 1)) {
    return { enabled: false, reason: "Can't set a category on split transactions" };
  }
  return { enabled: true, type: allIncome ? 'income' : 'expense' };
}
```

> Verify before writing: confirm `isIncome`/`isExpense` are exported from `./transactionType` and `allocationCategoryIds` from `./allocations`, and that `TransactionResponse.allocations` has the `{ incomes, expenses }` shape used in the factory (see `allocations.ts`). Adjust the factory's allocation object to match the real slice type if fields differ.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/bulkLabels.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add src/features/transactions/bulkLabels.ts src/features/transactions/bulkLabels.test.ts
git commit -m "feat(transactions): pure helpers for bulk label state & category gating"
```

---

## Task 2: `setOnly` on the selection hook

**Files:**
- Modify: `src/features/transactions/useTransactionSelection.ts`
- Test: `src/features/transactions/useTransactionSelection.test.ts`

- [ ] **Step 1: Add the failing test** (append to the existing describe block)

```ts
it('setOnly replaces the selection with a single id', () => {
  const { result } = renderHook(() => useTransactionSelection('scope'));
  act(() => result.current.setMany(['a', 'b', 'c'] as UUID[], true));
  expect(result.current.count).toBe(3);
  act(() => result.current.setOnly('b' as UUID));
  expect(result.current.count).toBe(1);
  expect(result.current.isSelected('b' as UUID)).toBe(true);
  expect(result.current.isSelected('a' as UUID)).toBe(false);
});
```

> Match the existing test's imports (`renderHook`, `act`, `UUID`). Reuse whatever helper the file already uses to render the hook.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/useTransactionSelection.test.ts`
Expected: FAIL — `setOnly` is not a function.

- [ ] **Step 3: Implement**

In `useTransactionSelection.ts`, add to the interface (after `setMany`):
```ts
  // Collapse the selection to exactly one row (file-manager right-click).
  setOnly: (id: UUID) => void;
```
Add the callback near `clear`:
```ts
  const setOnly = useCallback((id: UUID) => setSelectedIds(new Set([id])), []);
```
Add `setOnly` to the returned object:
```ts
  return { selectedIds, isSelected, toggle, setMany, setOnly, clear, count: selectedIds.size };
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/useTransactionSelection.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/useTransactionSelection.ts src/features/transactions/useTransactionSelection.test.ts
git commit -m "feat(transactions): add setOnly to collapse selection to one row"
```

---

## Task 3: `indeterminate` state in `MenuSearchList`

**Files:**
- Modify: `src/features/transactions/MenuSearchList.tsx`
- Test: `src/features/transactions/MenuSearchList.test.tsx`

- [ ] **Step 1: Add the failing tests**

```ts
it('renders a dash for indeterminate options and suppresses the check', () => {
  render(
    <MenuSearchList
      options={options}
      isSelected={(id) => id === 'a'}
      indeterminate={(id) => id === 'b'}
      onPick={() => {}}
      searchAriaLabel="Search labels"
      placeholder="…"
    />,
  );
  // 'a' = checked, 'b' = indeterminate (dash), 'c' = empty
  const gas = screen.getByRole('option', { name: 'Gas' }); // id 'b'
  expect(gas.querySelector('[data-testid="indeterminate-icon"]')).toBeInTheDocument();
  expect(gas.querySelector('[data-testid="check-icon"]')).not.toBeInTheDocument();
});

it('renders no dash when indeterminate prop is absent (regression)', () => {
  render(
    <MenuSearchList
      options={options}
      isSelected={() => false}
      onPick={() => {}}
      searchAriaLabel="Search labels"
      placeholder="…"
    />,
  );
  expect(document.querySelector('[data-testid="indeterminate-icon"]')).not.toBeInTheDocument();
});
```

> If adding `data-testid` to the icons is undesirable, assert via the lucide class names instead (`.lucide-minus` / `.lucide-check`). Prefer test-ids for stability — add them in Step 3.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/MenuSearchList.test.tsx`
Expected: FAIL — no indeterminate icon rendered.

- [ ] **Step 3: Implement**

- Import `Minus`: change `import { Check, Plus } from 'lucide-react';` → `import { Check, Minus, Plus } from 'lucide-react';`
- Add to `MenuSearchListProps` (after `isSelected`):
```ts
  // Optional third state for multi-target callers: an option that is on SOME
  // but not all targets renders a dash instead of a check. Never both — check
  // (on all) wins. Absent → no option is ever indeterminate.
  indeterminate?: (id: UUID) => boolean;
```
- Destructure `indeterminate` in the params.
- In the option `map`, replace the `checked` block:
```tsx
          const checked = isSelected(opt.id);
          const isIndeterminate = !checked && (indeterminate?.(opt.id) ?? false);
          return (
            <li
              key={opt.id}
              role="option"
              aria-selected={checked}
              ...unchanged...
            >
              <span className={cn(checked && 'font-medium')}>{opt.name}</span>
              {checked && <Check data-testid="check-icon" aria-hidden className="h-4 w-4" />}
              {isIndeterminate && <Minus data-testid="indeterminate-icon" aria-hidden className="h-4 w-4" />}
            </li>
          );
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/MenuSearchList.test.tsx`
Expected: PASS (new + existing tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/MenuSearchList.tsx src/features/transactions/MenuSearchList.test.tsx
git commit -m "feat(transactions): tri-state (indeterminate) option in MenuSearchList"
```

---

## Task 4: `BulkLabelPicker`

**Files:**
- Create: `src/features/transactions/BulkLabelPicker.tsx`
- Test: `src/features/transactions/BulkLabelPicker.test.tsx`

- [ ] **Step 1: Write the failing test** (mirror `TxLabelQuickPicker.test.tsx`'s ContextMenu harness)

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import type { TransactionResponse, UUID } from '@/api/types';
import { BulkLabelPicker } from './BulkLabelPicker';

const options = [
  { id: 'l1' as UUID, name: 'Trip' },
  { id: 'l2' as UUID, name: 'Work' },
];
const row = (labels: UUID[]) => ({ id: 'x', labels } as unknown as TransactionResponse);

function Harness({ onAdd, onRemove }: { onAdd: (id: UUID) => void; onRemove: (id: UUID) => void }) {
  const rows = [row(['l1']), row([])]; // l1 = some, l2 = none
  return (
    <ContextMenu>
      <ContextMenuTrigger><div data-testid="target">row</div></ContextMenuTrigger>
      <ContextMenuContent>
        <BulkLabelPicker
          options={options}
          rows={rows}
          onAdd={onAdd}
          onRemove={onRemove}
          onCreate={() => Promise.resolve(null)}
        />
      </ContextMenuContent>
    </ContextMenu>
  );
}

async function openSubmenu(user: ReturnType<typeof userEvent.setup>) {
  await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('target') });
  await user.hover(await screen.findByRole('menuitem', { name: /set labels/i }));
}

// Pick an option with a MouseLeft pointer press (not user.click): MenuSearchList
// commits on onMouseDown+preventDefault, and a plain click can dismiss the Radix
// submenu — this mirrors TxLabelQuickPicker.test.tsx's proven harness.
async function pickOption(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.pointer({ keys: '[MouseLeft]', target: await screen.findByRole('option', { name }) });
}

describe('BulkLabelPicker', () => {
  it('adds a label that is not on all rows', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<Harness onAdd={onAdd} onRemove={() => {}} />);
    await openSubmenu(user);
    await pickOption(user, 'Work'); // 'none' → add
    expect(onAdd).toHaveBeenCalledWith('l2');
  });

  it('removes a label that is on all rows', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    // Both rows carry l1 → 'all' → clicking removes.
    render(
      <ContextMenu>
        <ContextMenuTrigger><div data-testid="target">row</div></ContextMenuTrigger>
        <ContextMenuContent>
          <BulkLabelPicker options={options} rows={[row(['l1']), row(['l1'])]}
            onAdd={() => {}} onRemove={onRemove} onCreate={() => Promise.resolve(null)} />
        </ContextMenuContent>
      </ContextMenu>,
    );
    await openSubmenu(user);
    await pickOption(user, 'Trip');
    expect(onRemove).toHaveBeenCalledWith('l1');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/BulkLabelPicker.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/features/transactions/BulkLabelPicker.tsx
import { Tags } from 'lucide-react';
import {
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import type { DictionaryEntryResponse, TransactionResponse, UUID } from '@/api/types';
import { MenuSearchList } from './MenuSearchList';
import { labelState } from './bulkLabels';

export interface BulkLabelPickerProps {
  options: DictionaryEntryResponse[];
  rows: TransactionResponse[]; // the selected rows
  onAdd: (labelId: UUID) => void; // add to every selected row
  onRemove: (labelId: UUID) => void; // remove from every selected row
  onCreate: (name: string) => Promise<UUID | null>;
  createHint?: string;
  disabled?: boolean; // true while a batch is applying
}

// Tri-state bulk labels submenu. A label on ALL rows renders checked and toggles
// off (remove-from-all); anything else (some/none) toggles on (add-to-all). The
// submenu stays open across edits; state re-derives from `rows` as the parent
// refetches after each commit.
export function BulkLabelPicker({
  options,
  rows,
  onAdd,
  onRemove,
  onCreate,
  createHint,
  disabled,
}: BulkLabelPickerProps) {
  const pick = (labelId: UUID) => {
    if (disabled) return;
    if (labelState(rows, labelId) === 'all') onRemove(labelId);
    else onAdd(labelId);
  };
  const handleCreate = async (name: string) => {
    if (disabled) return;
    const id = await onCreate(name);
    if (id) onAdd(id);
  };
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger disabled={disabled}>
        <Tags className="mr-2 h-4 w-4" aria-hidden />
        Set labels
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="p-0">
        <MenuSearchList
          options={options}
          isSelected={(id) => labelState(rows, id) === 'all'}
          indeterminate={(id) => labelState(rows, id) === 'some'}
          onPick={pick}
          searchAriaLabel="Search labels"
          placeholder="Search labels…"
          createHint={createHint}
          onCreate={handleCreate}
        />
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/BulkLabelPicker.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/BulkLabelPicker.tsx src/features/transactions/BulkLabelPicker.test.tsx
git commit -m "feat(transactions): BulkLabelPicker tri-state add/remove submenu"
```

---

## Task 5: `BulkTransactionMenu`

**Files:**
- Create: `src/features/transactions/BulkTransactionMenu.tsx`
- Test: `src/features/transactions/BulkTransactionMenu.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import type { TransactionResponse, UUID } from '@/api/types';
import { BulkTransactionMenu } from './BulkTransactionMenu';

const base = {
  count: 3,
  rows: [] as TransactionResponse[],
  labelOptions: [{ id: 'l1' as UUID, name: 'Trip' }],
  incomeCategoryEntries: [],
  expenseCategoryEntries: [{ id: 'c1' as UUID, name: 'Food' }],
  labelsEnabled: true,
  isApplying: false,
  onSetCategory: vi.fn(),
  onAddLabel: vi.fn(),
  onRemoveLabel: vi.fn(),
  onCreateLabel: () => Promise.resolve(null),
  canLink: false,
  canMerge: true,
  onLink: vi.fn(),
  onMerge: vi.fn(),
};

function renderMenu(props: Partial<typeof base> & { categoryEligibility: { enabled: boolean; reason?: string; type?: 'income' | 'expense' } }) {
  return render(
    <ContextMenu>
      <ContextMenuTrigger><div data-testid="target">row</div></ContextMenuTrigger>
      <ContextMenuContent>
        <BulkTransactionMenu {...base} {...props} />
      </ContextMenuContent>
    </ContextMenu>,
  );
}
const open = (user: ReturnType<typeof userEvent.setup>) =>
  user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('target') });

describe('BulkTransactionMenu', () => {
  it('shows the count and a disabled category reason when ineligible', async () => {
    const user = userEvent.setup();
    renderMenu({ categoryEligibility: { enabled: false, reason: 'Select transactions of one type to set a category' } });
    await open(user);
    expect(await screen.findByText(/3 selected/i)).toBeInTheDocument();
    expect(screen.getByText(/one type to set a category/i)).toBeInTheDocument();
  });

  it('fires onMerge but hides Link when canLink is false', async () => {
    const user = userEvent.setup();
    const onMerge = vi.fn();
    renderMenu({ categoryEligibility: { enabled: true, type: 'expense' }, onMerge, canLink: false });
    await open(user);
    expect(screen.queryByRole('menuitem', { name: /^link$/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('menuitem', { name: /^merge$/i }));
    expect(onMerge).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/BulkTransactionMenu.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```tsx
// src/features/transactions/BulkTransactionMenu.tsx
import { Link2, Merge, Tag } from 'lucide-react';
import {
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import type { DictionaryEntryResponse, TransactionResponse, UUID } from '@/api/types';
import { MenuSearchList } from './MenuSearchList';
import { BulkLabelPicker } from './BulkLabelPicker';
import type { BulkCategoryEligibility } from './bulkLabels';

export interface BulkTransactionMenuProps {
  count: number;
  rows: TransactionResponse[];
  labelOptions: DictionaryEntryResponse[];
  incomeCategoryEntries: DictionaryEntryResponse[];
  expenseCategoryEntries: DictionaryEntryResponse[];
  categoryEligibility: BulkCategoryEligibility;
  labelsEnabled: boolean; // allCompleted(rows)
  isApplying: boolean;
  onSetCategory: (categoryId: UUID) => void; // fan-out + close menu
  onAddLabel: (labelId: UUID) => void;
  onRemoveLabel: (labelId: UUID) => void;
  onCreateLabel: (name: string) => Promise<UUID | null>;
  canLink: boolean;
  canMerge: boolean;
  mergeDisabledReason?: string;
  onLink: () => void;
  onMerge: () => void;
}

// The bulk context-menu body shown when a 2+ selection is right-clicked. Purely
// presentational; the pane computes eligibility and supplies the fan-out
// handlers. Category is a single-select (commits + closes via onSetCategory);
// labels stay open (BulkLabelPicker).
export function BulkTransactionMenu({
  count,
  rows,
  labelOptions,
  incomeCategoryEntries,
  expenseCategoryEntries,
  categoryEligibility,
  labelsEnabled,
  isApplying,
  onSetCategory,
  onAddLabel,
  onRemoveLabel,
  onCreateLabel,
  canLink,
  canMerge,
  mergeDisabledReason,
  onLink,
  onMerge,
}: BulkTransactionMenuProps) {
  const categoryOptions =
    categoryEligibility.type === 'income' ? incomeCategoryEntries : expenseCategoryEntries;
  return (
    <>
      <ContextMenuLabel>{count} selected</ContextMenuLabel>

      {categoryEligibility.enabled ? (
        <ContextMenuSub>
          <ContextMenuSubTrigger disabled={isApplying}>
            <Tag className="mr-2 h-4 w-4" aria-hidden />
            Set category
          </ContextMenuSubTrigger>
          <ContextMenuSubContent className="p-0">
            <MenuSearchList
              options={categoryOptions}
              isSelected={() => false}
              onPick={(id) => onSetCategory(id)}
              searchAriaLabel="Search categories"
              placeholder="Search categories…"
            />
          </ContextMenuSubContent>
        </ContextMenuSub>
      ) : (
        <>
          <ContextMenuItem disabled>
            <Tag className="mr-2 h-4 w-4" aria-hidden />
            Set category
          </ContextMenuItem>
          {categoryEligibility.reason && (
            <div className="px-2 pb-1 text-xs text-muted-foreground">
              {categoryEligibility.reason}
            </div>
          )}
        </>
      )}

      {labelsEnabled ? (
        <BulkLabelPicker
          options={labelOptions}
          rows={rows}
          onAdd={onAddLabel}
          onRemove={onRemoveLabel}
          onCreate={onCreateLabel}
          disabled={isApplying}
        />
      ) : (
        <>
          <ContextMenuItem disabled>
            <Tag className="mr-2 h-4 w-4" aria-hidden />
            Set labels
          </ContextMenuItem>
          <div className="px-2 pb-1 text-xs text-muted-foreground">
            Only completed transactions can be edited
          </div>
        </>
      )}

      <ContextMenuSeparator />

      {canLink && (
        <ContextMenuItem onSelect={onLink}>
          <Link2 className="mr-2 h-4 w-4" aria-hidden />
          Link
        </ContextMenuItem>
      )}
      {count >= 2 && (
        <ContextMenuItem onSelect={onMerge} disabled={!canMerge}>
          <Merge className="mr-2 h-4 w-4" aria-hidden />
          Merge{!canMerge && mergeDisabledReason ? ` — ${mergeDisabledReason}` : ''}
        </ContextMenuItem>
      )}
    </>
  );
}
```

> Verify `ContextMenuLabel` and `ContextMenuSeparator` are exported from `@/components/ui/context-menu` (they are per `context-menu.tsx`). The labels-disabled branch reuses the `Tag` icon for simplicity — swap to `Tags` if you prefer visual parity with the enabled state.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/BulkTransactionMenu.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/BulkTransactionMenu.tsx src/features/transactions/BulkTransactionMenu.test.tsx
git commit -m "feat(transactions): BulkTransactionMenu bulk context-menu body"
```

---

## Task 6: Wire into `TransactionsPane`

**Files:**
- Modify: `src/features/transactions/TransactionsPane.tsx`
- Test: `src/features/transactions/TransactionsPane.test.tsx` (add cases)

### 6a — Menu-close nonce + selection collapse

- [ ] **Step 1:** Add state + helper near the other pane state (after `selectedRows` / `selection`):

```tsx
  // Per-row remount nonce. Bumping a row's nonce changes its <ContextMenu> key,
  // remounting it closed — the only way to programmatically close an uncontrolled
  // Radix ContextMenu. Used for single-select (category) commits.
  const [menuNonce, setMenuNonce] = useState<Record<string, number>>({});
  const requestCloseMenu = useCallback(
    (rowId: UUID) => setMenuNonce((m) => ({ ...m, [rowId]: (m[rowId] ?? 0) + 1 })),
    [],
  );
  const [isApplying, setIsApplying] = useState(false);
```

- [ ] **Step 2:** Change the row `ContextMenu` key and add `onContextMenu` to the `<tr>`:

```tsx
              <ContextMenu key={`${t.id}:${menuNonce[t.id] ?? 0}`}>
                <ContextMenuTrigger asChild>
                  <tr
                    ...existing props...
                    onContextMenu={() => {
                      // File-manager behavior: right-clicking an unselected row
                      // collapses any multi-selection to just this row.
                      if (!selection.isSelected(t.id)) selection.setOnly(t.id);
                    }}
                  >
```

> Import note: `TransactionsPane.tsx:1` already imports `useState` but **not** `useCallback` — add `useCallback` to that React import for `requestCloseMenu`.

### 6b — Bulk fan-out handlers + toast

- [ ] **Step 3:** Add the toast import and handlers. Import at top: `import { toast } from '@/lib/toast';` and from `./bulkLabels`: `import { allCompleted, bulkCategoryEligibility, withLabelAdded, withLabelRemoved } from './bulkLabels';`

```tsx
  // Fan a per-row edit out over the selection and report the outcome once.
  const runBulk = async (tasks: Promise<unknown>[]) => {
    setIsApplying(true);
    const results = await Promise.allSettled(tasks);
    setIsApplying(false);
    const failed = results.filter((r) => r.status === 'rejected').length;
    const ok = results.length - failed;
    if (failed === 0) toast.success(`Updated ${ok} transaction${ok === 1 ? '' : 's'}.`);
    else toast.error(`Updated ${ok} of ${results.length}; ${failed} failed.`);
  };

  const bulkAddLabel = (labelId: UUID) =>
    void runBulk(
      selectedRows.map((t) =>
        edit.mutateAsync({
          id: t.id,
          accountIds: affectedAccountIds(t),
          diff: { labels: withLabelAdded(t.labels, labelId) },
          onSubCallApplied: () => {},
        }),
      ),
    );
  const bulkRemoveLabel = (labelId: UUID) =>
    void runBulk(
      selectedRows.map((t) =>
        edit.mutateAsync({
          id: t.id,
          accountIds: affectedAccountIds(t),
          diff: { labels: withLabelRemoved(t.labels, labelId) },
          onSubCallApplied: () => {},
        }),
      ),
    );
  const bulkSetCategory = (rowId: UUID, categoryId: UUID) => {
    void runBulk(
      selectedRows.map((t) =>
        edit.mutateAsync({
          id: t.id,
          accountIds: affectedAccountIds(t),
          diff: { allocations: allocationsWithCategory(t.allocations, categoryId) },
          onSubCallApplied: () => {},
        }),
      ),
    );
    requestCloseMenu(rowId); // single-select → close the menu
  };
```

### 6c — Extract Link/Merge handlers

- [ ] **Step 4:** Extract the inline `SelectionActionBar` handlers into named ones and reuse them. Find `onLink={() => { ... setLinkPair(...) }}` / `onMerge={() => { ... setMergeSelection(...) }}` (~lines 912–917) and define above the return:

```tsx
  const handleLink = () => {
    if (canLink) setLinkPair([selectedRows[0]!, selectedRows[1]!]);
  };
  const handleMerge = () => {
    if (selectedRows.length >= 2) setMergeSelection(selectedRows);
  };
```
Then set `onLink={handleLink}` and `onMerge={handleMerge}` on `SelectionActionBar`.

### 6d — Swap menu content on multi-selection

- [ ] **Step 5:** Wrap the existing `<ContextMenuContent>` body in the bulk/single branch:

```tsx
                <ContextMenuContent>
                  {selection.isSelected(t.id) && selection.count >= 2 ? (
                    <BulkTransactionMenu
                      count={selection.count}
                      rows={selectedRows}
                      labelOptions={labelOptions}
                      incomeCategoryEntries={incomeCategoryEntries}
                      expenseCategoryEntries={expenseCategoryEntries}
                      categoryEligibility={bulkCategoryEligibility(selectedRows)}
                      labelsEnabled={allCompleted(selectedRows)}
                      isApplying={isApplying}
                      onSetCategory={(categoryId) => bulkSetCategory(t.id, categoryId)}
                      onAddLabel={bulkAddLabel}
                      onRemoveLabel={bulkRemoveLabel}
                      onCreateLabel={(name) => createEntry('label', name)}
                      canLink={canLink}
                      canMerge={canMerge}
                      mergeDisabledReason={mergeDisabledReason}
                      onLink={handleLink}
                      onMerge={handleMerge}
                    />
                  ) : (
                    <>
                      {/* PHYSICALLY MOVE the existing single-row items here
                          (TransactionsPane.tsx:706-773) — do not retype them. */}
                    </>
                  )}
                </ContextMenuContent>
```

- [ ] **Step 6:** Add `requestCloseMenu` to the single-row category picker so it also closes on pick:

```tsx
                        onSelect={(categoryId) => {
                          assignCategory(t, categoryId);
                          requestCloseMenu(t.id);
                        }}
```

- [ ] **Step 7:** Add the import: `import { BulkTransactionMenu } from './BulkTransactionMenu';`

### 6e — Tests

- [ ] **Step 8:** Add pane tests (extend `TransactionsPane.test.tsx`; reuse its existing render + seed helpers and MSW handlers). Cover:

```
- Selecting 2 rows then right-clicking a SELECTED row shows the bulk menu
  (getByText(/2 selected/i)); the single-row "Edit" item is absent.
- Right-clicking an UNSELECTED row while 2 are selected collapses selection
  (floating bar shows "1 selected") and shows the single-row menu (Edit present).
- Bulk "Set category" is disabled with the mixed-type reason when the selection
  mixes an income and an expense.
- Applying a bulk label calls the labels endpoint for each selected row and a
  success toast appears (assert via MSW request count + toast text, mirroring
  profile tests' `toast.success` spy).
- Partial failure (one row's PATCH mocked to 500) → error toast "Updated 1 of 2; 1 failed."
```

> Match the file's existing patterns for opening a context menu (`user.pointer({ keys: '[MouseRight]', target })`) and for spying on `toast` (see `src/features/profile/*.test.tsx`, which mock `@/lib/toast`). If the pane test file doesn't yet mock toast, add `vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))` at the top.

- [ ] **Step 9:** Run the full transactions suite + typecheck:

Run: `pnpm exec vitest run src/features/transactions && pnpm exec tsc --noEmit`
Expected: PASS, no type errors.

- [ ] **Step 10:** Commit

```bash
git add src/features/transactions/TransactionsPane.tsx src/features/transactions/TransactionsPane.test.tsx
git commit -m "feat(transactions): bulk label/category via right-click menu on multi-selection"
```

---

## Task 7: Playwright e2e (`@local`)

**Files:**
- Create: `e2e/bulk-label-category.spec.ts`

- [ ] **Step 1:** Write the spec, reusing the setup style from `e2e/merge-transaction.spec.ts` (register → create Wallet → seed completed expenses). Then:

```
1. Seed 3 completed expenses.
2. Select all 3 via the header "select all" checkbox (or 3 row checkboxes).
3. Right-click one selected row → assert "3 selected" bulk menu appears.
4. Hover "Set labels" → in the search box type a new label name → click "Create '…'".
5. Assert the label chip appears on all 3 rows and a success toast is shown.
6. Right-click a selected row again → "Set category" → pick a category →
   assert the menu closes and the category shows on all rows.
```

Tag the test `@local` (matches how merge/refund specs gate live-backend runs).

- [ ] **Step 2:** Run against a live backend:

Run: `pnpm exec playwright test e2e/bulk-label-category.spec.ts`
Expected: PASS. (Requires a running backend per project e2e conventions.)

- [ ] **Step 3:** Commit

```bash
git add e2e/bulk-label-category.spec.ts
git commit -m "test(transactions): e2e bulk label & category on selected rows"
```

---

## Final verification

- [ ] **Step 1:** Full check

Run: `just check && just test`
Expected: typecheck + lint + format-check pass; all unit tests green.

- [ ] **Step 2:** Live smoke via the running app (use the `verify` skill): select several transactions, confirm the bulk right-click menu (no double single-row menu), bulk-add a label to all, bulk-set a category (menu closes), and a toast confirms each.

- [ ] **Step 3:** Update memory index entry for this feature (see MEMORY.md) once implemented & verified.
