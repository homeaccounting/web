---
status: completed
issue: 32
---

# Cancel Transaction — Design

## Problem

> As a user I want to be able to delete/cancel the transaction so that it
> doesn't appear by default in the list & account balance doesn't contain it.
> — GitHub issue #32

## Context & existing infrastructure

The downstream behaviour the issue asks for already exists; only the trigger is
missing.

- **Backend**: `DELETE /api/transactions/:id` _cancels_ a transaction (soft),
  returning `204 No Content`. There is no hard delete. The resulting status is
  `Cancelled`. See `../server-infra/src/Web/API/TransactionAPI.hs`
  (`cancelTransactionHandler`). Invalid states return `409`:
  `TRANSACTION_ALREADY_CANCELLED`, cancellation already in progress, or
  cancellation blocked by an in-flight amendment.
- **Balance**: the backend already excludes cancelled transactions from account
  balance — no frontend work needed.
- **List visibility**: `applyTransactionFilters` in
  `src/features/transactions/transactionFilters.ts` already hides `Cancelled`
  (and `Failed`) rows unless `showCancelledFailed` is on (default `false`).
- **Status surfacing**: `TransactionStatusIcon` already renders a `Ban` icon for
  `Cancelled`, and `TransactionsPane` already de-emphasises (strikethrough,
  muted) `Cancelled` rows.

The gap is purely the **frontend action** that calls the DELETE endpoint and
invalidates the relevant queries.

## Decisions (from brainstorming)

- Confirmation is required (balance-affecting, not reversible via the UI) →
  `AlertDialog`.
- Action is labelled **"Cancel transaction"** (matches backend semantics and the
  `Cancelled` status), not "Delete".
- Two entry points: the row **context menu** _and_ a dedicated per-row **icon
  control with a tooltip**.
- Errors surface **inline inside the confirm dialog** (this app has no global
  toast system); the dialog stays open on failure.

## Components & data flow

### 1. API layer — `src/api/transactions.ts`

Add to `transactionsApi`:

```ts
cancel: (id: UUID): Promise<void> => client.delete<void>(`/api/transactions/${id}`),
```

`ApiClient.delete` already exists (`src/api/client.ts`) and empty bodies are
already normalised to `void`.

### 2. Mutation hook — `src/features/transactions/useCancelTransaction.ts`

Mirrors `useEditTransaction`'s structure (own `ApiClient` from `tokenRef` +
`signOut`).

- Vars: `{ id: UUID; accountIds: UUID[] }`.
- `mutationFn`: `await api.cancel(id)`.
- `onSettled`: invalidate `['accounts']` and `['transactions', acc]` for each
  account in `accountIds`, so the list re-fetches (the now-`Cancelled` row drops
  out of the default view) and balances refresh.
- No optimistic cache patch — invalidation is sufficient and simpler.

`accountIds` for a row are `[sourceAccountId, targetAccountId]` de-duplicated
(same approach the edit flow uses to refresh both legs of a transfer).

### 3. Confirmation dialog — `src/features/transactions/CancelTransactionDialog.tsx`

A shadcn `AlertDialog` (`src/components/ui/alert-dialog.tsx`).

- Props: `{ open, onOpenChange, transaction }` where `transaction` provides the
  id + account ids (nullable; closed when null).
- Title: "Cancel this transaction?"; body: brief explanation that it will be
  excluded from the balance and hidden from the default list.
- Footer: `AlertDialogCancel` "Keep" + a destructive confirm
  "Cancel transaction".
- On confirm: run the mutation. On success → close. On `ApiError` (e.g. the
  `409`s) → render `error.message` inline in the dialog body and **keep it
  open**, matching the inline-banner pattern in `EditTransactionDialog`. While
  pending, the confirm button is disabled/busy.

### 4. Entry points — `src/features/transactions/TransactionsPane.tsx`

A single dialog instance driven by local `cancelTarget` state.

- **Context menu**: a destructive `ContextMenuItem` "Cancel transaction" with a
  `Ban` icon, next to the existing "Edit" item.
- **Dedicated row control**: a new trailing action cell containing a ghost icon
  `Button` (`Ban` icon) wrapped in `Tooltip`/`TooltipContent`
  "Cancel transaction" (the same tooltip pattern as `ControlBar`), with
  `aria-label="Cancel transaction"`. Revealed on row hover. Its `onClick` calls
  `stopPropagation` so it does not trigger the row's `openEdit`
  double-click/Enter handler.
- Both set `cancelTarget` and open the dialog.
- Action is **hidden for rows whose status is already `Cancelled`**. Other
  invalid states (amendment in progress, etc.) are left to the backend `409` →
  inline error.

## Error handling

- `409` conflicts → `ApiError.message` shown inline in the dialog; user can
  retry or "Keep".
- `401` → handled centrally by `ApiClient.onUnauthorized` → sign-out (unchanged).

## Testing

Tests live next to the code (repo convention) and use the `src/test` helpers +
MSW handlers.

- `useCancelTransaction.test.tsx`: DELETE is called with the right id;
  `['accounts']` and `['transactions', acc]` are invalidated on settle.
- `CancelTransactionDialog.test.tsx`: confirm triggers the mutation and closes on
  success; a mocked `409` shows the inline error and keeps the dialog open.
- `TransactionsPane.test.tsx` (extend): the dedicated control and the context-menu
  item are present for a non-cancelled row, absent for a `Cancelled` row, and
  opening either shows the dialog; clicking the control does not open the edit
  dialog.
- Add/extend an MSW handler for `DELETE /api/transactions/:id` in
  `src/test/handlers.ts`.

## Out of scope

- No backend changes.
- No hard delete (backend only supports soft cancel).
- No new list filter — existing `showCancelledFailed` already governs visibility.
- No un-cancel / restore flow.
