# Default Accounts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the web app to the backend's reshaped nested `defaults` API and add a Defaults profile tab for setting default categories, a global default account, and per-type default accounts.

**Architecture:** Reshape `src/api/types.ts` to the nested `defaults` DTO in one atomic pass (types + all consumers + test infra, to keep `tsc` green), then build three new presentational profile components behind the existing `useConfiguration()` / `useAccounts()` / `useUpdateDefaults()` hooks, and wire a new "Defaults" tab into `ProfilePage`.

**Tech Stack:** React 18, TypeScript (strict), TanStack Query, shadcn/ui (Select/Card/Button/Alert), Vitest + Testing Library + MSW.

**Spec:** `docs/specs/2026-07-03-default-accounts-design.md`

**Key invariants (do not violate):**

- Backend `PUT .../defaults` is **set-only**: `null`/absent scalar = no-op. Never rely on `null` to clear `incomeCategory` / `expenseCategory` / `account`.
- `subtypeAccounts`, when present, **replaces the whole map**. Every save of the accounts card sends the _complete_ assembled map (omit a row → that default is cleared).
- Backend map keys are `CashKind`/`BankAccountKind`/`EWalletKind`/`AssetKind`/`LoanKind`; web keys are `cash`/`bankAccount`/`eWallet`/`asset`/`loan`. Always convert via the mapping helper.

**Verify each task with:** `pnpm exec vitest run <path>` for the touched test, and `pnpm typecheck` after the atomic reshape task.

---

## File Structure

New:

- `src/api/defaults.ts` — subtype-key mapping helpers (`toBackendSubtypeKind`, `fromBackendSubtypeKind`) + `SELECTABLE_ACCOUNT` predicate helper.
- `src/api/defaults.test.ts`
- `src/features/profile/AccountSelect.tsx` — presentational account dropdown.
- `src/features/profile/DefaultCategoriesCard.tsx` + `.test.tsx`
- `src/features/profile/DefaultAccountsCard.tsx` + `.test.tsx`
- `src/features/profile/ProfileDefaultsPane.tsx` + `.test.tsx`

Modified:

- `src/api/types.ts` — reshape DTOs, fix stale comment.
- `src/test/fixtures.ts`, `src/test/handlers.ts` — nested shape.
- `src/features/transactions/{CreateIncomeDialog,CreateExpenseDialog,ConvertTransactionDialog}.tsx`
- `src/pages/ProfilePage.tsx` — add Defaults tab.
- `src/features/profile/ProfileDictionariesPane.tsx` — remove Default categories card.
- Tests: `useUpdateDefaults.test.tsx`, `EditTransactionDialog.test.tsx`, `CreateIncomeDialog.test.tsx`, `CreateExpenseDialog.test.tsx`, `ConvertTransactionDialog.test.tsx`, `ProfileDictionariesPane.test.tsx`.

Removed:

- `src/features/profile/DefaultCategoryField.tsx` + `DefaultCategoryField.test.tsx`

---

## Task 1: Reshape API types (atomic — must land compiling)

This task changes the wire types and **every** consumer + test fixture in one commit so `tsc` and the suite stay green. Because the removed `ConfigurationResponse.defaultIncomeCategory`/`defaultExpenseCategory` and the renamed `UpdateDefaultsRequest` keys are also referenced by `ProfileDictionariesPane.tsx` (lines 68-76) and `DefaultCategoryField.tsx` (its `save()` builds an `UpdateDefaultsRequest` from the old keys), those two must be handled here too — otherwise `pnpm typecheck` is red at this commit boundary. `DefaultCategoryField` is deleted now (its behaviour is superseded by `DefaultCategoriesCard` in Task 4); the Default-categories card is removed from `ProfileDictionariesPane` now (its replacement lives on the new Defaults tab, Task 6).

**Files:**

- Modify: `src/api/types.ts:358-448`
- Create: `src/api/defaults.ts`
- Modify: `src/test/fixtures.ts:103-104`, `src/test/handlers.ts:294-301`
- Modify: `src/features/transactions/CreateIncomeDialog.tsx:44`, `CreateExpenseDialog.tsx:41`, `ConvertTransactionDialog.tsx:131`
- Modify: `src/features/profile/ProfileDictionariesPane.tsx` (remove Default categories card + `DefaultCategoryField` import + unused `incomeCategories`/`expenseCategories` locals), `src/features/profile/ProfileDictionariesPane.test.tsx` (drop default-category assertions)
- Delete: `src/features/profile/DefaultCategoryField.tsx`, `src/features/profile/DefaultCategoryField.test.tsx`
- Modify: `src/features/configuration/useUpdateDefaults.test.tsx:22,34,37,38`, `src/features/transactions/EditTransactionDialog.test.tsx:72-73`, `CreateIncomeDialog.test.tsx:56`, `CreateExpenseDialog.test.tsx:55`, `ConvertTransactionDialog.test.tsx:59-60`

- [ ] **Step 1: Rewrite the Configuration types + comment in `src/api/types.ts`**

Replace the stale comment block (lines 359-363) with:

```ts
// JSON shape from server-infra/src/Web/API/ConfigurationAPI.hs (ConfigurationResponse,
// ConfigurationDefaultsDTO, DictionaryResponse, BankingConfigurationDTO).
// Defaults are nested under `defaults` (incomeCategory/expenseCategory/account/
// subtypeAccounts); set via PUT /api/users/me/configuration/defaults.
```

Replace `UpdateDefaultsRequest` (lines 411-414) with:

```ts
export interface UpdateDefaultsRequest {
  incomeCategory?: UUID | null;
  expenseCategory?: UUID | null;
  account?: UUID | null;
  // Present = replaces the whole per-subtype map wholesale (omit a key to clear it).
  subtypeAccounts?: Partial<Record<BackendSubtypeKind, UUID>>;
}
```

Add the DTO + mapping type near the Configuration section (after `BankingConfigurationDTO`, before `ConfigurationResponse`):

```ts
// Backend AccountSubtypeKind constructor names, used as subtypeAccounts map keys.
export const BACKEND_SUBTYPE_KIND = {
  cash: 'CashKind',
  bankAccount: 'BankAccountKind',
  eWallet: 'EWalletKind',
  asset: 'AssetKind',
  loan: 'LoanKind',
} as const satisfies Record<AccountSubtypeKind, string>;
export type BackendSubtypeKind = (typeof BACKEND_SUBTYPE_KIND)[AccountSubtypeKind];

export interface ConfigurationDefaultsDTO {
  incomeCategory: UUID | null;
  expenseCategory: UUID | null;
  account: UUID | null;
  subtypeAccounts: Partial<Record<BackendSubtypeKind, UUID>>;
}
```

In `ConfigurationResponse` (lines 435-448), remove the two lines:

```ts
defaultIncomeCategory: UUID | null;
defaultExpenseCategory: UUID | null;
```

and add:

```ts
defaults: ConfigurationDefaultsDTO;
```

(`AccountSubtypeKind` is already exported at line ~114; `UUID` already in scope.)

- [ ] **Step 2: Create `src/api/defaults.ts`**

```ts
import {
  BACKEND_SUBTYPE_KIND,
  type AccountSubtypeKind,
  type BackendSubtypeKind,
  type AccountResponse,
} from '@/api/types';

const FROM_BACKEND = Object.fromEntries(
  Object.entries(BACKEND_SUBTYPE_KIND).map(([web, backend]) => [backend, web]),
) as Record<string, AccountSubtypeKind>;

export function toBackendSubtypeKind(kind: AccountSubtypeKind): BackendSubtypeKind {
  return BACKEND_SUBTYPE_KIND[kind];
}

/** Returns undefined for unknown keys so a future backend subtype is ignored, not fatal. */
export function fromBackendSubtypeKind(key: string): AccountSubtypeKind | undefined {
  return FROM_BACKEND[key];
}

/** Accounts eligible to be a default: Regular (has a subtype) and Opened. */
export function isSelectableDefaultAccount(a: AccountResponse): boolean {
  return a.status === 'Opened' && a.subtype != null;
}
```

- [ ] **Step 3: Update transaction dialog consumers**

- `CreateIncomeDialog.tsx:44` → `const defaultCategory = config?.defaults.incomeCategory ?? '';`
- `CreateExpenseDialog.tsx:41` → `const defaultCategory = config?.defaults.expenseCategory ?? '';`
- `ConvertTransactionDialog.tsx:131` → change `config?.defaultIncomeCategory` / `config?.defaultExpenseCategory` to `config?.defaults.incomeCategory` / `config?.defaults.expenseCategory`.

- [ ] **Step 4: Update test infra to nested shape**

`src/test/fixtures.ts` — replace lines 103-104 (`defaultIncomeCategory`/`defaultExpenseCategory`) with:

```ts
  defaults: {
    incomeCategory: null,
    expenseCategory: null,
    account: null,
    subtypeAccounts: {},
  },
```

`src/test/handlers.ts` (lines 294-301) — the PUT handler should echo the nested shape, merging request fields into `configurationFixture.defaults`:

```ts
  http.put(`${apiBase}/api/users/me/configuration/defaults`, async ({ request }) => {
    const body = (await request.json()) as UpdateDefaultsRequest;
    return HttpResponse.json({
      ...configurationFixture,
      defaults: {
        ...configurationFixture.defaults,
        ...(body.incomeCategory !== undefined ? { incomeCategory: body.incomeCategory } : {}),
        ...(body.expenseCategory !== undefined ? { expenseCategory: body.expenseCategory } : {}),
        ...(body.account !== undefined ? { account: body.account } : {}),
        ...(body.subtypeAccounts !== undefined ? { subtypeAccounts: body.subtypeAccounts } : {}),
      },
    });
  }),
```

- [ ] **Step 5: Update the tests that reference old field names**

Update these to the nested shape (config overrides move under `defaults:` merged onto `configurationFixture`, request-body assertions use new field names):

- `CreateIncomeDialog.test.tsx:56` — `{ ...configurationFixture, defaults: { ...configurationFixture.defaults, incomeCategory: salaryCategoryId } }`
- `CreateExpenseDialog.test.tsx:55` — same pattern with `expenseCategory: foodCategoryId`
- `ConvertTransactionDialog.test.tsx:59-60` — `defaults: { ...configurationFixture.defaults, expenseCategory: foodCategoryId, incomeCategory: salaryCategoryId }`
- `EditTransactionDialog.test.tsx:72-73` — drop the two lines (fixture already defaults them to null) or nest them.
- `useUpdateDefaults.test.tsx:22,34,37,38` — response override becomes `defaults: { ...configurationFixture.defaults, incomeCategory: 'cat-income' }`; request body `mutate({ incomeCategory: 'cat-income' })`; assertion `expect(body).toEqual({ incomeCategory: 'cat-income' })`; response assertion `expect(result.current.data?.defaults.incomeCategory).toBe('cat-income')`.

- [ ] **Step 6: Remove the Default categories card + delete `DefaultCategoryField`**

In `src/features/profile/ProfileDictionariesPane.tsx`: delete the third `<Card>` (the "Default categories" card, lines ~62-80), the `DefaultCategoryField` import (line 6), and the now-unused `incomeCategories`/`expenseCategories` locals (lines 26-27). The Dictionaries tab keeps Categories + Labels only.

```bash
git rm src/features/profile/DefaultCategoryField.tsx src/features/profile/DefaultCategoryField.test.tsx
```

In `src/features/profile/ProfileDictionariesPane.test.tsx`: remove any assertion referencing the Default categories card / the old field names (e.g. the `defaultExpenseCategory` PUT assertion).

- [ ] **Step 7: Verify typecheck + full suite**

Run: `pnpm typecheck`
Expected: no errors (this is the real gate — all references to the old shape are now gone).

Run: `pnpm test`
Expected: PASS. (The `src/api/defaults.test.ts` from Task 2 doesn't exist yet — that's fine, nothing references it.)

- [ ] **Step 8: Commit**

```bash
git add -A src/api src/test src/features/transactions src/features/configuration/useUpdateDefaults.test.tsx src/features/profile
git commit -m "refactor(api): reshape configuration defaults to nested DTO"
```

---

## Task 2: Test the mapping helpers

**Files:**

- Test: `src/api/defaults.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import {
  toBackendSubtypeKind,
  fromBackendSubtypeKind,
  isSelectableDefaultAccount,
} from './defaults';
import { ACCOUNT_SUBTYPE_KINDS, type AccountResponse } from './types';

describe('subtype key mapping', () => {
  it('round-trips every web subtype kind', () => {
    for (const kind of ACCOUNT_SUBTYPE_KINDS) {
      expect(fromBackendSubtypeKind(toBackendSubtypeKind(kind))).toBe(kind);
    }
  });
  it('maps cash to CashKind', () => {
    expect(toBackendSubtypeKind('cash')).toBe('CashKind');
  });
  it('returns undefined for unknown backend keys', () => {
    expect(fromBackendSubtypeKind('CryptoKind')).toBeUndefined();
  });
});

describe('isSelectableDefaultAccount', () => {
  const base: AccountResponse = {
    id: 'a1',
    name: 'A',
    balance: 0,
    currency: 'USD',
    overdraftLimit: null,
    subtype: { type: 'cash' },
    status: 'Opened',
    version: 1,
  };
  it('accepts opened regular accounts', () => {
    expect(isSelectableDefaultAccount(base)).toBe(true);
  });
  it('rejects closed accounts', () => {
    expect(isSelectableDefaultAccount({ ...base, status: 'Closed' })).toBe(false);
  });
  it('rejects external accounts (no subtype)', () => {
    expect(isSelectableDefaultAccount({ ...base, subtype: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect PASS** (helpers already implemented in Task 1)

Run: `pnpm exec vitest run src/api/defaults.test.ts`
Expected: PASS. (If a helper is missing, implement it in `src/api/defaults.ts`.)

- [ ] **Step 3: Commit**

```bash
git add src/api/defaults.test.ts
git commit -m "test(api): cover defaults subtype-key mapping helpers"
```

---

## Task 3: `AccountSelect` presentational component

A thin wrapper over shadcn `Select` listing accounts, with optional "— none —".

**Files:**

- Create: `src/features/profile/AccountSelect.tsx`

- [ ] **Step 1: Implement**

```tsx
import type { AccountResponse } from '@/api/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export const NONE_VALUE = '__none__';

interface AccountSelectProps {
  id?: string;
  label: string;
  value: string; // account id or NONE_VALUE
  accounts: AccountResponse[];
  includeNone: boolean;
  placeholder?: string;
  onChange: (value: string) => void;
}

export function AccountSelect({
  id,
  label,
  value,
  accounts,
  includeNone,
  placeholder = 'Select…',
  onChange,
}: AccountSelectProps) {
  return (
    <Select value={value || undefined} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-56" aria-label={label}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeNone && <SelectItem value={NONE_VALUE}>— none —</SelectItem>}
        {accounts.map((a) => (
          <SelectItem key={a.id} value={a.id}>
            {a.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/features/profile/AccountSelect.tsx
git commit -m "feat(profile): add AccountSelect presentational dropdown"
```

---

## Task 4: `DefaultCategoriesCard`

Card-level single-Save income + expense selects, **no none option** (set-only backend).

**Files:**

- Create: `src/features/profile/DefaultCategoriesCard.tsx`
- Test: `src/features/profile/DefaultCategoriesCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import { DefaultCategoriesCard } from './DefaultCategoriesCard';

const apiBase = 'http://localhost:8080';
const income = [{ id: 'inc-1', name: 'Salary' }];
const expense = [{ id: 'exp-1', name: 'Food' }];

describe('DefaultCategoriesCard', () => {
  it('has no "none" option and PUTs the chosen income category', async () => {
    let body: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/defaults`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(
      <AuthProvider>
        <DefaultCategoriesCard
          incomeCurrent={null}
          expenseCurrent={null}
          incomeCategories={income}
          expenseCategories={expense}
        />
      </AuthProvider>,
    );
    const user = userEvent.setup();

    const row = screen.getByRole('combobox', { name: 'Default income category' });
    await user.click(row);
    expect(screen.queryByRole('option', { name: '— none —' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'Salary' }));
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(body).toEqual({ incomeCategory: 'inc-1' }));
  });
});
```

(Session + `AuthProvider` are required because `useUpdateDefaults` reads `useAuth()`; without them the mutation hits `onUnauthorized`. The `combobox` role + `await findByRole('option')` is the established shadcn-Select pattern — model on `DefaultCategoryField.test.tsx` / `CreateIncomeDialog.test.tsx`, **not** `AdjustBalanceDialog.test.tsx` which uses a native `<select>`.)

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './DefaultCategoriesCard'`)

Run: `pnpm exec vitest run src/features/profile/DefaultCategoriesCard.test.tsx`

- [ ] **Step 3: Implement**

```tsx
import { useState } from 'react';
import type { DictionaryEntryResponse, UUID, UpdateDefaultsRequest } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useUpdateDefaults } from '@/features/configuration/useUpdateDefaults';

interface Props {
  incomeCurrent: UUID | null;
  expenseCurrent: UUID | null;
  incomeCategories: DictionaryEntryResponse[];
  expenseCategories: DictionaryEntryResponse[];
}

function CategoryRow({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: DictionaryEntryResponse[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={id} className="w-44 text-sm font-medium">
        {label}
      </label>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id={id} className="w-56" aria-label={label}>
          <SelectValue placeholder="Select…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.id} value={o.id}>
              {o.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function DefaultCategoriesCard({
  incomeCurrent,
  expenseCurrent,
  incomeCategories,
  expenseCategories,
}: Props) {
  const update = useUpdateDefaults();
  const [income, setIncome] = useState<string>(incomeCurrent ?? '');
  const [expense, setExpense] = useState<string>(expenseCurrent ?? '');
  const dirty = income !== (incomeCurrent ?? '') || expense !== (expenseCurrent ?? '');

  const save = () => {
    const body: UpdateDefaultsRequest = {};
    if (income && income !== incomeCurrent) body.incomeCategory = income;
    if (expense && expense !== expenseCurrent) body.expenseCategory = expense;
    update.mutate(body);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default categories</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <CategoryRow
          id="default-income-category"
          label="Default income category"
          value={income}
          options={incomeCategories}
          onChange={setIncome}
        />
        <CategoryRow
          id="default-expense-category"
          label="Default expense category"
          value={expense}
          options={expenseCategories}
          onChange={setExpense}
        />
        <Button type="button" onClick={save} disabled={!dirty || update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
        {update.error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{update.error.message}</AlertDescription>
          </Alert>
        )}
        {update.isSuccess && <p className="text-sm text-green-600">Updated.</p>}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm exec vitest run src/features/profile/DefaultCategoriesCard.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/features/profile/DefaultCategoriesCard.tsx src/features/profile/DefaultCategoriesCard.test.tsx
git commit -m "feat(profile): default categories card (set-only, single save)"
```

---

## Task 5: `DefaultAccountsCard`

Global account select + 5 per-type rows (filtered to matching subtype); single Save assembling the full `subtypeAccounts` map.

**Files:**

- Create: `src/features/profile/DefaultAccountsCard.tsx`
- Test: `src/features/profile/DefaultAccountsCard.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import type { AccountResponse } from '@/api/types';
import { DefaultAccountsCard } from './DefaultAccountsCard';

const apiBase = 'http://localhost:8080';
const acct = (id: string, name: string, type: string): AccountResponse => ({
  id,
  name,
  balance: 0,
  currency: 'USD',
  overdraftLimit: null,
  subtype: { type },
  status: 'Opened',
  version: 1,
});
const accounts = [acct('cash-1', 'Wallet', 'cash'), acct('bank-1', 'Checking', 'bankAccount')];

describe('DefaultAccountsCard', () => {
  it('per-type row lists only matching subtype and PUTs the full map', async () => {
    let body: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/defaults`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(
      <AuthProvider>
        <DefaultAccountsCard accounts={accounts} accountCurrent={null} subtypeCurrent={{}} />
      </AuthProvider>,
    );
    const user = userEvent.setup();

    // The Cash row must not offer the bank account.
    const cashRow = screen.getByRole('combobox', { name: 'Cash default account' });
    await user.click(cashRow);
    // Panel content is async; wait for the matching option, then assert the non-match is absent.
    await user.click(await screen.findByRole('option', { name: 'Wallet' }));
    // Re-open to inspect options (selection closes the panel).
    await user.click(cashRow);
    expect(screen.queryByRole('option', { name: 'Checking' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(body).toEqual({ subtypeAccounts: { CashKind: 'cash-1' } }));
  });
});
```

(Session + `AuthProvider` required for `useUpdateDefaults`. Use `getByRole('combobox', { name })` + `await findByRole('option', ...)`; model on `DefaultCategoryField.test.tsx`. The label text must match the component: `` `${ACCOUNT_SUBTYPE_LABELS[k]} default account` `` → for `cash` that is `Cash default account`.)

- [ ] **Step 2: Run — expect FAIL**

Run: `pnpm exec vitest run src/features/profile/DefaultAccountsCard.test.tsx`

- [ ] **Step 3: Implement**

```tsx
import { useState } from 'react';
import type {
  AccountResponse,
  UUID,
  UpdateDefaultsRequest,
  BackendSubtypeKind,
  AccountSubtypeKind,
} from '@/api/types';
import { ACCOUNT_SUBTYPE_KINDS } from '@/api/types';
import {
  toBackendSubtypeKind,
  fromBackendSubtypeKind,
  isSelectableDefaultAccount,
} from '@/api/defaults';
import { ACCOUNT_SUBTYPE_LABELS } from '@/features/accounts/labels';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useUpdateDefaults } from '@/features/configuration/useUpdateDefaults';
import { AccountSelect, NONE_VALUE } from './AccountSelect';

interface Props {
  accounts: AccountResponse[];
  accountCurrent: UUID | null;
  subtypeCurrent: Partial<Record<BackendSubtypeKind, UUID>>;
}

export function DefaultAccountsCard({ accounts, accountCurrent, subtypeCurrent }: Props) {
  const update = useUpdateDefaults();
  const selectable = accounts.filter(isSelectableDefaultAccount);

  const [account, setAccount] = useState<string>(accountCurrent ?? '');
  const initialRows = Object.fromEntries(
    ACCOUNT_SUBTYPE_KINDS.map((k) => [k, subtypeCurrent[toBackendSubtypeKind(k)] ?? NONE_VALUE]),
  ) as Record<AccountSubtypeKind, string>;
  const [rows, setRows] = useState<Record<AccountSubtypeKind, string>>(initialRows);

  const dirty =
    account !== (accountCurrent ?? '') ||
    ACCOUNT_SUBTYPE_KINDS.some((k) => rows[k] !== initialRows[k]);

  const save = () => {
    const subtypeAccounts: Partial<Record<BackendSubtypeKind, UUID>> = {};
    for (const k of ACCOUNT_SUBTYPE_KINDS) {
      const v = rows[k];
      if (v && v !== NONE_VALUE) subtypeAccounts[toBackendSubtypeKind(k)] = v;
    }
    const body: UpdateDefaultsRequest = { subtypeAccounts };
    if (account && account !== accountCurrent) body.account = account;
    update.mutate(body);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Default accounts</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <label htmlFor="default-account" className="w-44 text-sm font-medium">
            Default account
          </label>
          <AccountSelect
            id="default-account"
            label="Default account"
            value={account}
            accounts={selectable}
            includeNone={false}
            onChange={setAccount}
          />
        </div>
        <div className="space-y-3 border-t pt-4">
          {ACCOUNT_SUBTYPE_KINDS.map((k) => (
            <div key={k} className="flex items-center gap-3">
              <label htmlFor={`default-${k}`} className="w-44 text-sm font-medium">
                {ACCOUNT_SUBTYPE_LABELS[k]} default account
              </label>
              <AccountSelect
                id={`default-${k}`}
                label={`${ACCOUNT_SUBTYPE_LABELS[k]} default account`}
                value={rows[k]}
                includeNone
                accounts={selectable.filter((a) => a.subtype?.type === k)}
                onChange={(v) => setRows((prev) => ({ ...prev, [k]: v }))}
              />
            </div>
          ))}
        </div>
        <Button type="button" onClick={save} disabled={!dirty || update.isPending}>
          {update.isPending ? 'Saving…' : 'Save'}
        </Button>
        {update.error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{update.error.message}</AlertDescription>
          </Alert>
        )}
        {update.isSuccess && <p className="text-sm text-green-600">Updated.</p>}
      </CardContent>
    </Card>
  );
}
```

Note the label wording (`Cash default account`) — align the test's `getByLabelText` with `${ACCOUNT_SUBTYPE_LABELS[k]} default account` (label for `cash` is `Cash`).

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm exec vitest run src/features/profile/DefaultAccountsCard.test.tsx`

- [ ] **Step 5: Commit**

```bash
git add src/features/profile/DefaultAccountsCard.tsx src/features/profile/DefaultAccountsCard.test.tsx
git commit -m "feat(profile): default accounts card (global + per-type)"
```

---

## Task 6: `ProfileDefaultsPane`

(The old Default categories card and `DefaultCategoryField` were already removed in Task 1 — this task only adds the new pane.)

**Files:**

- Create: `src/features/profile/ProfileDefaultsPane.tsx`
- Test: `src/features/profile/ProfileDefaultsPane.test.tsx`

- [ ] **Step 1: Write the failing pane test**

```tsx
import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import { ProfileDefaultsPane } from './ProfileDefaultsPane';

describe('ProfileDefaultsPane', () => {
  it('renders both defaults cards once loaded', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(
      <AuthProvider>
        <ProfileDefaultsPane />
      </AuthProvider>,
    );
    expect(await screen.findByText('Default categories')).toBeInTheDocument();
    expect(await screen.findByText('Default accounts')).toBeInTheDocument();
  });
});
```

(The default `GET /configuration` and `GET /accounts` handlers in `handlers.ts` (line ~74 for accounts) resolve because `saveSession` + `AuthProvider` enable the `enabled: !!session` queries.)

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `ProfileDefaultsPane.tsx`**

```tsx
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { useAccounts } from '@/features/accounts/useAccounts';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { DefaultCategoriesCard } from './DefaultCategoriesCard';
import { DefaultAccountsCard } from './DefaultAccountsCard';

export function ProfileDefaultsPane() {
  const config = useConfiguration();
  const accounts = useAccounts();

  if (config.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40" />
        <Skeleton className="h-64" />
      </div>
    );
  }
  if (config.isError || !config.data) {
    return (
      <Alert variant="destructive" role="alert">
        <AlertDescription>Failed to load configuration.</AlertDescription>
      </Alert>
    );
  }
  const c = config.data;
  return (
    <div className="space-y-6">
      <DefaultCategoriesCard
        incomeCurrent={c.defaults.incomeCategory}
        expenseCurrent={c.defaults.expenseCategory}
        incomeCategories={c.dictionaries['income-category']?.entries ?? []}
        expenseCategories={c.dictionaries['expense-category']?.entries ?? []}
      />
      <DefaultAccountsCard
        accounts={accounts.data ?? []}
        accountCurrent={c.defaults.account}
        subtypeCurrent={c.defaults.subtypeAccounts}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run — expect PASS**

Run: `pnpm exec vitest run src/features/profile/ProfileDefaultsPane.test.tsx`
Expected: PASS.

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/profile/ProfileDefaultsPane.tsx src/features/profile/ProfileDefaultsPane.test.tsx
git commit -m "feat(profile): defaults pane composing both cards"
```

---

## Task 7: Wire the Defaults tab into `ProfilePage`

**Files:**

- Modify: `src/pages/ProfilePage.tsx`

- [ ] **Step 1: Add the tab**

- Add `'defaults'` to `STATIC_TABS` (line 11): `['general', 'dictionaries', 'defaults', 'auth']`.
- Import `ProfileDefaultsPane`.
- Add `<TabsTrigger value="defaults">Defaults</TabsTrigger>` after the Dictionaries trigger (line 67).
- Add:

  ```tsx
  <TabsContent value="defaults">
    <ProfileDefaultsPane />
  </TabsContent>
  ```

  after the Dictionaries content.

- [ ] **Step 2: Verify**

Run: `pnpm typecheck && pnpm exec vitest run src/pages src/features/profile`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/pages/ProfilePage.tsx
git commit -m "feat(profile): add Defaults tab"
```

---

## Task 8: Full verification

- [ ] **Step 1: Run the complete gate**

Run: `just check && just test`
Expected: typecheck + lint + format-check pass; all Vitest tests pass.

- [ ] **Step 2: Manual smoke (optional but recommended)**

Use the `verify` or `run` skill: start the app, open `/app/profile/defaults`, confirm both cards render, per-type dropdowns list only matching-subtype accounts, and Save persists (network tab shows the nested PUT body).

- [ ] **Step 3: Final commit / open PR**

Per `superpowers:finishing-a-development-branch`.

---

## Notes on test harness paths (confirmed against the repo)

Use these exact imports/values in every new test — verified in `DefaultCategoryField.test.tsx`:

- Render helper: `import { renderWithProviders } from '@/test/utils'`.
- MSW server: `import { server } from '@/test/server'`.
- Session/auth: `import { saveSession } from '@/auth/storage'` and `import { AuthProvider } from '@/auth/AuthContext'`; call `saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 })` and wrap the component in `<AuthProvider>` **before** any hook that reads `useAuth()` (all the config/accounts/mutation hooks do).
- `apiBase` is **not** exported from `handlers.ts` — declare `const apiBase = 'http://localhost:8080';` locally in each test.
- shadcn `Select` in happy-dom: grab the trigger with `screen.getByRole('combobox', { name })`, click it, then `await screen.findByRole('option', { name })` (options mount asynchronously in a portal — never assert options synchronously right after the click). Pointer-capture polyfills live in `src/test/setup.ts`; do not touch them.
- Do **not** model Select interactions on `AdjustBalanceDialog.test.tsx` — that dialog uses a native `<select>` (`userEvent.selectOptions`), a different API.
