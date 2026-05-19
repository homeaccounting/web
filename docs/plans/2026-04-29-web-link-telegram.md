---
status: draft
date: 2026-04-29
spec: docs/specs/2026-04-29-web-link-telegram-design.md
branch: feat/web-mvp
---

# Web — Link Telegram Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Link Telegram" affordance to the avatar dropdown that calls `POST /api/auth/telegram/link-code`, opens the returned `t.me` deep link, and reflects the linked state on the cached user profile.

**Architecture:** A new shadcn-style `Dialog` UI primitive wraps `@radix-ui/react-dialog`. A new `LinkTelegramDialog` component owns the API mutation, the `window.open` side-effect, and a small derived state machine (`requesting | showing | linked | error`). `UserMenu` gains a sibling dropdown item that opens the dialog, mirroring the existing "Link Google" branch. The link-success signal is the cached `['users','me']` profile flipping `telegramIdentity` from `null` to populated — driven for free by React Query's `refetchOnWindowFocus`.

**Tech Stack:** React 18, TypeScript, TanStack Query 5, Radix UI (`@radix-ui/react-dialog` newly added; the other Radix packages are already in `package.json`), Tailwind, shadcn pattern, Vitest + RTL + MSW for tests.

**Branch:** `feat/web-mvp` — same branch the spec was committed on. No new branch.

**Design reference:** `docs/specs/2026-04-29-web-link-telegram-design.md`. Read it before starting; if the plan and spec disagree, flag it — do not silently diverge.

**Backend prerequisite:** `POST /api/auth/telegram/link-code` is already shipped in the backend (see `backend/src/Web/API/AuthAPI.hs:102-108`). Frontend can ship independently.

---

## File Map

Files created:

- `src/components/ui/dialog.tsx` — Radix Dialog wrapper, shadcn-style, mirrors `dropdown-menu.tsx` in shape.
- `src/components/LinkTelegramDialog.tsx` — feature component (mutation + state machine + side-effects).
- `src/components/LinkTelegramDialog.test.tsx` — co-located tests (RTL + MSW).
- `src/components/UserMenu.test.tsx` — new file; exists nowhere yet. The existing `Header.test.tsx` covers the Link-Google branches; we extend coverage with Telegram-specific tests in this new file. (Per spec §6.1, "create if it does not exist".)

Files modified:

- `package.json`, `pnpm-lock.yaml` — add `@radix-ui/react-dialog`.
- `src/api/types.ts` — add `TelegramLinkCodeResponse`.
- `src/api/auth.ts` — add `requestTelegramLinkCode` method.
- `src/components/UserMenu.tsx` — render the new menu item + dialog.
- `src/test/handlers.ts` — add MSW handler for `POST /api/auth/telegram/link-code`.
- `src/test/fixtures.ts` — add `telegramLinkCodeFixture`.

No backend files are touched.

---

## Conventions

- **Branch & commits.** All work lands on `feat/web-mvp`. Conventional Commits (`feat:`, `chore:`, `test:`, `refactor:`, `docs:`).
- **TDD.** Failing test first, minimal implementation, passing test, commit. Skip TDD only for pure config / type-only / one-line wrapper tasks; call out the skip explicitly when it happens.
- **Imports.** Always `@/*` path alias; no relative paths beyond a single sibling.
- **Tests.** Co-located `*.test.tsx`. RTL semantic queries (`getByRole`, `getByText`, `getByLabelText`) — avoid `getByTestId`. MSW handlers in `src/test/handlers.ts` with per-test overrides via `server.use(...)`. Fake timers for the auto-close test only — `vi.useFakeTimers()` / `vi.useRealTimers()` per test, never globally.
- **Strictness.** Don't loosen `tsconfig.json` strictness or add ESLint disables to make a test pass. If a test forces an unsafe cast, the design is wrong — fix the design.
- **Spec drift.** If during implementation a spec rule turns out wrong (e.g., a Radix API limitation), pause and update the spec, then continue.

---

## Phase A — API surface

These are tiny additive changes. No TDD on individual lines — they're exercised by the dialog tests in Phase C.

### Task 1 — Add `@radix-ui/react-dialog` dependency

**Files:**

- Modify: `package.json` (add to `dependencies`)
- Modify: `pnpm-lock.yaml` (regenerated)

- [ ] **Step 1.1: Install the package.**

```bash
pnpm add @radix-ui/react-dialog@^1.1.0
```

Pin to `^1.1.0` to match the major used by the other Radix packages in this repo (e.g., `@radix-ui/react-dropdown-menu: ^2.1.16` is on the matching shadcn track).

- [ ] **Step 1.2: Verify install.**

```bash
pnpm ls @radix-ui/react-dialog
```

Expected: a single `1.1.x` version listed.

- [ ] **Step 1.3: Commit.**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore(deps): add @radix-ui/react-dialog for Link Telegram dialog"
```

### Task 2 — `TelegramLinkCodeResponse` type

**Files:**

- Modify: `src/api/types.ts` (add interface near the other auth types)

- [ ] **Step 2.1: Add the type.**

Place it after `OAuthRedirectResponse` (around line 32). Code:

```ts
export interface TelegramLinkCodeResponse {
  deepLink: string;
  expiresAt: ISO8601;
}
```

- [ ] **Step 2.2: Type-check.**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 2.3: Commit.**

```bash
git add src/api/types.ts
git commit -m "feat(api/types): add TelegramLinkCodeResponse"
```

### Task 3 — `requestTelegramLinkCode` API method

**Files:**

- Modify: `src/api/auth.ts`

(No co-located test for `auth.ts` — the existing `auth.ts` methods are not unit-tested individually; they are exercised through their consumers. The MSW handler added in Task 4 is what proves the request shape.)

- [ ] **Step 3.1: Add the import.**

In `src/api/auth.ts:1-8`, add `TelegramLinkCodeResponse` to the type import block.

- [ ] **Step 3.2: Add the method.**

Append inside the returned object (after `linkOAuth`):

```ts
requestTelegramLinkCode: () =>
  client.post<TelegramLinkCodeResponse>('/api/auth/telegram/link-code'),
```

- [ ] **Step 3.3: Type-check.**

```bash
pnpm tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3.4: Commit.**

```bash
git add src/api/auth.ts
git commit -m "feat(api/auth): add requestTelegramLinkCode"
```

---

## Phase B — Test infrastructure

### Task 4 — MSW handler + fixture for the link-code endpoint

**Files:**

- Modify: `src/test/handlers.ts`
- Modify: `src/test/fixtures.ts`

- [ ] **Step 4.1: Add the fixture.**

In `src/test/fixtures.ts`, after the imports, add:

```ts
import type {
  AccountResponse,
  AuthResponse,
  TelegramLinkCodeResponse,
  TransactionResponse,
  UserProfileResponse,
} from '@/api/types';
```

(Add `TelegramLinkCodeResponse` to the existing import.)

Then below `transactionFixture`, add:

```ts
export const telegramLinkCodeFixture: TelegramLinkCodeResponse = {
  deepLink: 'https://t.me/HomeAccountingBot?start=LINK_test-token',
  expiresAt: '2026-04-29T12:34:56Z',
};
```

- [ ] **Step 4.2: Add the MSW handler.**

In `src/test/handlers.ts`, import the new fixture and add a handler. Updated handler list (insert near the other auth handlers):

```ts
http.post(`${apiBase}/api/auth/telegram/link-code`, () =>
  HttpResponse.json(telegramLinkCodeFixture),
),
```

Update the import line at the top of `handlers.ts` to include `telegramLinkCodeFixture`.

- [ ] **Step 4.3: Type-check + run existing tests.**

```bash
pnpm tsc --noEmit
pnpm vitest run
```

Expected: all existing tests still pass; no type errors.

- [ ] **Step 4.4: Commit.**

```bash
git add src/test/fixtures.ts src/test/handlers.ts
git commit -m "test(msw): add telegram link-code handler and fixture"
```

---

## Phase C — Dialog UI primitive

### Task 5 — `src/components/ui/dialog.tsx`

**Files:**

- Create: `src/components/ui/dialog.tsx`

(Skip TDD — this is a copy-pasted shadcn primitive with no logic of its own. It's exercised by the `LinkTelegramDialog` tests in Phase D.)

- [ ] **Step 5.1: Create the file.**

Match the style of `src/components/ui/dropdown-menu.tsx` exactly (same `'use client';` directive, `cn()` from `@/lib/utils`, `forwardRef`, `displayName`, named exports). Code:

```tsx
'use client';

import * as React from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';

import { cn } from '@/lib/utils';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        'fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:rounded-lg',
        className,
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
        <X className="h-4 w-4" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn('text-lg font-semibold leading-none tracking-tight', className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogTrigger,
  DialogPortal,
  DialogClose,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
```

- [ ] **Step 5.2: Verify it compiles and existing tests still pass.**

```bash
pnpm tsc --noEmit
pnpm vitest run
```

Expected: no errors, all existing tests pass.

- [ ] **Step 5.3: Commit.**

```bash
git add src/components/ui/dialog.tsx
git commit -m "feat(ui): add shadcn-style Dialog primitive (Radix wrapper)"
```

---

## Phase D — `LinkTelegramDialog`

This is the core feature work. Each behavior gets its own test → implementation → commit cycle.

### Task 6 — Skeleton: opens, fires the mutation once, renders the deep link

**Files:**

- Create: `src/components/LinkTelegramDialog.test.tsx`
- Create: `src/components/LinkTelegramDialog.tsx`

- [ ] **Step 6.1: Write the failing test.**

`src/components/LinkTelegramDialog.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { telegramLinkCodeFixture } from '@/test/fixtures';
import { ApiClient } from '@/api/client';
import { LinkTelegramDialog } from './LinkTelegramDialog';

const apiBase = 'http://localhost:8080';

function makeClient() {
  return new ApiClient({
    baseUrl: apiBase,
    getToken: () => 'test-token',
    onUnauthorized: () => {},
  });
}

describe('LinkTelegramDialog', () => {
  beforeEach(() => {
    vi.spyOn(window, 'open').mockReturnValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('fires POST /api/auth/telegram/link-code once on open and renders the deep link', async () => {
    let callCount = 0;
    server.use(
      http.post(`${apiBase}/api/auth/telegram/link-code`, () => {
        callCount += 1;
        return HttpResponse.json(telegramLinkCodeFixture);
      }),
    );

    const onOpenChange = vi.fn();
    renderWithProviders(
      <LinkTelegramDialog open={true} onOpenChange={onOpenChange} client={makeClient()} />,
    );

    const link = await screen.findByRole('link', { name: /open telegram/i });
    expect(link).toHaveAttribute('href', telegramLinkCodeFixture.deepLink);
    expect(link).toHaveAttribute('target', '_blank');
    expect(callCount).toBe(1);
  });
});
```

- [ ] **Step 6.2: Run the test, confirm it fails.**

```bash
pnpm vitest run src/components/LinkTelegramDialog.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 6.3: Create the minimal component.**

`src/components/LinkTelegramDialog.tsx`:

```tsx
import { useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { authApi } from '@/api/auth';
import type { ApiClient } from '@/api/client';

interface LinkTelegramDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client: ApiClient;
}

export function LinkTelegramDialog({ open, onOpenChange, client }: LinkTelegramDialogProps) {
  const popupFiredRef = useRef(false);
  const mutation = useMutation({
    mutationFn: () => authApi(client).requestTelegramLinkCode(),
  });

  useEffect(() => {
    if (open) {
      popupFiredRef.current = false;
      mutation.reset();
      mutation.mutate();
    }
    // The mutation handle is stable across renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Link Telegram</DialogTitle>
        </DialogHeader>
        {mutation.isSuccess && mutation.data && (
          <Button asChild>
            <a href={mutation.data.deepLink} target="_blank" rel="noopener noreferrer">
              Open Telegram
            </a>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 6.4: Run the test, confirm it passes.**

```bash
pnpm vitest run src/components/LinkTelegramDialog.test.tsx
```

Expected: PASS.

- [ ] **Step 6.5: Commit.**

```bash
git add src/components/LinkTelegramDialog.tsx src/components/LinkTelegramDialog.test.tsx
git commit -m "feat(LinkTelegramDialog): scaffold component with deep link rendering"
```

### Task 7 — Auto-fire `window.open` once on success

- [ ] **Step 7.1: Add a test.**

Append to `LinkTelegramDialog.test.tsx`:

```tsx
it('auto-fires window.open with the deep link once on success', async () => {
  const onOpenChange = vi.fn();
  renderWithProviders(
    <LinkTelegramDialog open={true} onOpenChange={onOpenChange} client={makeClient()} />,
  );

  await screen.findByRole('link', { name: /open telegram/i });
  expect(window.open).toHaveBeenCalledTimes(1);
  expect(window.open).toHaveBeenCalledWith(
    telegramLinkCodeFixture.deepLink,
    '_blank',
    'noopener,noreferrer',
  );
});
```

- [ ] **Step 7.2: Run the test, confirm it fails.**

```bash
pnpm vitest run src/components/LinkTelegramDialog.test.tsx -t "auto-fires window.open"
```

Expected: FAIL — `window.open` was not called.

- [ ] **Step 7.3: Implement the popup effect.**

In `LinkTelegramDialog.tsx`, add an effect after the existing one:

```tsx
useEffect(() => {
  if (mutation.isSuccess && mutation.data && !popupFiredRef.current) {
    popupFiredRef.current = true;
    window.open(mutation.data.deepLink, '_blank', 'noopener,noreferrer');
  }
}, [mutation.isSuccess, mutation.data]);
```

- [ ] **Step 7.4: Run the test, confirm it passes.**

```bash
pnpm vitest run src/components/LinkTelegramDialog.test.tsx
```

Expected: both tests PASS.

- [ ] **Step 7.5: Commit.**

```bash
git add src/components/LinkTelegramDialog.tsx src/components/LinkTelegramDialog.test.tsx
git commit -m "feat(LinkTelegramDialog): auto-open Telegram in new tab on success"
```

### Task 8 — Render the formatted "expires at HH:MM" line

- [ ] **Step 8.1: Add a test.**

```tsx
it('renders the expires-at time formatted as a local HH:MM string', async () => {
  // The fixture's expiresAt is '2026-04-29T12:34:56Z'.
  const expected = new Date(telegramLinkCodeFixture.expiresAt).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  renderWithProviders(
    <LinkTelegramDialog open={true} onOpenChange={() => {}} client={makeClient()} />,
  );
  await screen.findByRole('link', { name: /open telegram/i });
  expect(screen.getByText(new RegExp(expected))).toBeInTheDocument();
});
```

- [ ] **Step 8.2: Run, confirm it fails.**

```bash
pnpm vitest run src/components/LinkTelegramDialog.test.tsx -t "expires-at"
```

- [ ] **Step 8.3: Render the line.**

In `LinkTelegramDialog.tsx`, inside the `mutation.isSuccess && mutation.data &&` block, render an extra line. Refactor to a small `<div>` wrapping link + expiry:

```tsx
{
  mutation.isSuccess && mutation.data && (
    <div className="flex flex-col gap-3">
      <Button asChild>
        <a href={mutation.data.deepLink} target="_blank" rel="noopener noreferrer">
          Open Telegram
        </a>
      </Button>
      <p className="text-sm text-muted-foreground">
        Link expires at{' '}
        {new Date(mutation.data.expiresAt).toLocaleTimeString(undefined, {
          hour: '2-digit',
          minute: '2-digit',
        })}
      </p>
    </div>
  );
}
```

- [ ] **Step 8.4: Run, confirm it passes.**

```bash
pnpm vitest run src/components/LinkTelegramDialog.test.tsx
```

Expected: 3/3 PASS.

- [ ] **Step 8.5: Commit.**

```bash
git add src/components/LinkTelegramDialog.tsx src/components/LinkTelegramDialog.test.tsx
git commit -m "feat(LinkTelegramDialog): render formatted expiry time"
```

### Task 9 — "I've linked it" button invalidates the profile query

- [ ] **Step 9.1: Add a test.**

```tsx
it('clicking "I have linked it" refetches the profile', async () => {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  let profileCalls = 0;
  server.use(
    http.get(`${apiBase}/api/users/me`, () => {
      profileCalls += 1;
      return HttpResponse.json(profileFixture);
    }),
  );

  // Render a parent that primes the ['users','me'] query, then mounts the dialog.
  const queryClient = makeQueryClient();
  renderWithProviders(
    <LinkTelegramDialog open={true} onOpenChange={() => {}} client={makeClient()} />,
    { queryClient },
  );
  // Pre-fetch the profile so the cache is populated.
  await queryClient.fetchQuery({
    queryKey: ['users', 'me'],
    queryFn: () => usersApi(makeClient()).getMe(),
  });
  expect(profileCalls).toBe(1);

  await screen.findByRole('link', { name: /open telegram/i });
  await userEvent.setup().click(screen.getByRole('button', { name: /i.*linked it/i }));
  await waitFor(() => expect(profileCalls).toBe(2));
});
```

Add the imports at the top of the file: `userEvent` from `@testing-library/user-event`, `saveSession` from `@/auth/storage`, `profileFixture` from `@/test/fixtures`, `usersApi` from `@/api/users`, `makeQueryClient` from `@/test/utils`.

- [ ] **Step 9.2: Run, confirm it fails.**

```bash
pnpm vitest run src/components/LinkTelegramDialog.test.tsx -t "linked it"
```

Expected: FAIL — button not found.

- [ ] **Step 9.3: Wire up the invalidation.**

In `LinkTelegramDialog.tsx`, import `useQueryClient`:

```tsx
import { useMutation, useQueryClient } from '@tanstack/react-query';
```

Inside the component, add:

```tsx
const queryClient = useQueryClient();
```

And add a button next to "Open Telegram":

```tsx
<Button
  variant="secondary"
  onClick={() => queryClient.invalidateQueries({ queryKey: ['users', 'me'] })}
>
  I've linked it
</Button>
```

(Place it inside the same `<div className="flex flex-col gap-3">` block, after the expiry `<p>`.)

- [ ] **Step 9.4: Run, confirm it passes.**

```bash
pnpm vitest run src/components/LinkTelegramDialog.test.tsx
```

- [ ] **Step 9.5: Commit.**

```bash
git add src/components/LinkTelegramDialog.tsx src/components/LinkTelegramDialog.test.tsx
git commit -m "feat(LinkTelegramDialog): manual refetch via I've linked it button"
```

### Task 10 — Linked state when the cached profile flips

- [ ] **Step 10.1: Add a test.**

```tsx
it('renders the linked state when the cached profile gains a telegramIdentity', async () => {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  // First profile call: not linked. Second call (after invalidation): linked.
  let calls = 0;
  server.use(
    http.get(`${apiBase}/api/users/me`, () => {
      calls += 1;
      if (calls === 1) return HttpResponse.json(profileFixture);
      return HttpResponse.json({
        ...profileFixture,
        telegramIdentity: { id: 42, username: 'alice', firstName: 'Alice' },
      });
    }),
  );

  const queryClient = makeQueryClient();
  renderWithProviders(
    <LinkTelegramDialog open={true} onOpenChange={() => {}} client={makeClient()} />,
    { queryClient },
  );
  await queryClient.fetchQuery({
    queryKey: ['users', 'me'],
    queryFn: () => usersApi(makeClient()).getMe(),
  });

  await screen.findByRole('link', { name: /open telegram/i });
  await userEvent.setup().click(screen.getByRole('button', { name: /i.*linked it/i }));
  expect(await screen.findByText(/linked as @alice/i)).toBeInTheDocument();
});
```

- [ ] **Step 10.2: Run, confirm it fails.**

```bash
pnpm vitest run src/components/LinkTelegramDialog.test.tsx -t "linked state"
```

- [ ] **Step 10.3: Compute the phase and render the linked branch.**

In `LinkTelegramDialog.tsx`, read the cached profile (no fetch — `enabled: false` doesn't fit because we want to react to changes; instead use `useQuery` with the same key):

```tsx
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '@/api/users';
```

```tsx
const { data: profile } = useQuery({
  queryKey: ['users', 'me'],
  queryFn: () => usersApi(client).getMe(),
});
```

(This shares the cache with `UserMenu`'s query; React Query deduplicates.)

Compute the phase (precedence per spec §4.2: linked > error > requesting > showing):

```tsx
type Phase = 'linked' | 'error' | 'requesting' | 'showing';
const phase: Phase =
  profile?.telegramIdentity != null
    ? 'linked'
    : mutation.isError
      ? 'error'
      : mutation.isPending || !mutation.data
        ? 'requesting'
        : 'showing';
```

Render branches conditional on `phase`. Replace the existing `mutation.isSuccess` block with a switch on `phase`:

```tsx
{
  phase === 'linked' && profile?.telegramIdentity && (
    <p className="text-sm">
      Telegram linked as @{profile.telegramIdentity.username ?? profile.telegramIdentity.firstName}
    </p>
  );
}
{
  phase === 'showing' && mutation.data && (
    <div className="flex flex-col gap-3">
      {/* …existing link + expiry + I've linked it button… */}
    </div>
  );
}
{
  phase === 'requesting' && <p className="text-sm text-muted-foreground">Generating link…</p>;
}
```

- [ ] **Step 10.4: Run all dialog tests.**

```bash
pnpm vitest run src/components/LinkTelegramDialog.test.tsx
```

Expected: all pass.

- [ ] **Step 10.5: Commit.**

```bash
git add src/components/LinkTelegramDialog.tsx src/components/LinkTelegramDialog.test.tsx
git commit -m "feat(LinkTelegramDialog): render linked state from cached profile"
```

### Task 11 — Auto-close 1.5s after entering linked state

- [ ] **Step 11.1: Add a test using fake timers.**

```tsx
it('auto-closes 1.5s after the linked state is entered', async () => {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  server.use(
    http.get(`${apiBase}/api/users/me`, () =>
      HttpResponse.json({
        ...profileFixture,
        telegramIdentity: { id: 42, username: 'alice', firstName: 'Alice' },
      }),
    ),
  );

  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const onOpenChange = vi.fn();
    const queryClient = makeQueryClient();
    renderWithProviders(
      <LinkTelegramDialog open={true} onOpenChange={onOpenChange} client={makeClient()} />,
      { queryClient },
    );
    await queryClient.fetchQuery({
      queryKey: ['users', 'me'],
      queryFn: () => usersApi(makeClient()).getMe(),
    });

    await screen.findByText(/linked as @alice/i);
    expect(onOpenChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1500);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  } finally {
    vi.useRealTimers();
  }
});
```

- [ ] **Step 11.2: Run, confirm it fails.**

```bash
pnpm vitest run src/components/LinkTelegramDialog.test.tsx -t "auto-closes"
```

- [ ] **Step 11.3: Add the auto-close effect.**

In `LinkTelegramDialog.tsx`:

```tsx
useEffect(() => {
  if (phase !== 'linked' || !open) return;
  const id = setTimeout(() => onOpenChange(false), 1500);
  return () => clearTimeout(id);
}, [phase, open, onOpenChange]);
```

- [ ] **Step 11.4: Run, confirm it passes.**

```bash
pnpm vitest run src/components/LinkTelegramDialog.test.tsx
```

- [ ] **Step 11.5: Commit.**

```bash
git add src/components/LinkTelegramDialog.tsx src/components/LinkTelegramDialog.test.tsx
git commit -m "feat(LinkTelegramDialog): auto-close 1.5s after linked"
```

### Task 12 — Error state with Retry

- [ ] **Step 12.1: Add a test.**

```tsx
it('renders the error alert and retries on click', async () => {
  let calls = 0;
  server.use(
    http.post(`${apiBase}/api/auth/telegram/link-code`, () => {
      calls += 1;
      if (calls === 1) return new HttpResponse('boom', { status: 500 });
      return HttpResponse.json(telegramLinkCodeFixture);
    }),
  );

  const onOpenChange = vi.fn();
  renderWithProviders(
    <LinkTelegramDialog open={true} onOpenChange={onOpenChange} client={makeClient()} />,
  );

  await screen.findByRole('alert');
  await userEvent.setup().click(screen.getByRole('button', { name: /retry/i }));
  await screen.findByRole('link', { name: /open telegram/i });
  expect(calls).toBe(2);
});
```

- [ ] **Step 12.2: Run, confirm it fails.**

```bash
pnpm vitest run src/components/LinkTelegramDialog.test.tsx -t "error alert"
```

- [ ] **Step 12.3: Render the error branch.**

In `LinkTelegramDialog.tsx`, import `Alert` and `AlertDescription`:

```tsx
import { Alert, AlertDescription } from '@/components/ui/alert';
```

Add the branch:

```tsx
{
  phase === 'error' && mutation.error && (
    <div className="flex flex-col gap-3">
      <Alert variant="destructive">
        <AlertDescription>{(mutation.error as Error).message}</AlertDescription>
      </Alert>
      <Button onClick={() => mutation.mutate()}>Retry</Button>
    </div>
  );
}
```

(Note: the project's `Alert` is from `src/components/ui/alert.tsx`, already in the codebase.)

- [ ] **Step 12.4: Run, confirm it passes.**

```bash
pnpm vitest run src/components/LinkTelegramDialog.test.tsx
```

Expected: all dialog tests pass.

- [ ] **Step 12.5: Commit.**

```bash
git add src/components/LinkTelegramDialog.tsx src/components/LinkTelegramDialog.test.tsx
git commit -m "feat(LinkTelegramDialog): error state with retry"
```

### Task 13 — Reopening after close re-fires the request and re-fires `window.open`

- [ ] **Step 13.1: Add a test.**

```tsx
it('reopening fires the mutation again and reopens the popup', async () => {
  let calls = 0;
  server.use(
    http.post(`${apiBase}/api/auth/telegram/link-code`, () => {
      calls += 1;
      return HttpResponse.json(telegramLinkCodeFixture);
    }),
  );

  const onOpenChange = vi.fn();
  const { rerender } = renderWithProviders(
    <LinkTelegramDialog open={true} onOpenChange={onOpenChange} client={makeClient()} />,
  );
  await screen.findByRole('link', { name: /open telegram/i });
  expect(calls).toBe(1);
  expect(window.open).toHaveBeenCalledTimes(1);

  rerender(<LinkTelegramDialog open={false} onOpenChange={onOpenChange} client={makeClient()} />);
  rerender(<LinkTelegramDialog open={true} onOpenChange={onOpenChange} client={makeClient()} />);

  await waitFor(() => expect(calls).toBe(2));
  await waitFor(() => expect(window.open).toHaveBeenCalledTimes(2));
});
```

- [ ] **Step 13.2: Run.**

```bash
pnpm vitest run src/components/LinkTelegramDialog.test.tsx -t "reopening"
```

If the implementation from Task 6 is correct (resets `popupFiredRef` and calls `mutation.reset()` + `mutation.mutate()` on every open transition), this should already pass. If it fails, fix the effect — do not silently make the test less strict.

- [ ] **Step 13.3: Commit (test only, if no implementation change needed).**

```bash
git add src/components/LinkTelegramDialog.test.tsx
git commit -m "test(LinkTelegramDialog): reopening re-fires request and popup"
```

---

## Phase E — `UserMenu` integration

### Task 14 — `UserMenu` opens the Telegram dialog when not linked

**Files:**

- Create: `src/components/UserMenu.test.tsx`
- Modify: `src/components/UserMenu.tsx`

- [ ] **Step 14.1: Write the failing tests.**

`src/components/UserMenu.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { UserMenu } from './UserMenu';
import { profileFixture } from '@/test/fixtures';

const apiBase = 'http://localhost:8080';

describe('UserMenu — Link Telegram', () => {
  beforeEach(() => {
    vi.spyOn(window, 'open').mockReturnValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows Link Telegram when telegramIdentity is null', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(
      <AuthProvider>
        <UserMenu />
      </AuthProvider>,
    );
    await userEvent.setup().click(await screen.findByRole('button', { name: /open user menu/i }));
    expect(await screen.findByText(/link telegram/i)).toBeInTheDocument();
  });

  it('hides Link Telegram when a Telegram identity is already linked', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    server.use(
      http.get(`${apiBase}/api/users/me`, () =>
        HttpResponse.json({
          ...profileFixture,
          telegramIdentity: { id: 7, username: 'alice', firstName: 'Alice' },
        }),
      ),
    );
    renderWithProviders(
      <AuthProvider>
        <UserMenu />
      </AuthProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /open user menu/i }));
    await waitFor(() => expect(screen.getByText(/sign out/i)).toBeInTheDocument());
    expect(screen.queryByText(/link telegram/i)).not.toBeInTheDocument();
  });

  it('clicking Link Telegram opens the dialog', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(
      <AuthProvider>
        <UserMenu />
      </AuthProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /open user menu/i }));
    await user.click(await screen.findByText(/link telegram/i));
    // The dialog title is the same string; assert it now appears under role=dialog.
    await screen.findByRole('dialog', { name: /link telegram/i });
  });
});
```

- [ ] **Step 14.2: Run, confirm fails.**

```bash
pnpm vitest run src/components/UserMenu.test.tsx
```

Expected: FAIL — "Link Telegram" not found.

- [ ] **Step 14.3: Wire up `UserMenu`.**

Modify `src/components/UserMenu.tsx`:

1. Add imports at the top:

   ```tsx
   import { useState } from 'react';
   import { LinkTelegramDialog } from './LinkTelegramDialog';
   ```

2. Inside the component, after the `hasGoogle` line, add:

   ```tsx
   const hasTelegram = profile?.telegramIdentity != null;
   const [tgDialogOpen, setTgDialogOpen] = useState(false);
   ```

3. Inside `<DropdownMenuContent>`, after the Link Google item, add:

   ```tsx
   {
     !hasTelegram && (
       <DropdownMenuItem onSelect={() => setTgDialogOpen(true)}>Link Telegram</DropdownMenuItem>
     );
   }
   ```

4. Wrap the return in a Fragment and render the dialog as a sibling of `<DropdownMenu>`:
   ```tsx
   return (
     <>
       <DropdownMenu>{/* …existing content… */}</DropdownMenu>
       <LinkTelegramDialog open={tgDialogOpen} onOpenChange={setTgDialogOpen} client={client} />
     </>
   );
   ```

- [ ] **Step 14.4: Run, confirm passes.**

```bash
pnpm vitest run src/components/UserMenu.test.tsx
```

Expected: 3/3 PASS.

- [ ] **Step 14.5: Run the full test suite as a regression check.**

```bash
pnpm vitest run
```

Expected: all tests pass, including the existing `Header.test.tsx` (which only asserts on the Google branches and should be unaffected).

- [ ] **Step 14.6: Commit.**

```bash
git add src/components/UserMenu.tsx src/components/UserMenu.test.tsx
git commit -m "feat(UserMenu): add Link Telegram menu item and dialog"
```

---

## Phase F — Manual smoke + final guard

### Task 15 — Manual browser smoke

- [ ] **Step 15.1: Boot the dev server with the backend running.**

```bash
pnpm dev
```

In another terminal, ensure the backend is reachable at `VITE_API_BASE_URL` (default `http://localhost:8080`) and a `HomeAccountingBot` is configured per the backend spec.

- [ ] **Step 15.2: Walk the golden path.**

1. Sign in with email + password (or register a fresh user).
2. Open the avatar menu → click **Link Telegram**.
3. Confirm: dialog opens; new tab opens to the `t.me/HomeAccountingBot?start=LINK_…` URL; "expires at HH:MM" line shows; "Open Telegram" + "I've linked it" buttons present.
4. In the Telegram tab, send `/start` (Telegram does this automatically on link click).
5. Return to the web tab. Without manual refresh, the dialog flips to "Telegram linked as @<your-username>" and auto-closes ~1.5 s later.
6. Re-open the avatar menu — **Link Telegram** is no longer rendered.

- [ ] **Step 15.3: Walk an edge case (popup blocker).**

1. Sign out, sign back in, block popups in the browser.
2. Open the avatar menu → click **Link Telegram**. The auto-popup is blocked; the dialog still renders the "Open Telegram" button. Click it to proceed manually. Confirm the rest of the flow still works.

- [ ] **Step 15.4: Walk an edge case (network failure).**

1. With the dialog closed, kill the backend.
2. Click **Link Telegram**. The dialog renders the destructive `Alert` with the network error and a Retry button.
3. Restart the backend and click Retry. The dialog flips to the showing state.

- [ ] **Step 15.5: No commit needed for manual testing. Note any bugs found and fix them as small follow-up commits before continuing.**

### Task 16 — Final type-check, lint, build, full test sweep

- [ ] **Step 16.1: Run the full battery.**

```bash
pnpm tsc --noEmit
pnpm lint
pnpm build
pnpm vitest run
```

Expected: all green.

- [ ] **Step 16.2: Confirm no stray uncommitted changes.**

```bash
git status
```

Expected: clean working tree.

- [ ] **Step 16.3: No commit needed.**

---

## Done

The branch `feat/web-mvp` now carries the Link Telegram feature on top of the spec commit. PR title for when this is shipped (the MVP branch is opened separately): `feat(web): link Telegram via bot deep-link`.
