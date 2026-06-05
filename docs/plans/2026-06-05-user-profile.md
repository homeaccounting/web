# User Profile (View & Edit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a `/profile` route that lets a signed-in user change their default and base currency, manage labels/income-categories/expense-categories, change their password, and link/unlink Google + Telegram identities — fulfilling issue [#16](https://github.com/homeaccounting/web/issues/16).

**Architecture:** A new protected route `/profile` (with deep-linkable `/profile/:tab`) hosts three tab panes — General / Dictionaries / Auth — under `src/features/profile/`. The panes consume the existing `useConfiguration()` and a new shared `useUserProfile()` hook (both share TanStack Query cache keys with the rest of the app), and trigger mutations through new methods on the existing `usersApi` and `configurationApi` clients. The `UserMenu` dropdown is trimmed to **Profile** + **Sign out**; existing `LinkTelegramDialog` is reused from the Auth pane. There is no toast infrastructure in this repo; we follow the codebase pattern of inline `<Alert variant="destructive">` for errors and silent close-and-invalidate for success.

**Tech Stack:** React 18 + TypeScript (strict), Vite 6, TanStack Query, react-router-dom v6, react-hook-form + Zod (`@hookform/resolvers`), shadcn/ui on Radix + Tailwind, MSW 2.13.3 + Vitest + Testing Library for unit/component, Playwright for E2E.

**Spec:** [`docs/specs/2026-06-05-user-profile-design.md`](../specs/2026-06-05-user-profile-design.md).

---

## Prerequisite (blocking)

The General tab gates base-currency editing on a new boolean `baseCurrencyEditable` on `ConfigurationResponse`, derived backend-side from the user's External account's `hasTransactions`. **Track that change in a separate backend PR against `server-infra`** (spec §2.1). This plan codes the field as required on the TS type; the field is populated by MSW in tests and must be in production before the web PR ships.

Until the backend PR is merged, the web PR can be developed end-to-end against MSW: every test in this plan supplies `baseCurrencyEditable` in fixtures, so the FE work is unblocked.

## Phase 0 — Setup

### Task 0.1: Confirm branch + working tree

**Files:** none

- [ ] **Step 1:** Verify you are on a fresh branch off `master`:

  ```bash
  git fetch origin
  git checkout -b feat/user-profile origin/master
  ```

  If the branch already exists from earlier brainstorming (the spec commit lives there), `git checkout feat/user-profile` and confirm `git log --oneline -3` shows the spec commit at HEAD and `master` as its parent.

- [ ] **Step 2:** Sanity-check the dev toolchain:

  ```bash
  just install
  just check    # typecheck + lint + format-check
  just test     # vitest run
  ```

  All four should pass on the baseline. If they don't, stop and fix the baseline before continuing.

### Task 0.2: Add the shadcn primitives we need

**Files:**

- Create: `src/components/ui/tabs.tsx`
- Create: `src/components/ui/alert-dialog.tsx`
- Modify: `package.json`, `pnpm-lock.yaml` (auto-updated by shadcn-cli)

- [ ] **Step 1:** Vendor the components:

  ```bash
  pnpm dlx shadcn@latest add tabs alert-dialog
  ```

  This adds `@radix-ui/react-tabs` and `@radix-ui/react-alert-dialog` to `package.json`, refreshes the lockfile, and writes the two new files into `src/components/ui/`. Per CLAUDE.md these files are ESLint-excluded vendored output — do not hand-edit them.

- [ ] **Step 2:** Verify nothing else regressed:

  ```bash
  just check
  ```

  Expected: pass. (No runtime tests reference these yet.)

- [ ] **Step 3:** Commit:

  ```bash
  git add src/components/ui/tabs.tsx src/components/ui/alert-dialog.tsx package.json pnpm-lock.yaml
  git commit -m "chore(ui): vendor shadcn tabs + alert-dialog"
  ```

## Phase 1 — Foundations (types, fixtures, API client)

Each task here is a self-contained vertical that ends in green tests, so later phases can build on stable scaffolding.

### Task 1.1: Extend `ConfigurationResponse` and fixtures with new fields

**Files:**

- Modify: `src/api/types.ts`
- Modify: `src/test/fixtures.ts`

- [ ] **Step 1: Write the failing fixture-shape test**

  Append to `src/test/fixtures.test.ts` (create if absent — there isn't one today; if you'd rather, fold this check into `src/features/configuration/useConfiguration.test.ts` instead. Either is fine; prefer the dedicated file for clarity):

  ```ts
  import { describe, it, expect } from 'vitest';
  import { configurationFixture } from './fixtures';

  describe('configurationFixture', () => {
    it('exposes baseCurrencyEditable', () => {
      expect(configurationFixture.baseCurrencyEditable).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run it to verify it fails**

  ```bash
  pnpm exec vitest run src/test/fixtures.test.ts
  ```

  Expected: FAIL — property `baseCurrencyEditable` missing.

- [ ] **Step 3: Update the type**

  In `src/api/types.ts` `ConfigurationResponse`, add:

  ```ts
  // Backend Web.API.ConfigurationAPI.ConfigurationResponse adds these:
  // booksClosedThrough has been present on the backend since the books-close
  // slice landed; baseCurrencyEditable is added in the issue-#16 backend PR.
  booksClosedThrough?: ISO8601 | null;
  baseCurrencyEditable: boolean;
  ```

- [ ] **Step 4: Update the fixture**

  In `src/test/fixtures.ts`, add `baseCurrencyEditable: true` to `configurationFixture`. Don't add `booksClosedThrough` — it's optional and the FE doesn't need it for this slice.

- [ ] **Step 5: Run tests and typecheck**

  ```bash
  pnpm exec vitest run src/test/fixtures.test.ts
  just typecheck
  ```

  Expected: PASS for both. Typecheck may surface other callers that destructure `ConfigurationResponse` — there should be none requiring change, since the new field is additive.

- [ ] **Step 6: Commit**

  ```bash
  git add src/api/types.ts src/test/fixtures.ts src/test/fixtures.test.ts
  git commit -m "feat(api): add baseCurrencyEditable to ConfigurationResponse"
  ```

### Task 1.2: Add new request/response DTOs to `types.ts`

**Files:**

- Modify: `src/api/types.ts`

- [ ] **Step 1: Write the failing type-shape test**

  Create `src/api/types.test.ts` (or append if it exists):

  ```ts
  import { describe, it, expectTypeOf } from 'vitest';
  import type {
    ChangePasswordRequest,
    ChangeCurrencyRequest,
    AddEntryRequest,
    AddEntryResponse,
    RenameEntryRequest,
  } from './types';

  describe('User Profile DTOs', () => {
    it('ChangePasswordRequest has currentPassword + newPassword', () => {
      expectTypeOf<ChangePasswordRequest>().toEqualTypeOf<{
        currentPassword: string;
        newPassword: string;
      }>();
    });

    it('ChangeCurrencyRequest has currency', () => {
      expectTypeOf<ChangeCurrencyRequest>().toEqualTypeOf<{ currency: string }>();
    });

    it('AddEntryRequest has name', () => {
      expectTypeOf<AddEntryRequest>().toEqualTypeOf<{ name: string }>();
    });

    it('AddEntryResponse has id and name', () => {
      expectTypeOf<AddEntryResponse>().toEqualTypeOf<{ id: string; name: string }>();
    });

    it('RenameEntryRequest has name', () => {
      expectTypeOf<RenameEntryRequest>().toEqualTypeOf<{ name: string }>();
    });
  });
  ```

- [ ] **Step 2: Run to verify it fails**

  ```bash
  pnpm exec vitest run src/api/types.test.ts
  ```

  Expected: type errors — these types aren't exported yet.

- [ ] **Step 3: Add the types**

  Append to `src/api/types.ts` (file references the backend source it mirrors — keep the comment style consistent):

  ```ts
  // Mirrors backend Web/API/UserAPI.hs:122-130.
  export interface ChangePasswordRequest {
    currentPassword: string;
    newPassword: string;
  }

  // Mirrors backend Web/API/ConfigurationAPI.hs:226-233.
  export interface ChangeCurrencyRequest {
    currency: string;
  }

  // Mirrors backend Web/API/ConfigurationAPI.hs:236-243.
  export interface AddEntryRequest {
    name: string;
  }

  // Mirrors backend Web/API/ConfigurationAPI.hs:246-254.
  export interface AddEntryResponse {
    id: UUID;
    name: string;
  }

  // Mirrors backend Web/API/ConfigurationAPI.hs:257-264.
  export interface RenameEntryRequest {
    name: string;
  }
  ```

- [ ] **Step 4: Run + typecheck**

  ```bash
  pnpm exec vitest run src/api/types.test.ts
  just typecheck
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/api/types.ts src/api/types.test.ts
  git commit -m "feat(api): add DTOs for user profile and dictionary ops"
  ```

### Task 1.3: Extend `usersApi` with changePassword / unlinkOAuth / unlinkTelegram

**Files:**

- Modify: `src/api/users.ts`
- Create: `src/api/users.test.ts`

- [ ] **Step 1: Write failing tests**

  Create `src/api/users.test.ts` following the existing pattern in `src/api/transactions.test.ts` (stub `fetch`, assert URL + method + body):

  ```ts
  import { describe, expect, it, vi, beforeEach } from 'vitest';
  import { ApiClient } from './client';
  import { usersApi } from './users';

  const mkClient = () =>
    new ApiClient({
      baseUrl: 'http://test',
      getToken: () => 'jwt',
      onUnauthorized: () => undefined,
    });

  describe('usersApi', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    });

    it('POSTs change-password', async () => {
      await usersApi(mkClient()).changePassword({
        currentPassword: 'old',
        newPassword: 'new-12345',
      });
      expect(fetch).toHaveBeenCalledWith(
        'http://test/api/users/me/change-password',
        expect.objectContaining({
          method: 'POST',
          body: '{"currentPassword":"old","newPassword":"new-12345"}',
        }),
      );
    });

    it('DELETEs unlinkOAuth using lowercase slug', async () => {
      await usersApi(mkClient()).unlinkOAuth('Google');
      expect(fetch).toHaveBeenCalledWith(
        'http://test/api/users/me/oauth/google',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('DELETEs unlinkTelegram', async () => {
      await usersApi(mkClient()).unlinkTelegram();
      expect(fetch).toHaveBeenCalledWith(
        'http://test/api/users/me/telegram',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });
  ```

- [ ] **Step 2: Run to verify it fails**

  ```bash
  pnpm exec vitest run src/api/users.test.ts
  ```

  Expected: FAIL — methods don't exist.

- [ ] **Step 3: Implement**

  Replace `src/api/users.ts` with:

  ```ts
  import type { ChangePasswordRequest, OAuthProviderName, UserProfileResponse } from './types';
  import type { ApiClient } from './client';

  export const usersApi = (client: ApiClient) => ({
    getMe: () => client.get<UserProfileResponse>('/api/users/me'),
    changePassword: (body: ChangePasswordRequest) =>
      client.post<void>('/api/users/me/change-password', body),
    // Backend `Capture "provider" Text` accepts lowercase slug, same convention
    // as authApi.initiateOAuth — convert PascalCase to slug at the call site.
    unlinkOAuth: (provider: OAuthProviderName) =>
      client.delete<void>(`/api/users/me/oauth/${provider.toLowerCase()}`),
    unlinkTelegram: () => client.delete<void>('/api/users/me/telegram'),
  });
  ```

- [ ] **Step 4: Run + lint**

  ```bash
  pnpm exec vitest run src/api/users.test.ts
  just check
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/api/users.ts src/api/users.test.ts
  git commit -m "feat(api): add change-password, unlink-oauth, unlink-telegram"
  ```

### Task 1.4: Extend `configurationApi` with currency + dictionary mutations

**Files:**

- Modify: `src/api/configuration.ts`
- Create: `src/api/configuration.test.ts`

- [ ] **Step 1: Write failing tests**

  Create `src/api/configuration.test.ts` (same `fetch`-stub pattern):

  ```ts
  import { describe, expect, it, vi, beforeEach } from 'vitest';
  import { ApiClient } from './client';
  import { configurationApi } from './configuration';

  const mkClient = () =>
    new ApiClient({
      baseUrl: 'http://test',
      getToken: () => 'jwt',
      onUnauthorized: () => undefined,
    });

  describe('configurationApi', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    });

    it('PUTs base currency', async () => {
      await configurationApi(mkClient()).setBaseCurrency({ currency: 'EUR' });
      expect(fetch).toHaveBeenCalledWith(
        'http://test/api/users/me/configuration/base-currency',
        expect.objectContaining({ method: 'PUT', body: '{"currency":"EUR"}' }),
      );
    });

    it('PUTs default currency', async () => {
      await configurationApi(mkClient()).setDefaultCurrency({ currency: 'EUR' });
      expect(fetch).toHaveBeenCalledWith(
        'http://test/api/users/me/configuration/default-currency',
        expect.objectContaining({ method: 'PUT', body: '{"currency":"EUR"}' }),
      );
    });

    it('GETs a single dictionary', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ entries: [] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      );
      await configurationApi(mkClient()).listDictionary('labels');
      expect(fetch).toHaveBeenCalledWith(
        'http://test/api/users/me/configuration/dictionaries/labels',
        expect.objectContaining({ method: 'GET' }),
      );
    });

    it('POSTs an entry', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(JSON.stringify({ id: 'e-1', name: 'trip' }), {
            status: 201,
            headers: { 'content-type': 'application/json' },
          }),
        ),
      );
      await configurationApi(mkClient()).addEntry('labels', { name: 'trip' });
      expect(fetch).toHaveBeenCalledWith(
        'http://test/api/users/me/configuration/dictionaries/labels/entries',
        expect.objectContaining({ method: 'POST', body: '{"name":"trip"}' }),
      );
    });

    it('PUTs a rename', async () => {
      await configurationApi(mkClient()).renameEntry('labels', 'e-1', { name: 'travel' });
      expect(fetch).toHaveBeenCalledWith(
        'http://test/api/users/me/configuration/dictionaries/labels/entries/e-1',
        expect.objectContaining({ method: 'PUT', body: '{"name":"travel"}' }),
      );
    });

    it('DELETEs an entry', async () => {
      await configurationApi(mkClient()).removeEntry('labels', 'e-1');
      expect(fetch).toHaveBeenCalledWith(
        'http://test/api/users/me/configuration/dictionaries/labels/entries/e-1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });
  ```

- [ ] **Step 2: Run to verify it fails**

  ```bash
  pnpm exec vitest run src/api/configuration.test.ts
  ```

- [ ] **Step 3: Implement**

  Replace `src/api/configuration.ts` with:

  ```ts
  import type { ApiClient } from './client';
  import type {
    AddEntryRequest,
    AddEntryResponse,
    ChangeCurrencyRequest,
    ConfigurationResponse,
    DictionaryResponse,
    RenameEntryRequest,
    UUID,
  } from './types';

  export const configurationApi = (client: ApiClient) => ({
    get: (): Promise<ConfigurationResponse> =>
      client.get<ConfigurationResponse>('/api/users/me/configuration'),
    setBaseCurrency: (body: ChangeCurrencyRequest) =>
      client.put<void>('/api/users/me/configuration/base-currency', body),
    setDefaultCurrency: (body: ChangeCurrencyRequest) =>
      client.put<void>('/api/users/me/configuration/default-currency', body),
    listDictionary: (dictId: string) =>
      client.get<DictionaryResponse>(`/api/users/me/configuration/dictionaries/${dictId}`),
    addEntry: (dictId: string, body: AddEntryRequest) =>
      client.post<AddEntryResponse>(
        `/api/users/me/configuration/dictionaries/${dictId}/entries`,
        body,
      ),
    renameEntry: (dictId: string, entryId: UUID, body: RenameEntryRequest) =>
      client.put<void>(
        `/api/users/me/configuration/dictionaries/${dictId}/entries/${entryId}`,
        body,
      ),
    removeEntry: (dictId: string, entryId: UUID) =>
      client.delete<void>(`/api/users/me/configuration/dictionaries/${dictId}/entries/${entryId}`),
  });
  ```

- [ ] **Step 4: Run + lint**

  ```bash
  pnpm exec vitest run src/api/configuration.test.ts
  just check
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src/api/configuration.ts src/api/configuration.test.ts
  git commit -m "feat(api): add currency and dictionary mutations to configurationApi"
  ```

### Task 1.5: Add MSW handlers for the new endpoints

**Files:**

- Modify: `src/test/handlers.ts`

- [ ] **Step 1:** Append handlers to `src/test/handlers.ts` (just before the closing `]` of `export const handlers`):

  ```ts
    http.put(`${apiBase}/api/users/me/configuration/base-currency`, () =>
      new HttpResponse(null, { status: 204 }),
    ),
    http.put(`${apiBase}/api/users/me/configuration/default-currency`, () =>
      new HttpResponse(null, { status: 204 }),
    ),
    http.post(
      `${apiBase}/api/users/me/configuration/dictionaries/:dictId/entries`,
      async ({ request }) => {
        const body = (await request.json()) as { name: string };
        return HttpResponse.json(
          { id: 'entry-new', name: body.name },
          { status: 201 },
        );
      },
    ),
    http.put(
      `${apiBase}/api/users/me/configuration/dictionaries/:dictId/entries/:entryId`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.delete(
      `${apiBase}/api/users/me/configuration/dictionaries/:dictId/entries/:entryId`,
      () => new HttpResponse(null, { status: 204 }),
    ),
    http.post(`${apiBase}/api/users/me/change-password`, () =>
      new HttpResponse(null, { status: 204 }),
    ),
    http.delete(`${apiBase}/api/users/me/oauth/:provider`, () =>
      new HttpResponse(null, { status: 204 }),
    ),
    http.delete(`${apiBase}/api/users/me/telegram`, () =>
      new HttpResponse(null, { status: 204 }),
    ),
  ```

- [ ] **Step 2:** Run the existing test suite to confirm we haven't broken anything; MSW handlers default to success, and the suite shouldn't hit them yet:

  ```bash
  just test
  ```

  Expected: PASS.

- [ ] **Step 3:** Commit:

  ```bash
  git add src/test/handlers.ts
  git commit -m "test: add MSW handlers for profile/configuration mutations"
  ```

## Phase 2 — Route shell, page, and `UserMenu` trim

After this phase, navigating to `/app/profile` renders a page with three empty tab placeholders, and `UserMenu` shows only Profile + Sign out.

### Task 2.1: Extend `oauthFlow` with optional `returnTo`

**Files:**

- Modify: `src/auth/oauthFlow.ts`
- Modify: `src/auth/oauthFlow.test.ts`

- [ ] **Step 1: Write failing test**

  Append to `src/auth/oauthFlow.test.ts`:

  ```ts
  import { beginLinkFlow, takeOAuthState, takeLinkReturnTo } from './oauthFlow';

  describe('beginLinkFlow returnTo', () => {
    beforeEach(() => sessionStorage.clear());

    it('round-trips a returnTo path via session storage', () => {
      beginLinkFlow({ returnTo: '/profile/auth' });
      // takeOAuthState() is called first in the real flow; mirror that.
      sessionStorage.setItem('ha.oauth.state', 'state-abc');
      void takeOAuthState();
      expect(takeLinkReturnTo()).toBe('/profile/auth');
      // second read returns null
      expect(takeLinkReturnTo()).toBeNull();
    });

    it('returns null when beginLinkFlow was called without returnTo', () => {
      beginLinkFlow();
      expect(takeLinkReturnTo()).toBeNull();
    });
  });
  ```

- [ ] **Step 2: Run to verify it fails**

  ```bash
  pnpm exec vitest run src/auth/oauthFlow.test.ts
  ```

  Expected: FAIL (`takeLinkReturnTo` undefined, `beginLinkFlow` rejects argument).

- [ ] **Step 3: Implement**

  In `src/auth/oauthFlow.ts`:

  ```ts
  const RETURN_TO_KEY = 'ha.oauth.returnTo';

  export interface BeginLinkFlowOptions {
    returnTo?: string;
  }

  export function beginLinkFlow(opts: BeginLinkFlowOptions = {}): void {
    sessionStorage.setItem(LINKING_KEY, '1');
    if (opts.returnTo) {
      sessionStorage.setItem(RETURN_TO_KEY, opts.returnTo);
    } else {
      sessionStorage.removeItem(RETURN_TO_KEY);
    }
  }

  export function takeLinkReturnTo(): string | null {
    const v = sessionStorage.getItem(RETURN_TO_KEY);
    sessionStorage.removeItem(RETURN_TO_KEY);
    return v;
  }
  ```

  Also: the existing `takeOAuthState()` already wipes `LINKING_KEY`; leave that intact. `takeLinkReturnTo` is a separate one-shot consumer.

- [ ] **Step 4: Run**

  ```bash
  pnpm exec vitest run src/auth/oauthFlow.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Update `OAuthCallbackPage` to honour returnTo on the link branch**

  In `src/pages/OAuthCallbackPage.tsx`, just after the existing `await api.linkOAuth(...)` line, replace the unconditional `navigate('/', { replace: true })` with:

  ```ts
  const returnTo = linking ? takeLinkReturnTo() : null;
  navigate(returnTo ?? '/', { replace: true });
  ```

  Add `takeLinkReturnTo` to the existing `@/auth/oauthFlow` import.

- [ ] **Step 6: Add a test for the callback's returnTo branch**

  Append to `src/pages/OAuthCallbackPage.test.tsx`:

  ```ts
  it('navigates to returnTo after a successful link', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    sessionStorage.setItem('ha.oauth.state', 'state-link');
    sessionStorage.setItem('ha.oauth.linking', '1');
    sessionStorage.setItem('ha.oauth.returnTo', '/profile/auth');

    renderWithProviders(
      <AuthProvider>
        <OAuthCallbackPage />
      </AuthProvider>,
      { initialPath: '/auth/oauth/google/callback?code=c&state=state-link' },
    );

    await waitFor(() =>
      expect(mockNavigate).toHaveBeenCalledWith('/profile/auth', { replace: true }),
    );
  });
  ```

  Match the existing file's `mockNavigate` plumbing — re-use whatever mock helper is already in `OAuthCallbackPage.test.tsx`.

- [ ] **Step 7: Run + lint**

  ```bash
  pnpm exec vitest run src/auth src/pages/OAuthCallbackPage.test.tsx
  just check
  ```

- [ ] **Step 8: Commit**

  ```bash
  git add src/auth/oauthFlow.ts src/auth/oauthFlow.test.ts \
          src/pages/OAuthCallbackPage.tsx src/pages/OAuthCallbackPage.test.tsx
  git commit -m "feat(auth): support returnTo on OAuth link flow"
  ```

### Task 2.2: Shared `useUserProfile` hook

**Files:**

- Create: `src/features/profile/useUserProfile.ts`
- Create: `src/features/profile/useUserProfile.test.ts`

The hook is just `useConfiguration`'s sibling for the user-profile endpoint — same auth and client wiring, same query key `['users', 'me']` (UserMenu already uses this key).

- [ ] **Step 1: Write failing test**

  Create `src/features/profile/useUserProfile.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { renderHook, waitFor } from '@testing-library/react';
  import { QueryClientProvider } from '@tanstack/react-query';
  import { saveSession } from '@/auth/storage';
  import { AuthProvider } from '@/auth/AuthContext';
  import { makeQueryClient } from '@/test/utils';
  import { useUserProfile } from './useUserProfile';

  describe('useUserProfile', () => {
    it('queries /api/users/me and returns the profile', async () => {
      saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
      const client = makeQueryClient();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>
          <AuthProvider>{children}</AuthProvider>
        </QueryClientProvider>
      );
      const { result } = renderHook(() => useUserProfile(), { wrapper });
      await waitFor(() => expect(result.current.data?.email).toBe('alice@example.com'));
    });
  });
  ```

- [ ] **Step 2: Run to verify it fails**

- [ ] **Step 3: Implement**

  Create `src/features/profile/useUserProfile.ts`. Model on `src/features/configuration/useConfiguration.ts`:

  ```ts
  import { useQuery } from '@tanstack/react-query';
  import { ApiClient } from '@/api/client';
  import { usersApi } from '@/api/users';
  import { useAuth } from '@/auth/useAuth';

  const baseUrl =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

  export function useUserProfile() {
    const { tokenRef, signOut, session } = useAuth();
    return useQuery({
      queryKey: ['users', 'me'],
      enabled: !!session,
      queryFn: () => {
        const client = new ApiClient({
          baseUrl,
          getToken: () => tokenRef.current,
          onUnauthorized: signOut,
        });
        return usersApi(client).getMe();
      },
    });
  }
  ```

- [ ] **Step 4: Run + lint**

- [ ] **Step 5: Commit**

  ```bash
  git add src/features/profile/useUserProfile.ts src/features/profile/useUserProfile.test.ts
  git commit -m "feat(profile): add shared useUserProfile hook"
  ```

### Task 2.3: `ProfilePage` shell with tab plumbing

**Files:**

- Create: `src/pages/ProfilePage.tsx`
- Create: `src/pages/ProfilePage.test.tsx`
- Modify: `src/App.tsx`

The page is intentionally thin in this task — three tab triggers, three empty `<TabsContent>` placeholders that the next phases fill in.

- [ ] **Step 1: Write failing tests**

  Create `src/pages/ProfilePage.test.tsx`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { screen } from '@testing-library/react';
  import userEvent from '@testing-library/user-event';
  import { saveSession } from '@/auth/storage';
  import { AuthProvider } from '@/auth/AuthContext';
  import { renderWithProviders } from '@/test/utils';
  import ProfilePage from './ProfilePage';

  describe('ProfilePage', () => {
    beforeEach(() => {
      saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    });

    it('renders three tabs with General selected by default', async () => {
      renderWithProviders(
        <AuthProvider>
          <ProfilePage />
        </AuthProvider>,
        { initialPath: '/profile' },
      );
      expect(screen.getByRole('tab', { name: /general/i })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(screen.getByRole('tab', { name: /dictionaries/i })).toBeInTheDocument();
      expect(screen.getByRole('tab', { name: /auth/i })).toBeInTheDocument();
    });

    it('deep-links to the dictionaries tab', () => {
      renderWithProviders(
        <AuthProvider>
          <ProfilePage />
        </AuthProvider>,
        { initialPath: '/profile/dictionaries' },
      );
      expect(screen.getByRole('tab', { name: /dictionaries/i })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });

    it('clicking a tab updates the URL', async () => {
      renderWithProviders(
        <AuthProvider>
          <ProfilePage />
        </AuthProvider>,
        { initialPath: '/profile' },
      );
      await userEvent.setup().click(screen.getByRole('tab', { name: /auth/i }));
      expect(window.location.pathname).toBe('/profile/auth');
    });
  });
  ```

  Note: `MemoryRouter` doesn't update `window.location` — the third test will need a different verification. Adjust the test to read the active tab after clicking, or extract `useLocation()` inside a `LocationProbe` test helper. Use the simpler "active tab updates" assertion:

  ```ts
    it('clicking a tab makes it active', async () => {
      renderWithProviders(
        <AuthProvider>
          <ProfilePage />
        </AuthProvider>,
        { initialPath: '/profile' },
      );
      await userEvent.setup().click(screen.getByRole('tab', { name: /auth/i }));
      expect(screen.getByRole('tab', { name: /auth/i })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });
  ```

- [ ] **Step 2: Run to verify failures** — file doesn't exist yet, all should fail.

- [ ] **Step 3: Implement `ProfilePage`**

  Create `src/pages/ProfilePage.tsx`:

  ```tsx
  import { Navigate, useNavigate, useParams } from 'react-router-dom';
  import { Header } from '@/components/Header';
  import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

  const TABS = ['general', 'dictionaries', 'auth'] as const;
  type Tab = (typeof TABS)[number];

  function isTab(value: string | undefined): value is Tab {
    return TABS.includes(value as Tab);
  }

  export default function ProfilePage() {
    const { tab } = useParams<{ tab?: string }>();
    const navigate = useNavigate();
    const active: Tab | undefined = isTab(tab) ? tab : tab === undefined ? 'general' : undefined;

    if (active === undefined) {
      return <Navigate to="/profile/general" replace />;
    }

    return (
      <div className="flex h-screen flex-col">
        <Header />
        <main className="mx-auto w-full max-w-3xl flex-1 overflow-y-auto p-6">
          <h1 className="mb-6 text-xl font-semibold">Profile</h1>
          <Tabs value={active} onValueChange={(next) => navigate(`/profile/${next}`)}>
            <TabsList>
              <TabsTrigger value="general">General</TabsTrigger>
              <TabsTrigger value="dictionaries">Dictionaries</TabsTrigger>
              <TabsTrigger value="auth">Auth</TabsTrigger>
            </TabsList>
            <TabsContent value="general">{/* Phase 3 */}</TabsContent>
            <TabsContent value="dictionaries">{/* Phase 4 */}</TabsContent>
            <TabsContent value="auth">{/* Phase 5 */}</TabsContent>
          </Tabs>
        </main>
      </div>
    );
  }
  ```

- [ ] **Step 4: Wire up the routes**

  In `src/App.tsx`, inside the `ProtectedRoute` block, add:

  ```tsx
  <Route path="/profile" element={<ProfilePage />} />
  <Route path="/profile/:tab" element={<ProfilePage />} />
  ```

  And the import:

  ```tsx
  import ProfilePage from '@/pages/ProfilePage';
  ```

- [ ] **Step 5: Run + lint**

  ```bash
  pnpm exec vitest run src/pages/ProfilePage.test.tsx
  just check
  ```

- [ ] **Step 6: Commit**

  ```bash
  git add src/pages/ProfilePage.tsx src/pages/ProfilePage.test.tsx src/App.tsx
  git commit -m "feat(profile): add /profile route with tab shell"
  ```

### Task 2.4: Trim `UserMenu`

**Files:**

- Modify: `src/components/UserMenu.tsx`
- Modify: `src/components/UserMenu.test.tsx`

- [ ] **Step 1: Update the tests first (red)**

  Replace the contents of `src/components/UserMenu.test.tsx` with assertions that:
  - The menu contains a **Profile** link to `/profile` and a **Sign out** item.
  - The menu no longer contains Link Google / Link Telegram items.

  ```tsx
  import { describe, expect, it } from 'vitest';
  import userEvent from '@testing-library/user-event';
  import { screen } from '@testing-library/react';
  import { renderWithProviders } from '@/test/utils';
  import { AuthProvider } from '@/auth/AuthContext';
  import { saveSession } from '@/auth/storage';
  import { UserMenu } from './UserMenu';

  describe('UserMenu', () => {
    it('shows Profile link and Sign out only', async () => {
      saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
      renderWithProviders(
        <AuthProvider>
          <UserMenu />
        </AuthProvider>,
      );
      await userEvent.setup().click(await screen.findByRole('button', { name: /open user menu/i }));
      expect(screen.getByRole('menuitem', { name: /profile/i })).toBeInTheDocument();
      expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
      expect(screen.queryByText(/link google/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/link telegram/i)).not.toBeInTheDocument();
    });

    it('Profile menu item links to /profile', async () => {
      saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
      renderWithProviders(
        <AuthProvider>
          <UserMenu />
        </AuthProvider>,
      );
      const user = userEvent.setup();
      await user.click(await screen.findByRole('button', { name: /open user menu/i }));
      const profile = await screen.findByRole('menuitem', { name: /profile/i });
      // Profile item is rendered with asChild + a <Link to="/profile" />
      expect(profile.querySelector('a')).toHaveAttribute('href', '/profile');
    });
  });
  ```

- [ ] **Step 2: Run to verify failures**

  ```bash
  pnpm exec vitest run src/components/UserMenu.test.tsx
  ```

- [ ] **Step 3: Implement the trimmed `UserMenu`**

  Replace `src/components/UserMenu.tsx`:

  ```tsx
  import { Link } from 'react-router-dom';
  import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
  } from '@/components/ui/dropdown-menu';
  import { Avatar, AvatarFallback } from '@/components/ui/avatar';
  import { Button } from '@/components/ui/button';
  import { useAuth } from '@/auth/useAuth';
  import { useUserProfile } from '@/features/profile/useUserProfile';

  export function UserMenu() {
    const { session, signOut } = useAuth();
    const { data: profile } = useUserProfile();
    const initials = (profile?.email ?? session?.email ?? '?').slice(0, 1).toUpperCase();

    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" aria-label="Open user menu" className="rounded-full p-0">
            <Avatar className="h-8 w-8">
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{profile?.email ?? session?.email ?? 'Account'}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/profile">Profile</Link>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={signOut}>Sign out</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  ```

  The `LinkTelegramDialog` import is removed (now used from `ProfileAuthPane` in Phase 5). `useUserProfile` replaces the inline `useQuery`, sharing the cache key with the rest of the app.

- [ ] **Step 4: Run + lint**

  ```bash
  pnpm exec vitest run src/components/UserMenu.test.tsx
  just check
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/UserMenu.tsx src/components/UserMenu.test.tsx
  git commit -m "feat(user-menu): trim to Profile + Sign out"
  ```

## Phase 3 — General tab

Single-pane mutations following the existing dialog pattern: inline `<Alert>` for errors, invalidate-on-success.

### Task 3.1: Hooks for currency mutations

**Files:**

- Create: `src/features/profile/useSetDefaultCurrency.ts`
- Create: `src/features/profile/useSetBaseCurrency.ts`
- Create: `src/features/profile/useSetDefaultCurrency.test.ts`
- Create: `src/features/profile/useSetBaseCurrency.test.ts`

Both hooks follow the `useCreateIncome` shape (TanStack `useMutation`, new `ApiClient` per request, invalidate `['configuration']` on success).

- [ ] **Step 1: Tests first**

  Create `src/features/profile/useSetDefaultCurrency.test.ts`:

  ```ts
  import { describe, expect, it } from 'vitest';
  import { renderHook, waitFor } from '@testing-library/react';
  import { QueryClientProvider } from '@tanstack/react-query';
  import { server } from '@/test/server';
  import { http, HttpResponse } from 'msw';
  import { saveSession } from '@/auth/storage';
  import { AuthProvider } from '@/auth/AuthContext';
  import { makeQueryClient } from '@/test/utils';
  import { useSetDefaultCurrency } from './useSetDefaultCurrency';

  describe('useSetDefaultCurrency', () => {
    it('sends PUT and invalidates configuration on success', async () => {
      saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
      let receivedBody: unknown = null;
      server.use(
        http.put(
          'http://localhost:8080/api/users/me/configuration/default-currency',
          async ({ request }) => {
            receivedBody = await request.json();
            return new HttpResponse(null, { status: 204 });
          },
        ),
      );
      const client = makeQueryClient();
      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={client}>
          <AuthProvider>{children}</AuthProvider>
        </QueryClientProvider>
      );
      const { result } = renderHook(() => useSetDefaultCurrency(), { wrapper });
      result.current.mutate({ currency: 'EUR' });
      await waitFor(() => expect(result.current.isSuccess).toBe(true));
      expect(receivedBody).toEqual({ currency: 'EUR' });
    });
  });
  ```

  Mirror the same for `useSetBaseCurrency.test.ts` against `/base-currency`.

- [ ] **Step 2: Run to verify fail**

- [ ] **Step 3: Implement the hooks**

  Both follow this template — `useSetDefaultCurrency.ts`:

  ```ts
  import { useMutation, useQueryClient } from '@tanstack/react-query';
  import { ApiClient } from '@/api/client';
  import { configurationApi } from '@/api/configuration';
  import type { ChangeCurrencyRequest } from '@/api/types';
  import { useAuth } from '@/auth/useAuth';

  const baseUrl =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

  export function useSetDefaultCurrency() {
    const { tokenRef, signOut } = useAuth();
    const queryClient = useQueryClient();
    return useMutation<void, Error, ChangeCurrencyRequest>({
      mutationFn: (body) => {
        const client = new ApiClient({
          baseUrl,
          getToken: () => tokenRef.current,
          onUnauthorized: signOut,
        });
        return configurationApi(client).setDefaultCurrency(body);
      },
      onSuccess: () => {
        void queryClient.invalidateQueries({ queryKey: ['configuration'] });
      },
    });
  }
  ```

  `useSetBaseCurrency.ts` is identical except `setBaseCurrency` and the file name.

- [ ] **Step 4: Run + lint**

- [ ] **Step 5: Commit**

  ```bash
  git add src/features/profile/useSet*Currency*
  git commit -m "feat(profile): add currency mutation hooks"
  ```

### Task 3.2: `ProfileGeneralPane`

**Files:**

- Create: `src/features/profile/ProfileGeneralPane.tsx`
- Create: `src/features/profile/ProfileGeneralPane.test.tsx`
- Modify: `src/pages/ProfilePage.tsx` (mount the pane)

The pane has two field rows; each is a tiny one-field form (Select + Save). The base-currency Save opens an `<AlertDialog>` for confirmation, and a `baseCurrencyEditable === false` branch renders the field disabled.

- [ ] **Step 1: Write component tests**

  Create `src/features/profile/ProfileGeneralPane.test.tsx`. Cover:
  1. Renders both selects with current values from `configurationFixture` (USD/USD).
  2. Default-currency Save: change to EUR → click Save → MSW handler is hit with `{ currency: 'EUR' }` → after success, Save button is disabled again and a status note ("Default currency updated") is visible. To assert this without toasts, use a small `data-testid="default-currency-status"` element in the component that reads the mutation's `isSuccess` / `error.message`.
  3. Base-currency Save opens an `AlertDialog` ("Change base currency from USD to EUR?"); Cancel closes without a request; Confirm fires the request and resolves like #2.
  4. With `configuration.baseCurrencyEditable: false`, the base-currency select is `disabled`, no Save button, and a locked notice is visible. Override fixture via `server.use(http.get('/configuration', () => ...))`.
  5. On 400 error from the default-currency endpoint, an inline `Alert` renders the backend's message. Use `server.use(...)` to return a 400 with `{ message: 'Bad currency' }`.

  Render with:

  ```tsx
  renderWithProviders(
    <AuthProvider>
      <ProfileGeneralPane />
    </AuthProvider>,
  );
  ```

- [ ] **Step 2: Run to verify failures**

- [ ] **Step 3: Implement `currencySchema.ts`**

  Create `src/features/profile/currencySchema.ts`:

  ```ts
  import { z } from 'zod';
  import { SUPPORTED_CURRENCIES } from '@/api/types';

  export const currencySchema = z.object({
    currency: z.enum(SUPPORTED_CURRENCIES),
  });
  export type CurrencyFormValues = z.infer<typeof currencySchema>;
  ```

- [ ] **Step 4: Implement `ProfileGeneralPane.tsx`**

  Skeleton (fill in the JSX with shadcn `<Select>`, `<Button>`, `<Alert>`, `<AlertDialog>`):

  ```tsx
  import { useState } from 'react';
  import { useForm } from 'react-hook-form';
  import { zodResolver } from '@hookform/resolvers/zod';
  import { useConfiguration } from '@/features/configuration/useConfiguration';
  import { useSetDefaultCurrency } from './useSetDefaultCurrency';
  import { useSetBaseCurrency } from './useSetBaseCurrency';
  import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '@/api/types';
  import { currencySchema, type CurrencyFormValues } from './currencySchema';
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
  } from '@/components/ui/select';
  import { Button } from '@/components/ui/button';
  import { Alert, AlertDescription } from '@/components/ui/alert';
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/components/ui/alert-dialog';
  import { Skeleton } from '@/components/ui/skeleton';
  import { ApiError } from '@/api/client';

  export function ProfileGeneralPane() {
    const config = useConfiguration();
    const setDefault = useSetDefaultCurrency();
    const setBase = useSetBaseCurrency();
    const [confirmingBase, setConfirmingBase] = useState<SupportedCurrency | null>(null);

    if (config.isPending) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-64" />
        </div>
      );
    }
    if (config.isError || !config.data) {
      return (
        <Alert variant="destructive">
          <AlertDescription>Failed to load configuration.</AlertDescription>
        </Alert>
      );
    }

    const c = config.data;
    return (
      <div className="space-y-8">
        <CurrencyRow
          id="defaultCurrency"
          label="Default currency"
          description="Used when creating new accounts and transactions."
          current={c.defaultCurrency}
          onSubmit={(values) => setDefault.mutate(values)}
          isPending={setDefault.isPending}
          error={setDefault.error}
          isSuccess={setDefault.isSuccess}
        />
        <CurrencyRow
          id="baseCurrency"
          label="Base currency"
          description={
            c.baseCurrencyEditable
              ? 'Re-bases the External account that anchors your reporting.'
              : 'Base currency is locked because your books already contain transactions.'
          }
          current={c.baseCurrency}
          disabled={!c.baseCurrencyEditable}
          onSubmit={(values) => setConfirmingBase(values.currency)}
          isPending={setBase.isPending}
          error={setBase.error}
          isSuccess={setBase.isSuccess}
        />
        <AlertDialog
          open={confirmingBase !== null}
          onOpenChange={(open) => !open && setConfirmingBase(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Change base currency</AlertDialogTitle>
              <AlertDialogDescription>
                Change base currency from {c.baseCurrency} to {confirmingBase}? This re-bases the
                External account that anchors your reporting. This cannot be undone from the UI.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirmingBase) {
                    setBase.mutate({ currency: confirmingBase });
                  }
                  setConfirmingBase(null);
                }}
              >
                Change base currency
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    );
  }

  interface CurrencyRowProps {
    id: string;
    label: string;
    description: string;
    current: string;
    disabled?: boolean;
    onSubmit: (values: CurrencyFormValues) => void;
    isPending: boolean;
    error: Error | null;
    isSuccess: boolean;
  }

  function CurrencyRow({
    id,
    label,
    description,
    current,
    disabled,
    onSubmit,
    isPending,
    error,
    isSuccess,
  }: CurrencyRowProps) {
    const form = useForm<CurrencyFormValues>({
      resolver: zodResolver(currencySchema),
      defaultValues: { currency: current as SupportedCurrency },
    });
    const selected = form.watch('currency');
    const dirty = selected !== current;
    const message =
      error instanceof ApiError ? (error.fieldErrors?.currency ?? error.message) : error?.message;

    return (
      <form
        className="space-y-2"
        onSubmit={form.handleSubmit(onSubmit)}
        aria-labelledby={`${id}-label`}
      >
        <div className="flex items-center gap-3">
          <label id={`${id}-label`} htmlFor={id} className="w-40 text-sm font-medium">
            {label}
          </label>
          <Select
            disabled={disabled}
            value={selected}
            onValueChange={(v) => form.setValue('currency', v as SupportedCurrency)}
          >
            <SelectTrigger id={id} className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORTED_CURRENCIES.map((cur) => (
                <SelectItem key={cur} value={cur}>
                  {cur}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!disabled && (
            <Button type="submit" disabled={!dirty || isPending}>
              {isPending ? 'Saving…' : 'Save'}
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
        {message && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}
        {isSuccess && (
          <p data-testid={`${id}-status`} className="text-sm text-green-600">
            Updated.
          </p>
        )}
      </form>
    );
  }
  ```

- [ ] **Step 5: Mount the pane in `ProfilePage`**

  Replace the `general` placeholder with `<ProfileGeneralPane />`.

- [ ] **Step 6: Run + lint**

  ```bash
  pnpm exec vitest run src/features/profile/ProfileGeneralPane.test.tsx
  just check
  ```

- [ ] **Step 7: Commit**

  ```bash
  git add src/features/profile/ProfileGeneralPane.tsx \
          src/features/profile/ProfileGeneralPane.test.tsx \
          src/features/profile/currencySchema.ts \
          src/pages/ProfilePage.tsx
  git commit -m "feat(profile): General tab — default + base currency"
  ```

## Phase 4 — Dictionaries tab

A small reusable `DictionaryList` powers three lists (income-category, expense-category, labels). Each row supports inline rename, delete-with-confirm, and a footer "Add" row that expands into an inline input.

### Task 4.1: Mutation hooks and shared schema

**Files:**

- Create: `src/features/profile/entryNameSchema.ts`
- Create: `src/features/profile/useAddDictionaryEntry.ts`
- Create: `src/features/profile/useRenameDictionaryEntry.ts`
- Create: `src/features/profile/useRemoveDictionaryEntry.ts`
- Create: `src/features/profile/useAddDictionaryEntry.test.ts`
- Create: `src/features/profile/useRenameDictionaryEntry.test.ts`
- Create: `src/features/profile/useRemoveDictionaryEntry.test.ts`

- [ ] **Step 1: Schema**

  ```ts
  // entryNameSchema.ts
  import { z } from 'zod';
  // Mirrors backend mkEntryName (Domain/Core/Types.hs): nonempty, trimmed.
  export const entryNameSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(100, 'Too long'),
  });
  export type EntryNameFormValues = z.infer<typeof entryNameSchema>;
  ```

- [ ] **Step 2: Write hook tests**

  For each hook test:
  - `useAddDictionaryEntry`: assert POST URL contains `/dictionaries/labels/entries`, body has `{ name }`, and on success `['configuration']` is invalidated. Use a small custom QueryClient and assert `client.invalidateQueries` was called via a spy.
  - `useRenameDictionaryEntry`: assert PUT to `/entries/:entryId`, body `{ name }`.
  - `useRemoveDictionaryEntry`: assert DELETE to `/entries/:entryId`.

  Use the same `renderHook` + `QueryClientProvider` wrapper from Task 2.2.

- [ ] **Step 3: Run to verify fail**

- [ ] **Step 4: Implement hooks**

  Same shape as `useSetDefaultCurrency`, but each mutate signature:

  ```ts
  // useAddDictionaryEntry.ts
  type Vars = { dictId: string; name: string };
  return useMutation<AddEntryResponse, Error, Vars>({
    mutationFn: ({ dictId, name }) => configurationApi(client).addEntry(dictId, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['configuration'] }),
  });
  ```

  Same pattern for rename (`Vars = { dictId; entryId; name }`) and remove (`Vars = { dictId; entryId }`).

- [ ] **Step 5: Run + lint**

- [ ] **Step 6: Commit**

  ```bash
  git add src/features/profile/entryNameSchema.ts \
          src/features/profile/useAddDictionaryEntry.* \
          src/features/profile/useRenameDictionaryEntry.* \
          src/features/profile/useRemoveDictionaryEntry.*
  git commit -m "feat(profile): hooks for dictionary CRUD"
  ```

### Task 4.2: `DictionaryList` component

**Files:**

- Create: `src/features/profile/DictionaryList.tsx`
- Create: `src/features/profile/DictionaryList.test.tsx`

The component owns row-level state (which row is being edited, which row is being deleted) and delegates I/O to the three hooks from Task 4.1.

- [ ] **Step 1: Write tests** covering:
  1. Renders one row per entry with the entry name.
  2. Add row: click "Add label" → input appears with focus → type "trip" + Enter → POST is sent; the inline input clears.
  3. Escape on Add cancels and does NOT send a request.
  4. Rename: click pencil → input appears with the current name pre-filled → edit + Enter → PUT is sent.
  5. Delete: click trash → AlertDialog appears with the entry's name → Confirm → DELETE is sent.
  6. Backend 409 on remove (`{ message: 'Label still in use' }`) → an inline `Alert` appears in the list-level area; row stays.
  7. Empty list shows "No entries yet" above the Add row.

  Render with both real hooks and a `QueryClientProvider`:

  ```tsx
  renderWithProviders(
    <AuthProvider>
      <DictionaryList
        dictId="labels"
        title="Labels"
        entries={[{ id: 'l-1', name: 'travel' }]}
        addLabel="Add label"
      />
    </AuthProvider>,
  );
  ```

- [ ] **Step 2: Run to verify fail**

- [ ] **Step 3: Implement**

  Sketch:

  ```tsx
  import { useState } from 'react';
  import { Pencil, Trash2, Plus } from 'lucide-react';
  import type { DictionaryEntryResponse } from '@/api/types';
  import { Input } from '@/components/ui/input';
  import { Button } from '@/components/ui/button';
  import { Alert, AlertDescription } from '@/components/ui/alert';
  import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
  } from '@/components/ui/alert-dialog';
  import { useAddDictionaryEntry } from './useAddDictionaryEntry';
  import { useRenameDictionaryEntry } from './useRenameDictionaryEntry';
  import { useRemoveDictionaryEntry } from './useRemoveDictionaryEntry';
  import { entryNameSchema } from './entryNameSchema';

  interface Props {
    dictId: string;
    title: string;
    entries: DictionaryEntryResponse[];
    addLabel: string;
  }

  export function DictionaryList({ dictId, title, entries, addLabel }: Props) {
    const add = useAddDictionaryEntry();
    const rename = useRenameDictionaryEntry();
    const remove = useRemoveDictionaryEntry();
    const [editing, setEditing] = useState<{ id: string; value: string } | null>(null);
    const [adding, setAdding] = useState<{ value: string } | null>(null);
    const [deleting, setDeleting] = useState<DictionaryEntryResponse | null>(null);
    const opError = add.error ?? rename.error ?? remove.error;

    const submitAdd = () => {
      if (!adding) return;
      const parsed = entryNameSchema.safeParse({ name: adding.value });
      if (!parsed.success) return;
      add.mutate({ dictId, name: parsed.data.name }, { onSuccess: () => setAdding(null) });
    };

    const submitRename = () => {
      if (!editing) return;
      const parsed = entryNameSchema.safeParse({ name: editing.value });
      if (!parsed.success) return;
      rename.mutate(
        { dictId, entryId: editing.id, name: parsed.data.name },
        { onSuccess: () => setEditing(null) },
      );
    };

    return (
      <section className="space-y-2" aria-labelledby={`${dictId}-heading`}>
        <h3 id={`${dictId}-heading`} className="text-sm font-semibold">
          {title}
        </h3>
        {entries.length === 0 && <p className="text-sm text-muted-foreground">No entries yet</p>}
        <ul className="divide-y">
          {entries.map((e) =>
            editing?.id === e.id ? (
              <li key={e.id} className="flex items-center gap-2 py-2">
                <Input
                  autoFocus
                  value={editing.value}
                  onChange={(ev) => setEditing({ id: e.id, value: ev.target.value })}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter') submitRename();
                    if (ev.key === 'Escape') setEditing(null);
                  }}
                  onBlur={submitRename}
                  aria-label={`Rename ${e.name}`}
                />
              </li>
            ) : (
              <li key={e.id} className="flex items-center justify-between py-2">
                <span>{e.name}</span>
                <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 sm:group-hover:opacity-100">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Rename ${e.name}`}
                    onClick={() => setEditing({ id: e.id, value: e.name })}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete ${e.name}`}
                    onClick={() => setDeleting(e)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
        {adding ? (
          <Input
            autoFocus
            value={adding.value}
            onChange={(ev) => setAdding({ value: ev.target.value })}
            onKeyDown={(ev) => {
              if (ev.key === 'Enter') submitAdd();
              if (ev.key === 'Escape') setAdding(null);
            }}
            onBlur={submitAdd}
            placeholder={addLabel}
            aria-label={addLabel}
          />
        ) : (
          <Button variant="outline" size="sm" onClick={() => setAdding({ value: '' })}>
            <Plus className="mr-1 h-4 w-4" />
            {addLabel}
          </Button>
        )}
        {opError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{opError.message}</AlertDescription>
          </Alert>
        )}
        <AlertDialog open={deleting !== null} onOpenChange={(open) => !open && setDeleting(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {deleting?.name}?</AlertDialogTitle>
              <AlertDialogDescription>
                Transactions tagged with it will not be deleted.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (deleting) {
                    remove.mutate({ dictId, entryId: deleting.id });
                  }
                  setDeleting(null);
                }}
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </section>
    );
  }
  ```

  (Note: the hover-visibility CSS uses `group-hover`; wrap the `<li>` in `group` if you want the hover-only behaviour. For tests, the buttons need to be queryable even when hidden — happy-dom renders them; that's fine.)

- [ ] **Step 4: Run + lint**

- [ ] **Step 5: Commit**

  ```bash
  git add src/features/profile/DictionaryList.tsx src/features/profile/DictionaryList.test.tsx
  git commit -m "feat(profile): DictionaryList component with CRUD"
  ```

### Task 4.3: `ProfileDictionariesPane`

**Files:**

- Create: `src/features/profile/ProfileDictionariesPane.tsx`
- Create: `src/features/profile/ProfileDictionariesPane.test.tsx`
- Modify: `src/pages/ProfilePage.tsx`

- [ ] **Step 1: Write tests**

  Cover only the composition concerns:
  1. Renders "Categories" card with two sub-sections (Income, Expense) and "Labels" card with one list, populated from the configuration fixture.
  2. While the configuration query is `pending`, shows skeleton placeholders.
  3. On query error, shows an inline `Alert`.

- [ ] **Step 2: Run to verify fail**

- [ ] **Step 3: Implement**

  ```tsx
  import { useConfiguration } from '@/features/configuration/useConfiguration';
  import { Skeleton } from '@/components/ui/skeleton';
  import { Alert, AlertDescription } from '@/components/ui/alert';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { DictionaryList } from './DictionaryList';

  export function ProfileDictionariesPane() {
    const config = useConfiguration();
    if (config.isPending) {
      return (
        <div className="space-y-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
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
        <Card>
          <CardHeader>
            <CardTitle>Categories</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <DictionaryList
              dictId="income-category"
              title="Income"
              entries={c.dictionaries['income-category']?.entries ?? []}
              addLabel="Add income category"
            />
            <DictionaryList
              dictId="expense-category"
              title="Expense"
              entries={c.dictionaries['expense-category']?.entries ?? []}
              addLabel="Add expense category"
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Labels</CardTitle>
          </CardHeader>
          <CardContent>
            <DictionaryList
              dictId="labels"
              title="Labels"
              entries={c.dictionaries.labels?.entries ?? []}
              addLabel="Add label"
            />
          </CardContent>
        </Card>
      </div>
    );
  }
  ```

- [ ] **Step 4: Mount in `ProfilePage`** — replace the `dictionaries` placeholder.

- [ ] **Step 5: Run + lint + commit**

  ```bash
  git add src/features/profile/ProfileDictionariesPane.* src/pages/ProfilePage.tsx
  git commit -m "feat(profile): Dictionaries tab"
  ```

## Phase 5 — Auth tab

### Task 5.1: Password schema and mutation hook

**Files:**

- Create: `src/features/profile/passwordSchema.ts`
- Create: `src/features/profile/useChangePassword.ts`
- Create: `src/features/profile/useChangePassword.test.ts`

- [ ] **Step 1: Schema**

  ```ts
  // passwordSchema.ts
  import { z } from 'zod';
  export const passwordSchema = z
    .object({
      currentPassword: z.string().min(1, 'Current password is required'),
      newPassword: z.string().min(8, 'At least 8 characters'),
      confirmPassword: z.string(),
    })
    .refine((d) => d.newPassword === d.confirmPassword, {
      path: ['confirmPassword'],
      message: 'Passwords do not match',
    });
  export type PasswordFormValues = z.infer<typeof passwordSchema>;
  ```

- [ ] **Step 2: Mutation hook + test**

  Same shape as `useSetDefaultCurrency`. Vars `{ currentPassword, newPassword }`. On success, invalidate `['users','me']` (so `hasPassword` stays current — backend already returns `true` once a password is set).

- [ ] **Step 3: Run + lint + commit**

  ```bash
  git add src/features/profile/passwordSchema.ts src/features/profile/useChangePassword.*
  git commit -m "feat(profile): change-password hook + schema"
  ```

### Task 5.2: Unlink hooks

**Files:**

- Create: `src/features/profile/useUnlinkOAuth.ts`
- Create: `src/features/profile/useUnlinkTelegram.ts`
- Create: `src/features/profile/useUnlinkOAuth.test.ts`
- Create: `src/features/profile/useUnlinkTelegram.test.ts`

Mirror Task 5.1 shape; on success, invalidate `['users','me']`. For `useUnlinkOAuth`, the mutate variable is the provider name (`'Google'`).

- [ ] Commit `feat(profile): hooks for unlinking identities`.

### Task 5.3: `ProviderRow` component

**Files:**

- Create: `src/features/profile/ProviderRow.tsx`
- Create: `src/features/profile/ProviderRow.test.tsx`

A presentational row used twice (Google, Telegram). Props per the spec §8.2.

- [ ] **Step 1: Tests**
  1. `status: { linked: false }` → renders "Not linked" and a Link button that calls `onLink`.
  2. `status: { linked: true, subtitle: 'alice@example.com' }` → renders subtitle and an Unlink button.
  3. Unlink button opens an `AlertDialog`; Confirm calls `onUnlink`.
  4. `disableUnlinkReason` provided → Unlink button is disabled and exposes the reason as the `title`/`aria-label`.

- [ ] **Step 2: Implement**

  Mirror `CurrencyRow`'s structure. Wrap the Unlink button in `<AlertDialog>`. When `disableUnlinkReason` is set, render the button with `disabled` and `title={disableUnlinkReason}` — and `aria-disabled='true'`.

- [ ] **Step 3: Commit**

  ```bash
  git add src/features/profile/ProviderRow.*
  git commit -m "feat(profile): ProviderRow component"
  ```

### Task 5.4: `ProfileAuthPane`

**Files:**

- Create: `src/features/profile/ProfileAuthPane.tsx`
- Create: `src/features/profile/ProfileAuthPane.test.tsx`
- Modify: `src/pages/ProfilePage.tsx`

- [ ] **Step 1: Write tests** for:
  1. `profile.hasPassword === true`: the password card renders three fields; submit happy path; mismatch validation; 400 with `fieldErrors.currentPassword` rendered under that field.
  2. `profile.hasPassword === false`: the password card is replaced by a notice "Your account uses OAuth sign-in. Setting an initial password isn't available yet."
  3. Google not linked → Link Google button calls `authApi.initiateOAuth('google')`. Use `server.use(...)` for the GET and assert the redirect URL passed to `window.location.href` — mock `window.location` per the existing pattern in `UserMenu.test.tsx`/`OAuthCallbackPage.test.tsx`. Also assert `beginLinkFlow` was called with `{ returnTo: '/profile/auth' }` (you may need to spy on it via `vi.mock`).
  4. Google linked: subtitle is the Google email (subject); Unlink confirm fires DELETE and invalidates `['users','me']`.
  5. Last-credential guard: `hasPassword:false`, single OAuth identity, no Telegram → the lone Unlink button is disabled with the explanatory `title`.
  6. Telegram link button opens `LinkTelegramDialog` (assert dialog appears).
  7. Telegram unlink confirm fires DELETE.

- [ ] **Step 2: Implement**

  Sketch:

  ```tsx
  import { useState } from 'react';
  import { useForm } from 'react-hook-form';
  import { zodResolver } from '@hookform/resolvers/zod';
  import { ApiClient, ApiError } from '@/api/client';
  import { authApi } from '@/api/auth';
  import { useAuth } from '@/auth/useAuth';
  import { beginLinkFlow, saveOAuthState } from '@/auth/oauthFlow';
  import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
  import { Button } from '@/components/ui/button';
  import { Input } from '@/components/ui/input';
  import { Alert, AlertDescription } from '@/components/ui/alert';
  import { LinkTelegramDialog } from '@/components/LinkTelegramDialog';
  import { useUserProfile } from './useUserProfile';
  import { useChangePassword } from './useChangePassword';
  import { useUnlinkOAuth } from './useUnlinkOAuth';
  import { useUnlinkTelegram } from './useUnlinkTelegram';
  import { ProviderRow } from './ProviderRow';
  import { passwordSchema, type PasswordFormValues } from './passwordSchema';

  const baseUrl =
    (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

  export function ProfileAuthPane() {
    const profile = useUserProfile();
    const { tokenRef, signOut } = useAuth();
    const changePassword = useChangePassword();
    const unlinkOAuth = useUnlinkOAuth();
    const unlinkTelegram = useUnlinkTelegram();
    const [tgDialogOpen, setTgDialogOpen] = useState(false);

    const form = useForm<PasswordFormValues>({
      resolver: zodResolver(passwordSchema),
      defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
    });

    if (profile.isPending) return null;
    if (profile.isError || !profile.data) {
      return (
        <Alert variant="destructive" role="alert">
          <AlertDescription>Failed to load profile.</AlertDescription>
        </Alert>
      );
    }
    const p = profile.data;
    const google = p.oauthIdentities.find((i) => i.provider === 'Google') ?? null;
    const tg = p.telegramIdentity;

    const credentialCount = (p.hasPassword ? 1 : 0) + p.oauthIdentities.length + (tg ? 1 : 0);
    const disableUnlinkReason =
      credentialCount <= 1 ? 'You need at least one way to sign in.' : undefined;

    const onLinkGoogle = async () => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      const { redirectUrl, state } = await authApi(client).initiateOAuth('google');
      saveOAuthState(state);
      beginLinkFlow({ returnTo: '/profile/auth' });
      window.location.href = redirectUrl;
    };

    const submitPassword = (values: PasswordFormValues) => {
      changePassword.mutate(
        { currentPassword: values.currentPassword, newPassword: values.newPassword },
        {
          onSuccess: () => form.reset(),
          onError: (err) => {
            if (err instanceof ApiError && err.fieldErrors) {
              for (const [field, message] of Object.entries(err.fieldErrors)) {
                form.setError(field as keyof PasswordFormValues, { message });
              }
            }
          },
        },
      );
    };

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Password</CardTitle>
          </CardHeader>
          <CardContent>
            {p.hasPassword ? (
              <form className="space-y-3" onSubmit={form.handleSubmit(submitPassword)}>
                <Input
                  type="password"
                  placeholder="Current password"
                  {...form.register('currentPassword')}
                  aria-label="Current password"
                />
                {form.formState.errors.currentPassword && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.currentPassword.message}
                  </p>
                )}
                <Input
                  type="password"
                  placeholder="New password"
                  {...form.register('newPassword')}
                  aria-label="New password"
                />
                {form.formState.errors.newPassword && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.newPassword.message}
                  </p>
                )}
                <Input
                  type="password"
                  placeholder="Confirm new password"
                  {...form.register('confirmPassword')}
                  aria-label="Confirm new password"
                />
                {form.formState.errors.confirmPassword && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.confirmPassword.message}
                  </p>
                )}
                {changePassword.error instanceof ApiError && !changePassword.error.fieldErrors && (
                  <Alert variant="destructive" role="alert">
                    <AlertDescription>{changePassword.error.message}</AlertDescription>
                  </Alert>
                )}
                <Button type="submit" disabled={!form.formState.isValid || !form.formState.isDirty}>
                  Change password
                </Button>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                Your account uses OAuth sign-in. Setting an initial password isn&rsquo;t available
                yet.
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Linked accounts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProviderRow
              provider="Google"
              status={google ? { linked: true, subtitle: google.subject } : { linked: false }}
              onLink={() => void onLinkGoogle()}
              onUnlink={() => unlinkOAuth.mutateAsync('Google')}
              disableUnlinkReason={google ? disableUnlinkReason : undefined}
            />
            <ProviderRow
              provider="Telegram"
              status={
                tg
                  ? { linked: true, subtitle: tg.username ? `@${tg.username}` : tg.firstName }
                  : { linked: false }
              }
              onLink={() => setTgDialogOpen(true)}
              onUnlink={() => unlinkTelegram.mutateAsync()}
              disableUnlinkReason={tg ? disableUnlinkReason : undefined}
            />
          </CardContent>
        </Card>
        <LinkTelegramDialog
          open={tgDialogOpen}
          onOpenChange={setTgDialogOpen}
          client={
            new ApiClient({
              baseUrl,
              getToken: () => tokenRef.current,
              onUnauthorized: signOut,
            })
          }
        />
      </div>
    );
  }
  ```

- [ ] **Step 3: Mount in `ProfilePage`** — replace the `auth` placeholder.

- [ ] **Step 4: Run + lint**

  ```bash
  pnpm exec vitest run src/features/profile/ProfileAuthPane.test.tsx
  just check
  ```

- [ ] **Step 5: Commit**

  ```bash
  git add src/features/profile/ProfileAuthPane.* src/pages/ProfilePage.tsx
  git commit -m "feat(profile): Auth tab"
  ```

## Phase 6 — End-to-end test

### Task 6.1: `e2e/profile.spec.ts`

**Files:**

- Create: `e2e/profile.spec.ts`

Follow the convention of `e2e/edit-transaction.spec.ts` (signed-in seeded user; no real OAuth).

- [ ] **Step 1: Write the spec**

  ```ts
  import { test, expect } from '@playwright/test';
  import { signIn } from './helpers'; // mirror whatever helper edit-transaction uses

  test('user can update default currency, edit dictionaries, and change password', async ({
    page,
  }) => {
    await signIn(page);

    await page.goto('/profile');
    await expect(page.getByRole('tab', { name: 'General' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // 1. Change default currency to EUR
    await page.getByLabel('Default currency').click();
    await page.getByRole('option', { name: 'EUR' }).click();
    await page.getByRole('button', { name: 'Save' }).first().click();
    await expect(page.getByTestId('defaultCurrency-status')).toBeVisible();

    // 2. Dictionaries — add then delete a label
    await page.getByRole('tab', { name: 'Dictionaries' }).click();
    await page.getByRole('button', { name: 'Add label' }).click();
    await page.getByLabel('Add label').fill('trip');
    await page.getByLabel('Add label').press('Enter');
    await expect(page.getByText('trip')).toBeVisible();

    await page.getByRole('button', { name: 'Delete trip' }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('trip')).not.toBeVisible();

    // 3. Change password
    await page.getByRole('tab', { name: 'Auth' }).click();
    await page.getByLabel('Current password').fill('seeded-password');
    await page.getByLabel('New password').fill('new-strong-pw-123');
    await page.getByLabel('Confirm new password').fill('new-strong-pw-123');
    await page.getByRole('button', { name: 'Change password' }).click();
    // No toast in this codebase — assert the form re-disables itself via reset
    await expect(page.getByRole('button', { name: 'Change password' })).toBeDisabled();
  });
  ```

- [ ] **Step 2: Run the spec**

  ```bash
  just e2e
  ```

  Expected: PASS. If the seeded backend rejects the password change, adjust the seed credentials in `e2e/helpers` first.

- [ ] **Step 3: Commit**

  ```bash
  git add e2e/profile.spec.ts
  git commit -m "test(e2e): happy-path profile editing"
  ```

## Phase 7 — Wrap-up

### Task 7.1: Run the whole check + test pipeline

- [ ] `just all` (check + test + build). Expected: green.
- [ ] If any test you didn't touch starts failing, stop and investigate. The most likely culprits:
  - A test that previously imported `LinkTelegramDialog` indirectly through `UserMenu` and now needs to import directly — adjust the import.
  - A test asserting `UserMenu` had "Link Google"/"Link Telegram" — those were updated explicitly in Task 2.4; if the assertion sneaked into another file, update it.

### Task 7.2: Update the design spec status to in-progress (or completed once merged)

- [ ] In `docs/specs/2026-06-05-user-profile-design.md`, change `status: draft` to `status: in-progress` and commit.

  ```bash
  git add docs/specs/2026-06-05-user-profile-design.md
  git commit -m "docs(profile): mark spec as in-progress"
  ```

### Task 7.3: Open the PR

- [ ] Push the branch and open a PR titled `feat(profile): user profile view & edit (closes #16)`. The PR description should:
  - Link to the spec and this plan.
  - **Call out the backend dependency** (the `baseCurrencyEditable` field) and link to its server-infra PR. Mark this PR as "blocked on backend" until that lands.
  - Include the test plan from the spec §10.

---

## Notes for the executing agent

- **Frequent commits.** Each task ends in a commit. Don't squash.
- **DRY.** The hook templates are repetitive on purpose — they're isolated and the duplication is local. Don't refactor into a "generic mutation factory" — every other feature in this codebase repeats the pattern, and matching existing conventions is more valuable than DRY here.
- **YAGNI.** Skip optimistic updates, toast infrastructure, and email editing — explicitly out of scope (§1 of the spec).
- **TDD.** Every task writes the test first, watches it fail, implements, watches it pass, commits.
- **Conventional Commits.** Use `feat(profile):`, `feat(api):`, `chore(ui):`, `test:` prefixes consistently.
- **MSW must stay on 2.13.3** per CLAUDE.md — do not let any transitive bump float it. Run `pnpm why msw` if unsure.
- **Reference skills via @ syntax:**
  - @superpowers:test-driven-development for the TDD loop.
  - @superpowers:verification-before-completion before claiming a task is done.
