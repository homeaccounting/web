# Close / Unclose Account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user close (hide) an account so it drops out of the accounts list, and reopen it later — with a "Show closed" toggle to reveal closed accounts.

**Architecture:** The backend lifecycle already ships (issue #99): `AccountResponse` carries `status` (`"Opened"`/`"Closed"`), and `POST /api/accounts/:id/{close,reopen}` return `204`. The list endpoint returns _all_ accounts, so hiding closed ones is a client-side view concern. This plan adds: the `status` field in the API types, two API methods, a pair of mutation hooks, a confirmation dialog, a right-click context menu, and `AccountsPane` view changes (toolbar Close/Reopen button, "Show closed" toggle, list partition, one shared reopen error toast).

**Tech Stack:** React 18, TypeScript (strict), TanStack Query, react-router-dom v6, shadcn/ui (`alert-dialog`, `context-menu`, `tooltip`, `button`, `alert`), lucide-react, Vitest + Testing Library + happy-dom + MSW.

Spec: `docs/specs/2026-06-15-close-unclose-account-design.md`.

---

## File Structure

- **Modify** `src/api/types.ts` — add `AccountStatus` type and `status` field on `AccountResponse`.
- **Modify** `src/api/accounts.ts` — add `close(id)` / `reopen(id)` (`POST … → void`).
- **Modify** `src/test/fixtures.ts` — add `status` to `accountFixture`; add `closedAccountFixture`.
- **Modify** `src/test/handlers.ts` — add `POST /api/accounts/:id/close` and `…/reopen` (204); add `status: 'Opened'` to the create-account response body.
- **Create** `src/features/accounts/useAccountStatus.ts` — `useCloseAccount()` and `useReopenAccount()` mutation hooks.
- **Create** `src/features/accounts/CloseAccountDialog.tsx` — confirmation `AlertDialog` with inline error.
- **Create** `src/features/accounts/AccountContextMenu.tsx` — presentational right-click menu emitting Close/Reopen intent.
- **Modify** `src/features/accounts/AccountsPane.tsx` — toolbar Close/Reopen button, "Show closed" toggle, list partition, context-menu wrapping, reopen error toast.
- **Create/Modify** tests: `useAccountStatus.test.tsx`, `CloseAccountDialog.test.tsx`, `AccountContextMenu.test.tsx`; **extend** `AccountsPane.test.tsx`, `src/api/types.test.ts`.

### Conventions to follow

- Run a single test file with `pnpm exec vitest run <path>`; filter by name with `-t "<name>"`.
- Run `just check` (typecheck + lint + format-check) before each commit; `just format` fixes formatting.
- Import from `@/...`, never deep relative paths.
- Mutation hooks construct a fresh `ApiClient` exactly like `useCancelTransaction` (`src/features/transactions/useCancelTransaction.ts`) and invalidate on `onSettled`.
- Right-click in tests: `await user.pointer({ keys: '[MouseRight]', target: row })`, then `screen.findByRole('menuitem', { name: … })` (mirrors `TransactionsPane.test.tsx:243`).
- `client.post<void>(...)` already treats an empty 204 body as `void` (see `src/api/client.ts`).

---

## Task 1: Add `status` to the account API types

**Files:**

- Modify: `src/api/types.ts:88-96` (the `AccountResponse` interface) and the `--- Accounts ---` block above it.
- Modify: `src/test/fixtures.ts:31-39`
- Test: `src/api/types.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `src/api/types.test.ts` (inside the existing top-level `describe`, or add a new one):

```ts
import { accountFixture, closedAccountFixture } from '@/test/fixtures';

describe('AccountResponse status', () => {
  it('carries an Opened/Closed status that round-trips through JSON', () => {
    const parsed = JSON.parse(JSON.stringify(accountFixture));
    expect(parsed.status).toBe('Opened');
    expect(closedAccountFixture.status).toBe('Closed');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/api/types.test.ts`
Expected: FAIL — `closedAccountFixture` is not exported / `status` undefined.

- [ ] **Step 3: Add the type and field**

In `src/api/types.ts`, in the `// --- Accounts ---` section just above `AccountResponse`:

```ts
// Account lifecycle status. Mirrors backend fromAccountStatus
// (../server-infra/src/Web/Types.hs:793-795): every account starts "Opened".
export type AccountStatus = 'Opened' | 'Closed';
```

Then add the field to `AccountResponse` (cite the backend line in a comment, matching house style):

```ts
export interface AccountResponse {
  id: UUID;
  name: string;
  balance: number;
  currency: string;
  overdraftLimit: number | null;
  subtype: AccountSubtype | null;
  status: AccountStatus; // backend Web/Types.hs:260
  version: number;
}
```

- [ ] **Step 4: Update fixtures**

In `src/test/fixtures.ts`, add `status: 'Opened',` to `accountFixture` (before `version`) and add a closed fixture right after it:

```ts
export const accountFixture: AccountResponse = {
  id: 'a1',
  name: 'Checking',
  balance: 1234.56,
  currency: 'USD',
  overdraftLimit: null,
  subtype: { type: 'bankAccount', bankName: 'ACME' },
  status: 'Opened',
  version: 1,
};

export const closedAccountFixture: AccountResponse = {
  id: 'a2',
  name: 'Old Savings',
  balance: 0,
  currency: 'USD',
  overdraftLimit: null,
  subtype: { type: 'bankAccount', bankName: 'ACME' },
  status: 'Closed',
  version: 1,
};
```

- [ ] **Step 5: Run the test + typecheck**

Run: `pnpm exec vitest run src/api/types.test.ts` → PASS
Run: `just typecheck` → must pass. (The create-account handler in `handlers.ts` uses an untyped `HttpResponse.json`, so it won't break the typecheck, but Task 2 adds `status` there for realism.)

- [ ] **Step 6: Commit**

```bash
git add src/api/types.ts src/api/types.test.ts src/test/fixtures.ts
git commit -m "feat(accounts): surface account status in API types (#29)"
```

---

## Task 2: Add `close`/`reopen` API methods + MSW handlers

**Files:**

- Modify: `src/api/accounts.ts`
- Modify: `src/test/handlers.ts:73-94`
- Test: `src/api/accounts.test.ts` (create — there is no existing accounts API test)

- [ ] **Step 1: Write the failing test**

Create `src/api/accounts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { ApiClient } from './client';
import { accountsApi } from './accounts';

const apiBase = 'http://localhost:8080';
const client = new ApiClient({ baseUrl: apiBase, getToken: () => 't', onUnauthorized: () => {} });
const api = accountsApi(client);

describe('accountsApi close/reopen', () => {
  it('POSTs to /api/accounts/:id/close', async () => {
    let hit: string | undefined;
    server.use(
      http.post(`${apiBase}/api/accounts/:id/close`, ({ params }) => {
        hit = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(api.close('a1')).resolves.toBeUndefined();
    expect(hit).toBe('a1');
  });

  it('POSTs to /api/accounts/:id/reopen', async () => {
    let hit: string | undefined;
    server.use(
      http.post(`${apiBase}/api/accounts/:id/reopen`, ({ params }) => {
        hit = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(api.reopen('a2')).resolves.toBeUndefined();
    expect(hit).toBe('a2');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/api/accounts.test.ts`
Expected: FAIL — `api.close`/`api.reopen` are not functions.

- [ ] **Step 3: Add the methods**

In `src/api/accounts.ts`, inside the returned object (after `adjustBalance`):

```ts
  // POST /api/accounts/:id/close → 204 (owner only). Hides the account from the
  // default list. Backend: Web/API/AccountAPI.hs:174-180.
  close: (id: UUID): Promise<void> => client.post<void>(`/api/accounts/${id}/close`),
  // POST /api/accounts/:id/reopen → 204 (owner only). Backend: AccountAPI.hs:181-187.
  reopen: (id: UUID): Promise<void> => client.post<void>(`/api/accounts/${id}/reopen`),
```

- [ ] **Step 4: Add default MSW handlers**

In `src/test/handlers.ts`, after the `…/balance` handler block (around line 94), add:

```ts
  http.post(`${apiBase}/api/accounts/:id/close`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${apiBase}/api/accounts/:id/reopen`, () => new HttpResponse(null, { status: 204 })),
```

Also add `status: 'Opened',` to the create-account response object (the `http.post(\`${apiBase}/api/accounts\`...)` handler near line 77) so the mocked create response matches the type shape.

- [ ] **Step 5: Run the test + typecheck**

Run: `pnpm exec vitest run src/api/accounts.test.ts` → PASS
Run: `just typecheck` → PASS

- [ ] **Step 6: Commit**

```bash
git add src/api/accounts.ts src/api/accounts.test.ts src/test/handlers.ts
git commit -m "feat(accounts): add close/reopen API methods (#29)"
```

---

## Task 3: `useCloseAccount` / `useReopenAccount` mutation hooks

**Files:**

- Create: `src/features/accounts/useAccountStatus.ts`
- Test: `src/features/accounts/useAccountStatus.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/accounts/useAccountStatus.test.tsx` (mirror `useCancelTransaction.test.tsx`'s wrapper):

```tsx
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { AuthContext } from '@/auth/AuthContext';
import { useCloseAccount, useReopenAccount } from './useAccountStatus';

const apiBase = 'http://localhost:8080';

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

describe('useCloseAccount', () => {
  it('POSTs close and invalidates accounts on settle', async () => {
    let hit: string | undefined;
    server.use(
      http.post(`${apiBase}/api/accounts/:id/close`, ({ params }) => {
        hit = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCloseAccount(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({ id: 'a1' });
    expect(hit).toBe('a1');
    expect(spy).toHaveBeenCalledWith({ queryKey: ['accounts'] });
  });
});

describe('useReopenAccount', () => {
  it('POSTs reopen and invalidates accounts on settle', async () => {
    let hit: string | undefined;
    server.use(
      http.post(`${apiBase}/api/accounts/:id/reopen`, ({ params }) => {
        hit = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useReopenAccount(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({ id: 'a2' });
    expect(hit).toBe('a2');
    expect(spy).toHaveBeenCalledWith({ queryKey: ['accounts'] });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/features/accounts/useAccountStatus.test.tsx`
Expected: FAIL — module/hooks not found.

- [ ] **Step 3: Implement the hooks**

Create `src/features/accounts/useAccountStatus.ts`:

```ts
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { accountsApi } from '@/api/accounts';
import type { UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

export interface AccountStatusVars {
  id: UUID;
}

// Shared builder: close and reopen are symmetric — same client construction and
// the same `['accounts']` invalidation (a refetch is the simplest correct path,
// since the row's list visibility and the "Show closed" count both change).
function useAccountStatusMutation(
  action: (api: ReturnType<typeof accountsApi>, id: UUID) => Promise<void>,
): UseMutationResult<void, Error, AccountStatusVars> {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<void, Error, AccountStatusVars>({
    mutationFn: ({ id }) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return action(accountsApi(client), id);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

export function useCloseAccount() {
  return useAccountStatusMutation((api, id) => api.close(id));
}

export function useReopenAccount() {
  return useAccountStatusMutation((api, id) => api.reopen(id));
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/features/accounts/useAccountStatus.test.tsx` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/useAccountStatus.ts src/features/accounts/useAccountStatus.test.tsx
git commit -m "feat(accounts): add close/reopen mutation hooks (#29)"
```

---

## Task 4: `CloseAccountDialog` confirmation dialog

**Files:**

- Create: `src/features/accounts/CloseAccountDialog.tsx`
- Test: `src/features/accounts/CloseAccountDialog.test.tsx`

Mirrors `src/features/transactions/CancelTransactionDialog.tsx` and its test.

- [ ] **Step 1: Write the failing test**

Create `src/features/accounts/CloseAccountDialog.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { CloseAccountDialog } from './CloseAccountDialog';
import { accountFixture } from '@/test/fixtures';

const apiBase = 'http://localhost:8080';

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
});

function renderDialog(onOpenChange = vi.fn()) {
  renderWithProviders(
    <AuthProvider>
      <CloseAccountDialog open onOpenChange={onOpenChange} account={accountFixture} />
    </AuthProvider>,
  );
  return { onOpenChange };
}

describe('CloseAccountDialog', () => {
  it('renders the confirmation prompt when open', () => {
    renderDialog();
    expect(screen.getByText('Close this account?')).toBeInTheDocument();
  });

  it('confirming closes the account and dismisses the dialog', async () => {
    let hit: string | undefined;
    server.use(
      http.post(`${apiBase}/api/accounts/:id/close`, ({ params }) => {
        hit = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { onOpenChange } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Close account' }));
    await waitFor(() => expect(hit).toBe('a1'));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('shows the backend error inline and stays open on failure', async () => {
    server.use(
      http.post(`${apiBase}/api/accounts/:id/close`, () =>
        HttpResponse.json(
          { status: 400, code: 'ACCOUNT_ERROR', message: 'Account command rejected by domain' },
          { status: 400 },
        ),
      ),
    );
    const { onOpenChange } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'Close account' }));
    expect(await screen.findByText('Account command rejected by domain')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/features/accounts/CloseAccountDialog.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the dialog**

Create `src/features/accounts/CloseAccountDialog.tsx`:

```tsx
import { ApiError } from '@/api/client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import type { AccountResponse } from '@/api/types';
import { useCloseAccount } from './useAccountStatus';

export interface CloseAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AccountResponse;
}

// Confirmation for closing (hiding) an account. Errors surface inline and keep
// the dialog open — the app has no global toast — mirroring CancelTransactionDialog.
// Closing is reversible via Reopen, so the copy reassures rather than warns.
export function CloseAccountDialog({ open, onOpenChange, account }: CloseAccountDialogProps) {
  const close = useCloseAccount();

  const showBanner = close.isError;
  const bannerMessage =
    close.error instanceof ApiError
      ? close.error.message
      : 'Something went wrong. Please try again.';

  const onConfirm = async () => {
    try {
      await close.mutateAsync({ id: account.id });
      onOpenChange(false);
    } catch {
      // Surfaced via the inline banner above; keep the dialog open.
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (close.isPending) return;
        if (!next) close.reset();
        onOpenChange(next);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Close this account?</AlertDialogTitle>
          <AlertDialogDescription>
            &ldquo;{account.name}&rdquo; will be hidden from your accounts list. You can reopen it
            later from &ldquo;Show closed&rdquo;.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {showBanner && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{bannerMessage}</AlertDescription>
          </Alert>
        )}
        <AlertDialogFooter>
          <Button variant="outline" disabled={close.isPending} onClick={() => onOpenChange(false)}>
            Keep open
          </Button>
          <Button variant="default" disabled={close.isPending} onClick={() => void onConfirm()}>
            Close account
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/features/accounts/CloseAccountDialog.test.tsx` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/CloseAccountDialog.tsx src/features/accounts/CloseAccountDialog.test.tsx
git commit -m "feat(accounts): add close-account confirmation dialog (#29)"
```

---

## Task 5: `AccountContextMenu` right-click menu

**Files:**

- Create: `src/features/accounts/AccountContextMenu.tsx`
- Test: `src/features/accounts/AccountContextMenu.test.tsx`

Presentational only: emits Close/Reopen intent via callbacks; owns no mutation.

- [ ] **Step 1: Write the failing test**

Create `src/features/accounts/AccountContextMenu.test.tsx`:

```tsx
import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import { AccountContextMenu } from './AccountContextMenu';
import { accountFixture, closedAccountFixture } from '@/test/fixtures';

describe('AccountContextMenu', () => {
  it('offers Close account for an open account and emits onRequestClose', async () => {
    const user = userEvent.setup();
    const onRequestClose = vi.fn();
    renderWithProviders(
      <AccountContextMenu
        account={accountFixture}
        onRequestClose={onRequestClose}
        onRequestReopen={vi.fn()}
      >
        <div>row</div>
      </AccountContextMenu>,
    );
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('row') });
    await user.click(await screen.findByRole('menuitem', { name: /close account/i }));
    expect(onRequestClose).toHaveBeenCalledWith(accountFixture);
  });

  it('offers Reopen account for a closed account and emits onRequestReopen', async () => {
    const user = userEvent.setup();
    const onRequestReopen = vi.fn();
    renderWithProviders(
      <AccountContextMenu
        account={closedAccountFixture}
        onRequestClose={vi.fn()}
        onRequestReopen={onRequestReopen}
      >
        <div>row</div>
      </AccountContextMenu>,
    );
    await user.pointer({ keys: '[MouseRight]', target: screen.getByText('row') });
    await user.click(await screen.findByRole('menuitem', { name: /reopen account/i }));
    expect(onRequestReopen).toHaveBeenCalledWith(closedAccountFixture);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm exec vitest run src/features/accounts/AccountContextMenu.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the menu**

Create `src/features/accounts/AccountContextMenu.tsx`:

```tsx
import type { ReactNode } from 'react';
import { Archive, ArchiveRestore } from 'lucide-react';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import type { AccountResponse } from '@/api/types';

export interface AccountContextMenuProps {
  account: AccountResponse;
  onRequestClose: (account: AccountResponse) => void;
  onRequestReopen: (account: AccountResponse) => void;
  children: ReactNode;
}

// Right-click menu on an account row. Presentational: emits intent so the pane
// owns the single close-dialog and the single reopen mutation/error surface.
export function AccountContextMenu({
  account,
  onRequestClose,
  onRequestReopen,
  children,
}: AccountContextMenuProps) {
  const isClosed = account.status === 'Closed';
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        {isClosed ? (
          <ContextMenuItem onSelect={() => onRequestReopen(account)}>
            <ArchiveRestore className="mr-2 h-4 w-4" />
            Reopen account
          </ContextMenuItem>
        ) : (
          <ContextMenuItem onSelect={() => onRequestClose(account)}>
            <Archive className="mr-2 h-4 w-4" />
            Close account
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run src/features/accounts/AccountContextMenu.test.tsx` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/AccountContextMenu.tsx src/features/accounts/AccountContextMenu.test.tsx
git commit -m "feat(accounts): add account row context menu (#29)"
```

---

## Task 6: Wire `AccountsPane` — toolbar button, toggle, partition, toast

**Files:**

- Modify: `src/features/accounts/AccountsPane.tsx`
- Test: `src/features/accounts/AccountsPane.test.tsx` (extend)

This task has several behaviors; write the tests first, then implement them together (the pane is one cohesive component). Add `status` to the existing handler usage by relying on `closedAccountFixture`.

- [ ] **Step 1: Write the failing tests**

Add to `src/features/accounts/AccountsPane.test.tsx`. First extend the imports:

```ts
import { accountFixture, closedAccountFixture } from '@/test/fixtures';
```

Add a helper to serve a mixed list and these tests inside the `describe('AccountsPane', …)` block:

```ts
function serveMixedAccounts() {
  server.use(
    http.get(`${apiBase}/api/accounts`, () =>
      HttpResponse.json({ accounts: [accountFixture, closedAccountFixture], totalCount: 2 }),
    ),
  );
}

it('hides closed accounts from the list by default', async () => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  serveMixedAccounts();
  renderWithProviders(ui(), { initialPath: '/' });
  expect(await screen.findByText('Checking')).toBeInTheDocument();
  expect(screen.queryByText('Old Savings')).not.toBeInTheDocument();
});

it('reveals closed accounts when "Show closed" is toggled', async () => {
  const user = userEvent.setup();
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  serveMixedAccounts();
  renderWithProviders(ui(), { initialPath: '/' });
  await screen.findByText('Checking');
  await user.click(screen.getByRole('button', { name: /show closed/i }));
  expect(await screen.findByText('Old Savings')).toBeInTheDocument();
});

it('does not render the "Show closed" toggle when there are no closed accounts', async () => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  renderWithProviders(ui(), { initialPath: '/' }); // default handler: only the open accountFixture
  await screen.findByText('Checking');
  expect(screen.queryByRole('button', { name: /show closed/i })).not.toBeInTheDocument();
});

it('shows a Close action in the toolbar for a selected open account', async () => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  serveMixedAccounts();
  renderWithProviders(ui(), { initialPath: `/accounts/${accountFixture.id}` });
  const btn = await screen.findByRole('button', { name: /close account/i });
  await waitFor(() => expect(btn).not.toBeDisabled());
});

it('toolbar Close opens the confirmation dialog', async () => {
  const user = userEvent.setup();
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  serveMixedAccounts();
  renderWithProviders(ui(), { initialPath: `/accounts/${accountFixture.id}` });
  const btn = await screen.findByRole('button', { name: /close account/i });
  await waitFor(() => expect(btn).not.toBeDisabled());
  await user.click(btn);
  expect(await screen.findByText('Close this account?')).toBeInTheDocument();
});

it('shows a Reopen action in the toolbar for a selected closed account and reopens it', async () => {
  const user = userEvent.setup();
  let hit: string | undefined;
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  serveMixedAccounts();
  server.use(
    http.post(`${apiBase}/api/accounts/:id/reopen`, ({ params }) => {
      hit = params.id as string;
      return new HttpResponse(null, { status: 204 });
    }),
  );
  renderWithProviders(ui(), { initialPath: `/accounts/${closedAccountFixture.id}` });
  const btn = await screen.findByRole('button', { name: /reopen account/i });
  await waitFor(() => expect(btn).not.toBeDisabled());
  await user.click(btn);
  await waitFor(() => expect(hit).toBe('a2'));
});

it('surfaces a dismissible error toast when reopen fails', async () => {
  const user = userEvent.setup();
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  serveMixedAccounts();
  server.use(
    http.post(`${apiBase}/api/accounts/:id/reopen`, () =>
      HttpResponse.json(
        { status: 400, code: 'ACCOUNT_ERROR', message: 'Account command rejected by domain' },
        { status: 400 },
      ),
    ),
  );
  renderWithProviders(ui(), { initialPath: `/accounts/${closedAccountFixture.id}` });
  const btn = await screen.findByRole('button', { name: /reopen account/i });
  await waitFor(() => expect(btn).not.toBeDisabled());
  await user.click(btn);
  expect(await screen.findByText('Account command rejected by domain')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm exec vitest run src/features/accounts/AccountsPane.test.tsx`
Expected: FAIL — no Close/Reopen button, no Show closed toggle, etc.

- [ ] **Step 3: Implement the pane changes**

Edit `src/features/accounts/AccountsPane.tsx`:

1. Add imports:

```ts
import { Archive, ArchiveRestore, Pencil, Plus, X } from 'lucide-react';
import type { AccountResponse } from '@/api/types';
import { ApiError } from '@/api/client';
import { CloseAccountDialog } from './CloseAccountDialog';
import { AccountContextMenu } from './AccountContextMenu';
import { useReopenAccount } from './useAccountStatus';
```

2. Inside the component, add state + the shared reopen handler (after the existing `editing` state):

```ts
const [closingAccount, setClosingAccount] = useState<AccountResponse | null>(null);
const [showClosed, setShowClosed] = useState(false);
const [reopenError, setReopenError] = useState<string | null>(null);
const reopenMutation = useReopenAccount();

const reopen = (account: AccountResponse) => {
  setReopenError(null);
  reopenMutation.mutate(
    { id: account.id },
    {
      onError: (err) =>
        setReopenError(
          err instanceof ApiError ? err.message : 'Could not reopen this account. Try again.',
        ),
    },
  );
};

const openAccounts = data?.filter((a) => a.status !== 'Closed') ?? [];
const closedAccounts = data?.filter((a) => a.status === 'Closed') ?? [];
const selectedIsClosed = selectedAccount?.status === 'Closed';
```

3. Add the Close/Reopen toolbar button just after the Edit `<Tooltip>` block (before `<SyncNowButton …/>`):

```tsx
<Tooltip>
  <TooltipTrigger asChild>
    <Button
      size="icon"
      variant="ghost"
      aria-label={selectedIsClosed ? 'Reopen account' : 'Close account'}
      disabled={accountActionsDisabled}
      onClick={() =>
        selectedAccount &&
        (selectedIsClosed ? reopen(selectedAccount) : setClosingAccount(selectedAccount))
      }
      className="h-9 w-9"
    >
      {selectedIsClosed ? <ArchiveRestore className="h-5 w-5" /> : <Archive className="h-5 w-5" />}
    </Button>
  </TooltipTrigger>
  <TooltipContent>{selectedIsClosed ? 'Reopen account' : 'Close account'}</TooltipContent>
</Tooltip>
```

4. Replace the list `<ul>` rendering. Extract a row renderer so open and closed rows share markup, wrapping each in `AccountContextMenu`. Replace the whole `{!isLoading && !isError && data && data.length > 0 && ( <ul>…</ul> )}` block with:

```tsx
{
  !isLoading && !isError && data && data.length > 0 && (
    <div className="p-2">
      <ul className="space-y-1">
        {openAccounts.map((a) => (
          <li key={a.id}>{renderAccountRow(a)}</li>
        ))}
      </ul>

      {closedAccounts.length > 0 && (
        <>
          <button
            type="button"
            onClick={() => setShowClosed((v) => !v)}
            className="mt-2 px-2 text-xs text-muted-foreground hover:underline"
          >
            {showClosed ? 'Hide closed' : `Show closed (${closedAccounts.length})`}
          </button>
          {showClosed && (
            <ul className="mt-1 space-y-1 border-t pt-2">
              {closedAccounts.map((a) => (
                <li key={a.id}>{renderAccountRow(a)}</li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
```

Define `renderAccountRow` inside the component (above the `return`), reusing the existing `NavLink` markup and wrapping in the context menu. Closed rows get muted styling and a "Closed" label:

```tsx
const renderAccountRow = (a: AccountResponse) => {
  const isClosed = a.status === 'Closed';
  return (
    <AccountContextMenu account={a} onRequestClose={setClosingAccount} onRequestReopen={reopen}>
      <NavLink
        to={`/accounts/${a.id}`}
        className={({ isActive }) =>
          cn(
            'block rounded-md p-2 text-sm hover:bg-muted',
            isActive && 'bg-muted font-medium',
            isClosed && 'opacity-60',
          )
        }
      >
        <div className="flex items-baseline justify-between gap-2">
          <span>{a.name}</span>
          <span className="tabular-nums">{formatAccountBalance(a)}</span>
        </div>
        {isClosed ? (
          <div className="text-xs text-muted-foreground">Closed</div>
        ) : (
          a.subtype && (
            <div className="text-xs text-muted-foreground">{formatAccountSubtypeLabel(a)}</div>
          )
        )}
      </NavLink>
    </AccountContextMenu>
  );
};
```

5. Mount the dialog and the reopen error toast at the end (next to `CreateAccountDialog`/`EditAccountDialog`):

```tsx
{
  closingAccount && (
    <CloseAccountDialog
      open
      onOpenChange={(next) => {
        if (!next) setClosingAccount(null);
      }}
      account={closingAccount}
    />
  );
}
{
  reopenError && (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)]">
      <Alert role="alert" variant="destructive" className="relative pr-9 shadow-lg">
        <AlertDescription>{reopenError}</AlertDescription>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={() => setReopenError(null)}
          className="absolute right-2 top-2 rounded-sm opacity-70 transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      </Alert>
    </div>
  );
}
```

> Note: `selectedAccount` (from `useAccountById`) still resolves a closed account because `useAccounts` returns the full list — so the toolbar correctly flips to Reopen for a selected closed account, and the detail view keeps working after a close.

- [ ] **Step 4: Run the pane tests to verify they pass**

Run: `pnpm exec vitest run src/features/accounts/AccountsPane.test.tsx` → PASS (all old + new tests).

- [ ] **Step 5: Run the full feature test sweep + checks**

Run: `pnpm exec vitest run src/features/accounts src/api/accounts.test.ts src/api/types.test.ts` → PASS
Run: `just check` → typecheck + lint + format-check all pass (run `just format` first if needed).

- [ ] **Step 6: Commit**

```bash
git add src/features/accounts/AccountsPane.tsx src/features/accounts/AccountsPane.test.tsx
git commit -m "feat(accounts): close/reopen controls and show-closed toggle in pane (#29)"
```

---

## Task 7: Full verification

- [ ] **Step 1: Run the whole test suite**

Run: `just test` → all green.

- [ ] **Step 2: Run all checks + build**

Run: `just all` (check + test + build) → passes.

- [ ] **Step 3: Manual smoke (optional but recommended)**

Use the `verify` / `run` skill or `just run`. Sign in, create or pick an account, close it via the toolbar (confirm dialog) — it disappears from the list. Toggle "Show closed" — it reappears, muted, labelled "Closed". Right-click it → Reopen; it returns to the open list. Right-click an open account → Close. Confirm the reopen error toast by temporarily failing the endpoint (or trust the unit test).

- [ ] **Step 4: Final commit (only if Step 2/3 produced fixes)**

```bash
git add -A
git commit -m "chore(accounts): finalize close/unclose account (#29)"
```

---

## Notes for the implementer

- **Don't hand-edit `src/components/ui/`** — `context-menu`, `alert-dialog`, `tooltip`, `alert`, `button` are all already vendored; just import them.
- **MSW `onUnhandledRequest: 'error'`** — any endpoint a render touches must have a handler. The default `handlers.ts` close/reopen handlers (Task 2) cover most cases; per-test `server.use(...)` overrides when asserting the hit id or an error.
- **`reset()` on dialog close** clears a stale error banner if the dialog is reopened — mirror `CancelTransactionDialog` exactly.
- **YAGNI**: no server-side filter, no bulk actions, no Edit in the context menu, no special-casing the generic 400.
