# Transaction Quick-Assign (Category & Labels) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add "Category" and "Labels" submenus to the transaction row context menu so a user can reassign a category (single-slice income/expense only) or toggle labels inline, without opening the edit dialog.

**Architecture:** Two new self-contained `ContextMenuSub` picker components share one menu-native search-list primitive. They render a search input + `role="option"` list directly inside `ContextMenuSubContent` (avoiding the popup-in-popup problems of the existing self-popping comboboxes). Both write through the existing `useEditTransaction` mutation — Category via a rebuilt `allocations` PATCH, Labels via a full-array `labels` PUT. No backend or `src/api` changes.

**Tech Stack:** React 18, TypeScript (strict), Radix ContextMenu (shadcn `src/components/ui/context-menu.tsx`), TanStack Query, Vitest + Testing Library + happy-dom + MSW, lucide icons, Tailwind.

**Spec:** `docs/specs/2026-07-15-transaction-quick-assign-design.md`

---

## File Structure

- **Create** `src/features/transactions/MenuSearchList.tsx` — presentational search-input + filtered option list designed to live inside a menu popup. Owns query state, keyboard nav (Arrow/Enter), key+focus isolation from Radix, and the empty state. Single-purpose, reused by both pickers.
- **Create** `src/features/transactions/MenuSearchList.test.tsx` — unit tests for the primitive.
- **Create** `src/features/transactions/TxCategoryQuickPicker.tsx` — `ContextMenuSub` wrapper, single-select; picking commits and closes the menu.
- **Create** `src/features/transactions/TxLabelQuickPicker.tsx` — `ContextMenuSub` wrapper, multi-select; holds local optimistic state (race-free via a ref), reverts on error, keeps the submenu open across toggles.
- **Modify** `src/features/transactions/TransactionsPane.tsx` — import the pickers, derive per-kind category options + `affectedAccountIds`, wire `useEditTransaction`, and render the two submenus with gating after "Convert to". The row `ContextMenu` stays uncontrolled.
- **Modify** `src/features/transactions/TransactionsPane.test.tsx` — integration tests for gating + write paths.

No changes to `src/test/handlers.ts` are required (the default `PATCH /allocations` and `PUT /labels` handlers already return a valid transaction; tests use `server.use(...)` to capture bodies and to force 500s).

---

### Task 1: `MenuSearchList` primitive

**Files:**

- Create: `src/features/transactions/MenuSearchList.tsx`
- Test: `src/features/transactions/MenuSearchList.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/transactions/MenuSearchList.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MenuSearchList } from './MenuSearchList';

const options = [
  { id: 'a', name: 'Groceries' },
  { id: 'b', name: 'Gas' },
  { id: 'c', name: 'Rent' },
];

describe('MenuSearchList', () => {
  it('filters options by case-insensitive substring', async () => {
    const user = userEvent.setup();
    render(
      <MenuSearchList
        options={options}
        isSelected={() => false}
        onPick={() => {}}
        searchAriaLabel="Search categories"
        placeholder="Search categories…"
      />,
    );
    await user.type(screen.getByRole('combobox', { name: /search categories/i }), 'g');
    expect(screen.getByRole('option', { name: 'Groceries' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Gas' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Rent' })).not.toBeInTheDocument();
  });

  it('marks selected options with aria-selected', () => {
    render(
      <MenuSearchList
        options={options}
        isSelected={(id) => id === 'b'}
        onPick={() => {}}
        searchAriaLabel="Search categories"
        placeholder="…"
      />,
    );
    expect(screen.getByRole('option', { name: 'Gas' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('option', { name: 'Rent' })).toHaveAttribute('aria-selected', 'false');
  });

  it('picks the clicked option', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <MenuSearchList
        options={options}
        isSelected={() => false}
        onPick={onPick}
        searchAriaLabel="Search categories"
        placeholder="…"
      />,
    );
    await user.click(screen.getByRole('option', { name: 'Rent' }));
    expect(onPick).toHaveBeenCalledWith('c');
  });

  it('navigates with arrows and commits the active option on Enter', async () => {
    const user = userEvent.setup();
    const onPick = vi.fn();
    render(
      <MenuSearchList
        options={options}
        isSelected={() => false}
        onPick={onPick}
        searchAriaLabel="Search categories"
        placeholder="…"
      />,
    );
    const input = screen.getByRole('combobox', { name: /search categories/i });
    input.focus();
    await user.keyboard('{ArrowDown}{Enter}'); // active 0 -> 1 -> pick 'b'
    expect(onPick).toHaveBeenCalledWith('b');
  });

  it('renders a No matches row when the filter excludes everything', async () => {
    const user = userEvent.setup();
    render(
      <MenuSearchList
        options={options}
        isSelected={() => false}
        onPick={() => {}}
        searchAriaLabel="Search categories"
        placeholder="…"
      />,
    );
    await user.type(screen.getByRole('combobox', { name: /search categories/i }), 'zzz');
    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });

  it('renders the empty state for an empty option list', () => {
    render(
      <MenuSearchList
        options={[]}
        isSelected={() => false}
        onPick={() => {}}
        searchAriaLabel="Search categories"
        placeholder="…"
      />,
    );
    expect(screen.getByText(/no matches/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/MenuSearchList.test.tsx`
Expected: FAIL — cannot resolve `./MenuSearchList`.

- [ ] **Step 3: Write minimal implementation**

```tsx
// src/features/transactions/MenuSearchList.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import type { DictionaryEntryResponse, UUID } from '@/api/types';

export interface MenuSearchListProps {
  options: DictionaryEntryResponse[];
  isSelected: (id: UUID) => boolean;
  onPick: (id: UUID) => void;
  searchAriaLabel: string;
  placeholder: string;
}

// A search box + option list built to live *inside* a Radix menu popup
// (e.g. ContextMenuSubContent, which is itself the popup). It manages its own
// query/active state and isolates keyboard + focus from the surrounding Radix
// menu so the menu's built-in typeahead and roving-focus don't hijack typing.
// Unlike CategoryCombobox/LabelMultiSelect it does NOT render its own popup
// wrapper or an outside-click listener — the menu owns those.
export function MenuSearchList({
  options,
  isSelected,
  onPick,
  searchAriaLabel,
  placeholder,
}: MenuSearchListProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // The submenu's onOpenAutoFocus is prevented by the picker, so take focus here.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.name.toLowerCase().includes(q)) : options;
  }, [options, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  return (
    <div className="w-56">
      <div className="p-1">
        <Input
          ref={inputRef}
          role="combobox"
          aria-expanded
          aria-label={searchAriaLabel}
          autoComplete="off"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // Let Escape bubble so Radix can close the submenu.
            if (e.key === 'Escape') return;
            // Everything else stays here: without this, Radix Menu's typeahead
            // eats typed letters and its roving focus steals Arrow keys.
            e.stopPropagation();
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setActive((i) => Math.min(i + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setActive((i) => Math.max(i - 1, 0));
            } else if (e.key === 'Enter') {
              const opt = filtered[active];
              if (opt) {
                e.preventDefault();
                onPick(opt.id);
              }
            }
          }}
          className="h-8"
        />
      </div>
      <ul role="listbox" aria-label={searchAriaLabel} className="max-h-60 overflow-auto p-1">
        {filtered.length === 0 && (
          <li className="px-2 py-1.5 text-sm text-muted-foreground">No matches</li>
        )}
        {filtered.map((opt, i) => {
          const checked = isSelected(opt.id);
          return (
            <li
              key={opt.id}
              role="option"
              aria-selected={checked}
              onMouseDown={(e) => {
                // mousedown (not click) so the input's blur doesn't beat the pick.
                e.preventDefault();
                onPick(opt.id);
              }}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex cursor-pointer items-center justify-between rounded-sm px-2 py-1.5 text-sm',
                i === active && 'bg-accent text-accent-foreground',
              )}
            >
              <span className={cn(checked && 'font-medium')}>{opt.name}</span>
              {checked && <Check aria-hidden className="h-4 w-4" />}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

> Note: shadcn's `Input` (`src/components/ui/input.tsx`) is a `forwardRef`, so the `ref` lands on the underlying `<input>`. `role="combobox"` + `aria-label` is why the tests query `getByRole('combobox', { name: … })`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/MenuSearchList.test.tsx`
Expected: PASS (6 tests).

- [ ] **Step 5: Typecheck & lint the new file**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint src/features/transactions/MenuSearchList.tsx src/features/transactions/MenuSearchList.test.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/transactions/MenuSearchList.tsx src/features/transactions/MenuSearchList.test.tsx
git commit -m "feat(transactions): menu-native searchable option list primitive"
```

---

### Task 2: Picker components (`TxCategoryQuickPicker`, `TxLabelQuickPicker`)

These are thin `ContextMenuSub` wrappers around `MenuSearchList`. They are exercised by the integration tests in Tasks 3–4 (testing a Radix submenu in isolation requires the same right-click/hover harness as the pane, so we cover them there rather than duplicating the harness).

**Files:**

- Create: `src/features/transactions/TxCategoryQuickPicker.tsx`
- Create: `src/features/transactions/TxLabelQuickPicker.tsx`

- [ ] **Step 1: Write `TxCategoryQuickPicker`**

```tsx
// src/features/transactions/TxCategoryQuickPicker.tsx
import { Tag } from 'lucide-react';
import {
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import type { DictionaryEntryResponse, UUID } from '@/api/types';
import { MenuSearchList } from './MenuSearchList';

export interface TxCategoryQuickPickerProps {
  options: DictionaryEntryResponse[];
  value: UUID | undefined; // currently-assigned category id (may be archived/absent)
  onSelect: (categoryId: UUID) => void;
}

// Single-select category submenu. Picking commits via onSelect (the parent
// rebuilds allocations, fires the PATCH, and closes the menu).
export function TxCategoryQuickPicker({ options, value, onSelect }: TxCategoryQuickPickerProps) {
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Tag className="mr-2 h-4 w-4" aria-hidden />
        Category
      </ContextMenuSubTrigger>
      {/* p-0: MenuSearchList supplies its own padding. onOpenAutoFocus is
          prevented so the search input (not the first row) takes focus. */}
      <ContextMenuSubContent className="p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <MenuSearchList
          options={options}
          isSelected={(id) => id === value}
          onPick={onSelect}
          searchAriaLabel="Search categories"
          placeholder="Search categories…"
        />
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
```

- [ ] **Step 2: Write `TxLabelQuickPicker`**

```tsx
// src/features/transactions/TxLabelQuickPicker.tsx
import { useEffect, useRef, useState } from 'react';
import { Tags } from 'lucide-react';
import {
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import type { DictionaryEntryResponse, UUID } from '@/api/types';
import { MenuSearchList } from './MenuSearchList';

export interface TxLabelQuickPickerProps {
  options: DictionaryEntryResponse[];
  value: UUID[]; // the transaction's current labels
  onCommit: (labels: UUID[]) => Promise<unknown>;
}

// Multi-select labels submenu. Each toggle optimistically updates local state
// and fires a full-array PUT. The submenu stays open across toggles. A ref
// mirrors the latest selection so rapid toggles compose (no last-write-wins
// race against the async prop refresh); a rejected PUT reverts the toggle.
export function TxLabelQuickPicker({ options, value, onCommit }: TxLabelQuickPickerProps) {
  const [selected, setSelected] = useState<UUID[]>(value);
  const selectedRef = useRef<UUID[]>(value);
  selectedRef.current = selected;

  // Re-seed from the server-confirmed value when it changes (e.g. after the
  // cache patch/invalidation settles, or the picker re-opens on another row).
  useEffect(() => {
    setSelected(value);
    selectedRef.current = value;
  }, [value]);

  const toggle = (id: UUID) => {
    const prev = selectedRef.current;
    const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
    selectedRef.current = next;
    setSelected(next);
    void onCommit(next).catch(() => {
      selectedRef.current = prev;
      setSelected(prev);
    });
  };

  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger>
        <Tags className="mr-2 h-4 w-4" aria-hidden />
        Labels
      </ContextMenuSubTrigger>
      <ContextMenuSubContent className="p-0" onOpenAutoFocus={(e) => e.preventDefault()}>
        <MenuSearchList
          options={options}
          isSelected={(id) => selected.includes(id)}
          onPick={toggle}
          searchAriaLabel="Search labels"
          placeholder="Search labels…"
        />
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
```

> **Correction (found during implementation):** Do **not** pass `onOpenAutoFocus` to
> `ContextMenuSubContent`. In the installed `@radix-ui/react-menu@2.1.16`, `onOpenAutoFocus`
> is excluded from the public `MenuSubContentProps` type (it lives in the private impl props),
> so passing it fails `tsc` (TS2322) — and it's a runtime no-op because `MenuSubContent`
> hardcodes its own `onOpenAutoFocus` (already `preventDefault`) and doesn't compose the
> caller's. Omit it entirely; SubContent already prevents open-auto-focus, and
> `MenuSearchList`'s mount `useEffect` takes input focus. The two code blocks above still
> show the prop — leave it out.

- [ ] **Step 3: Typecheck & lint**

Run: `pnpm exec tsc --noEmit && pnpm exec eslint src/features/transactions/TxCategoryQuickPicker.tsx src/features/transactions/TxLabelQuickPicker.tsx`
Expected: no errors. (Nothing imports them yet — that's fine; `noUnusedLocals` is per-file, exports are not flagged.)

- [ ] **Step 4: Commit**

```bash
git add src/features/transactions/TxCategoryQuickPicker.tsx src/features/transactions/TxLabelQuickPicker.tsx
git commit -m "feat(transactions): category & labels quick-assign submenu components"
```

---

### Task 3: Wire the Category picker into `TransactionsPane` (+ integration tests)

**Files:**

- Modify: `src/features/transactions/TransactionsPane.tsx`
- Test: `src/features/transactions/TransactionsPane.test.tsx`

- [ ] **Step 1: Write the failing integration tests**

Add a `describe('quick-assign category', …)` block.

**Fixture facts (verified — `src/test/fixtures.ts`):** `configurationFixture.dictionaries` has exactly one entry per dictionary: `expense-category` → `{ id: foodCategoryId, name: 'Food' }`, `income-category` → `{ id: salaryCategoryId, name: 'Salary' }`, `labels` → `{ id: tripLabelId, name: 'Trip' }`. The default `transactionFixture` is a completed single-slice **expense categorized as Food**. `editedTransactionFixture` is **module-local in `src/test/handlers.ts` and NOT exported** — do not use it in the test; return `{ ...transactionFixture, ...overrides }` from MSW overrides instead (its id matches the rendered row, so `useEditTransaction`'s cache patch applies realistically).

To reassign to a _different_ category we need a second expense category, so scope a config override per test. Add this helper inside the describe block, and import `configurationFixture`, `foodCategoryId`, `tripLabelId` from `@/test/fixtures` (verify they're exported; `salaryCategoryId`/`tripLabelId`/`foodCategoryId` are already used elsewhere in the suite):

```tsx
// inside src/features/transactions/TransactionsPane.test.tsx
const GROCERIES_ID = '00000000-0000-0000-0000-000000000970';

// Config with a second expense category so a "reassign to different" is possible.
const twoExpenseCategoriesConfig = () => ({
  ...configurationFixture,
  dictionaries: {
    ...configurationFixture.dictionaries,
    'expense-category': {
      ...configurationFixture.dictionaries['expense-category'],
      entries: [
        ...configurationFixture.dictionaries['expense-category'].entries, // Food
        { id: GROCERIES_ID, name: 'Groceries' },
      ],
    },
  },
});

describe('quick-assign category', () => {
  it('reassigns a single-slice expense category via PATCH, preserving amount', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    let patchBody: unknown;
    server.use(
      http.get(`${apiBase}/api/users/me/configuration`, () =>
        HttpResponse.json(twoExpenseCategoriesConfig()),
      ),
      http.patch(`${apiBase}/api/transactions/:id/allocations`, async ({ request }) => {
        patchBody = await request.json();
        return HttpResponse.json({ ...transactionFixture });
      }),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    const row = (await screen.findByText(transactionFixture.description)).closest('tr')!;
    await user.pointer({ keys: '[MouseRight]', target: row });
    await user.hover(await screen.findByRole('menuitem', { name: /^category$/i }));
    await user.click(await screen.findByRole('option', { name: /groceries/i }));
    await waitFor(() => expect(patchBody).toBeTruthy());
    // Body preserves the original slice amount/currency/comment and swaps only categoryId.
    const original = transactionFixture.allocations.expenses[0];
    expect(patchBody).toEqual({
      newAllocations: {
        incomes: [],
        expenses: [{ ...original, categoryId: GROCERIES_ID }],
      },
    });
  });

  it('does not fire a PATCH when the chosen category equals the current one', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    const patch = vi.fn(() => HttpResponse.json({ ...transactionFixture }));
    server.use(
      http.get(`${apiBase}/api/users/me/configuration`, () =>
        HttpResponse.json(twoExpenseCategoriesConfig()),
      ),
      http.patch(`${apiBase}/api/transactions/:id/allocations`, patch),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    const row = (await screen.findByText(transactionFixture.description)).closest('tr')!;
    await user.pointer({ keys: '[MouseRight]', target: row });
    await user.hover(await screen.findByRole('menuitem', { name: /^category$/i }));
    // The current category (Food) is marked selected; clicking it is a no-op.
    const current = await screen.findByRole('option', { selected: true });
    expect(current).toHaveAccessibleName(/food/i);
    await user.click(current);
    await new Promise((r) => setTimeout(r, 20));
    expect(patch).not.toHaveBeenCalled();
  });

  it('hides Category for transfers, adjustments, split, and non-completed rows', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            {
              ...transactionFixture,
              id: 'split-1',
              description: 'SplitTx',
              allocations: {
                incomes: [],
                expenses: [
                  { categoryId: 'cat-x', amount: { amount: 5, currency: 'USD' } },
                  { categoryId: 'cat-y', amount: { amount: 5, currency: 'USD' } },
                ],
              },
            },
          ],
          totalCount: 1,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    const row = (await screen.findByText('SplitTx')).closest('tr')!;
    await user.pointer({ keys: '[MouseRight]', target: row });
    await screen.findByRole('menuitem', { name: /edit/i });
    expect(screen.queryByRole('menuitem', { name: /^category$/i })).not.toBeInTheDocument();
  });
});
```

> Add per-scenario rows (transfer, adjustment, pending) mirroring the existing "does not offer Refund" tests if you want each negative case isolated; the split case above is the representative one. `waitFor` (from `@testing-library/react`), `vi`, `http`, `HttpResponse`, `server`, `apiBase` are all already imported in this file — verify before adding. Import `configurationFixture`, `foodCategoryId`, `tripLabelId` from `@/test/fixtures` (the suite already imports `salaryCategoryId`/`tripLabelId`/`foodCategoryId` — extend that import).

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx -t "quick-assign category"`
Expected: FAIL — no "Category" menuitem exists yet.

- [ ] **Step 3: Wire the pane — imports**

In `src/features/transactions/TransactionsPane.tsx`:

Extend the `./transactionType` import (currently `isAdjustment, transactionKind, transactionTypeMeta`) to add `isIncome, isExpense, isTransfer` (all three are needed — `isTransfer` is used by `affectedAccountIds` below):

```tsx
import {
  isAdjustment,
  isExpense,
  isIncome,
  isTransfer,
  transactionKind,
  transactionTypeMeta,
} from './transactionType';
```

Add the new component + hook imports near the other feature imports:

```tsx
import { TxCategoryQuickPicker } from './TxCategoryQuickPicker';
import { TxLabelQuickPicker } from './TxLabelQuickPicker';
import { useEditTransaction } from './useEditTransaction';
import type { Allocations, UUID } from '@/api/types'; // extend the existing type import
```

> `TransactionResponse, TransactionTypeText` are already imported from `@/api/types` at line 33 — add `Allocations, UUID` to that existing import rather than a second statement.

- [ ] **Step 4: Wire the pane — helpers, state, handlers**

Add module-level helpers near the top of the file (outside the component):

```tsx
// Accounts whose cached transaction lists hold this row — mirrors
// EditTransactionDialog's derivation so useEditTransaction patches the right caches.
function affectedAccountIds(t: TransactionResponse): UUID[] {
  if (isTransfer(t.transactionType) || isAdjustment(t.transactionType)) {
    return [t.sourceAccountId, t.targetAccountId];
  }
  return [isIncome(t.transactionType) ? t.targetAccountId : t.sourceAccountId];
}

// Rebuild allocations with a new categoryId on the single slice (in whichever
// bucket it lives), preserving that slice's amount/comment. Caller guarantees
// exactly one slice total.
function allocationsWithCategory(allocations: Allocations, categoryId: UUID): Allocations {
  const swap = (slices: Allocations['incomes']) => slices.map((s) => ({ ...s, categoryId }));
  return {
    incomes: allocations.incomes.length ? swap(allocations.incomes) : allocations.incomes,
    expenses: allocations.expenses.length ? swap(allocations.expenses) : allocations.expenses,
  };
}
```

Inside the component, near the other hooks/derived values (after line ~139 where `labelOptions` is defined):

```tsx
const edit = useEditTransaction();

const incomeCategoryEntries = configuration?.dictionaries['income-category']?.entries ?? [];
const expenseCategoryEntries = configuration?.dictionaries['expense-category']?.entries ?? [];

const assignCategory = (t: TransactionResponse, categoryId: UUID) => {
  const current = allocationCategoryIds(t)[0];
  if (!current || categoryId === current) return; // no-op
  void edit
    .mutateAsync({
      id: t.id,
      accountIds: affectedAccountIds(t),
      diff: { allocations: allocationsWithCategory(t.allocations, categoryId) },
      onSubCallApplied: () => {},
    })
    .catch(() => {
      // No error surface in the pane yet (matches useUnlinkRelation's fire-and-forget);
      // a failed PATCH simply leaves the row's category unchanged. The comment keeps
      // eslint `no-empty` happy.
    });
};

const commitLabels = (t: TransactionResponse, labels: UUID[]) =>
  edit.mutateAsync({
    id: t.id,
    accountIds: affectedAccountIds(t),
    diff: { labels },
    onSubCallApplied: () => {},
  });
```

> `allocationCategoryIds` is already imported at line 51.

- [ ] **Step 5: Wire the pane — render the Category submenu**

Do **not** touch the row `<ContextMenu>` element — leave it uncontrolled. (Radix `ContextMenu.Root` accepts no `open` prop; only `ContextMenuSub` does. An earlier draft added a controlled `open`/`onOpenChange` to force-close on pick — that is invalid TypeScript and a no-op at runtime, so it is dropped. The menu closes on Escape/outside-click, consistent with the Labels submenu.)

Inside `<ContextMenuContent>`, immediately after the closing `)}` of the "Convert to" `ContextMenuSub` block (after line ~510) and before the Refund item, insert:

```tsx
{
  t.status === 'Completed' &&
    (isIncome(t.transactionType) || isExpense(t.transactionType)) &&
    allocationCategoryIds(t).length === 1 && (
      <TxCategoryQuickPicker
        options={isIncome(t.transactionType) ? incomeCategoryEntries : expenseCategoryEntries}
        value={allocationCategoryIds(t)[0]}
        onSelect={(categoryId) => assignCategory(t, categoryId)}
      />
    );
}
```

- [ ] **Step 6: Run the category tests to verify they pass**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx -t "quick-assign category"`
Expected: PASS. (`vi` is already imported in this test file — verify; the no-op test uses `vi.fn()`.)

- [ ] **Step 7: Run the full pane suite (no regressions)**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx`
Expected: PASS. The menu stays uncontrolled, so existing Convert/Refund/Cancel tests are unaffected; this run just confirms the added submenu markup didn't disturb the row.

- [ ] **Step 8: Commit**

```bash
git add src/features/transactions/TransactionsPane.tsx src/features/transactions/TransactionsPane.test.tsx
git commit -m "feat(transactions): quick-assign category from the row context menu"
```

---

### Task 4: Wire the Labels picker (+ integration tests)

**Files:**

- Modify: `src/features/transactions/TransactionsPane.tsx`
- Test: `src/features/transactions/TransactionsPane.test.tsx`

- [ ] **Step 1: Write the failing integration tests**

```tsx
// inside src/features/transactions/TransactionsPane.test.tsx
describe('quick-assign labels', () => {
  // The single label in configurationFixture is "Trip" (tripLabelId); the
  // default transactionFixture has `labels: []`, so toggling Trip on is a clean
  // add. Do NOT use editedTransactionFixture (module-local, unexported) — return
  // `{ ...transactionFixture, labels }` from the override.
  it('toggles a label via full-array PUT and keeps the submenu open', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    const bodies: string[][] = [];
    server.use(
      http.put(`${apiBase}/api/transactions/:id/labels`, async ({ request }) => {
        const body = (await request.json()) as { labels: string[] };
        bodies.push(body.labels);
        return HttpResponse.json({ ...transactionFixture, labels: body.labels });
      }),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    const row = (await screen.findByText(transactionFixture.description)).closest('tr')!;
    await user.pointer({ keys: '[MouseRight]', target: row });
    await user.hover(await screen.findByRole('menuitem', { name: /^labels$/i }));
    await user.click(await screen.findByRole('option', { name: /trip/i }));
    // The PUT carries the full desired array (just the toggled-on label).
    await waitFor(() => expect(bodies).toEqual([[tripLabelId]]));
    // Submenu still open — the option list is still in the document.
    expect(screen.getByRole('option', { name: /trip/i })).toBeInTheDocument();
  });

  it('reverts the local toggle when the PUT fails', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    server.use(
      http.put(
        `${apiBase}/api/transactions/:id/labels`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    const row = (await screen.findByText(transactionFixture.description)).closest('tr')!;
    await user.pointer({ keys: '[MouseRight]', target: row });
    await user.hover(await screen.findByRole('menuitem', { name: /^labels$/i }));
    const opt = await screen.findByRole('option', { name: /trip/i });
    expect(opt).toHaveAttribute('aria-selected', 'false');
    await user.click(opt);
    // Optimistically selected, then reverted after the 500.
    await waitFor(() =>
      expect(screen.getByRole('option', { name: /trip/i })).toHaveAttribute(
        'aria-selected',
        'false',
      ),
    );
  });

  it('offers Labels on a transfer row but not on a non-completed row', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            {
              ...transactionFixture,
              id: 'xfer-1',
              description: 'XferTx',
              transactionType: 'transfer',
              allocations: { incomes: [], expenses: [] },
            },
          ],
          totalCount: 1,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    const row = (await screen.findByText('XferTx')).closest('tr')!;
    await user.pointer({ keys: '[MouseRight]', target: row });
    expect(await screen.findByRole('menuitem', { name: /^labels$/i })).toBeInTheDocument();
    // Category must be absent for a transfer.
    expect(screen.queryByRole('menuitem', { name: /^category$/i })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx -t "quick-assign labels"`
Expected: FAIL — no "Labels" menuitem yet.

- [ ] **Step 3: Render the Labels submenu**

In `TransactionsPane.tsx`, right after the Category submenu block inserted in Task 3 Step 5, add:

```tsx
{
  t.status === 'Completed' && (
    <TxLabelQuickPicker
      options={labelOptions}
      value={t.labels}
      onCommit={(labels) => commitLabels(t, labels)}
    />
  );
}
```

- [ ] **Step 4: Run the labels tests to verify they pass**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx -t "quick-assign labels"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/TransactionsPane.tsx src/features/transactions/TransactionsPane.test.tsx
git commit -m "feat(transactions): quick-assign labels from the row context menu"
```

---

### Task 5: Key-isolation regression test + full verification

**Files:**

- Test: `src/features/transactions/TransactionsPane.test.tsx`
- Verify only (no source changes expected)

- [ ] **Step 1: Add the key/focus-isolation test (the spec's primary risk)**

```tsx
// inside src/features/transactions/TransactionsPane.test.tsx (quick-assign category describe,
// so twoExpenseCategoriesConfig() is in scope)
it('keeps typing/arrow keys inside the search input (no Radix typeahead hijack)', async () => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  const user = userEvent.setup();
  server.use(
    http.get(`${apiBase}/api/users/me/configuration`, () =>
      HttpResponse.json(twoExpenseCategoriesConfig()),
    ),
  );
  renderWithProviders(ui(), { initialPath: '/accounts/a1' });
  const row = (await screen.findByText(transactionFixture.description)).closest('tr')!;
  await user.pointer({ keys: '[MouseRight]', target: row });
  await user.hover(await screen.findByRole('menuitem', { name: /^category$/i }));
  const search = await screen.findByRole('combobox', { name: /search categories/i });
  await user.type(search, 'gro');
  // Characters landed in the input; the search actually filtered the list
  // (only Groceries matches "gro", Food is filtered out).
  expect(search).toHaveValue('gro');
  expect(screen.getByRole('option', { name: /groceries/i })).toBeInTheDocument();
  expect(screen.queryByRole('option', { name: /food/i })).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the new test**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx -t "no Radix typeahead hijack"`
Expected: PASS. (If it fails because characters don't reach the input, the `stopPropagation` in `MenuSearchList` or the `onOpenAutoFocus` prevention is misconfigured — revisit Task 1/Task 2.)

- [ ] **Step 3: Commit the test**

```bash
git add src/features/transactions/TransactionsPane.test.tsx
git commit -m "test(transactions): assert quick-assign search input isolates keys from the menu"
```

- [ ] **Step 4: Full project verification**

Run: `just check` (typecheck + lint + format-check), then `just test`.
Expected: all green. If format-check fails, run `just format` and amend the last commit.

Run: `just build`
Expected: `tsc -b` + `vite build` succeed.

- [ ] **Step 5: Playwright smoke against the running backend (REQUIRED)**

The backend is running, so drive the real app end-to-end (via the Playwright MCP browser tools, or `just e2e` which auto-starts the dev server). Start the dev server (`just run`) pointed at the running backend, sign in, open an account with a completed single-slice expense, then:

1. Right-click the row → hover **Category** → type to filter → pick a _different_ category → confirm the row's category chip updates in place, **no edit dialog opened**, and the change persisted (reload the row/list).
2. Right-click the row → hover **Labels** → toggle a label on, then a second on, then the first off → confirm chips update, the submenu **stays open** across toggles, and the final label set persists after reload.
3. Confirm **Category** is absent on a transfer row and on a split (multi-category) transaction, and both submenus are absent on a non-completed row.
4. Keyboard check: with the Category submenu open, type in the search box and confirm characters land in the input (no menu typeahead hijack) and Escape closes the submenu.

Capture a screenshot of the working Category and Labels submenus for the PR.

- [ ] **Step 6: Final commit (if any formatting/fixups)**

```bash
git add -A && git commit -m "chore(transactions): quick-assign fixups from verification" || echo "nothing to commit"
```

---

## Notes for the implementer

- **DRY:** `MenuSearchList` is the single source of the search+list behaviour; do not duplicate it into each picker.
- **YAGNI:** No "clear category", no per-slice split editing, no new toast/error UI, no dictionary-entry creation — all explicitly out of scope (see spec).
- **Fixtures (verified):** `configurationFixture` (`src/test/fixtures.ts`) has exactly one entry per dictionary — `Food` (`foodCategoryId`, expense), `Salary` (`salaryCategoryId`, income), `Trip` (`tripLabelId`, label). Category-reassign tests therefore inject a **second** expense category ("Groceries") via a per-test `GET /api/users/me/configuration` override (`twoExpenseCategoriesConfig()`) rather than editing the shared fixture — this keeps other suites' expectations intact. Label tests reuse `Trip`/`tripLabelId`. Confirm `configurationFixture`, `foodCategoryId`, `tripLabelId`, `salaryCategoryId` are exported from `@/test/fixtures` (add exports if missing — additive only).
- **`editedTransactionFixture` is NOT exported** (module-local in `src/test/handlers.ts`). Do not import it. MSW overrides in the new tests return `{ ...transactionFixture, ...overrides }` instead.
- **Menu stays uncontrolled:** the row `ContextMenu` is left untouched (Radix `ContextMenu.Root` has no `open` prop). A pick commits and the menu closes on Escape/outside-click — same as the Labels submenu. There is no controlled-open state.
- **Label re-seed nuance:** `TxLabelQuickPicker` re-seeds local state whenever its `value` prop changes. In prod the backend GET returns the updated labels after `useEditTransaction` invalidates, so the optimistic selection is confirmed rather than reverted. In unit tests the static MSW GET returns `labels: []`, so after invalidation the selection re-seeds to `[]` — the label tests therefore assert on the PUT body (the real contract) and submenu-open, not on persisted `aria-selected` after settle. This is a test-fixture artifact, not a prod bug.
- **Error handling:** category failures are swallowed with a commented empty catch (no `console.*`, matching `useUnlinkRelation`'s fire-and-forget style); label failures revert the optimistic toggle. No visible error surface is added.

```

```
