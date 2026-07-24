# Design-system Foundations + Consistency Rollout — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Home Accounting web client one deliberate design system — a self-hosted font, a documented type scale, semantic color tokens, and a small set of shared primitives — then roll it across every feature so the UI reads as one consistent product, while fixing two concrete UX defects (dialog scroll, Profile title/tab hierarchy).

**Architecture:** Additive-first. Establish tokens + primitives, then swap ad-hoc implementations over to them. Vendored `src/components/ui/*` edits (card, dialog) are minimal and documented in-file. No backend/API/route/IA changes.

**Tech Stack:** React 18 + TypeScript (strict), Vite 6, Tailwind CSS 3, shadcn/ui (Radix), react-hook-form + Zod, Vitest + Testing Library + happy-dom + MSW, Playwright.

**Spec:** `docs/specs/2026-07-24-design-system-foundations-design.md`

**Working dir:** all paths are relative to the repo root of the worktree `.worktrees/feat-design-system-foundations` (branch `feat/design-system-foundations`).

**Conventions for every task:**

- Run a single test file with `pnpm exec vitest run <path>`; filter by name with `-t "<name>"`.
- Styling-only changes that have no behavioral assertion use a **verify** step (`just check`) instead of a unit test — do not invent brittle class-string snapshot tests where none existed.
- After each task: `just check` (typecheck + lint + format-check) must pass before commit. Run `just format` to auto-fix formatting.
- Commit messages follow Conventional Commits.

---

## File map (what gets created / modified)

**Created**

- `src/components/ui/badge.tsx` — Badge primitive (WS3)
- `src/components/ui/badge.test.tsx`
- `src/components/ui/sonner.tsx` — Toaster (WS3)
- `src/components/EmptyState.tsx` + `.test.tsx` (WS3)
- `src/components/PageContainer.tsx`, `src/components/PageHeader.tsx` + tests (WS3)
- `src/lib/toast.ts` — thin re-export wrapper around sonner's `toast` (single import site)

**Modified — foundation**

- `package.json` (deps: `@fontsource-variable/inter`, `sonner`)
- `src/main.tsx` (font import, `<Toaster />`)
- `tailwind.config.ts` (`fontFamily.sans`, color tokens)
- `src/styles/globals.css` (token vars, light + dark)

**Modified — vendored ui (documented edits)**

- `src/components/ui/card.tsx` (`CardTitle` → `text-lg`)
- `src/components/ui/dialog.tsx` (flex-column layout, `DialogBody`, `size` prop)

**Modified — sweep** (feature files listed per task).

---

## Phase 1 — Foundation (WS1 + WS2)

### Task 1: Self-host Inter and wire the font

**Files:**

- Modify: `package.json`, `src/main.tsx`, `tailwind.config.ts`

- [ ] **Step 1: Add the dependency**

Run: `pnpm add @fontsource-variable/inter`
Expected: added to `dependencies`; lockfile updated.

- [ ] **Step 2: Import the variable font at the composition root**

In `src/main.tsx`, add as the first import (before `./styles/globals.css` is fine; keep CSS import order such that globals still wins for `@layer base`):

```ts
import '@fontsource-variable/inter';
import './styles/globals.css';
```

- [ ] **Step 3: Register the font family in Tailwind**

In `tailwind.config.ts`, add `import defaultTheme from 'tailwindcss/defaultTheme';` at the top, and inside `theme.extend` add:

```ts
fontFamily: {
  sans: ['"Inter Variable"', 'Inter', ...defaultTheme.fontFamily.sans],
},
```

- [ ] **Step 4: Verify**

Run: `just check`
Expected: PASS (typecheck + lint + format-check).
Run: `pnpm build` — Expected: build succeeds, no font resolution errors.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml src/main.tsx tailwind.config.ts
git commit -m "feat(design): self-host Inter and register as sans font"
```

---

### Task 2: Add semantic color tokens (positive/negative/warning/info)

**Files:**

- Modify: `src/styles/globals.css` (both `:root` and `.dark`), `tailwind.config.ts`

- [ ] **Step 1: Add CSS variables**

In `src/styles/globals.css`, add to `:root` (after `--chart-5`):

```css
--positive: 152 60% 36%;
--negative: 0 72% 45%;
--warning: 38 92% 40%;
--info: 217 91% 50%;
```

Add to `.dark` (after its `--chart-5`):

```css
--positive: 152 55% 45%;
--negative: 0 70% 58%;
--warning: 38 92% 55%;
--info: 217 91% 65%;
```

- [ ] **Step 2: Map the tokens in Tailwind**

In `tailwind.config.ts` `theme.extend.colors`, add:

```ts
positive: 'hsl(var(--positive))',
negative: 'hsl(var(--negative))',
warning: 'hsl(var(--warning))',
info: 'hsl(var(--info))',
```

- [ ] **Step 3: Verify contrast (manual, documented)**

Confirm each token meets WCAG AA (≥4.5:1 for text) against `--background` and `--card` in both themes. Adjust lightness if a check fails and note the final values. Quick check: paste HSL into any contrast tool, or eyeball in the Playwright pass (Task 24). Record final values in the spec's WS2 if changed.

- [ ] **Step 4: Verify build**

Run: `just check` — Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/styles/globals.css tailwind.config.ts
git commit -m "feat(design): add positive/negative/warning/info color tokens"
```

---

### Task 3: Shrink `CardTitle` to the type scale + AccountHeader h2 weight

**Files:**

- Modify: `src/components/ui/card.tsx:26` (the `text-2xl` in `CardTitle`)
- Modify: `src/features/transactions/AccountHeader.tsx:12` (`h2` `text-lg font-medium` → `text-lg font-semibold`)
- Test: `src/components/ui/card.test.tsx` (create only if none exists; otherwise update); `src/features/transactions/AccountHeader.test.tsx` (update if it asserts the weight)

- [ ] **Step 1: Check for existing card tests**

Run: `pnpm exec vitest run src/components/ui/card` (or `grep -rl CardTitle src --include=*.test.tsx`).
If a test asserts `text-2xl` on a title, update it in Step 3.

- [ ] **Step 2: Edit CardTitle**

In `src/components/ui/card.tsx`, change the `CardTitle` class from
`'text-2xl font-semibold leading-none tracking-tight'` to
`'text-lg font-semibold leading-none tracking-tight'`.
Add a one-line comment above it:

```tsx
// Intentional deviation from stock shadcn (text-2xl): our type scale caps
// card/section titles at text-lg so they sit below the page h1 (text-2xl).
// See docs/specs/2026-07-24-design-system-foundations-design.md WS1.
```

- [ ] **Step 3: Update any broken title-size assertions** (only if Step 1 found one).

- [ ] **Step 4: Fix AccountHeader h2 weight**

In `src/features/transactions/AccountHeader.tsx:12`, change the `h2` class `text-lg font-medium` → `text-lg font-semibold` (maps it to the "Card/section title" role). Update `AccountHeader.test.tsx` if it asserts the weight.

- [ ] **Step 5: Verify**

Run: `just check`, touched card tests, and `pnpm exec vitest run src/features/transactions/AccountHeader` — Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/components/ui/card.tsx src/features/transactions/AccountHeader.tsx
git commit -m "feat(design): cap CardTitle at text-lg; align AccountHeader h2 to scale"
```

---

### Task 4: Swap money/status colors to tokens

**Files (modify):**

- `src/features/reports/IncomeVsExpenseCard.tsx:40,41,45` — `text-green-600`/`text-red-600` → `text-positive`/`text-negative`
- `src/features/transactions/TransactionsPane.tsx:542` — negative amount `text-destructive` → `text-negative`
- `src/features/transactions/AllocationsEditor.tsx:284,286` — `bg-emerald-600`/`text-emerald-600` → `bg-positive`/`text-positive`
- `src/features/transactions/TransactionStatusIcon.tsx:12` — `text-amber-600 dark:text-amber-400` → `text-warning`
- `src/features/transactions/transactionType.tsx:42,50` — `text-green-600 dark:text-green-400` → `text-positive`; `text-blue-600 dark:text-blue-400` → `text-info`
- **Tests:** the corresponding `*.test.tsx` for each (search for the old class strings).

- [ ] **Step 1: Find every test asserting the old classes**

Run: `grep -rn "text-destructive\|text-green-600\|text-red-600\|text-amber\|emerald\|text-blue-600" src --include=*.test.tsx`
List the failing assertions to update.

- [ ] **Step 2: Update the tests first (TDD for the swap)**

Change each assertion to expect the new token class (e.g. `text-negative` in place of `text-destructive` on a transaction amount). Run them — Expected: FAIL (source still uses old class).

- [ ] **Step 3: Apply the source swaps** at the file:line targets above.

- [ ] **Step 4: Run the updated tests + full suite for the touched features**

Run: `pnpm exec vitest run src/features/reports src/features/transactions`
Expected: PASS.

- [ ] **Step 5: Audit `tabular-nums` on money displays (WS1)**

Run: `grep -rn "tabular-nums" src --include=*.tsx` to see current coverage (~9 files already have it). Then scan the money/amount render sites touched here and in the transactions/reports/accounts panes; add `tabular-nums` to any amount/balance/currency display that lacks it (e.g. reports figures, balances, allocation amounts). This closes WS1's "every money display" requirement. Don't add it to non-numeric text.

- [ ] **Step 6: Verify + Commit**

Run: `pnpm exec vitest run src/features/reports src/features/transactions` then `just check`.

```bash
git add src/features
git commit -m "feat(design): token money/status colors; tabular-nums on all amounts"
```

---

### Task 5: Reports charts use chart tokens; fix off-scale radius

**Files (modify):**

- Reports chart components using hardcoded green/red fills → `hsl(var(--positive))` / `hsl(var(--negative))` for income/expense; other series use `--chart-1..5`. (Inspect `src/features/reports/*Card.tsx` + `BreakdownBar.tsx` for inline colors.)
- Bare `rounded` → `rounded-md`: `src/features/transactions/TransactionPagination.tsx:50`, `src/features/profile/UserIdCard.tsx:33`, `src/features/profile/ProfileBankingPane.tsx:47`, `src/features/reports/BreakdownBar.tsx:15,18`

- [ ] **Step 1: Locate inline chart colors**

Run: `grep -rn "#\|green-\|red-\|rgb(" src/features/reports --include=*.tsx`
Map each to a token.

- [ ] **Step 2: Apply chart-token + radius edits.**

- [ ] **Step 3: Verify**

Run: `pnpm exec vitest run src/features/reports` then `just check` — Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features
git commit -m "feat(design): reports charts use chart tokens; normalize off-scale radius"
```

---

## Phase 2 — Primitives (WS3)

### Task 6: `Badge` primitive

**Files:**

- Create: `src/components/ui/badge.tsx`, `src/components/ui/badge.test.tsx`

- [ ] **Step 1: Write the failing test**

`src/components/ui/badge.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { Badge } from './badge';

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>3</Badge>);
    expect(screen.getByText('3')).toBeInTheDocument();
  });
  it('applies the positive variant token class', () => {
    render(<Badge variant="positive">in</Badge>);
    expect(screen.getByText('in').className).toContain('text-positive');
  });
  it('is pill-shaped for the count variant', () => {
    render(<Badge variant="count">9</Badge>);
    expect(screen.getByText('9').className).toContain('rounded-full');
  });
});
```

- [ ] **Step 2: Run — Expected: FAIL** (`Cannot find module './badge'`).
      Run: `pnpm exec vitest run src/components/ui/badge`

- [ ] **Step 3: Implement `badge.tsx`** using `class-variance-authority` (already a dep):

```tsx
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva('inline-flex items-center font-medium text-xs whitespace-nowrap', {
  variants: {
    variant: {
      default: 'rounded-md bg-secondary px-2 py-0.5 text-secondary-foreground',
      muted: 'rounded-md bg-muted px-2 py-0.5 text-muted-foreground',
      outline: 'rounded-md border px-2 py-0.5',
      positive: 'rounded-md bg-positive/10 px-2 py-0.5 text-positive',
      negative: 'rounded-md bg-negative/10 px-2 py-0.5 text-negative',
      count: 'rounded-full bg-primary px-1.5 text-primary-foreground',
      status: 'rounded-full bg-muted px-2 py-0.5 text-muted-foreground',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
export { badgeVariants };
```

- [ ] **Step 4: Run — Expected: PASS.**

- [ ] **Step 5: Verify + Commit**

Run: `just check`.

```bash
git add src/components/ui/badge.tsx src/components/ui/badge.test.tsx
git commit -m "feat(design): add Badge primitive"
```

---

### Task 7: Toast (sonner) + `lib/toast.ts`

**Files:**

- Modify: `package.json`, `src/main.tsx`
- Create: `src/components/ui/sonner.tsx`, `src/lib/toast.ts`

- [ ] **Step 1: Add dependency**

Run: `pnpm add sonner`

- [ ] **Step 2: Create `src/components/ui/sonner.tsx`**

```tsx
import { Toaster as SonnerToaster } from 'sonner';

// App-themed toaster. Uses design tokens so it matches light/dark automatically.
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: 'bg-background text-foreground border border-border shadow-lg',
          description: 'text-muted-foreground',
          actionButton: 'bg-primary text-primary-foreground',
          error: 'text-destructive',
          success: 'text-positive',
        },
      }}
    />
  );
}
```

- [ ] **Step 3: Create `src/lib/toast.ts`** (single import site so features never import `sonner` directly):

```ts
export { toast } from 'sonner';
```

- [ ] **Step 4: Mount `<Toaster />`** in `src/main.tsx` inside `<AuthProvider>` (sibling to `<App />`):

```tsx
import { Toaster } from '@/components/ui/sonner';
// ...
<AuthProvider>
  <App />
  <Toaster />
</AuthProvider>;
```

- [ ] **Step 5: Verify**

Run: `just check`; run the full suite to ensure MSW `onUnhandledRequest: 'error'` isn't tripped and nothing regresses: `pnpm test`.
Expected: PASS (883+).

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml src/components/ui/sonner.tsx src/lib/toast.ts src/main.tsx
git commit -m "feat(design): add sonner toaster and lib/toast wrapper"
```

---

### Task 8: `EmptyState` component

**Files:**

- Create: `src/components/EmptyState.tsx`, `src/components/EmptyState.test.tsx`

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

it('renders the message', () => {
  render(<EmptyState message="No accounts yet." />);
  expect(screen.getByText('No accounts yet.')).toBeInTheDocument();
});
it('renders an optional action', () => {
  render(<EmptyState message="No accounts yet." action={<button>Add</button>} />);
  expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run — Expected: FAIL.**

- [ ] **Step 3: Implement**

```tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  message: string;
  icon?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({ message, icon, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-2 p-6 text-center', className)}
    >
      {icon && <div className="text-muted-foreground">{icon}</div>}
      <p className="text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
```

- [ ] **Step 4: Run — Expected: PASS.**

- [ ] **Step 5: Verify + Commit**

```bash
git add src/components/EmptyState.tsx src/components/EmptyState.test.tsx
git commit -m "feat(design): add EmptyState component"
```

---

### Task 9: `PageContainer` + `PageHeader`

**Files:**

- Create: `src/components/PageContainer.tsx`, `src/components/PageHeader.tsx`, `src/components/PageHeader.test.tsx`

- [ ] **Step 1: Failing test (PageHeader renders h1 at scale + actions)**

```tsx
import { render, screen } from '@testing-library/react';
import { PageHeader } from './PageHeader';

it('renders the title as a level-1 heading', () => {
  render(<PageHeader title="Reports" />);
  const h = screen.getByRole('heading', { level: 1, name: 'Reports' });
  expect(h.className).toContain('text-2xl');
});
it('renders actions', () => {
  render(<PageHeader title="Reports" actions={<button>New</button>} />);
  expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run — Expected: FAIL.**

- [ ] **Step 3: Implement**

`PageHeader.tsx`:

```tsx
import type { ReactNode } from 'react';

export interface PageHeaderProps {
  title: string;
  actions?: ReactNode;
}
export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <div className="mb-4 flex items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      {actions}
    </div>
  );
}
```

`PageContainer.tsx`:

```tsx
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

// Standard app content page: consistent padding + max width. Scrolls within its
// parent (pages own the flex column + Header).
export function PageContainer({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={cn('mx-auto w-full max-w-4xl p-4 md:p-6', className)}>{children}</div>;
}
```

- [ ] **Step 4: Run — Expected: PASS.**

- [ ] **Step 5: Verify + Commit**

```bash
git add src/components/PageContainer.tsx src/components/PageHeader.tsx src/components/PageHeader.test.tsx
git commit -m "feat(design): add PageContainer and PageHeader layout primitives"
```

---

## Phase 3 — Dialog UX (WS7)

### Task 10: Restructure `DialogContent` (pinned header/footer, `DialogBody`, `size`)

**Files:**

- Modify: `src/components/ui/dialog.tsx`
- Test: `src/components/ui/dialog.test.tsx` (create)

- [ ] **Step 1: Failing test**

```tsx
import { render, screen } from '@testing-library/react';
import { Dialog, DialogContent, DialogBody, DialogTitle } from './dialog';

it('renders a scrollable body region', () => {
  render(
    <Dialog open>
      <DialogContent size="lg">
        <DialogTitle>T</DialogTitle>
        <DialogBody>content</DialogBody>
      </DialogContent>
    </Dialog>,
  );
  expect(screen.getByText('content').className).toContain('overflow-y-auto');
});
it('applies the lg width', () => {
  render(
    <Dialog open>
      <DialogContent size="lg">
        <DialogTitle>T</DialogTitle>
      </DialogContent>
    </Dialog>,
  );
  expect(screen.getByRole('dialog').className).toContain('max-w-2xl');
});
```

- [ ] **Step 2: Run — Expected: FAIL** (`DialogBody` undefined; no `size`).

- [ ] **Step 3: Implement**

In `src/components/ui/dialog.tsx`:

- Change `DialogContent` container classes from
  `... grid max-h-[85vh] w-full max-w-lg ... gap-4 overflow-y-auto ...`
  to a flex column that no longer scrolls as a whole:
  `... flex max-h-[85vh] w-full flex-col gap-4 ...` (drop `grid`, drop `overflow-y-auto`, drop the fixed `max-w-lg`).
- Add a `size` prop with a small map and a documented comment:

```tsx
const contentSizes = { sm: 'max-w-lg', lg: 'max-w-2xl' } as const;
type DialogSize = keyof typeof contentSizes;
// ...forwardRef props: add `size = 'sm'`
className={cn(
  'fixed left-[50%] top-[50%] z-50 flex max-h-[85vh] w-full translate-x-[-50%] translate-y-[-50%] flex-col gap-4 border bg-background p-6 shadow-lg duration-200 …animations… sm:rounded-lg',
  contentSizes[size],
  className,
)}
```

- Add `DialogBody`:

```tsx
const DialogBody = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('-mx-1 flex-1 space-y-4 overflow-y-auto px-1', className)} {...props} />
);
DialogBody.displayName = 'DialogBody';
```

- `DialogFooter`: add `shrink-0` and a top divider: `mt-0 flex shrink-0 flex-col-reverse border-t pt-4 sm:flex-row sm:justify-end sm:space-x-2`. (Header is already `shrink-0` by virtue of not being `flex-1`; leave as-is.)
- Export `DialogBody`.
- Add a comment documenting the deviation from stock shadcn and pointing at the spec.

- [ ] **Step 4: Run — Expected: PASS.** Then run the whole dialog-heavy suite to catch fallout: `pnpm exec vitest run src/features/transactions src/features/accounts`.

- [ ] **Step 5: Verify + Commit**

```bash
git add src/components/ui/dialog.tsx src/components/ui/dialog.test.tsx
git commit -m "feat(design): pinned dialog header/footer, scrollable DialogBody, size prop"
```

---

### Task 11: Two-column `IncomeExpenseForm` + pinned footer + wider dialogs

**Files:**

- Modify: `src/features/transactions/IncomeExpenseForm.tsx`, `src/features/transactions/CreateExpenseDialog.tsx`, `src/features/transactions/CreateIncomeDialog.tsx`, `src/features/transactions/EditTransactionDialog.tsx`, and the transfer dialog (`CreateTransferDialog.tsx` + `TransferForm.tsx`)
- Test: `src/features/transactions/IncomeExpenseForm.test.tsx`

- [ ] **Step 1: Update/extend the form test**

Assert the paired fields render inside a two-column grid on wide layout (query the grid wrapper by a `data-testid` you add, e.g. `data-testid="form-grid-account-currency"`, and assert `sm:grid-cols-2`). Keep existing behavioral tests intact. Run — Expected: FAIL.

- [ ] **Step 2: Reflow the form**

In `IncomeExpenseForm.tsx`:

- Wrap (Account, Currency) in `<div data-testid="form-grid-account-currency" className="grid grid-cols-1 gap-4 sm:grid-cols-2">`.
- Wrap (Date, Contact) similarly.
- Keep `AllocationsEditor`, Description, and Labels full-width.
- Wrap the scrolling fields in `<DialogBody>` and keep the existing `<DialogFooter>` **outside** `DialogBody` so it pins. (The form's root `<form>` becomes: `DialogBody` with fields, then `DialogFooter`.)

- [ ] **Step 3: Open the transaction dialogs at `size="lg"`**

In `CreateExpenseDialog.tsx`, `CreateIncomeDialog.tsx`, `EditTransactionDialog.tsx`, `CreateTransferDialog.tsx`: change `<DialogContent>` → `<DialogContent size="lg">`. Move each dialog's header/body/footer to use `DialogHeader` + `DialogBody` + pinned `DialogFooter` where the form doesn't already.

- [ ] **Step 4: Run — Expected: PASS**

Run: `pnpm exec vitest run src/features/transactions`

- [ ] **Step 5: Verify + Commit**

```bash
git add src/features/transactions
git commit -m "feat(transactions): two-column dialog form layout on wide screens; pinned footer"
```

---

## Phase 4 — Adoption sweep (WS4 + WS5 + WS6)

> Each task below is mechanical. For each: update tests that assert the old DOM first (TDD), swap the source, run the feature's tests, `just check`, commit.

### Task 12: Native `<select>` → shadcn `Select`; date input → `DatePicker`

**Files (modify):** `src/features/profile/DictionaryList.tsx` (3 selects), `src/features/transactions/TransferForm.tsx` (2), `src/features/transactions/IncomeExpenseForm.tsx` (account select), `src/features/transactions/TransactionPagination.tsx`, `src/features/accounts/AdjustBalanceDialog.tsx`; `src/features/accounts/SubtypeFields.tsx:289` (date `<Input>` → `DatePicker`). Tests alongside each.

- [ ] **Step 1:** For each file, find tests selecting the native control (`getByRole('combobox')` vs option interactions). Note that shadcn `Select` renders a button trigger + portal listbox, not a native `<select>` — tests using `selectOptions` must switch to click-open + click-option. Update tests to the `Select` interaction pattern first (Expected: FAIL).
- [ ] **Step 2:** Replace each native `<select>` with `Select`/`SelectTrigger`/`SelectContent`/`SelectItem`, preserving `value`/`onChange` wiring through react-hook-form (`onValueChange={field.onChange}`). Replace the `SubtypeFields` date input with `DatePicker` (match existing DatePicker usage).
- [ ] **Step 3:** Run each feature's suite — Expected: PASS.
- [ ] **Step 4:** `just check`; commit `refactor(design): adopt shadcn Select/DatePicker over native controls`.

### Task 13: Reports `<section>` cards → shadcn `Card`

**Files:** `src/features/reports/IncomeVsExpenseCard.tsx`, `SpendingByCategoryCard.tsx`, `NetWorthCard.tsx`.

- [ ] Update tests asserting the raw `<section>`/heading; swap to `Card`/`CardHeader`/`CardTitle`/`CardContent`. Titles now inherit `text-lg` from Task 3. Run reports suite → PASS. `just check`; commit `refactor(reports): use shadcn Card for report cards`.

### Task 14: `window.confirm` → `AlertDialog`

**Files:** `src/features/transactions/TransactionsPane.tsx:130` (association removal).

- [ ] Add an `AlertDialog` (match `DictionaryList` delete-confirm pattern) with state for the pending removal. Update/extend the test to drive the dialog instead of stubbing `window.confirm`. Run → PASS. `just check`; commit `refactor(transactions): replace window.confirm with AlertDialog`.

### Task 15: Adopt `Badge` across features

**Files:** `AccountsPane.tsx:42`, `ManageAccessDialog.tsx:60`, `ProfileBankingPane.tsx:47`, `ContactChip.tsx:25`, `RelationBadge.tsx:9`, `RefundBadge.tsx:7`, `TransactionsPane.tsx:728` (filter count → `variant="count"`).

- [ ] Map each hand-rolled chip to a `Badge` variant (count/status/muted/positive/negative). Update tests asserting old class strings. Run affected suites → PASS. `just check`; commit `refactor(design): replace hand-rolled chips with Badge`.

### Task 16: Adopt toasts; remove duplicated toast blocks + inline success text

**Files:** `AccountsPane.tsx:325`, `SyncNowButton.tsx:104`, `ImportStatementButton.tsx:108` (fixed toast blocks); inline `text-green-600` success at `ProfileGeneralPane.tsx:204`, `ProfileAuthPane.tsx:136`, `UserIdCard.tsx:51`, `DefaultAccountsCard.tsx:94`, `DefaultCategoriesCard.tsx:102`, `MccMappingEditor.tsx:121`.

- [ ] Replace each fixed toast block with `toast.success/error(...)` from `@/lib/toast`; replace inline success messages with `toast.success(...)`. Update tests: they should assert `toast` calls (mock `@/lib/toast`) or the rendered sonner region text rather than the old inline nodes. Run affected suites → PASS. `just check`; commit `refactor(design): route success/error feedback through toasts`.

### Task 17: Adopt `EmptyState`; unify empty copy

**Files:** `AccountsPane.tsx:240`, `NetWorthCard.tsx:32`, `SpendingByCategoryCard.tsx:39`, `TransactionsPane.tsx:347,368,370`, `ProfileBankingPane.tsx:137`, `DictionaryList.tsx:109`, `MccMappingEditor.tsx:64`.

- [ ] Replace ad-hoc empty text with `<EmptyState message="No X yet." />` (or context-appropriate copy ending in a period). Standardize wording. Update tests asserting old text/size. Run → PASS. `just check`; commit `refactor(design): unify empty states via EmptyState`.

### Task 18: Adopt `PageContainer`/`PageHeader`; rebuild `NotFoundPage`

**Files:** `src/pages/ProfilePage.tsx`, `src/features/reports/ReportsPane.tsx` (+ `ReportsPage.tsx`), `src/pages/NotFoundPage.tsx`.

- [ ] Wrap Profile and Reports content in `PageContainer` and render their titles via `PageHeader` (removes the inline `text-xl` h1 and the `p-6`/`p-4 md:p-6`/`max-w-3xl`/`max-w-4xl` divergence — now `max-w-4xl` + `p-4 md:p-6`). Rebuild `NotFoundPage` to use `Header` + `PageContainer` + `PageHeader title="Page not found"` + a link home. Update `ProfilePage.test.tsx`/`ReportsPage.test.tsx` heading-level/text expectations. Run → PASS. `just check`; commit `refactor(design): standardize page layout via PageContainer/PageHeader`.

### Task 19: Error convention (attribute order, copy, Retry)

**Files:** profile panes `ProfileDefaultsPane.tsx:22`, `ProfileDictionariesPane.tsx:18`, `ProfileGeneralPane.tsx:60`, `ProfileBankingPane.tsx:119`; align copy in `AccountsPane`/`TransactionsPane` error alerts.

- [ ] Normalize to `<Alert variant="destructive" role="alert">`; unify copy to `"Couldn't load X."`; add a `Retry` button (calls the query's `refetch`) to the profile-pane errors that lack one. Update tests. Run → PASS. `just check`; commit `refactor(design): consistent error alerts with retry`.

### Task 20: Loading convention

**Files:** `src/features/transactions/RefundTransactionDialog.tsx:55` (text → `Skeleton`); align profile skeleton wrapper spacing to `space-y-6` (`ProfileBankingPane.tsx:112`, `ProfileDefaultsPane.tsx:14`).

- [ ] Replace the "Loading refund details…" text with `Skeleton` blocks matching the loaded layout; make skeleton wrapper spacing equal the loaded state. Keep `SyncNowButton` spinner (documented). Update tests. Run → PASS. `just check`; commit `refactor(design): skeleton loading consistency`.

### Task 21: Tabs & Header nav (WS6 — two-tier preserved)

**Files:** `src/components/Header.tsx`; verify `src/pages/ProfilePage.tsx:66` (stays segmented) and `src/features/profile/ProfileDictionariesPane.tsx` (stays underline) need no change.

- [ ] **Step 1:** Update `Header.test`/`App.test` expectation for the active nav class from `border-foreground` to `border-primary` (Expected: FAIL).
- [ ] **Step 2:** In `Header.tsx`, change the active branch `'border-foreground text-foreground'` → `'border-primary text-foreground'` and align the inactive/hover classes to match the `underline` TabsTrigger treatment (`border-transparent text-muted-foreground hover:text-foreground`, `-mb-px border-b-2`). Optionally add a wrapping `border-b` context if it improves the seam — keep minimal.
- [ ] **Step 3:** Confirm Profile top tabs remain `segmented` and Dictionaries remain `underline` (no edits). Run `pnpm exec vitest run src/components src/pages src/features/profile` → PASS.
- [ ] **Step 4:** `just check`; commit `refactor(design): unify header nav active token with underline tabs`.

### Task 22: Icon & spacing normalization

**Files:** `AccountsPane.tsx`, `ControlBar.tsx`, `TransactionsPane.tsx`, `AccountHeader.tsx`, and any pane sub-headers.

- [ ] Standardize icon-button box to `h-9 w-9` (glyph `h-4 w-4`) for default actions and `h-7 w-7` (glyph `h-3.5 w-3.5`) for dense table-row actions; remove stray `h-10`/`h-5` icon overrides (rely on button's `[&_svg]:size-4`, override only for the compact row case). Unify pane sub-headers to `px-4 py-2.5`. Normalize card stacks to `space-y-6`, form fields `space-y-4`. Update any snapshot/class tests. Run affected suites → PASS. `just check`; commit `refactor(design): normalize icon sizes and spacing rhythm`.

---

## Phase 5 — Verification (spec §7)

### Task 23: Full gate + live verification

- [ ] **Step 1:** `just check` — Expected: PASS.
- [ ] **Step 2:** `just test` — Expected: all green (≥883, plus new primitive tests).
- [ ] **Step 3:** `just e2e` (Playwright smoke) — Expected: PASS.
- [ ] **Step 4: Live screenshot pass.** Start dev (`just run`), then via Playwright MCP visit and screenshot in **both light and dark**: transactions view, reports, profile (confirm card titles < page title and tabs hierarchy), and the **expense dialog** at a normal desktop viewport (confirm no scrollbar; header + footer pinned) and at a short viewport (confirm only the body scrolls). Compare against the spec's intent. Fix any visual regressions (clipped text from Inter metrics, contrast) and re-run the gate.
- [ ] **Step 5:** Use `superpowers:requesting-code-review` for a final review against this plan and the spec.
- [ ] **Step 6:** Use `superpowers:finishing-a-development-branch` to decide merge/PR.

---

## Notes & risks

- **Vendored `ui/` edits** (`card.tsx`, `dialog.tsx`): documented in-file; a future `pnpm dlx shadcn add` could clobber them — the comments warn against it.
- **`Select` interaction in tests**: shadcn `Select` uses a portal + button trigger. Prefer Testing Library user-event click-open then click-item; happy-dom pointer polyfills are already set up in `src/test/setup.ts` — do not strip them.
- **Money-color test churn** is expected in Task 4; update assertions, don't weaken them.
- **MSW stays on `~2.13.x`** — do not upgrade.
