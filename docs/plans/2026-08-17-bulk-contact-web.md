# Bulk "Set contact" context menu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a bulk "Set contact" submenu to the transaction context menu that assigns (or clears) a single contact across every selected row when a 2+ selection is right-clicked.

**Architecture:** Mirror the existing bulk "Set category" path. A new pure eligibility helper (`bulkContactEligibility`) gates a new single-select nullable submenu component (`BulkContactPicker`), which `BulkTransactionMenu` renders between "Set labels" and the Link/Merge separator. `TransactionsPane` supplies a `bulkSetContact` fan-out handler that reuses the existing `runBulk` + `useEditTransaction` `{ contactId }` edit seam (the `PUT /:id/contact` endpoint). No backend/DTO change.

**Tech Stack:** React 18, TypeScript (strict), Radix context-menu (`@/components/ui/context-menu`), Vitest + Testing Library + happy-dom + MSW.

**Spec:** `docs/specs/2026-08-17-bulk-contact-web-design.md`

---

## File Structure

- **Modify** `src/features/transactions/bulkLabels.ts` — add `BulkContactEligibility` interface + `bulkContactEligibility(rows)` pure helper (lives beside `bulkCategoryEligibility`; the file already owns bulk gating).
- **Modify** `src/features/transactions/bulkLabels.test.ts` — add a `bulkContactEligibility` describe block.
- **Create** `src/features/transactions/BulkContactPicker.tsx` — single-select nullable submenu (bulk twin of `TxContactQuickPicker`).
- **Create** `src/features/transactions/BulkContactPicker.test.tsx` — component tests.
- **Modify** `src/features/transactions/BulkTransactionMenu.tsx` — new contact props + render branch.
- **Modify** `src/features/transactions/BulkTransactionMenu.test.tsx` — extend `base` props + add contact assertions.
- **Modify** `src/features/transactions/TransactionsPane.tsx` — `bulkSetContact` handler + pass new props.
- **Modify** `src/features/transactions/TransactionsPane.bulk.test.tsx` — integration test for the bulk contact fan-out.

### Conventions to follow (verified in the existing suite)

- Radix submenu tests: right-click `data-testid="target"`, `user.hover` the sub-trigger, then pick options with `user.pointer({ keys: '[MouseLeft]', target })` — a plain `user.click` dismisses the Radix submenu (see `BulkLabelPicker.test.tsx`, `TxContactQuickPicker.test.tsx`).
- `Allocation.amount` is a `Money` object `{ amount, currency }`, never a bare number (`bulkLabels.test.ts` note).
- `DictionaryEntryResponse` options are `{ id, name }` (optionally `type`, `children`).
- The `{ contactId }` diff routes through `useEditTransaction` to `PUT /api/transactions/:id/contact`; a default MSW handler already exists (`src/test/handlers.ts:242`).

---

## Task 1: `bulkContactEligibility` pure helper

**Files:**

- Modify: `src/features/transactions/bulkLabels.ts`
- Test: `src/features/transactions/bulkLabels.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/features/transactions/bulkLabels.test.ts`. Add `bulkContactEligibility` to the existing import from `./bulkLabels`, then add:

```ts
describe('bulkContactEligibility', () => {
  it('enables for completed income/expense, including a mixed selection', () => {
    const income = row({
      transactionType: 'income',
      allocations: { incomes: [slice('c1')], expenses: [] },
    });
    expect(bulkContactEligibility([row({})]).enabled).toBe(true); // expense (default)
    expect(bulkContactEligibility([income]).enabled).toBe(true);
    expect(bulkContactEligibility([row({}), income]).enabled).toBe(true); // mixed OK
  });

  it('disables (status) when any row is not Completed', () => {
    const r = bulkContactEligibility([row({}), row({ status: 'Pending' })]);
    expect(r.enabled).toBe(false);
    expect(r.reason).toMatch(/only completed/i);
  });

  it('disables when a non-income/expense row is present', () => {
    const transfer = row({ transactionType: 'transfer' });
    const r = bulkContactEligibility([row({}), transfer]);
    expect(r.enabled).toBe(false);
    expect(r.reason).toMatch(/income and expense/i);
  });

  it('disables for an empty selection', () => {
    expect(bulkContactEligibility([]).enabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/bulkLabels.test.ts -t "bulkContactEligibility"`
Expected: FAIL — `bulkContactEligibility is not a function` (or import error).

- [ ] **Step 3: Write minimal implementation**

Append to `src/features/transactions/bulkLabels.ts` (after `bulkCategoryEligibility`):

```ts
export interface BulkContactEligibility {
  enabled: boolean;
  reason?: string;
}

// Whether "Set contact" is offered for the selection, and if not, why. Contact
// is a counterparty attribute valid on any Completed income/expense row
// regardless of allocation shape (splits/refunds keep it), so — unlike category
// — a mixed income+expense selection is fine and there is no allocation gate.
// Mirrors the single-row picker's gate in TransactionsPane.tsx:
//   status === 'Completed' && (isIncome || isExpense).
export function bulkContactEligibility(rows: TransactionResponse[]): BulkContactEligibility {
  if (!allCompleted(rows)) {
    return { enabled: false, reason: 'Only completed transactions can be edited' };
  }
  if (rows.some((t) => !isIncome(t.transactionType) && !isExpense(t.transactionType))) {
    return { enabled: false, reason: 'Contacts apply only to income and expense' };
  }
  return { enabled: true };
}
```

(`allCompleted`, `isIncome`, `isExpense`, and `TransactionResponse` are already in scope in this file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/bulkLabels.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/bulkLabels.ts src/features/transactions/bulkLabels.test.ts
git commit -m "feat(transactions): bulkContactEligibility gate for bulk set-contact"
```

---

## Task 2: `BulkContactPicker` component

**Files:**

- Create: `src/features/transactions/BulkContactPicker.tsx`
- Test: `src/features/transactions/BulkContactPicker.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/transactions/BulkContactPicker.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from '@/components/ui/context-menu';
import type { DictionaryEntryResponse, UUID } from '@/api/types';
import { BulkContactPicker } from './BulkContactPicker';

const options: DictionaryEntryResponse[] = [
  { id: 'c1', name: 'SILPO' },
  { id: 'c2', name: 'ATB' },
];

type Overrides = Partial<React.ComponentProps<typeof BulkContactPicker>>;

function renderPicker(overrides: Overrides = {}) {
  const props = {
    options,
    onSelect: vi.fn(),
    onCreate: vi.fn((): Promise<UUID | null> => Promise.resolve(null)),
    ...overrides,
  };
  render(
    <ContextMenu>
      <ContextMenuTrigger>
        <div data-testid="target">row</div>
      </ContextMenuTrigger>
      <ContextMenuContent>
        <BulkContactPicker {...props} />
      </ContextMenuContent>
    </ContextMenu>,
  );
  return props;
}

async function openSubmenu(user: ReturnType<typeof userEvent.setup>) {
  await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('target') });
  await user.hover(await screen.findByRole('menuitem', { name: /set contact/i }));
}

describe('BulkContactPicker', () => {
  it('picks a contact and calls onSelect with its id', async () => {
    const user = userEvent.setup();
    const props = renderPicker();
    await openSubmenu(user);
    await user.pointer({
      keys: '[MouseLeft]',
      target: await screen.findByRole('option', { name: 'ATB' }),
    });
    expect(props.onSelect).toHaveBeenCalledWith('c2');
  });

  it('clears via the — none — row (onSelect(null))', async () => {
    const user = userEvent.setup();
    const props = renderPicker();
    await openSubmenu(user);
    await user.pointer({
      keys: '[MouseLeft]',
      target: await screen.findByRole('menuitem', { name: /none/i }),
    });
    expect(props.onSelect).toHaveBeenCalledWith(null);
  });

  it('creates then assigns (onCreate → onSelect(newId))', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn((): Promise<UUID | null> => Promise.resolve('new-id'));
    const props = renderPicker({ onCreate });
    await openSubmenu(user);
    const box = await screen.findByRole('combobox', { name: /search contacts/i });
    box.focus();
    await user.keyboard('Acme Corp');
    await user.pointer({
      keys: '[MouseLeft]',
      target: await screen.findByRole('option', { name: /create ['‘]Acme Corp['’]/i }),
    });
    expect(onCreate).toHaveBeenCalledWith('Acme Corp');
    await vi.waitFor(() => expect(props.onSelect).toHaveBeenCalledWith('new-id'));
  });

  it('does not pick when disabled', async () => {
    const user = userEvent.setup();
    const props = renderPicker({ disabled: true });
    await user.pointer({ keys: '[MouseRight]', target: screen.getByTestId('target') });
    const trigger = await screen.findByRole('menuitem', { name: /set contact/i });
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(props.onSelect).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/BulkContactPicker.test.tsx`
Expected: FAIL — cannot resolve `./BulkContactPicker`.

- [ ] **Step 3: Write minimal implementation**

Create `src/features/transactions/BulkContactPicker.tsx`:

```tsx
import { Store } from 'lucide-react';
import {
  ContextMenuItem,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
} from '@/components/ui/context-menu';
import type { DictionaryEntryResponse, UUID } from '@/api/types';
import { MenuSearchList } from './MenuSearchList';

export interface BulkContactPickerProps {
  options: DictionaryEntryResponse[];
  onSelect: (id: UUID | null) => void; // apply to every selected row (null = clear)
  onCreate: (name: string) => Promise<UUID | null>;
  createHint?: string;
  disabled?: boolean; // true while a batch is applying
}

// Single-select nullable bulk contact submenu — the fan-out twin of
// TxContactQuickPicker. Picking commits via onSelect (the parent fans the PUT out
// over the selection and closes the menu). A "— none —" row clears the contact on
// all rows; typing a new name creates then assigns it. No per-contact checkmarks
// (isSelected={() => false}), matching bulk Set category.
export function BulkContactPicker({
  options,
  onSelect,
  onCreate,
  createHint,
  disabled,
}: BulkContactPickerProps) {
  const handleCreate = async (name: string) => {
    if (disabled) return;
    const id = await onCreate(name);
    if (id) onSelect(id);
  };
  return (
    <ContextMenuSub>
      <ContextMenuSubTrigger disabled={disabled}>
        <Store className="mr-2 h-4 w-4" aria-hidden />
        Set contact
      </ContextMenuSubTrigger>
      {/* p-0: MenuSearchList supplies its own padding. */}
      <ContextMenuSubContent className="p-0">
        <div className="p-1">
          <ContextMenuItem onSelect={() => !disabled && onSelect(null)}>— none —</ContextMenuItem>
        </div>
        <MenuSearchList
          options={options}
          isSelected={() => false}
          onPick={(id) => !disabled && onSelect(id)}
          searchAriaLabel="Search contacts"
          placeholder="Search contacts…"
          createHint={createHint}
          onCreate={handleCreate}
        />
      </ContextMenuSubContent>
    </ContextMenuSub>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/BulkContactPicker.test.tsx`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/BulkContactPicker.tsx src/features/transactions/BulkContactPicker.test.tsx
git commit -m "feat(transactions): BulkContactPicker submenu (single-select + clear)"
```

---

## Task 3: Wire `BulkContactPicker` into `BulkTransactionMenu`

**Files:**

- Modify: `src/features/transactions/BulkTransactionMenu.tsx`
- Test: `src/features/transactions/BulkTransactionMenu.test.tsx`

- [ ] **Step 1: Write the failing test**

In `src/features/transactions/BulkTransactionMenu.test.tsx`:

1. Add to the `base` object (so existing tests still render):

```ts
  contactOptions: [{ id: 'ct1' as UUID, name: 'SILPO' }],
  contactEligibility: { enabled: true } as import('./bulkLabels').BulkContactEligibility,
  onSetContact: vi.fn(),
  onCreateContact: () => Promise.resolve(null),
```

2. Add tests inside the `describe`:

```ts
it('renders the contact submenu when contact is eligible', async () => {
  const user = userEvent.setup();
  renderMenu({ categoryEligibility: { enabled: true, type: 'expense' } });
  await open(user);
  expect(await screen.findByRole('menuitem', { name: /set contact/i })).toBeInTheDocument();
});

it('shows a disabled contact reason when contact is ineligible', async () => {
  const user = userEvent.setup();
  renderMenu({
    categoryEligibility: { enabled: true, type: 'expense' },
    contactEligibility: { enabled: false, reason: 'Contacts apply only to income and expense' },
  });
  await open(user);
  const item = await screen.findByRole('menuitem', { name: /set contact/i });
  expect(item).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByText(/income and expense/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/BulkTransactionMenu.test.tsx`
Expected: FAIL — `set contact` menuitem not found (and TS error on unknown props if run via typecheck).

- [ ] **Step 3: Write minimal implementation**

In `src/features/transactions/BulkTransactionMenu.tsx`:

1. Update imports:

```ts
import { Link2, Merge, Store, Tag, Tags } from 'lucide-react';
import { BulkContactPicker } from './BulkContactPicker';
import type { BulkCategoryEligibility, BulkContactEligibility } from './bulkLabels';
```

2. Add to `BulkTransactionMenuProps` (after the label props):

```ts
  contactOptions: DictionaryEntryResponse[];
  contactEligibility: BulkContactEligibility;
  onSetContact: (contactId: UUID | null) => void; // fan-out + close menu
  onCreateContact: (name: string) => Promise<UUID | null>;
```

3. Destructure them in the component signature (`contactOptions, contactEligibility, onSetContact, onCreateContact`).

4. Insert, immediately **after** the labels `{labelsEnabled ? … : …}` block and **before** `<ContextMenuSeparator />`:

```tsx
{
  contactEligibility.enabled ? (
    <BulkContactPicker
      options={contactOptions}
      onSelect={onSetContact}
      onCreate={onCreateContact}
      disabled={isApplying}
    />
  ) : (
    <>
      <ContextMenuItem disabled>
        <Store className="mr-2 h-4 w-4" aria-hidden />
        Set contact
      </ContextMenuItem>
      {contactEligibility.reason && (
        <div className="px-2 pb-1 text-xs text-muted-foreground">{contactEligibility.reason}</div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/BulkTransactionMenu.test.tsx`
Expected: PASS (existing + 2 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/BulkTransactionMenu.tsx src/features/transactions/BulkTransactionMenu.test.tsx
git commit -m "feat(transactions): render bulk contact picker in BulkTransactionMenu"
```

---

## Task 4: Wire fan-out in `TransactionsPane` + integration test

**Files:**

- Modify: `src/features/transactions/TransactionsPane.tsx`
- Test: `src/features/transactions/TransactionsPane.bulk.test.tsx`

- [ ] **Step 1: Write the failing test**

Append to the `describe('TransactionsPane — bulk label/category menu', …)` block in `src/features/transactions/TransactionsPane.bulk.test.tsx`:

```ts
it('bulk-sets a contact on every selected row and shows a success toast', async () => {
  const user = userEvent.setup();
  seed([coffee, pastry]);
  const contactPuts: string[] = [];
  server.use(
    http.put(`${apiBase}/api/transactions/:id/contact`, async ({ request, params }) => {
      contactPuts.push(params.id as string);
      const body = (await request.json()) as { contactId: string | null };
      return HttpResponse.json({ ...coffee, id: params.id as string, contactId: body.contactId });
    }),
  );
  renderWithProviders(ui(), { initialPath: '/accounts/a1' });
  await screen.findByText('Coffee');
  await select(user, 'coffee');
  await select(user, 'pastry');
  await rightClick(user, 'Coffee');

  await user.hover(await screen.findByRole('menuitem', { name: /set contact/i }));
  await user.pointer({
    keys: '[MouseLeft]',
    target: await screen.findByRole('option', { name: 'Acme' }),
  });

  await waitFor(() => expect(contactPuts).toHaveLength(2));
  expect(new Set(contactPuts)).toEqual(new Set(['t-coffee', 't-pastry']));
  await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Updated 2 transactions.'));
});

it('disables bulk Set contact with a reason when a transfer is selected', async () => {
  const user = userEvent.setup();
  const transfer: TransactionResponse = {
    ...transactionFixture,
    id: 't-xfer',
    description: 'Xfer',
    transactionType: 'transfer',
  };
  seed([coffee, transfer]);
  renderWithProviders(ui(), { initialPath: '/accounts/a1' });
  await screen.findByText('Coffee');
  await select(user, 'coffee');
  await select(user, 'xfer');
  await rightClick(user, 'Coffee');

  const item = await screen.findByRole('menuitem', { name: /set contact/i });
  expect(item).toHaveAttribute('aria-disabled', 'true');
  expect(screen.getByText(/income and expense/i)).toBeInTheDocument();
});
```

Note: `Acme` is the seeded contact in `configuration.dictionaries.contact` (`src/test/fixtures.ts` — `acmeContactId`). If `transactionFixture.transactionType` is not income/expense, adjust `coffee`/`pastry` in the test to a type with a contact (they default to expense per the fixture — verify before implementing).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.bulk.test.tsx -t "bulk-sets a contact"`
Expected: FAIL — "Set contact" menuitem not found (pane doesn't pass the props yet).

- [ ] **Step 3: Write minimal implementation**

In `src/features/transactions/TransactionsPane.tsx`:

1. Add `bulkContactEligibility` to the existing `./bulkLabels` import.

2. Add the fan-out handler next to `bulkSetCategory` (~line 436):

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

3. In the `<BulkTransactionMenu … />` JSX (~line 839), add the four props:

```tsx
  contactOptions={contactOptions}
  contactEligibility={bulkContactEligibility(selectedRows)}
  onSetContact={(id) => bulkSetContact(t.id, id)}
  onCreateContact={(name) => createEntry('contact', name)}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.bulk.test.tsx`
Expected: PASS (existing + 2 new tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/TransactionsPane.tsx src/features/transactions/TransactionsPane.bulk.test.tsx
git commit -m "feat(transactions): bulk set-contact fan-out in TransactionsPane"
```

---

## Task 5: Full verification + version bump

**Files:**

- Modify: `package.json` (version bump, per PR convention)

- [ ] **Step 1: Run the whole check suite**

Run: `just check` (typecheck + lint + format-check).
Expected: clean. If `eslint .` reports thousands of errors from a stray gitignored `.worktrees/` dir, lint the touched files directly instead: `pnpm exec eslint src/features/transactions/BulkContactPicker.tsx src/features/transactions/BulkTransactionMenu.tsx src/features/transactions/TransactionsPane.tsx src/features/transactions/bulkLabels.ts` (known gotcha from prior bulk work).

- [ ] **Step 2: Run the full test suite**

Run: `just test`
Expected: all green (existing count + the new contact tests).

- [ ] **Step 3: Bump the version**

Edit `package.json` `version` (patch/minor bump consistent with recent feature PRs — check the current value and increment the minor, e.g. `0.11.0 → 0.12.0`). Confirm the exact current version before editing.

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: bump version for bulk set-contact"
```

- [ ] **Step 5: Manual smoke (optional, recommended before PR)**

Use the `verify` skill or run `just run`, open an account with 2+ completed income/expense rows, select them, right-click a selected row → **Set contact** → pick a contact → confirm the toast and that all rows show the contact. Then repeat with a transfer in the selection and confirm "Set contact" is disabled with the reason.

---

## Definition of Done

- `bulkContactEligibility` gates correctly (completed + income/expense; mixed OK; transfer/pending/adjustment disabled with the right reason).
- Right-clicking a 2+ selection shows **Set contact**; picking fans a `{ contactId }` PUT over every selected row, toasts the summary, and closes the menu; "— none —" clears; create-then-assign works.
- All new + existing tests pass; `just check` clean (touched files if the `.worktrees` gotcha bites).
- No backend, DTO, or single-row `TxContactQuickPicker` change.
