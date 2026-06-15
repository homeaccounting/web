---
status: draft
issue: 29
---

# Close / Unclose Account — Design

## Problem

> As a user I want to Close (hide) account so that it is not visible in the
> accounts list. Also I want to be able to unclose it to see again.
> — GitHub issue #29 (depends on backend issue #99)

## Context & existing infrastructure

The backend lifecycle already ships (issue #99 closed —
`feat(account): close/reopen account lifecycle (#103)`). The gap is purely the
frontend: surfacing the `status`, the close/reopen actions, and the list
filtering.

### Backend contract (`../server-infra`)

- **`AccountResponse` now carries `status`** — `Web/Types.hs:260`
  (`status :: Text`), serialised by `fromAccountStatus` (`Web/Types.hs:793-795`)
  to the literal `"Opened"` or `"Closed"`. Every account starts `"Opened"`.
- **`POST /api/accounts/:id/close`** → `204 No Content`, owner-only
  (`Web/API/AccountAPI.hs:174-180`). Rejects an already-closed account
  (`AccountAlreadyClosed`, `Domain/Account/CommandHandler.hs:299`).
- **`POST /api/accounts/:id/reopen`** → `204 No Content`, owner-only
  (`Web/API/AccountAPI.hs:181-187`). Rejects an already-open account
  (`AccountAlreadyOpen`, `CommandHandler.hs:306`).
- **The list endpoint does NOT filter by status** — `listAccountsHandler`
  (`Web/API/AccountAPI.hs:289`) returns _all_ accounts (Opened and Closed).
  Hiding closed accounts is therefore a **client-side view concern**.
- **Error mapping**: all account command rejections collapse to a generic
  `AccountError "Account command rejected by domain"` → **HTTP 400**
  (`Application/Services/Internal.hs:118`). There is no distinct code for
  already-closed / already-open. The UI's filtering means a user shouldn't
  normally hit these; if one races through, the generic `ApiError.message`
  surfaces in the inline banner.

### Frontend seam that makes this clean

`useAccountById` (`src/features/accounts/useAccountById.ts`) resolves an account
by `.find()` over the full `['accounts']` cache, which keeps closed accounts.
So **closing the selected account does not break its detail view** — only the
sidebar list filters. The just-closed account's toolbar simply flips to offer
Reopen.

### Patterns being mirrored

- Toolbar icon-buttons with tooltips: `AccountsPane` (Edit / Sync / Add).
- Confirmation + inline-error flow: `CancelTransactionDialog`
  (`AlertDialog`, inline destructive banner, pending-disabled, no global toast).
- Invalidate-on-settle mutation hook: `useCancelTransaction` (vars carry `id`,
  invalidate `['accounts']`).
- Both `context-menu` (right-click) and `dropdown-menu` shadcn primitives are
  already vendored under `src/components/ui/`.

## Decisions (from brainstorming)

- **Placement: toolbar + context menu.**
  - Toolbar button in `AccountsPane` acts on the _selected_ account: **Close**
    (Archive icon) when Open, **Reopen** (ArchiveRestore icon) when Closed,
    disabled when there is no selection.
  - Right-click on any account row opens a shadcn `ContextMenu` offering
    **Close account** / **Reopen account** for _that_ row (not necessarily the
    selected one), so an account can be closed/reopened without selecting it
    first.
  - The context menu is scoped to Close/Reopen only — Edit stays in its current
    toolbar home (out of scope for #29).
- **Reveal closed: a "Show closed" toggle.** Closed accounts are hidden from the
  sidebar by default. A `"Show closed (N)"` / `"Hide closed"` ghost toggle —
  rendered only when at least one closed account exists — reveals them as muted
  rows with a small "Closed" label. This satisfies both "hide" and "unclose to
  see again".
- **Confirm before closing; reopen is immediate.** Close opens an `AlertDialog`
  confirmation (an unusual, list-affecting action); Reopen fires directly (it is
  itself the undo, and is cheap to repeat).

## Architecture

The feature splits into a data/API layer, two mutation hooks, three components,
and view changes in `AccountsPane`. Each unit is independently testable.

### Data / API layer

1. **`src/api/types.ts`** — add the status enum and field:
   ```ts
   // Mirrors backend fromAccountStatus (Web/Types.hs:793-795): "Opened" | "Closed".
   export type AccountStatus = 'Opened' | 'Closed';
   ```
   and add `status: AccountStatus;` to `AccountResponse` (cite
   `Web/Types.hs:260`). This is a required field — the backend always emits it.
2. **`src/api/accounts.ts`** — extend `accountsApi`:
   ```ts
   close: (id: UUID): Promise<void> => client.post<void>(`/api/accounts/${id}/close`),
   reopen: (id: UUID): Promise<void> => client.post<void>(`/api/accounts/${id}/reopen`),
   ```
   `client.post<void>` already treats the empty 204 body as `void`.
3. **`src/test/fixtures.ts`** — add `status: 'Opened'` to `accountFixture`; add a
   `closedAccountFixture` (`id: 'a2'`, `status: 'Closed'`, distinct name) for
   pane/menu tests.
4. **`src/test/handlers.ts`** — add `POST /api/accounts/:id/close` and
   `…/reopen`, each returning `new HttpResponse(null, { status: 204 })`.

### Hooks — `src/features/accounts/useAccountStatus.ts`

One module exporting two symmetric hooks (kept together because they are
near-identical and always understood as a pair):

```ts
export function useCloseAccount(); // useMutation<void, Error, { id: UUID }>
export function useReopenAccount(); // useMutation<void, Error, { id: UUID }>
```

Each constructs the `ApiClient` the same way as `useCancelTransaction`, calls
`accountsApi(client).close|reopen(id)`, and on `onSettled` invalidates
`['accounts']`. Invalidation (rather than optimistic patching) is correct: the
row's visibility and the toggle count both change, and a single refetch is the
simplest correct path. A shared internal helper builds the mutation to avoid
duplication.

### Components

5. **`src/features/accounts/CloseAccountDialog.tsx`** — mirrors
   `CancelTransactionDialog`. Props `{ open, onOpenChange, account }`. Uses
   `useCloseAccount`; `AlertDialogTitle` "Close this account?",
   description "It will be hidden from your accounts list. You can reopen it
   later." Confirm button (default variant) labelled **Close**, cancel labelled
   **Keep open**. Inline destructive banner on `ApiError`; dialog stays open on
   error; `onOpenChange` is a no-op while pending and `reset()`s on close.
6. **`src/features/accounts/AccountContextMenu.tsx`** — presentational wrapper
   around a row's trigger; emits intent, owns no mutation:
   ```ts
   { account: AccountResponse; onRequestClose: (a) => void;
     onRequestReopen: (a) => void; children: ReactNode }
   ```
   Renders `<ContextMenu><ContextMenuTrigger asChild>{children}</…>` with a
   single item: **Close account** (calls `onRequestClose(account)`) when
   `account.status === 'Opened'`, or **Reopen account** (calls
   `onRequestReopen(account)`) when `'Closed'`. Keeping both mutations in the pane
   (see below) gives close and reopen a **single shared error surface** rather
   than duplicating one per row.
7. **`src/features/accounts/AccountsPane.tsx`** — view changes:
   - **State**: `closingAccount: AccountResponse | null` (drives
     `CloseAccountDialog`), `showClosed: boolean` (drives the toggle), and a
     single `reopenError: string | null` for the reopen toast. One pane-level
     `useReopenAccount` powers **both** the toolbar Reopen and the context-menu
     Reopen (the menu delegates via `onRequestReopen`), so there is exactly one
     reopen mutation and one error surface.
   - **Toolbar**: insert a Close/Reopen icon button after Edit. When the selected
     account is Open → Archive icon, tooltip "Close account", click sets
     `closingAccount`. When Closed → ArchiveRestore icon, tooltip "Reopen
     account", click calls the shared `reopen(account)`. Disabled when no
     selection.
   - **List**: partition `data` into `openAccounts` and `closedAccounts`. Render
     open rows as today. When `closedAccounts.length > 0`, render the
     `"Show closed (N)"` toggle; when `showClosed`, render closed rows below a
     subtle separator, each muted (`text-muted-foreground`/reduced opacity) with
     a small "Closed" label. Every row (open and closed) is wrapped in
     `AccountContextMenu` with `onRequestClose={setClosingAccount}` and
     `onRequestReopen={reopen}`.
   - **Reopen handler**: a single `reopen(account)` callback fires
     `useReopenAccount.mutate({ id }, { onError })`; `onError` sets `reopenError`
     to `ApiError.message` (fallback "Could not reopen this account. Try again.").
   - **Dialog & toast mounts**: `{closingAccount && <CloseAccountDialog open
onOpenChange={…clear…} account={closingAccount} />}`, plus a dismissible
     fixed-bottom-right error `Alert` (reusing the `SyncNowButton` toast pattern)
     rendered when `reopenError` is set.

Icons come from `lucide-react` (`Archive`, `ArchiveRestore`), already the pane's
icon source.

## Data flow

- **Close (toolbar or context menu)** → set `closingAccount` →
  `CloseAccountDialog` confirm → `useCloseAccount.mutate({ id })` → `POST …/close`
  204 → invalidate `['accounts']` → refetch drops the row from the default list
  (still present in cache; detail view, if open, now offers Reopen).
- **Reopen (toolbar or context menu)** → `useReopenAccount.mutate({ id })` →
  `POST …/reopen` 204 → invalidate `['accounts']` → row returns to the open list.
- **Show/Hide closed** → local `showClosed` toggle; pure view, no network.

## Error handling

- Close errors surface in the dialog's inline banner via `ApiError.message`
  (generic 400 from the backend), dialog stays open, matching
  `CancelTransactionDialog`.
- Reopen errors (toolbar _and_ context menu — neither uses a dialog): both
  surfaces share the pane's single `useReopenAccount` mutation, whose `onError`
  sets `reopenError`. The pane renders one dismissible fixed-bottom-right error
  `Alert` (the `SyncNowButton` toast pattern) — so there is exactly one reopen
  error surface regardless of which control triggered it. Invalidation keeps
  state correct on failure; errors are rare (Reopen is only offered on Closed
  accounts).

## Testing

- **`useAccountStatus.test.tsx`** — close/reopen call the right endpoints and
  invalidate `['accounts']`.
- **`CloseAccountDialog.test.tsx`** — confirm closes & dismisses; cancel keeps it
  open; `ApiError` renders the banner and keeps the dialog open; pending disables
  buttons.
- **`AccountContextMenu.test.tsx`** — right-click an Open row shows "Close
  account" and calls `onRequestClose`; a Closed row shows "Reopen account" and
  calls `onRequestReopen`.
- **`AccountsPane.test.tsx`** (extend) — closed accounts hidden by default;
  toggle reveals them with the "Closed" label and flips its own label/count;
  toolbar button flips Close↔Reopen with the selected account's status; toolbar
  Close opens the dialog, toolbar Reopen fires the mutation; a failed reopen
  surfaces the dismissible error toast.
- **`types.test.ts`** — `status` round-trips on `AccountResponse`.

## Out of scope (YAGNI)

- No server-side status filter (backend returns all; client filters).
- No bulk close/reopen, no "closed accounts" dedicated page.
- No Edit action in the context menu (#29 is close/unclose only).
- No distinct handling of the generic already-closed/already-open 400 beyond
  surfacing `ApiError.message`.
