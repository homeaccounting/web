# Adjust Balance Consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Adjust-balance action behave like Income/Expense/Transfer — account chosen inside the dialog (pre-selected to the highlighted account), and all four control-bar buttons disabled (with an explanatory tooltip) when there are no accounts.

**Architecture:** Split `AdjustBalanceDialog` into a thin outer dialog (fetches accounts, renders header + no-accounts fallback) and an inner `AdjustBalanceForm` that owns the form, an account `<select>`, the reactive current-balance/currency, and the mutation. `ControlBar` gains `useAccounts()` to compute `hasAccounts`, disables all four buttons when false, and shows a "Create an account first" tooltip on the disabled state via a small local `IconAction` helper.

**Tech Stack:** React 18, react-hook-form + zod, TanStack Query, shadcn/ui (Radix Tooltip), Vitest + Testing Library + MSW.

---

## Spec

See `docs/specs/2026-06-24-adjust-balance-consistency-design.md`.

## Background facts (verified against the codebase)

- `useAccounts()` returns `{ data: AccountResponse[] | undefined }` (`src/features/accounts/useAccounts.ts`; `accountsApi.list()` returns the array). It's keyed `['accounts']`, so `ControlBar` and the dialog share one cached request.
- `useAdjustBalance(id: UUID)` closes the `id` at hook-call time and uses it in the mutation path **and** the `['transactions', id]` invalidation key (`src/features/accounts/useAdjustBalance.ts`). Passing the watched `accountId` re-creates the mutation when the account changes — acceptable.
- `toAdjustBalanceRequest(values, currency)` takes currency as a second arg (`src/features/accounts/adjustBalanceSchema.ts:27`). It must be fed the **watched** account's currency.
- The account `<select>` markup to mirror is `src/features/transactions/IncomeExpenseForm.tsx:133-142`.
- The income dialog's no-accounts fallback to mirror is `src/features/transactions/CreateIncomeDialog.tsx:113-117`.
- **Radix tooltip + disabled button:** a native `disabled` button fires no pointer events, so the tooltip won't open. Wrap the disabled button in a focusable `<span tabIndex={0}>` used as the `TooltipTrigger`. Keep the enabled path as-is (TooltipTrigger `asChild` on the `Button`) so the existing focus-tooltip test keeps passing.
- **Async-gating gotcha:** once the four buttons depend on `useAccounts()`, they are disabled until the query resolves. Tests that click a button must first wait for it to be enabled (`await waitFor(() => expect(btn).toBeEnabled())`) before clicking.
- Default MSW handler returns one account (`accountFixture`, id `a1`) at `GET /api/accounts` (`src/test/handlers.ts:74`). Override with an empty list to exercise the disabled/no-accounts states.

## File structure

- Modify: `src/features/accounts/AdjustBalanceDialog.tsx` — outer dialog (props change `account` → `selectedAccountId?`) + new inner `AdjustBalanceForm` component in the same file.
- Modify: `src/features/accounts/AdjustBalanceDialog.test.tsx` — new props, account-selector and reactivity tests, no-accounts fallback.
- Modify: `src/features/transactions/ControlBar.tsx` — `useAccounts()`, `hasAccounts`, disable-all rule, `IconAction` helper, always render `AdjustBalanceDialog`.
- Modify: `src/features/transactions/ControlBar.test.tsx` — disabled-when-no-accounts (all four), enabled-with-accounts, disabled tooltip, wait-for-enabled before clicking.

---

## Task 1: Rework `AdjustBalanceDialog` to choose the account inside the dialog

**Files:**

- Modify: `src/features/accounts/AdjustBalanceDialog.tsx`
- Test: `src/features/accounts/AdjustBalanceDialog.test.tsx`

- [ ] **Step 1: Update the test harness and add failing tests**

Replace the `ui()` helper and add the new fixtures/tests. The dialog no longer takes an `account` prop — it takes `selectedAccountId?` and fetches accounts via `useAccounts()`, so tests must seed the accounts endpoint via MSW. Add a two-account override so the selector has something to switch to.

```tsx
// at top, alongside existing imports
import { http, HttpResponse } from 'msw';

const apiBase = 'http://localhost:8080';

const accounts: AccountResponse[] = [
  {
    id: 'a1',
    name: 'Savings',
    balance: 100,
    currency: 'USD',
    overdraftLimit: null,
    subtype: { type: 'cash', storageLocation: 'wallet' },
    status: 'Opened',
    version: 1,
  },
  {
    id: 'a2',
    name: 'Euro Wallet',
    balance: 42.5,
    currency: 'EUR',
    overdraftLimit: null,
    subtype: { type: 'cash', storageLocation: 'wallet' },
    status: 'Opened',
    version: 1,
  },
];

function seedAccounts(list: AccountResponse[]) {
  server.use(
    http.get(`${apiBase}/api/accounts`, () =>
      HttpResponse.json({ accounts: list, totalCount: list.length }),
    ),
  );
}

function ui(selectedAccountId?: string, onOpenChange: (open: boolean) => void = () => {}) {
  return (
    <AuthProvider>
      <AdjustBalanceDialog open onOpenChange={onOpenChange} selectedAccountId={selectedAccountId} />
    </AuthProvider>
  );
}
```

Add these new tests (and update every existing test to call `seedAccounts(accounts)` first and use `ui('a1', ...)` instead of `ui(fixture, ...)`; the existing PUT-body assertions to `/api/accounts/a1/balance` stay valid because `a1` is pre-selected):

```tsx
it('pre-selects the highlighted account and shows its current balance', async () => {
  seedAccounts(accounts);
  renderWithProviders(ui('a2'), { queryClient: makeQueryClient() });
  const select = await screen.findByLabelText(/account/i);
  expect(select).toHaveValue('a2');
  expect(screen.getByText(/current balance/i)).toHaveTextContent('EUR');
});

it('defaults to the first account when no account is highlighted', async () => {
  seedAccounts(accounts);
  renderWithProviders(ui(undefined), { queryClient: makeQueryClient() });
  expect(await screen.findByLabelText(/account/i)).toHaveValue('a1');
});

it('switching the account updates the current balance, currency, and PUT target', async () => {
  seedAccounts(accounts);
  let path: string | null = null;
  let body: Record<string, unknown> | null = null;
  server.use(
    http.put(`${apiBase}/api/accounts/:id/balance`, async ({ request }) => {
      path = new URL(request.url).pathname;
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({});
    }),
  );
  renderWithProviders(ui('a1'), { queryClient: makeQueryClient() });
  const select = await screen.findByLabelText(/account/i);
  await userEvent.selectOptions(select, 'a2');
  expect(screen.getByText(/current balance/i)).toHaveTextContent('EUR');
  const target = screen.getByLabelText(/target balance/i);
  await userEvent.clear(target);
  await userEvent.type(target, '60');
  await userEvent.click(screen.getByRole('button', { name: /ok/i }));
  await waitFor(() => expect(path).toBe('/api/accounts/a2/balance'));
  expect(body).toMatchObject({ targetBalance: 60, currency: 'EUR' });
});

it('shows a fallback message when there are no accounts', async () => {
  seedAccounts([]);
  renderWithProviders(ui(undefined), { queryClient: makeQueryClient() });
  expect(
    await screen.findByText(/create an account first to adjust a balance/i),
  ).toBeInTheDocument();
  expect(screen.queryByLabelText(/target balance/i)).not.toBeInTheDocument();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/features/accounts/AdjustBalanceDialog.test.tsx`
Expected: FAIL — `AdjustBalanceDialog` still requires an `account` prop / has no account selector / no fallback.

- [ ] **Step 3: Rewrite `AdjustBalanceDialog.tsx`**

Outer dialog fetches accounts and renders either the fallback or the inner form. Inner `AdjustBalanceForm` owns the form (so `useForm` initializes with a correct default once accounts exist — avoiding the RHF default-timing problem), the account `<select>`, reactive balance/currency, and the mutation.

```tsx
import { useMemo } from 'react';
import { useForm, FormProvider, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { DatePicker } from '@/components/DatePicker';
import { nowDateTimeInput } from '@/lib/dates';
import { ApiError } from '@/api/client';
import type { AccountResponse, UUID } from '@/api/types';
import {
  adjustBalanceFormSchema,
  toAdjustBalanceRequest,
  type AdjustBalanceFormValues,
} from './adjustBalanceSchema';
import { formatAccountBalance } from './format';
import { useAccounts } from './useAccounts';
import { useAdjustBalance } from './useAdjustBalance';

export interface AdjustBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAccountId?: UUID;
}

export function AdjustBalanceDialog({
  open,
  onOpenChange,
  selectedAccountId,
}: AdjustBalanceDialogProps) {
  const { data: accounts } = useAccounts();
  const hasAccounts = !!accounts && accounts.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust balance</DialogTitle>
          <DialogDescription>
            Record a balance adjustment as a synthetic transaction.
          </DialogDescription>
        </DialogHeader>
        {hasAccounts ? (
          <AdjustBalanceForm
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <div className="p-2 text-sm text-muted-foreground">
            Create an account first to adjust a balance.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface AdjustBalanceFormProps {
  accounts: AccountResponse[];
  selectedAccountId?: UUID;
  onClose: () => void;
}

function AdjustBalanceForm({ accounts, selectedAccountId, onClose }: AdjustBalanceFormProps) {
  const defaultAccount = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0];
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const form = useForm<AdjustBalanceFormValues & { accountId: UUID }>({
    // The form carries an extra `accountId` field the schema doesn't validate;
    // cast the resolver to the wider form type. Same pattern as
    // IncomeExpenseForm.tsx:52-55.
    resolver: zodResolver(adjustBalanceFormSchema) as Resolver<
      AdjustBalanceFormValues & { accountId: UUID }
    >,
    defaultValues: {
      accountId: defaultAccount.id,
      targetBalance: defaultAccount.balance,
      description: '',
      date: nowDateTimeInput(),
    },
  });

  const watchedAccountId = form.watch('accountId');
  const selected = accounts.find((a) => a.id === watchedAccountId) ?? defaultAccount;
  const adjust = useAdjustBalance(selected.id);

  const showBanner =
    adjust.isError && !(adjust.error instanceof ApiError && adjust.error.fieldErrors);
  const bannerMessage =
    adjust.error instanceof ApiError
      ? adjust.error.message
      : 'Something went wrong. Please try again.';

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await adjust.mutateAsync(toAdjustBalanceRequest(values, selected.currency));
      onClose();
      form.reset();
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          form.setError(field as keyof AdjustBalanceFormValues, { type: 'server', message });
        }
      }
    }
  });

  return (
    <>
      {showBanner && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{bannerMessage}</AlertDescription>
        </Alert>
      )}
      <FormProvider {...form}>
        <form
          onSubmit={(e) => {
            void onSubmit(e);
          }}
          className="space-y-4"
        >
          <FormField
            control={form.control}
            name="accountId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Account</FormLabel>
                <FormControl>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    {...field}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} ({a.currency})
                      </option>
                    ))}
                  </select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="text-sm text-muted-foreground">
            Current balance: {formatAccountBalance(selected)}
          </div>

          <FormField
            control={form.control}
            name="targetBalance"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target balance</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="any"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={
                      field.value === undefined ||
                      field.value === null ||
                      (typeof field.value === 'number' && Number.isNaN(field.value))
                        ? ''
                        : field.value
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '' || raw === '-') {
                        field.onChange(raw);
                        return;
                      }
                      const n = e.target.valueAsNumber;
                      field.onChange(Number.isNaN(n) ? raw : n);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (optional)</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Date</FormLabel>
                <FormControl>
                  <DatePicker
                    withTime
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    maxDate={today}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={adjust.isPending}>
              {adjust.isPending ? 'Saving…' : 'OK'}
            </Button>
          </div>
        </form>
      </FormProvider>
    </>
  );
}
```

Notes:

- `accountId` is added to the form values as an extra field; `adjustBalanceFormSchema` ignores unknown keys by default (zod object strips them), so no schema change is needed and `toAdjustBalanceRequest` still receives the shape it expects.
- The current-balance display now sits **below** the account selector and uses the watched `selected` account.
- The `as Resolver<...>` cast mirrors `IncomeExpenseForm.tsx:52-55` — without it, `tsc` rejects assigning a `Resolver` for the schema's narrower inferred type to a `useForm` typed with the wider `{ ...; accountId }` shape.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/features/accounts/AdjustBalanceDialog.test.tsx`
Expected: PASS (all existing + new tests).

- [ ] **Step 5: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: no errors. (If zod's strip behavior trips the `AdjustBalanceFormValues & { accountId }` typing, ensure `accountId` is referenced only via `form` generics as written.)

- [ ] **Step 6: Commit**

```bash
git add src/features/accounts/AdjustBalanceDialog.tsx src/features/accounts/AdjustBalanceDialog.test.tsx
git commit -m "feat(accounts): choose account inside adjust-balance dialog"
```

---

## Task 2: Disable all four control-bar buttons when there are no accounts

**Files:**

- Modify: `src/features/transactions/ControlBar.tsx`
- Test: `src/features/transactions/ControlBar.test.tsx`

- [ ] **Step 1: Update/extend the failing tests**

Replace the two adjust-balance-specific disabled tests with the new no-accounts rule, and make click-tests wait for enablement. Add a disabled-tooltip test.

```tsx
function seedNoAccounts() {
  server.use(
    http.get(`${apiBase}/api/accounts`, () => HttpResponse.json({ accounts: [], totalCount: 0 })),
  );
}

it('disables all four buttons when there are no accounts', async () => {
  seedNoAccounts();
  renderWithProviders(ui(), { initialPath: '/' });
  for (const name of [/add expense/i, /add income/i, /add transfer/i, /adjust balance/i]) {
    await waitFor(() => expect(screen.getByRole('button', { name })).toBeDisabled());
  }
});

it('enables all four buttons when at least one account exists', async () => {
  // default handler returns one account
  renderWithProviders(ui(), { initialPath: '/' });
  for (const name of [/add expense/i, /add income/i, /add transfer/i, /adjust balance/i]) {
    await waitFor(() => expect(screen.getByRole('button', { name })).toBeEnabled());
  }
});

it('shows a "create an account first" tooltip on a disabled button', async () => {
  seedNoAccounts();
  renderWithProviders(ui(), { initialPath: '/' });
  const btn = await screen.findByRole('button', { name: /add expense/i });
  await waitFor(() => expect(btn).toBeDisabled());
  // The focusable span wrapper is the tooltip trigger when disabled.
  fireEvent.focus(btn.parentElement as HTMLElement);
  expect(
    await screen.findByRole('tooltip', { name: /create an account first/i }),
  ).toBeInTheDocument();
});
```

Update the existing click tests (`clicking "Add income"`, `clicking "Add expense"`, `clicking "Add transfer"`, `clicking "Adjust balance"`) to wait for the button to be enabled before clicking, e.g.:

```tsx
const btn = await screen.findByRole('button', { name: /add income/i });
await waitFor(() => expect(btn).toBeEnabled());
await user.click(btn);
```

Delete the now-obsolete tests `renders the Adjust balance button disabled when no account is selected` and `enables the Adjust balance button when an account is selected` (superseded by the no-accounts rule). The `uiWithAccount()` helper can stay for the adjust-balance click test (it still passes `selectedAccountId`).

Also update the existing `shows a tooltip … when an icon button is focused` test (`ControlBar.test.tsx:126-130`). Under the new async gating the button starts disabled (query pending) and only becomes the enabled `asChild`-on-Button trigger after `useAccounts()` resolves, so focusing it immediately is now racy. Wait for enablement first:

```tsx
it('shows a tooltip describing the action when an icon button is focused', async () => {
  renderWithProviders(ui(), { initialPath: '/' });
  const btn = await screen.findByRole('button', { name: /add expense/i });
  await waitFor(() => expect(btn).toBeEnabled());
  fireEvent.focus(btn);
  expect(await screen.findByRole('tooltip', { name: /add expense/i })).toBeInTheDocument();
});
```

The synchronous `renders all three icon buttons with accessible names` test (`ControlBar.test.tsx:68-73`) only asserts presence (not enabled state), so it continues to pass unchanged.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm exec vitest run src/features/transactions/ControlBar.test.tsx`
Expected: FAIL — buttons are not yet gated on `hasAccounts`; no disabled tooltip wrapper.

- [ ] **Step 3: Rewrite `ControlBar.tsx`**

Add `useAccounts()`, compute `hasAccounts`, introduce a local `IconAction` helper that wraps the disabled button in a focusable span (so the Radix tooltip still opens), and always render `AdjustBalanceDialog` with `selectedAccountId`.

```tsx
import { useState, type ReactNode } from 'react';
import { ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { AccountResponse, UUID } from '@/api/types';
import { useAccounts } from '@/features/accounts/useAccounts';
import { AdjustBalanceDialog } from '@/features/accounts/AdjustBalanceDialog';
import { CreateIncomeDialog } from './CreateIncomeDialog';
import { CreateExpenseDialog } from './CreateExpenseDialog';
import { CreateTransferDialog } from './CreateTransferDialog';

export interface ControlBarProps {
  selectedAccountId?: UUID;
  selectedAccount?: AccountResponse;
}

const NO_ACCOUNTS_HINT = 'Create an account first';

function IconAction({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  const button = (
    <Button
      size="icon"
      variant="ghost"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="h-9 w-9"
    >
      {icon}
    </Button>
  );
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {disabled ? (
          // A native disabled button fires no pointer events, so wrap it in a
          // focusable span to keep the tooltip reachable on hover/focus.
          <span tabIndex={0} className="inline-flex">
            {button}
          </span>
        ) : (
          button
        )}
      </TooltipTrigger>
      <TooltipContent>{disabled ? NO_ACCOUNTS_HINT : label}</TooltipContent>
    </Tooltip>
  );
}

export function ControlBar({ selectedAccountId, selectedAccount }: ControlBarProps) {
  const { data: accounts } = useAccounts();
  const hasAccounts = (accounts?.length ?? 0) > 0;

  const [openIncome, setOpenIncome] = useState(false);
  const [openExpense, setOpenExpense] = useState(false);
  const [openTransfer, setOpenTransfer] = useState(false);
  const [adjusting, setAdjusting] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">Transactions</span>
        <TooltipProvider>
          <div className="flex items-center gap-1">
            <IconAction
              label="Add expense"
              icon={<ArrowUpFromLine className="h-5 w-5" />}
              disabled={!hasAccounts}
              onClick={() => setOpenExpense(true)}
            />
            <IconAction
              label="Add income"
              icon={<ArrowDownToLine className="h-5 w-5" />}
              disabled={!hasAccounts}
              onClick={() => setOpenIncome(true)}
            />
            <IconAction
              label="Add transfer"
              icon={<ArrowLeftRight className="h-5 w-5" />}
              disabled={!hasAccounts}
              onClick={() => setOpenTransfer(true)}
            />
            <IconAction
              label="Adjust balance"
              icon={<Scale className="h-5 w-5" />}
              disabled={!hasAccounts}
              onClick={() => setAdjusting(true)}
            />
          </div>
        </TooltipProvider>
      </div>
      <CreateIncomeDialog
        open={openIncome}
        onOpenChange={setOpenIncome}
        selectedAccountId={selectedAccountId}
      />
      <CreateExpenseDialog
        open={openExpense}
        onOpenChange={setOpenExpense}
        selectedAccountId={selectedAccountId}
      />
      <CreateTransferDialog
        open={openTransfer}
        onOpenChange={setOpenTransfer}
        selectedAccountId={selectedAccountId}
      />
      <AdjustBalanceDialog
        open={adjusting}
        onOpenChange={setAdjusting}
        selectedAccountId={selectedAccountId ?? selectedAccount?.id}
      />
    </>
  );
}
```

Notes:

- `selectedAccount` is retained in props for backward compatibility with callers; it now only feeds `selectedAccountId ?? selectedAccount?.id`. (If a follow-up confirms no caller passes `selectedAccount` without `selectedAccountId`, the prop can be dropped — out of scope here.)
- The enabled path keeps `TooltipTrigger asChild` on the `Button`, preserving the existing `shows a tooltip … when an icon button is focused` test.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm exec vitest run src/features/transactions/ControlBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/ControlBar.tsx src/features/transactions/ControlBar.test.tsx
git commit -m "feat(transactions): disable action buttons when no accounts exist"
```

---

## Task 3: Full verification

- [ ] **Step 1: Run the full check + test suite**

Run: `just check && just test`
Expected: typecheck, lint, format-check, and all Vitest suites pass.

- [ ] **Step 2: Manual smoke (optional but recommended)**

Run `just run`, then:

- With zero accounts: all four buttons greyed out; hovering shows "Create an account first".
- With accounts: open Adjust balance from the control bar without first selecting a row → dialog opens with the first account (or the highlighted one) pre-selected; switching the account updates the "Current balance" line and currency; submitting targets the chosen account.

- [ ] **Step 3: Commit any fixups**

```bash
git add -A && git commit -m "chore(transactions): adjust-balance consistency fixups"
```

---

## Out of scope

- No backend changes (`useAdjustBalance` / adjust endpoint unchanged).
- The income/expense/transfer in-dialog empty-state branches are kept as defensive fallbacks.
- Dropping the now-secondary `selectedAccount` prop from `ControlBar` is deferred.
