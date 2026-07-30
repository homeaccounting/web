# Account-as-a-Filter (all / subset / single scope) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Demote the transactions "account" from a mandatory single scope to a filter, so the user can view all accounts, a selected subset, or a single account on a canonical `/transactions` route.

**Architecture:** Account scope lives in the URL query param `accounts` (absent = all, `a1` = single, `a1,a2` = subset), parsed by a new pure `accountScope.ts`. `useScopedTransactions` picks the right existing fetch hook (single → `useWindowedTransactions`, all/subset → `useAllAccountsWindowedTransactions`, subset client-filtered). `TransactionsPane` renders an Account column and scope header when >1 account is in view; the sidebar and a new `AccountMultiSelect` chip both write the `accounts` param. No backend change.

**Tech Stack:** React 18 + TypeScript (strict), react-router-dom v6, TanStack Query, Vitest + Testing Library + happy-dom + MSW, Playwright.

**Spec:** `docs/specs/2026-07-30-transactions-account-scope-design.md`

---

## File Structure

**New files**
- `src/features/transactions/accountScope.ts` — scope type; `parseAccountScope`, `scopeToParam`, `withAccountScope`, `isSingleAccount`, `scopeSpansMultiple`, `accountsOf`, `transactionInScope`.
- `src/features/transactions/accountScope.test.ts`
- `src/features/transactions/transactionDisplayAmount.ts` — `transactionDisplayAmount(t, viewedAccountId)` and `transactionAccountCell(t)`.
- `src/features/transactions/transactionDisplayAmount.test.ts`
- `src/features/transactions/useScopedTransactions.ts` — scope-driven fetch wrapper.
- `src/features/transactions/useScopedTransactions.test.tsx`
- `src/features/transactions/AccountMultiSelect.tsx` — multi-select chip over accounts.
- `src/features/transactions/AccountMultiSelect.test.tsx`
- `src/features/transactions/ScopeHeader.tsx` — all/subset header (name row without balance).
- `src/pages/AccountRedirect.tsx` — `/accounts/:id` → `/transactions?accounts=:id` redirect.

**Modified files**
- `src/features/transactions/lastView.ts` — `accountId: string` → `accounts: 'all' | UUID[]` + migration.
- `src/features/transactions/lastView.test.ts`
- `src/App.tsx` — add `/transactions`; redirect `/accounts/:id`, `/accounts`, `/`.
- `src/pages/HomePage.tsx` — restore logic targets `/transactions`.
- `src/features/transactions/TransactionsPane.tsx` — scope parsing, `useScopedTransactions`, Account column, header variant, ControlBar/QuickAdd gating, persistence.
- `src/features/transactions/TransactionFilterBar.tsx` — account chip props.
- `src/features/accounts/AccountsPane.tsx` — "All accounts" row + scope-driven active states + links to `/transactions?accounts=:id`.
- `e2e/` — new smoke spec.

**Convention reminders**
- Import via `@/…` (no deep relative paths). Run `just check` (typecheck + lint + format-check) and `just test` before each commit-heavy task. Commit after every task.
- `TransactionResponse` fields used: `transactionType`, `status`, `sourceAccountId`, `targetAccountId`, `sourceAmount`, `targetAmount`, `sourceCurrency`, `targetCurrency` (see `src/api/types.ts`).

---

## Task 1: `accountScope.ts` — pure scope model

**Files:**
- Create: `src/features/transactions/accountScope.ts`
- Test: `src/features/transactions/accountScope.test.ts`
- Modify: `src/features/transactions/TransactionsPane.tsx` (remove local `affectedAccountIds`, import `accountsOf`)

- [ ] **Step 1: Write the failing test**

```ts
// src/features/transactions/accountScope.test.ts
import { describe, expect, it } from 'vitest';
import type { AccountResponse, TransactionResponse } from '@/api/types';
import {
  accountsOf,
  isSingleAccount,
  parseAccountScope,
  scopeSpansMultiple,
  scopeToParam,
  transactionInScope,
  withAccountScope,
} from './accountScope';

const acct = (id: string): AccountResponse => ({ id }) as AccountResponse;
const accounts = [acct('a1'), acct('a2'), acct('a3')];
const params = (s: string) => new URLSearchParams(s);

const tx = (over: Partial<TransactionResponse>): TransactionResponse =>
  ({
    id: 't',
    transactionType: 'Expense',
    status: 'Completed',
    sourceAccountId: 'a1',
    targetAccountId: 'external',
    ...over,
  }) as TransactionResponse;

describe('parseAccountScope', () => {
  it('treats a missing param as all accounts', () => {
    expect(parseAccountScope(params(''), accounts)).toEqual({ kind: 'all' });
  });
  it('parses a single id', () => {
    expect(parseAccountScope(params('accounts=a1'), accounts)).toEqual({
      kind: 'accounts',
      ids: ['a1'],
    });
  });
  it('parses and dedupes a subset', () => {
    expect(parseAccountScope(params('accounts=a1,a2,a1'), accounts)).toEqual({
      kind: 'accounts',
      ids: ['a1', 'a2'],
    });
  });
  it('drops ids not in the user accounts', () => {
    expect(parseAccountScope(params('accounts=a1,ghost'), accounts)).toEqual({
      kind: 'accounts',
      ids: ['a1'],
    });
  });
  it('falls back to all when a subset filters down to empty', () => {
    expect(parseAccountScope(params('accounts=ghost'), accounts)).toEqual({ kind: 'all' });
  });
  it('keeps raw ids unfiltered while accounts are still loading (undefined)', () => {
    expect(parseAccountScope(params('accounts=a1,ghost'), undefined)).toEqual({
      kind: 'accounts',
      ids: ['a1', 'ghost'],
    });
  });
});

describe('scopeToParam / withAccountScope', () => {
  it('serialises all as null and a subset as a csv', () => {
    expect(scopeToParam({ kind: 'all' })).toBeNull();
    expect(scopeToParam({ kind: 'accounts', ids: ['a1', 'a2'] })).toBe('a1,a2');
  });
  it('overrides (not merges) the accounts param and preserves others', () => {
    const next = withAccountScope(params('accounts=a3&period=this-year'), {
      kind: 'accounts',
      ids: ['a1'],
    });
    expect(next.get('accounts')).toBe('a1');
    expect(next.get('period')).toBe('this-year');
  });
  it('deletes the param for all', () => {
    const next = withAccountScope(params('accounts=a3&period=this-year'), { kind: 'all' });
    expect(next.get('accounts')).toBeNull();
    expect(next.get('period')).toBe('this-year');
  });
});

describe('isSingleAccount / scopeSpansMultiple', () => {
  it('returns the sole id only for a one-element subset', () => {
    expect(isSingleAccount({ kind: 'accounts', ids: ['a1'] })).toBe('a1');
    expect(isSingleAccount({ kind: 'accounts', ids: ['a1', 'a2'] })).toBeNull();
    expect(isSingleAccount({ kind: 'all' })).toBeNull();
  });
  it('spans multiple for all or a 2+ subset', () => {
    expect(scopeSpansMultiple({ kind: 'all' })).toBe(true);
    expect(scopeSpansMultiple({ kind: 'accounts', ids: ['a1', 'a2'] })).toBe(true);
    expect(scopeSpansMultiple({ kind: 'accounts', ids: ['a1'] })).toBe(false);
  });
});

describe('accountsOf / transactionInScope', () => {
  it('income touches the target, expense the source, transfer both', () => {
    expect(accountsOf(tx({ transactionType: 'Income', targetAccountId: 'a2' }))).toEqual(['a2']);
    expect(accountsOf(tx({ transactionType: 'Expense', sourceAccountId: 'a1' }))).toEqual(['a1']);
    expect(
      accountsOf(tx({ transactionType: 'Transfer', sourceAccountId: 'a1', targetAccountId: 'a2' })),
    ).toEqual(['a1', 'a2']);
  });
  it('is always true for all scope; intersects ids otherwise', () => {
    const t = tx({ transactionType: 'Transfer', sourceAccountId: 'a1', targetAccountId: 'a2' });
    expect(transactionInScope(t, { kind: 'all' })).toBe(true);
    expect(transactionInScope(t, { kind: 'accounts', ids: ['a2'] })).toBe(true);
    expect(transactionInScope(t, { kind: 'accounts', ids: ['a3'] })).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/accountScope.test.ts`
Expected: FAIL — cannot find module `./accountScope`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/transactions/accountScope.ts
import type { AccountResponse, TransactionResponse, UUID } from '@/api/types';
import { isAdjustment, isIncome, isTransfer } from './transactionType';

// Account scope is carried in the `accounts` URL query param and is the single
// source of truth for which accounts the transactions list shows. Absent param
// = all accounts; a csv of ids = that subset (a single id is a one-element set).
export type AccountScope = { kind: 'all' } | { kind: 'accounts'; ids: UUID[] };

const ALL: AccountScope = { kind: 'all' };

function dedupe(ids: UUID[]): UUID[] {
  return [...new Set(ids)];
}

// Parse the `accounts` param into a scope. `accounts` is the loaded account
// list; pass `undefined` while it is still loading so a valid subset is not
// transiently emptied to "all" — unknown-id filtering only runs once loaded.
export function parseAccountScope(
  params: URLSearchParams,
  accounts: AccountResponse[] | undefined,
): AccountScope {
  const raw = params.get('accounts');
  if (!raw) return ALL;
  const ids = dedupe(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  if (ids.length === 0) return ALL;
  if (!accounts) return { kind: 'accounts', ids };
  const known = new Set(accounts.map((a) => a.id));
  const filtered = ids.filter((id) => known.has(id));
  return filtered.length ? { kind: 'accounts', ids: filtered } : ALL;
}

// The `accounts` param value for a scope, or null when the param should be
// omitted entirely (all accounts).
export function scopeToParam(scope: AccountScope): string | null {
  return scope.kind === 'all' ? null : scope.ids.join(',');
}

// Set (or clear) the `accounts` param on a copy of `params`, preserving every
// other param (period/from/to). Overrides any existing value — it does not
// merge into the current subset.
export function withAccountScope(params: URLSearchParams, scope: AccountScope): URLSearchParams {
  const next = new URLSearchParams(params);
  const value = scopeToParam(scope);
  if (value) next.set('accounts', value);
  else next.delete('accounts');
  return next;
}

// The sole account id when exactly one account is scoped, else null. Drives the
// single-account behaviours (per-account header/balance, create prefill,
// Quick add visibility).
export function isSingleAccount(scope: AccountScope): UUID | null {
  return scope.kind === 'accounts' && scope.ids.length === 1 ? scope.ids[0]! : null;
}

// True when more than one account can appear in the list (all, or a 2+ subset)
// — the condition for showing the Account column and the multi-account header.
export function scopeSpansMultiple(scope: AccountScope): boolean {
  return scope.kind === 'all' || scope.ids.length > 1;
}

// The account ids a transaction touches: income → its target, expense → its
// source, transfer/adjustment → both legs. (Moved from TransactionsPane; the
// subset filter and cache-patch derivation share this one definition.)
export function accountsOf(t: TransactionResponse): UUID[] {
  if (isTransfer(t.transactionType) || isAdjustment(t.transactionType)) {
    return [t.sourceAccountId, t.targetAccountId];
  }
  return [isIncome(t.transactionType) ? t.targetAccountId : t.sourceAccountId];
}

// Whether a transaction belongs in the current scope (always true for all).
export function transactionInScope(t: TransactionResponse, scope: AccountScope): boolean {
  if (scope.kind === 'all') return true;
  const ids = new Set(scope.ids);
  return accountsOf(t).some((id) => ids.has(id));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/accountScope.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Replace the local `affectedAccountIds` in `TransactionsPane.tsx`**

In `src/features/transactions/TransactionsPane.tsx`: delete the local `affectedAccountIds` function (currently ~lines 107-114) and add `accountsOf` to the `./accountScope` import. Then replace every `affectedAccountIds(` call with `accountsOf(`.

Run: `grep -n "affectedAccountIds" src/features/transactions/TransactionsPane.tsx` — expect no matches after editing.

- [ ] **Step 6: Run the full suite to confirm no regressions**

Run: `pnpm exec vitest run src/features/transactions` and `just check`
Expected: PASS / clean.

- [ ] **Step 7: Commit**

```bash
git add src/features/transactions/accountScope.ts src/features/transactions/accountScope.test.ts src/features/transactions/TransactionsPane.tsx
git commit -m "feat(transactions): add account-scope model (all/subset/single)"
```

---

## Task 2: `transactionDisplayAmount.ts` — amount leg + account cell

**Files:**
- Create: `src/features/transactions/transactionDisplayAmount.ts`
- Test: `src/features/transactions/transactionDisplayAmount.test.ts`

Behaviour (from spec §"List — Account column & amount"):
- **Single scope** (`viewedAccountId` provided): preserve today's leg logic exactly — `isTarget ? +targetAmount : −sourceAmount`, currency from that leg.
- **Multi/all scope** (`viewedAccountId` null): income → `+targetAmount`/targetCurrency; expense → `−sourceAmount`/sourceCurrency; transfer/adjustment → `+sourceAmount`/sourceCurrency (unsigned magnitude, direction is shown by the From→To cell).
- **Colour** always via `transactionAmountClass` (income green, expense red, transfer/adjustment neutral) — independent of scope.

- [ ] **Step 1: Write the failing test**

```ts
// src/features/transactions/transactionDisplayAmount.test.ts
import { describe, expect, it } from 'vitest';
import type { TransactionResponse } from '@/api/types';
import { transactionAccountCell, transactionDisplayAmount } from './transactionDisplayAmount';

const tx = (over: Partial<TransactionResponse>): TransactionResponse =>
  ({
    id: 't',
    transactionType: 'Expense',
    status: 'Completed',
    sourceAccountId: 'a1',
    targetAccountId: 'ext',
    sourceAmount: 4.5,
    targetAmount: 4.5,
    sourceCurrency: 'USD',
    targetCurrency: 'USD',
    ...over,
  }) as TransactionResponse;

describe('transactionDisplayAmount — multi/all scope (viewedAccountId null)', () => {
  it('income → +target, green', () => {
    const t = tx({ transactionType: 'Income', targetAccountId: 'a1', targetAmount: 2000 });
    expect(transactionDisplayAmount(t, null)).toEqual({
      amount: 2000,
      currency: 'USD',
      colorClass: 'text-positive',
    });
  });
  it('expense → −source, red', () => {
    expect(transactionDisplayAmount(tx({ sourceAmount: 4.5 }), null)).toEqual({
      amount: -4.5,
      currency: 'USD',
      colorClass: 'text-negative',
    });
  });
  it('transfer → +source magnitude, neutral', () => {
    const t = tx({ transactionType: 'Transfer', sourceAccountId: 'a1', targetAccountId: 'a2', sourceAmount: 500 });
    expect(transactionDisplayAmount(t, null)).toEqual({
      amount: 500,
      currency: 'USD',
      colorClass: '',
    });
  });
});

describe('transactionDisplayAmount — single scope preserves leg logic', () => {
  it('shows the target leg when viewing the target account', () => {
    const t = tx({ transactionType: 'Transfer', sourceAccountId: 'a1', targetAccountId: 'a2', targetAmount: 500, targetCurrency: 'EUR' });
    expect(transactionDisplayAmount(t, 'a2')).toEqual({ amount: 500, currency: 'EUR', colorClass: '' });
  });
  it('shows the negated source leg when viewing the source account', () => {
    const t = tx({ transactionType: 'Transfer', sourceAccountId: 'a1', targetAccountId: 'a2', sourceAmount: 500 });
    expect(transactionDisplayAmount(t, 'a1')).toEqual({ amount: -500, currency: 'USD', colorClass: '' });
  });
});

describe('transactionAccountCell', () => {
  it('income → target only', () => {
    expect(transactionAccountCell(tx({ transactionType: 'Income', targetAccountId: 'a2' }))).toEqual({ fromId: 'a2' });
  });
  it('expense → source only', () => {
    expect(transactionAccountCell(tx({ sourceAccountId: 'a1' }))).toEqual({ fromId: 'a1' });
  });
  it('transfer → source → target', () => {
    expect(
      transactionAccountCell(tx({ transactionType: 'Transfer', sourceAccountId: 'a1', targetAccountId: 'a2' })),
    ).toEqual({ fromId: 'a1', toId: 'a2' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/transactionDisplayAmount.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/features/transactions/transactionDisplayAmount.ts
import type { TransactionResponse, UUID } from '@/api/types';
import { isAdjustment, isExpense, isIncome, isTransfer, transactionAmountClass } from './transactionType';

export interface DisplayAmount {
  amount: number; // signed for income/expense; positive magnitude for transfer/adjustment
  currency: string;
  colorClass: string; // '' | 'text-positive' | 'text-negative'
}

// The amount to show for a row. `viewedAccountId` is the single scoped account
// (or null in multi/all scope). Single scope keeps the historical viewed-leg
// logic; multi/all uses a scope-independent per-type rule.
export function transactionDisplayAmount(
  t: TransactionResponse,
  viewedAccountId: UUID | null,
): DisplayAmount {
  const colorClass = transactionAmountClass(t.transactionType);
  if (viewedAccountId) {
    const isTarget = t.targetAccountId === viewedAccountId && t.sourceAccountId !== viewedAccountId;
    return {
      amount: isTarget ? t.targetAmount : -t.sourceAmount,
      currency: isTarget ? t.targetCurrency : t.sourceCurrency,
      colorClass,
    };
  }
  if (isIncome(t.transactionType)) {
    return { amount: t.targetAmount, currency: t.targetCurrency, colorClass };
  }
  if (isExpense(t.transactionType)) {
    return { amount: -t.sourceAmount, currency: t.sourceCurrency, colorClass };
  }
  // transfer / adjustment: neutral magnitude on the source leg; the Account
  // column's "from → to" conveys direction.
  return { amount: t.sourceAmount, currency: t.sourceCurrency, colorClass };
}

export interface AccountCell {
  fromId: UUID;
  toId?: UUID; // present ⇒ render "from → to" (transfer / adjustment)
}

// Which account(s) label a row: income → target, expense → source,
// transfer/adjustment → source → target.
export function transactionAccountCell(t: TransactionResponse): AccountCell {
  if (isTransfer(t.transactionType) || isAdjustment(t.transactionType)) {
    return { fromId: t.sourceAccountId, toId: t.targetAccountId };
  }
  return { fromId: isIncome(t.transactionType) ? t.targetAccountId : t.sourceAccountId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/transactionDisplayAmount.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/transactionDisplayAmount.ts src/features/transactions/transactionDisplayAmount.test.ts
git commit -m "feat(transactions): amount-leg + account-cell helpers for multi-account view"
```

---

## Task 3: `lastView.ts` — persist scope instead of a single id

**Files:**
- Modify: `src/features/transactions/lastView.ts`
- Test: `src/features/transactions/lastView.test.ts` (extend)

`TxLastView.accountId: string` becomes `accounts: 'all' | UUID[]`. `readLastView` migrates the old `{ accountId }` shape to `['<id>']`; missing/invalid → `'all'`.

- [ ] **Step 1: Write the failing test** (append to `lastView.test.ts`)

```ts
import { describe, expect, it, beforeEach } from 'vitest';
import { readLastView, writeLastView, TX_LAST_VIEW_KEY } from './lastView';

const EMPTY_FILTERS = {
  description: '',
  labelIds: [],
  category: '',
  contactId: '',
  showCancelledFailed: false,
};

describe('lastView scope migration', () => {
  beforeEach(() => localStorage.clear());

  it('reads a stored all-accounts scope', () => {
    writeLastView({ accounts: 'all', period: 'this-month', filters: EMPTY_FILTERS });
    expect(readLastView()?.accounts).toBe('all');
  });

  it('reads a stored subset scope', () => {
    writeLastView({ accounts: ['a1', 'a2'], period: 'this-month', filters: EMPTY_FILTERS });
    expect(readLastView()?.accounts).toEqual(['a1', 'a2']);
  });

  it('migrates the legacy { accountId } shape to a one-element subset', () => {
    localStorage.setItem(
      TX_LAST_VIEW_KEY,
      JSON.stringify({ accountId: 'a9', period: 'this-month', filters: EMPTY_FILTERS }),
    );
    expect(readLastView()?.accounts).toEqual(['a9']);
  });

  it('returns null when neither accounts nor accountId is present', () => {
    localStorage.setItem(
      TX_LAST_VIEW_KEY,
      JSON.stringify({ period: 'this-month', filters: EMPTY_FILTERS }),
    );
    expect(readLastView()).toBeNull();
  });
});
```

> Note: the existing `lastView.test.ts` cases assert `accountId`; update those to the new `accounts` shape as part of this step (they should now read/write `accounts`).

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/lastView.test.ts`
Expected: FAIL (type/shape mismatch).

- [ ] **Step 3: Implement the new shape + migration**

Edit `src/features/transactions/lastView.ts`:

```ts
export interface TxLastView {
  accounts: 'all' | string[]; // 'all' = every account; a list = that subset (one id = single)
  period: PeriodValue;
  from?: string;
  to?: string;
  filters: TransactionFilters;
}

// Read the persisted scope, tolerant of the legacy `{ accountId: string }`
// shape (a single-account view before account-as-a-filter): it maps to a
// one-element subset. Returns null when no usable scope is present.
function readAccounts(o: Record<string, unknown>): 'all' | string[] | null {
  if (o.accounts === 'all') return 'all';
  if (Array.isArray(o.accounts) && o.accounts.every((x) => typeof x === 'string')) {
    return o.accounts as string[];
  }
  if (typeof o.accountId === 'string' && o.accountId !== '') return [o.accountId];
  return null;
}
```

In `readLastView`, replace the `accountId` checks with:

```ts
const accounts = readAccounts(o);
if (
  o &&
  typeof o === 'object' &&
  accounts !== null &&
  PERIODS.includes(o.period as PeriodValue) &&
  isFilters(o.filters)
) {
  const v: TxLastView = { accounts, period: o.period as PeriodValue, filters: o.filters };
  if (typeof o.from === 'string') v.from = o.from;
  if (typeof o.to === 'string') v.to = o.to;
  return v;
}
```

`writeLastView` is unchanged (it serialises whatever `TxLastView` it is given).

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/lastView.test.ts`
Expected: PASS.

> `HomePage.tsx` and `TransactionsPane.tsx` still reference `lastView.accountId` and will now fail to typecheck — they are updated in Tasks 4 and 9. Do not run `just check` until those land; `just test` for this file is green.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/lastView.ts src/features/transactions/lastView.test.ts
git commit -m "feat(transactions): persist account scope (all/subset) with legacy migration"
```

---

## Task 4: Routing — `/transactions` canonical + redirects

**Files:**
- Create: `src/pages/AccountRedirect.tsx`
- Modify: `src/App.tsx`, `src/pages/HomePage.tsx`
- Test: `src/pages/HomePage.test.tsx` (adjust), plus a small `AccountRedirect` test

- [ ] **Step 1: Write the redirect component**

```tsx
// src/pages/AccountRedirect.tsx
import { Navigate, useParams, useSearchParams } from 'react-router-dom';

// Permanent redirect for legacy single-account deep links:
//   /accounts/:id[?period…] → /transactions?accounts=:id[&period…]
// Preserves the existing period/from/to search and sets a fresh single scope.
export default function AccountRedirect() {
  const { id } = useParams<{ id: string }>();
  const [params] = useSearchParams();
  const next = new URLSearchParams(params);
  if (id) next.set('accounts', id);
  return <Navigate to={{ pathname: '/transactions', search: `?${next.toString()}` }} replace />;
}
```

- [ ] **Step 2: Update `App.tsx`**

```tsx
// imports
import AccountRedirect from '@/pages/AccountRedirect';

// inside <ProtectedRoute>:
<Route path="/" element={<HomePage />} />
<Route path="/transactions" element={<HomePage />} />
<Route path="/accounts" element={<Navigate to="/transactions" replace />} />
<Route path="/accounts/:id" element={<AccountRedirect />} />
{/* reports / profile unchanged */}
```

(`/` stays rendering `HomePage`; it restores-then-redirects into `/transactions` — see Step 3.)

- [ ] **Step 3: Update `HomePage.tsx` restore logic**

Replace `useRestoreLastAccount` so, on bare `/`, it redirects to `/transactions` reconstructing the persisted scope + period. All-scope (or no last view) → `/transactions` with just the period; a subset → `?accounts=…`.

```tsx
import { readLastView } from '@/features/transactions/lastView';
import { periodParamsToSearch } from '@/lib/period';
import { useAccounts } from '@/features/accounts/useAccounts';
import { scopeToParam } from '@/features/transactions/accountScope';

function useRestoreLastView() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const accounts = useAccounts();
  useEffect(() => {
    if (pathname !== '/' || !accounts.isSuccess) return;
    const lv = readLastView();
    const search = new URLSearchParams(
      lv ? periodParamsToSearch(lv.period, { from: lv.from ?? '', to: lv.to ?? '' }) : '',
    );
    if (lv) {
      // Drop stored ids no longer present; empty subset ⇒ all (omit param).
      const known = new Set(accounts.data?.map((a) => a.id));
      const ids = lv.accounts === 'all' ? [] : lv.accounts.filter((id) => known.has(id));
      const param = scopeToParam(ids.length ? { kind: 'accounts', ids } : { kind: 'all' });
      if (param) search.set('accounts', param);
    }
    const qs = search.toString();
    navigate(`/transactions${qs ? `?${qs}` : ''}`, { replace: true });
  }, [pathname, accounts.isSuccess, accounts.data, navigate]);
}
```

Swap the `useParams`/`id` import for `useLocation`, and call `useRestoreLastView()` in `HomePage`. The two-pane JSX (`<AccountsPane/>` + `<TransactionsPane/>`) is unchanged.

- [ ] **Step 4a: Write `AccountRedirect.test.tsx`**

Render `AccountRedirect` inside a `MemoryRouter` at `/accounts/a1?period=this-year` with a catch-all route that records the landed location; assert it lands on `/transactions?accounts=a1&period=this-year`. Add a second case: an existing `?accounts=` on the legacy URL is overridden by `:id`.

- [ ] **Step 4b: Adjust `HomePage.test.tsx`**

The existing tests assert a redirect from `/` to `/accounts/:id`. Update them to expect the redirect target `/transactions?accounts=<id>` (or `/transactions` for the deleted-account / no-last-view case). Keep the same fixtures; only the expected URL changes.

- [ ] **Step 5: Run the tests**

Run: `pnpm exec vitest run src/pages/HomePage.test.tsx src/pages/AccountRedirect.test.tsx`
Expected: PASS. (`just check` still red until Task 9 finishes TransactionsPane.)

- [ ] **Step 6: Commit**

```bash
git add src/pages/AccountRedirect.tsx src/App.tsx src/pages/HomePage.tsx src/pages/HomePage.test.tsx src/pages/AccountRedirect.test.tsx
git commit -m "feat(routing): canonical /transactions route + legacy /accounts redirects"
```

---

## Task 5: `useScopedTransactions` — scope-driven fetch

**Files:**
- Create: `src/features/transactions/useScopedTransactions.ts`
- Test: `src/features/transactions/useScopedTransactions.test.tsx`

Wraps the two existing hooks. React rule: call **both** hooks unconditionally (one disabled) — never call a hook behind a runtime branch. Single scope enables the per-account query; all/subset enable the all-accounts query and (for subset) client-filter with `transactionInScope`.

- [ ] **Step 1: Write the failing test**

Reuse the **exact** hook-test harness from `useWindowedTransactions.test.tsx` — `renderHook` from `@testing-library/react` and the local `makeWrapper()` that mounts `AuthContext.Provider` with `{ tokenRef, session, signIn, signOut }` (there is **no** `renderHook`/`auth` helper in `@/test/utils`; do not invent one). The API base in those tests is the literal `const apiBase = 'http://localhost:8080'`.

```tsx
// src/features/transactions/useScopedTransactions.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { server } from '@/test/server';
import { AuthContext } from '@/auth/AuthContext';
import { useScopedTransactions } from './useScopedTransactions';

const apiBase = 'http://localhost:8080';

// Copied verbatim from useWindowedTransactions.test.tsx.
function makeWrapper(client = new QueryClient()) {
  const ctx = {
    tokenRef: { current: 't' },
    session: { userId: 'u', email: 'a@b' } as never,
    signIn: vi.fn(),
    signOut: vi.fn(),
  } as never;
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={ctx}>{children}</AuthContext.Provider>
      </QueryClientProvider>
    );
  };
}
const wrapper = makeWrapper();

// Handler shape: GET {apiBase}/api/transactions → { transactions, totalCount, limit, offset }
describe('useScopedTransactions', () => {
  it('subset filters the all-accounts result to rows touching the selected ids', async () => {
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            { id: 't1', transactionType: 'Expense', status: 'Completed', sourceAccountId: 'a1', targetAccountId: 'ext' },
            { id: 't2', transactionType: 'Income', status: 'Completed', sourceAccountId: 'ext', targetAccountId: 'a2' },
            { id: 't3', transactionType: 'Expense', status: 'Completed', sourceAccountId: 'a3', targetAccountId: 'ext' },
          ],
          totalCount: 3,
          limit: 200,
          offset: 0,
        }),
      ),
    );
    const { result } = renderHook(
      () => useScopedTransactions({ kind: 'accounts', ids: ['a1', 'a2'] }, '2026-05-01', '2026-05-31'),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((t) => t.id)).toEqual(['t1', 't2']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/useScopedTransactions.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
// src/features/transactions/useScopedTransactions.ts
import { useMemo } from 'react';
import type { TransactionResponse } from '@/api/types';
import type { AccountScope } from './accountScope';
import { isSingleAccount, transactionInScope } from './accountScope';
import { useAllAccountsWindowedTransactions, useWindowedTransactions } from './useWindowedTransactions';

// Fetch the date-bounded transactions for an account scope. Both underlying
// queries are always called (React hook rules); only the one matching the scope
// is enabled. Subsets reuse the cached all-accounts result and filter client
// side — the backend has no multi-account query param (see spec).
export function useScopedTransactions(scope: AccountScope, fromDate: string, toDate: string) {
  const single = isSingleAccount(scope);
  const singleQuery = useWindowedTransactions(single ?? undefined, fromDate, toDate);
  const allQuery = useAllAccountsWindowedTransactions(fromDate, toDate);
  const active = single ? singleQuery : allQuery;

  const data = useMemo<TransactionResponse[] | undefined>(() => {
    if (!active.data) return active.data;
    if (single || scope.kind === 'all') return active.data;
    return active.data.filter((t) => transactionInScope(t, scope));
  }, [active.data, single, scope]);

  return { ...active, data };
}
```

> `useWindowedTransactions` already no-ops (`enabled: !!accountId`) when `single` is undefined, so the disabled query never fires.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/useScopedTransactions.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/useScopedTransactions.ts src/features/transactions/useScopedTransactions.test.tsx
git commit -m "feat(transactions): useScopedTransactions (single/all/subset fetch)"
```

---

## Task 6: `AccountMultiSelect` — account chip

**Files:**
- Create: `src/features/transactions/AccountMultiSelect.tsx`
- Test: `src/features/transactions/AccountMultiSelect.test.tsx`

A multi-select over accounts, mirroring `LabelMultiSelect` (typeahead, removable chips, keyboard nav). Options are `AccountResponse[]`; each option's display text is `accountLabel(account, accounts)`. `value` is `UUID[]`; empty = all accounts (placeholder "All accounts").

- [ ] **Step 1: Write the failing test**

```tsx
// src/features/transactions/AccountMultiSelect.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountResponse } from '@/api/types';
import { AccountMultiSelect } from './AccountMultiSelect';

const accounts = [
  { id: 'a1', name: 'Checking', currency: 'USD' },
  { id: 'a2', name: 'Savings', currency: 'USD' },
] as AccountResponse[];

it('shows the "All accounts" placeholder when nothing is selected', () => {
  render(<AccountMultiSelect options={accounts} value={[]} onChange={() => {}} />);
  expect(screen.getByPlaceholderText('All accounts')).toBeInTheDocument();
});

it('adds an account id on pick', async () => {
  const onChange = vi.fn();
  render(<AccountMultiSelect options={accounts} value={[]} onChange={onChange} />);
  await userEvent.click(screen.getByRole('combobox'));
  await userEvent.click(screen.getByRole('option', { name: /Checking/ }));
  expect(onChange).toHaveBeenCalledWith(['a1']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run src/features/transactions/AccountMultiSelect.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** — copy `LabelMultiSelect.tsx` to `AccountMultiSelect.tsx` and adapt:
  - Props: `options: AccountResponse[]`, `value: UUID[]`, `onChange`, optional `containerClassName`.
  - Option label: `const label = (a: AccountResponse) => accountLabel(a, options);` — use it for the filter query match, the chip text, and the option row text (replace every `entry.name` / `opt.name`).
  - Placeholder: `selected.length === 0 ? 'All accounts' : ''`.
  - Keep the `role="combobox"` / `role="option"` / keyboard/mousedown behaviour verbatim.
  - Import `accountLabel` from `@/features/accounts/accountLabel`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run src/features/transactions/AccountMultiSelect.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/AccountMultiSelect.tsx src/features/transactions/AccountMultiSelect.test.tsx
git commit -m "feat(transactions): AccountMultiSelect chip for account filtering"
```

---

## Task 7: Wire the account chip into `TransactionFilterBar`

**Files:**
- Modify: `src/features/transactions/TransactionFilterBar.tsx`
- Test: `src/features/transactions/TransactionFilterBar.test.tsx` (extend)

Account scope is URL-based (distinct from the in-state `TransactionFilters`), so pass it through as separate props rather than folding it into `filters`.

- [ ] **Step 1: Write the failing test** — render `TransactionFilterBar` with `accountOptions`, `accountValue={[]}`, `onAccountChange` spy; assert picking an account calls `onAccountChange(['a1'])` and the "All accounts" placeholder is present.

- [ ] **Step 2: Run it — FAIL** (props don't exist).

- [ ] **Step 3: Implement**

Add to `TransactionFilterBarProps`:

```ts
accountOptions: AccountResponse[];
accountValue: UUID[];
onAccountChange: (ids: UUID[]) => void;
```

Render the chip first in the row (account is the primary filter):

```tsx
<div className="w-64">
  <AccountMultiSelect
    options={accountOptions}
    value={accountValue}
    onChange={onAccountChange}
    containerClassName="h-10 flex-nowrap overflow-x-auto"
  />
</div>
```

Import `AccountMultiSelect` and the `AccountResponse`/`UUID` types.

- [ ] **Step 4: Run tests — PASS.** Also update any existing `TransactionFilterBar.test.tsx` render calls to pass the three new required props.

- [ ] **Step 5: Commit**

```bash
git add src/features/transactions/TransactionFilterBar.tsx src/features/transactions/TransactionFilterBar.test.tsx
git commit -m "feat(transactions): add account filter chip to the filter bar"
```

---

## Task 8: Sidebar — "All accounts" row + scope-driven active state

**Files:**
- Modify: `src/features/accounts/AccountsPane.tsx`
- Test: `src/features/accounts/AccountsPane.test.tsx` (extend or create)

Key change: sidebar rows link to `/transactions?accounts=:id` (overriding the current `accounts` param, preserving other params) and their **active** state is driven by the parsed scope, **not** `NavLink`'s path-based `aria-current` (query params don't affect it). Add an "All accounts" row at the top, active when scope is `all`.

- [ ] **Step 1: Write the failing test**

Render `AccountsPane` at `/transactions?accounts=a1` (via the `MemoryRouter`/render helper) with two accounts in MSW. Assert:
- an "All accounts" link exists with `href="/transactions"`;
- the `a1` row link points to `/transactions?accounts=a1` and is styled active (e.g. has `bg-muted` / `aria-current` substitute — assert via a stable `data-active` attribute you add);
- the "All accounts" row is **not** active.

At `/transactions` (no param) assert "All accounts" is active and no account row is.

> Add a `data-active={isActive ? 'true' : undefined}` attribute to each sidebar link so the test asserts active state without depending on Tailwind classes.

- [ ] **Step 2: Run it — FAIL.**

- [ ] **Step 3: Implement**

In `AccountsPane`:
- Replace `const { id } = useParams(...)` **and** the `useLocation()` usage with scope parsing off `useSearchParams` (commit to `searchParams` as the single representation of the query string — do not also read `location.search`):

```tsx
import { NavLink, useSearchParams } from 'react-router-dom';
import {
  parseAccountScope,
  withAccountScope,
  isSingleAccount,
  type AccountScope,
} from '@/features/transactions/accountScope';

const [searchParams] = useSearchParams();
const scope = parseAccountScope(searchParams, data);
const single = isSingleAccount(scope);

// Helper: the target for a sidebar link, preserving period/from/to and setting
// (or clearing, for all) the `accounts` param. Used by both the "All accounts"
// row and each account row.
const scopeSearch = (next: AccountScope) => {
  const qs = withAccountScope(searchParams, next).toString();
  return qs ? `?${qs}` : '';
};
```

- `selectedAccount` (for the management action buttons) now comes from `single`: `const { data: selectedAccount } = useAccountById(single ?? undefined);` — the account-actions toolbar keeps working only when exactly one account is scoped (unchanged UX: those actions already require a selected account).
- Add the "All accounts" row above the groups:

```tsx
<NavLink
  to={{ pathname: '/transactions', search: scopeSearch({ kind: 'all' }) }}
  data-active={scope.kind === 'all' ? 'true' : undefined}
  className={cn(
    'flex items-center rounded-md px-2 py-1 text-sm hover:bg-muted',
    scope.kind === 'all' && 'bg-muted font-medium',
  )}
>
  All accounts
</NavLink>
```

- In `renderAccountRow`, change the link target and active state to be scope-driven (a single-element subset equal to this row's id):

```tsx
const active = single === a.id;
// NavLink props:
to={{ pathname: '/transactions', search: scopeSearch({ kind: 'accounts', ids: [a.id] }) }}
data-active={active ? 'true' : undefined}
className={cn(
  'flex items-baseline justify-between gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted',
  active && 'bg-muted font-medium',
  isClosed && 'opacity-60',
)}
```

Remove the now-unused `aria-[current=page]` variant (query-param scope doesn't drive `NavLink`'s path-based `aria-current`, so the active state must be the static `active`-derived className above). Keep the `ContextMenuTrigger asChild` wrapper and double-click-to-edit.

> Because the link is cloned by Radix's `asChild` Slot, keep a **static** className computed from `active` (as above) — do not use `NavLink`'s function-form className.

- [ ] **Step 4: Run tests — PASS.**

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/AccountsPane.tsx src/features/accounts/AccountsPane.test.tsx
git commit -m "feat(accounts): sidebar 'All accounts' row + scope-driven selection"
```

---

## Task 9: `TransactionsPane` integration

**Files:**
- Modify: `src/features/transactions/TransactionsPane.tsx`
- Create: `src/features/transactions/ScopeHeader.tsx`
- Test: `src/features/transactions/TransactionsPane.test.tsx` (extend)

This is the integration task; do it as small sub-steps, running `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx` after each.

- [ ] **Step 1: Parse scope; swap the fetch hook**
  - Replace `const { id } = useParams()` with:
    ```tsx
    const [searchParams, setSearchParams] = useSearchParams();
    const { data: accounts } = useAccounts();
    const scope = useMemo(() => parseAccountScope(searchParams, accounts), [searchParams, accounts]);
    const single = isSingleAccount(scope);
    const showAccountColumn = scopeSpansMultiple(scope);
    ```
  - Replace `useWindowedTransactions(id, from, to)` with `useScopedTransactions(scope, dayRange.from, dayRange.to)`.
  - `useAccountById(id)` → `useAccountById(single ?? undefined)` (header/QuickAdd/ControlBar).
  - Build `const accountsById = useMemo(() => new Map((accounts ?? []).map((a) => [a.id, a])), [accounts]);`

- [ ] **Step 2: Header variant**
  - `header = single ? (account ? <AccountHeader account={account}/> : skeleton) : <ScopeHeader scope={scope} accounts={accounts ?? []} />`.
  - `ScopeHeader` renders "All accounts" (scope all) or "N accounts" (subset), no balance. Names available via `title=` tooltip listing `accountLabel`s.

- [ ] **Step 3: Empty-state / gating**
  - Remove the `if (!id) body = "Select an account."` branch — there is always a scope now (all is valid). Loading/error/empty branches stay, keyed off the query state.
  - `showFilterBar`/`showPagination` guards drop the `!!id` condition (always applicable).

- [ ] **Step 4: Account column**
  - Add a `<th>Account</th>` header between Description and Category **only when** `showAccountColumn`.
  - In the row, replace the inline `isTarget`/`amount`/`currency` computation (current ~lines 570-572) with:
    ```tsx
    const { amount, currency, colorClass } = transactionDisplayAmount(t, single);
    ```
    and apply `colorClass` to the amount cell (replacing the existing `transactionAmountClass(...)` usage there).
  - When `showAccountColumn`, render an Account cell from `transactionAccountCell(t)`:
    ```tsx
    const cell = transactionAccountCell(t);
    const from = accountsById.get(cell.fromId);
    const to = cell.toId ? accountsById.get(cell.toId) : undefined;
    // render: {from ? accountLabel(from, accounts) : '—'}{to && <> → {accountLabel(to, accounts)}</>}
    ```
    Use a muted arrow between the two. Guard against unknown ids (external accounts) with a `—` fallback.

- [ ] **Step 5: Create actions + Quick add gating**
  - `<ControlBar selectedAccountId={single ?? undefined} selectedAccount={account} />` (prefill only when single).
  - `{single && <QuickAddPrompt accountId={single} accountName={account?.name} />}` (hidden in multi/all).

- [ ] **Step 6: Persistence**
  - Replace the `writeLastView` effect to persist the scope:
    ```tsx
    useEffect(() => {
      writeLastView({
        accounts: scope.kind === 'all' ? 'all' : scope.ids,
        period: periodValue,
        ...(periodValue === 'custom' ? { from: dayRange.from, to: dayRange.to } : {}),
        filters,
      });
    }, [scope, periodValue, dayRange.from, dayRange.to, filters]);
    ```
    (No `if (!id) return` guard — every scope is persistable.)
  - When the account filter chip changes, write the `accounts` param: pass `onAccountChange={(ids) => setSearchParams(withAccountScope(searchParams, ids.length ? { kind: 'accounts', ids } : { kind: 'all' }), { replace: true })}` and `accountValue={scope.kind === 'all' ? [] : scope.ids}`, `accountOptions={accounts ?? []}` to `TransactionFilterBar`.

- [ ] **Step 7: Tests** — extend `TransactionsPane.test.tsx`:
  - Rendering at `/transactions` (all): rows from multiple accounts appear; an "Account" column header is present; a transfer row shows "from → to"; income shows `+`, expense shows `−`.
  - At `/transactions?accounts=a1` (single): no Account column; `AccountHeader` (with balance) shows; QuickAdd present.
  - At `/transactions?accounts=a1,a2` (subset): Account column present; only rows touching a1/a2 shown; QuickAdd hidden.
  - Changing the account chip updates the URL `accounts` param.
  - **Create dialog without prefill (spec obligation):** in all/subset scope, open a create dialog (e.g. Expense) and assert it renders with **no** account preselected and is usable — the account field is empty/awaiting a pick, not blank-and-broken. (Confirms `selectedAccountId={undefined}` is a supported path in the create dialogs; if a dialog crashes or hides its account field when unset, fix the dialog to require an in-dialog pick.)
  - Use the existing render helper + MSW handlers; add a multi-account transactions handler fixture.

- [ ] **Step 8: Full check**

Run: `just check` and `pnpm exec vitest run src/features/transactions`
Expected: clean + PASS (the whole app now typechecks again).

- [ ] **Step 9: Commit**

```bash
git add src/features/transactions/TransactionsPane.tsx src/features/transactions/ScopeHeader.tsx src/features/transactions/TransactionsPane.test.tsx
git commit -m "feat(transactions): all/subset/single account scope in the transactions pane"
```

---

## Task 10: E2E smoke (Playwright `@local`)

**Files:**
- Create: `e2e/transactions-account-scope.spec.ts`

- [ ] **Step 1: Write the smoke spec** (follow an existing `e2e/*.spec.ts` for auth/setup + the `@local` tag convention)
  - Sign in; navigate to `/app/transactions`.
  - Assert the list shows transactions from more than one account and an "Account" column is visible.
  - Click an account in the sidebar → URL becomes `/transactions?accounts=<id>`; the Account column disappears and the account header (with balance) appears.
  - Open the filter bar, add a second account via the chip → URL has `accounts=<id>,<id2>`; Account column returns.
  - Visit a legacy deep link `/app/accounts/<id>` → lands on `/transactions?accounts=<id>`.

- [ ] **Step 2: Run**

Run: `pnpm exec playwright test e2e/transactions-account-scope.spec.ts` (or the repo's `@local` invocation)
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/transactions-account-scope.spec.ts
git commit -m "test(e2e): account-scope transactions smoke"
```

---

## Final verification

- [ ] `just all` (check + test + build) is green.
- [ ] Manually (or via `/verify`) drive: all-accounts view → Account column + multi-account rows; pick single via sidebar → header/balance + QuickAdd; subset via chip → filtered rows, no QuickAdd; reload restores scope; `/accounts/:id` redirects.
- [ ] All acceptance criteria in the spec are satisfied.

## Notes for the implementer

- **Hook rules:** `useScopedTransactions` must call both underlying query hooks every render (one disabled). Never branch a hook call on scope.
- **Async accounts:** `parseAccountScope(params, accounts)` intentionally keeps raw ids while `accounts` is `undefined` (loading) so a valid subset isn't transiently emptied.
- **Override, not merge:** sidebar links and the chip both go through `withAccountScope`, which replaces the `accounts` param and preserves period/from/to.
- **Unknown/external accounts:** the Account cell renders `—` when an id isn't in `accountsById` (e.g. the External account behind adjustments).
- **Unblocks tracker#44:** cross-account rows now coexist on screen — the transfer-merge web work can proceed after this lands (out of scope here).
