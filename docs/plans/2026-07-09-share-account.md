# Share an Account — Web UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an account Owner share an account with another user by their user ID (with Editor/Viewer role), see who has access and revoke it, reflect the current user's role across the accounts UI, and expose the current user's own ID on the Profile page for sharing.

**Architecture:** Feature-local additions under `src/features/accounts/` plus a small Profile addition. API methods in `src/api/accounts.ts`; DTOs in `src/api/types.ts` (kept in lockstep with backend `Web/Types.hs` / `AccountAPI.hs`). TanStack Query hooks wrap the client; components stay presentational. Sharing targets are identified by a pasted UUID (no email lookup this iteration).

**Tech Stack:** React 18, TypeScript (strict), TanStack Query, react-hook-form + Zod, shadcn/ui (Radix + Tailwind), Vitest + Testing Library + MSW, Playwright.

**Spec:** `docs/specs/2026-07-09-share-account-design.md`. Tracker: homeaccounting/tracker#29.
**Depends on:** backend plan `../server-infra/docs/plans/2026-07-09-share-account.md` (role on `GET /api/accounts`; owner-only `GET /api/accounts/:id/access`). Land backend first.

**Conventions verified in this repo:**

- Tests: `just test` (`pnpm exec vitest run`), `just typecheck`, `just lint`, `just check`. E2E: `just e2e`.
- Query keys are **inline literal arrays** (no central factory): `['accounts']`, `['users','me']`. New: `['account-access', accountId]`.
- Hooks build a fresh `ApiClient` inside queryFn/mutationFn from `useAuth()` `{ tokenRef, signOut, session }`; invalidate with `queryClient.invalidateQueries({ queryKey: [...] })`.
- `ApiClient.delete<T>(path)` takes **no body**; query params are caller-built with `URLSearchParams` (not needed here — revoke uses a path param).
- `ApiError` has `{ status, code?, message, fieldErrors? }` (no `data`).
- Tests "sign in" via `beforeEach(() => saveSession({ token:'t', userId:'u', email:'e', expiresAt: 9e15 }))` from `@/auth/storage`; subjects needing auth wrap themselves in `<AuthProvider>`; render via `renderWithProviders` from `@/test/utils`.
- Enum wire values: `const X = [...] as const; type X = (typeof X)[number];`.

---

## File Structure

**Create:**

- `src/features/accounts/useAccountAccess.ts` — query for `['account-access', id]`.
- `src/features/accounts/useShareAccount.ts` — share mutation.
- `src/features/accounts/useRevokeAccess.ts` — revoke mutation.
- `src/features/accounts/shareAccountSchema.ts` — Zod schema (UUID + role) + tests.
- `src/features/accounts/ManageAccessDialog.tsx` — the dialog (share form + access list + revoke).
- `src/features/profile/UserIdCard.tsx` — "Your sharing ID" card with copy button.
- Test files alongside each of the above.

**Modify:**

- `src/api/types.ts` — `ACCOUNT_ROLES`/`AccountRole`, `role` on `AccountResponse`, `ShareAccountRequest`, `AccountAccessEntry`, `AccountAccessListResponse`.
- `src/api/accounts.ts` — `listAccess`, `share`, `revokeAccess`.
- `src/features/accounts/AccountContextMenu.tsx` — add owner-only "Manage access" item + `onRequestManageAccess` prop.
- `src/features/accounts/AccountsPane.tsx` — wire dialog + state; "Shared with me" group; role-gated toolbar actions.
- `src/pages/ProfilePage.tsx` (or its general pane) — mount `UserIdCard`.
- Fixtures: `role` must be added to **every** typed `AccountResponse` literal (required field) — `src/test/fixtures.ts`, and test literals under `src/features/accounts/`, `src/features/transactions/`, `src/features/profile/`, and `src/api/defaults.test.ts`. See Task 1 Step 3 for the full list; trust `tsc` as the source of truth.
- `src/test/handlers.ts` — handlers for the 3 sharing endpoints.

---

## Task 1: API types (`src/api/types.ts`)

**Files:**

- Modify: `src/api/types.ts` (`AccountResponse` at `:92`; enum-array block near `:117`)
- Test: `src/api/types.test.ts` (existing)

- [ ] **Step 1: Add the role enum + fields**

Near the `ACCOUNT_SUBTYPE_TYPES` block (`:117`):

```ts
// Account roles — mirrors backend AccountRole (Domain/Core/Types.hs). Wire tokens
// are lowercase (see backend roleToText).
export const ACCOUNT_ROLES = ['owner', 'editor', 'viewer'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];
```

In `AccountResponse` (`:92`), add `role` (backend `Web/Types.hs` AccountResponse; tracker#29):

```ts
export interface AccountResponse {
  id: UUID;
  name: string;
  balance: number;
  currency: string;
  overdraftLimit: number | null;
  subtype: AccountSubtype | null;
  status: AccountStatus;
  role: AccountRole; // tracker#29 — current user's role on this account
  version: number;
}
```

Add the sharing DTOs (near the account request DTOs, `:150`):

```ts
// POST /api/accounts/:id/share — backend AccountAPI.hs ShareAccountRequest.
export interface ShareAccountRequest {
  userId: UUID;
  role: AccountRole;
}

// GET /api/accounts/:id/access — backend AccountAPI.hs AccountAccessEntry.
// email/telegramUsername are display labels; either may be absent.
export interface AccountAccessEntry {
  userId: UUID;
  role: AccountRole;
  email?: string | null;
  telegramUsername?: string | null;
}

export interface AccountAccessListResponse {
  access: AccountAccessEntry[];
}
```

- [ ] **Step 2: Typecheck to surface ALL fixture breakages**

Run: `just typecheck`
Expected: FAIL — `role` is a **required** field, so **every** typed `AccountResponse` object literal in the repo now errors. Use the full error list as the worklist for Step 3. Do NOT assume it's only the two fixtures.

- [ ] **Step 3: Add `role: 'owner'` to every typed `AccountResponse` object literal**

Rule: add `role: 'owner',` (or `'editor'`/`'viewer'` where a test needs a specific role) to each full `AccountResponse` literal `tsc` reports. Confirmed sites (each is a standalone constructed object/array/factory, not a spread of `accountFixture`, so each breaks independently):

- `src/test/fixtures.ts:34` (`accountFixture`), `:45` (`closedAccountFixture`)
- `src/features/accounts/schema.test.ts:171` (`fixture`)
- `src/features/accounts/EditAccountDialog.test.tsx:16` (`fixture`)
- `src/features/accounts/AdjustBalanceDialog.test.tsx:15` (array — **both** objects)
- `src/features/transactions/schema.test.ts:218` (`acc` factory base), `:315` (`accBal` factory base)
- `src/features/transactions/ControlBar.test.tsx:44` (`selectedAccount`)
- `src/features/transactions/AccountHeader.test.tsx:9` (base object inside `fixture()`)
- `src/features/transactions/convertTransaction.test.ts:14` (array)
- `src/features/transactions/IncomeExpenseForm.test.tsx:16` (array)
- `src/features/transactions/TransferForm.test.tsx:12` (array)
- `src/features/profile/DefaultAccountsCard.test.tsx:13` (`acct` factory)
- `src/features/profile/LinkAccountsDialog.test.tsx:18` and `:104` (arrays)
- `src/api/defaults.test.ts:20` (`base`)

> Note the `Partial<AccountResponse>` factory in `AccountHeader.test.tsx:9` — `role` goes on the **base** object it spreads into, not the `overrides` type. Array literals may contain more than one object; add `role` to each. (Untyped inline objects in `src/test/handlers.ts` and `CreateAccountDialog.test.tsx` don't fail typecheck; they're updated in Task 8.)

- [ ] **Step 4: Typecheck passes**

Run: `just typecheck`
Expected: PASS. If any `AccountResponse` errors remain, add `role` to those literals too (the list above should be complete, but trust `tsc` over the list).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(accounts): add role + sharing DTOs to api types (tracker#29)"
```

---

## Task 2: API client methods (`src/api/accounts.ts`)

**Files:**

- Modify: `src/api/accounts.ts`
- Test: `src/api/accounts.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/api/accounts.test.ts` (follow the existing `server.use(http.…)` capture pattern):

```ts
describe('accountsApi sharing', () => {
  it('GETs the access list', async () => {
    server.use(
      http.get(`${apiBase}/api/accounts/:id/access`, () =>
        HttpResponse.json({
          access: [{ userId: 'u1', role: 'owner', email: 'o@x.com', telegramUsername: null }],
        }),
      ),
    );
    await expect(api.listAccess('a1')).resolves.toEqual([
      { userId: 'u1', role: 'owner', email: 'o@x.com', telegramUsername: null },
    ]);
  });

  it('POSTs a share request', async () => {
    let body: unknown;
    server.use(
      http.post(`${apiBase}/api/accounts/:id/share`, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(api.share('a1', { userId: 'u2', role: 'editor' })).resolves.toBeUndefined();
    expect(body).toEqual({ userId: 'u2', role: 'editor' });
  });

  it('DELETEs an access entry', async () => {
    let hit: { id?: string; userId?: string } = {};
    server.use(
      http.delete(`${apiBase}/api/accounts/:id/access/:userId`, ({ params }) => {
        hit = { id: params.id as string, userId: params.userId as string };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(api.revokeAccess('a1', 'u2')).resolves.toBeUndefined();
    expect(hit).toEqual({ id: 'a1', userId: 'u2' });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/api/accounts.test.ts`
Expected: FAIL — `api.listAccess`/`share`/`revokeAccess` are not functions.

- [ ] **Step 3: Implement the methods**

In `src/api/accounts.ts`, add to the returned object and extend the type imports with `AccountAccessListResponse, AccountAccessEntry, ShareAccountRequest`:

```ts
  listAccess: async (id: UUID): Promise<AccountAccessEntry[]> => {
    const res = await client.get<AccountAccessListResponse>(`/api/accounts/${id}/access`);
    return res.access;
  },
  share: (id: UUID, body: ShareAccountRequest): Promise<void> =>
    client.post<void>(`/api/accounts/${id}/share`, body),
  revokeAccess: (id: UUID, userId: UUID): Promise<void> =>
    client.delete<void>(`/api/accounts/${id}/access/${userId}`),
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run src/api/accounts.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/api/accounts.ts src/api/accounts.test.ts
git commit -m "feat(accounts): add listAccess/share/revokeAccess client methods (tracker#29)"
```

---

## Task 3: Hooks (query + mutations)

**Files:**

- Create: `src/features/accounts/useAccountAccess.ts`, `useShareAccount.ts`, `useRevokeAccess.ts`
- Test: `src/features/accounts/useShareAccount.test.tsx` (covers all three via a small harness)

- [ ] **Step 1: Write the query hook**

`src/features/accounts/useAccountAccess.ts` (mirror `useAccounts.ts`; enabled flag lets the dialog control fetching):

```ts
import { useQuery } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { accountsApi } from '@/api/accounts';
import { useAuth } from '@/auth/useAuth';
import type { UUID } from '@/api/types';

export function useAccountAccess(id: UUID | undefined, enabled = true) {
  const { tokenRef, signOut, session } = useAuth();
  return useQuery({
    queryKey: ['account-access', id],
    enabled: !!session && !!id && enabled,
    queryFn: () => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return accountsApi(client).listAccess(id!);
    },
  });
}
```

- [ ] **Step 2: Write the mutation hooks**

`src/features/accounts/useShareAccount.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { accountsApi } from '@/api/accounts';
import { useAuth } from '@/auth/useAuth';
import type { ShareAccountRequest, UUID } from '@/api/types';

export function useShareAccount(id: UUID) {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<void, Error, ShareAccountRequest>({
    mutationFn: (body) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return accountsApi(client).share(id, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['account-access', id] });
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}
```

`src/features/accounts/useRevokeAccess.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { accountsApi } from '@/api/accounts';
import { useAuth } from '@/auth/useAuth';
import type { UUID } from '@/api/types';

export function useRevokeAccess(id: UUID) {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<void, Error, UUID>({
    mutationFn: (userId) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return accountsApi(client).revokeAccess(id, userId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['account-access', id] });
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}
```

- [ ] **Step 3: Write a hook test (renderHook) proving fetch + invalidation**

`src/features/accounts/useShareAccount.test.tsx` — use `renderHook` with a wrapper that provides a real `QueryClient` + `<AuthProvider>`, `saveSession` in `beforeEach`, and `server.use` overrides. Assert `useAccountAccess` resolves to the handler's list, and that `useShareAccount(...).mutateAsync(...)` resolves and triggers an `['account-access', id]` refetch (spy on `queryClient.invalidateQueries` or assert a second fetch). Keep it focused: one test per hook.

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run src/features/accounts/useShareAccount.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/useAccountAccess.ts src/features/accounts/useShareAccount.ts src/features/accounts/useRevokeAccess.ts src/features/accounts/useShareAccount.test.tsx
git commit -m "feat(accounts): add access-list query + share/revoke mutation hooks (tracker#29)"
```

---

## Task 4: Share-form Zod schema

**Files:**

- Create: `src/features/accounts/shareAccountSchema.ts`
- Test: `src/features/accounts/shareAccountSchema.test.ts`

- [ ] **Step 1: Write failing schema tests**

`src/features/accounts/shareAccountSchema.test.ts` (mirror `schema.test.ts` style — pure `safeParse` unit tests):

```ts
import { describe, it, expect } from 'vitest';
import { shareAccountSchema } from './shareAccountSchema';

const valid = { userId: '550e8400-e29b-41d4-a716-446655440000', role: 'editor' as const };

describe('shareAccountSchema', () => {
  it('accepts a valid uuid + editor/viewer role', () => {
    expect(shareAccountSchema.safeParse(valid).success).toBe(true);
    expect(shareAccountSchema.safeParse({ ...valid, role: 'viewer' }).success).toBe(true);
  });
  it('rejects a non-uuid userId', () => {
    const r = shareAccountSchema.safeParse({ ...valid, userId: 'not-a-uuid' });
    expect(r.success).toBe(false);
  });
  it('rejects owner (not grantable via UI)', () => {
    expect(shareAccountSchema.safeParse({ ...valid, role: 'owner' }).success).toBe(false);
  });
  it('rejects empty userId', () => {
    expect(shareAccountSchema.safeParse({ ...valid, userId: '' }).success).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/features/accounts/shareAccountSchema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the schema**

`src/features/accounts/shareAccountSchema.ts`:

```ts
import { z } from 'zod';

// UI grants Editor/Viewer only — Owner is intentionally excluded (a granted
// Owner cannot be revoked). See docs/specs/2026-07-09-share-account-design.md.
export const shareAccountSchema = z.object({
  userId: z.string().uuid('Enter a valid user ID'),
  role: z.enum(['editor', 'viewer']),
});

export type ShareAccountFormValues = z.infer<typeof shareAccountSchema>;
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run src/features/accounts/shareAccountSchema.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/shareAccountSchema.ts src/features/accounts/shareAccountSchema.test.ts
git commit -m "feat(accounts): share form schema (uuid + editor/viewer) (tracker#29)"
```

---

## Task 5: ManageAccessDialog component

The dialog has two regions: a share form (UUID + role select + Share) and the current access list (label + role badge + Revoke). Owner-only; opened from the pane.

**Files:**

- Create: `src/features/accounts/ManageAccessDialog.tsx`
- Test: `src/features/accounts/ManageAccessDialog.test.tsx`
- Reuse: shadcn `Dialog`, `Select`, `Button`, `Alert`, RHF+`zodResolver`, `FormField` (see `AccountForm.tsx`), `useAccountAccess`, `useShareAccount`, `useRevokeAccess`, `shareAccountSchema`.

- [ ] **Step 1: Write the component**

Key behaviors (implement following `CreateAccountDialog.tsx` error-surface pattern):

- Props: `{ open: boolean; onOpenChange: (o: boolean) => void; account: AccountResponse }`.
- `const access = useAccountAccess(account.id, open);` — fetch only while open.
- Share form via `useForm<ShareAccountFormValues>({ resolver: zodResolver(shareAccountSchema), defaultValues: { userId: '', role: 'viewer' } })`.
- On submit: `await share.mutateAsync(values)`; on success reset the form (list refetches via invalidation). On `ApiError`, map to a friendly inline message:
  - `status === 404` / user-not-found → "No user found with that ID."
  - self-share (`code`/message contains "self") → "You can't share an account with yourself."
  - already-has-access → "That user already has access." (re-share replaces role — acceptable; still show success.)
  - fallback → `error.message`.
- Access list: `access.data?.map(entry => …)` — row shows the display label `entry.email ?? (entry.telegramUsername ? '@' + entry.telegramUsername : shortId(entry.userId))`, a role badge, and a **Revoke** button. Disable Revoke when `entry.role === 'owner'` OR `entry.userId === session?.userId` (own row). Use `useRevokeAccess(account.id)`; confirm via a nested AlertDialog or a simple `window.confirm` is acceptable for MVP — prefer shadcn `AlertDialog` for consistency.
- Loading/empty/error states for the list mirror `AccountsPane` (Skeleton / Alert + Retry).
- Add a `shortId(uuid: string)` local helper: `` `${uuid.slice(0, 8)}…` ``.

Get `session` from `useAuth()` for the own-row check.

- [ ] **Step 2: Write the component test**

`src/features/accounts/ManageAccessDialog.test.tsx` (harness like `CreateAccountDialog.test.tsx`: `saveSession` in `beforeEach`, wrap in `<AuthProvider>`, `renderWithProviders`, `server.use` overrides). Cover:

1. Renders the current access list (owner + one editor) from a mocked `GET …/access`.
2. Owner row's Revoke is disabled.
3. Typing a UUID + selecting Editor + clicking Share POSTs `{ userId, role: 'editor' }` (assert captured body) and the list refetches.
4. A `404` from share renders "No user found with that ID."
5. Clicking Revoke on the editor row (confirm) DELETEs `…/access/:userId`.
6. An invalid UUID shows the schema error and does not POST.

- [ ] **Step 3: Run to verify pass**

Run: `pnpm exec vitest run src/features/accounts/ManageAccessDialog.test.tsx`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/accounts/ManageAccessDialog.tsx src/features/accounts/ManageAccessDialog.test.tsx
git commit -m "feat(accounts): ManageAccessDialog — share by ID + access list + revoke (tracker#29)"
```

---

## Task 6: Context-menu entry + pane wiring

**Files:**

- Modify: `src/features/accounts/AccountContextMenu.tsx` + `.test.tsx`
- Modify: `src/features/accounts/AccountsPane.tsx`

- [ ] **Step 1: Extend the context menu (failing test first)**

In `AccountContextMenu.test.tsx`, add: given an owned account (`role: 'owner'`), a "Manage access" menuitem appears and calls `onRequestManageAccess(account)`; given a shared account (`role: 'editor'`), the item is **absent**. (Add an `editorAccountFixture` inline or override `accountFixture.role`.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/features/accounts/AccountContextMenu.test.tsx`
Expected: FAIL — no such menuitem / prop.

- [ ] **Step 3: Implement**

In `AccountContextMenu.tsx`: add `onRequestManageAccess: (a: AccountResponse) => void` to props, import a `Users` (or `Share2`) icon from `lucide-react`, and render the item only for owners:

```tsx
{
  account.role === 'owner' && (
    <ContextMenuItem onSelect={() => onRequestManageAccess(account)}>
      <Users className="mr-2 h-4 w-4" />
      Manage access
    </ContextMenuItem>
  );
}
```

- [ ] **Step 4: Wire the pane**

In `AccountsPane.tsx`:

- Add state: `const [managingAccount, setManagingAccount] = useState<AccountResponse | null>(null);`
- Pass `onRequestManageAccess={setManagingAccount}` to `<AccountContextMenu>` (in `renderAccountRow`).
- Render near the other dialogs:
  ```tsx
  {
    managingAccount && (
      <ManageAccessDialog
        open
        account={managingAccount}
        onOpenChange={(next) => {
          if (!next) setManagingAccount(null);
        }}
      />
    );
  }
  ```
- **Toolbar entry point (spec parity):** add a toolbar icon button (e.g. `Users`/`Share2` from `lucide-react`) next to the existing Edit/Close/Sync/Add buttons, mirroring their `Tooltip` + `Button size="icon" variant="ghost"` pattern. `aria-label="Manage access"`, `onClick={() => selectedAccount && setManagingAccount(selectedAccount)}`, and `disabled={!selectedAccount || selectedAccount.role !== 'owner'}`. This satisfies the spec's second entry point; the context-menu item covers per-row access.

- [ ] **Step 5: Run to verify pass**

Run: `pnpm exec vitest run src/features/accounts/AccountContextMenu.test.tsx src/features/accounts/AccountsPane.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/accounts/AccountContextMenu.tsx src/features/accounts/AccountContextMenu.test.tsx src/features/accounts/AccountsPane.tsx
git commit -m "feat(accounts): owner-only Manage access menu entry + pane wiring (tracker#29)"
```

---

## Task 7: Role reflection — "Shared with me" group + gated actions

**Files:**

- Modify: `src/features/accounts/AccountsPane.tsx` + `AccountsPane.test.tsx`

- [ ] **Step 1: Write failing tests**

In `AccountsPane.test.tsx`, seed the accounts query (via MSW `GET /api/accounts`) with a mix: an owned account (`role:'owner'`) and a shared one (`role:'editor'` or `'viewer'`). Assert:

1. A "Shared with me" section renders and contains the shared account.
2. The shared row shows a role badge (e.g. text "Editor"/"Viewer").
3. Toolbar Edit/Close are disabled when the **selected** account's role is `'viewer'` (view-only). (Owner/Editor: Close is owner-only → disabled for editor; Edit follows the confirmed tier — see note.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/features/accounts/AccountsPane.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement grouping + badges**

In `AccountsPane.tsx`:

- Split accounts: `owned = data.filter(a => a.role === 'owner')`, `shared = data.filter(a => a.role !== 'owner')`. Keep the existing subtype grouping for `owned` (open subset). Render `shared` (open) in a dedicated "Shared with me" group below the owned groups (closed accounts handling unchanged, applied to both sets or owned-only per current behavior — keep owned-only for closed to avoid scope creep; note it).
- In `renderAccountRow`, when `a.role !== 'owner'`, render a small badge next to the name: `{a.role === 'editor' ? 'Editor' : 'Viewer'}` (use the shadcn `Badge` if present, else a `<span className="…text-xs">`).

- [ ] **Step 4: Implement toolbar gating**

Compute from `selectedAccount?.role`:

- `canManage = role === 'owner'` → gate Close/Reopen (already implicitly owner via backend; disable button when `!canManage`).
- `canModify = role === 'owner' || role === 'editor'` → gate Edit and any record/adjust actions.
- Viewer → both disabled; keep the existing `accountActionsDisabled` (no selection) OR-ed in.
- Add tooltips explaining why disabled ("Owner only" / "Read-only access") — reuse the existing `Tooltip` wrappers.

> Note: the exact tier for Edit (rename/subtype/overdraft = Modify vs Manage) is per the backend authorization matrix — confirm against the backend handlers; if any of those are owner-only, gate Edit with `canManage` instead. Web gating is UX only; the backend enforces regardless.

- [ ] **Step 5: Run to verify pass + full suite**

Run: `pnpm exec vitest run src/features/accounts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/accounts/AccountsPane.tsx src/features/accounts/AccountsPane.test.tsx
git commit -m "feat(accounts): shared-with-me group + role-gated actions (tracker#29)"
```

---

## Task 8: MSW handlers + fixture realism

**Files:**

- Modify: `src/test/handlers.ts`

- [ ] **Step 1: Add default handlers for the sharing endpoints**

In `src/test/handlers.ts` (near the other account handlers, using `${apiBase}`):

```ts
http.get(`${apiBase}/api/accounts/:id/access`, () =>
  HttpResponse.json({
    access: [{ userId: 'u', role: 'owner', email: 'e', telegramUsername: null }],
  }),
),
http.post(`${apiBase}/api/accounts/:id/share`, () => new HttpResponse(null, { status: 204 })),
http.delete(`${apiBase}/api/accounts/:id/access/:userId`, () => new HttpResponse(null, { status: 204 })),
```

- [ ] **Step 2: Add `role` to the inline POST-account handler + any untyped account objects**

`src/test/handlers.ts:77-92` (the `POST /api/accounts` response object) → add `role: 'owner',`. Also `CreateAccountDialog.test.tsx:91-100` inline response → add `role: 'owner',` for realism.

- [ ] **Step 3: Run the whole unit suite**

Run: `just test`
Expected: PASS (MSW is `onUnhandledRequest: 'error'`, so the new default handlers prevent unrelated tests that touch these routes from failing).

- [ ] **Step 4: Commit**

```bash
git add src/test/handlers.ts src/features/accounts/CreateAccountDialog.test.tsx
git commit -m "test(accounts): MSW handlers + role fixtures for sharing (tracker#29)"
```

---

## Task 9: Profile — expose the user's sharing ID

**Files:**

- Create: `src/features/profile/UserIdCard.tsx` + `.test.tsx`
- Modify: `src/pages/ProfilePage.tsx` (mount in the general/first tab pane)

- [ ] **Step 1: Write the component (failing test first)**

`UserIdCard.test.tsx`: renders with a signed-in session (`saveSession({ userId: 'abc-123', … })`, wrap in `<AuthProvider>`); asserts the ID `abc-123` is shown and that clicking "Copy" calls `navigator.clipboard.writeText` with it (mock `navigator.clipboard`).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run src/features/profile/UserIdCard.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/features/profile/UserIdCard.tsx` — read `const { session } = useAuth();` and render the `session?.userId` with a copy button (shadcn `Button` + `Copy` icon; `void navigator.clipboard.writeText(session.userId)` guarded by `session?.userId`), plus the hint text: _"Share this ID with someone to let them add you to an account."_ Return `null` if no session.

- [ ] **Step 4: Mount it in ProfilePage**

Add `<UserIdCard />` to the general (first) tab pane in `src/pages/ProfilePage.tsx`. (If the general pane is a separate component, mount there; keep the page component thin.)

- [ ] **Step 5: Run to verify pass**

Run: `pnpm exec vitest run src/features/profile/UserIdCard.test.tsx src/pages/ProfilePage.test.tsx`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/features/profile/UserIdCard.tsx src/features/profile/UserIdCard.test.tsx src/pages/ProfilePage.tsx
git commit -m "feat(profile): show copyable user sharing ID (tracker#29)"
```

---

## Task 10: Full verification + E2E smoke

**Files:**

- Create: `e2e/share-account.spec.ts` (only if the backend is reachable in E2E; otherwise document as manual)

- [ ] **Step 1: Full check + unit suite**

Run: `just check && just test`
Expected: typecheck, lint, format-check, and all unit tests green.

- [ ] **Step 2: Use the `verify` skill to drive the flow**

Invoke the `verify` skill to exercise the real UI: sign in, open an owned account's "Manage access", paste a UUID, share as Viewer, confirm the row appears, then revoke it. Confirm the Profile page shows a copyable ID. (E2E against a live backend is optional; if the backend fixture supports two users, add `e2e/share-account.spec.ts` mirroring the existing Playwright specs; otherwise record the manual verification result.)

- [ ] **Step 3: Push branch & open web PR**

```bash
git push -u origin HEAD
gh pr create --title "feat(accounts): share an account with another user (tracker#29)" \
  --body "Web UI for account sharing. Depends on server-infra sharing read endpoints. Spec: docs/specs/2026-07-09-share-account-design.md"
```

---

## Notes / Out of scope

- No email/autocomplete resolution — share targets are pasted UUIDs.
- No invite-by-email for non-users; no granting Owner via UI; no in-place role edit (revoke + re-share).
- Closed-account handling for shared accounts kept minimal (owned-only closed section) to avoid scope creep.
