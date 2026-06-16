---
status: draft
issue: 28
---

# Copy Transaction — Design

## Problem

> As a user I want to be able to copy an existing transaction (create a new one
> based on the data of an existing one) with the possibility to edit any data.
> — GitHub issue #28

## Context & existing infrastructure

The create flow this feature reuses already exists end to end; only a
pre-seeded entry point is missing.

- **Create dialogs**: `CreateIncomeDialog`, `CreateExpenseDialog`, and
  `CreateTransferDialog` (`src/features/transactions/`) each build a `defaults`
  object and render a shared form (`IncomeExpenseForm` / `TransferForm`) in
  `mode="create"`, submitting via `useCreateIncome` / `useCreateExpense` /
  `useCreateTransfer` and the `toIncomeRequest` / `toExpenseRequest` /
  `toTransferRequest` mappers in `schema.ts`.
- **Seed helpers**: `toIncomeExpenseFormValues(tx, accounts)` and
  `toTransferFormValues(tx, accounts)` in `schema.ts` already convert a
  `TransactionResponse` into form values (account, amount, currency, category,
  description, date, labels, exchangeRate). They are used today by
  `EditTransactionDialog`; they are exactly what a copy needs to pre-fill.
- **Row triggers**: `TransactionsPane` already drives per-row actions through a
  `ContextMenu` (Edit / Cancel items) plus hover-revealed icon buttons in a
  trailing actions cell (the Cancel `Ban` icon), and tracks dialog targets via
  local state (`editing`, `cancelTarget`).
- **Date default**: `nowDateTimeInput()` (`src/lib/dates.ts`) is what the create
  dialogs already use to default the date field to the current local time.

The gap is purely a **pre-seeded create dialog** plus the row triggers that open
it.

## Decisions (from brainstorming)

- **Date defaults to now.** A copy is treated as recording a similar
  transaction happening now, so the seeded `date` is overridden with
  `nowDateTimeInput()` rather than the source's timestamp. Everything else
  (account(s), amount, currency, category, description, labels, exchangeRate) is
  copied verbatim.
- **Any income / expense / transfer is copyable, regardless of status.** Copying
  produces a brand-new `Completed` transaction, so the source's status
  (Completed / Cancelled / Failed) is irrelevant. **Adjustments are excluded** —
  there is no create flow for them (consistent with Edit, which blocks
  adjustments).
- **Two entry points:** a **"Duplicate"** context-menu item _and_ a
  hover-revealed **copy icon** in the trailing actions cell. Both are shown for
  non-adjustment rows only.
- **Additive approach.** A dedicated `CopyTransactionDialog` mirrors
  `EditTransactionDialog`'s structure and reuses the create forms, hooks, and
  schema mappers. The existing create dialogs are left untouched (no regression
  risk).

### Alternatives considered

- **Add an optional `seed` prop to the three `Create*Dialog`s** — less new code,
  but spreads changes across three dialogs plus their tests and entangles copy
  logic into the create path.
- **Extract a shared form-dialog used by both create and copy** — a larger
  refactor, against the repo's "additive by default" philosophy.

Both were rejected in favour of the dedicated, additive dialog.

## Components & data flow

### 1. Labels — `src/features/transactions/labels.ts`

Add a `copyTitle` to each kind in `TRANSACTION_KIND_LABELS`:

- `income.copyTitle = 'Copy income'`
- `expense.copyTitle = 'Copy expense'`
- `transfer.copyTitle = 'Copy transfer'`

The submit label reuses the existing create `submit` ("OK").

### 2. Copy dialog — `src/features/transactions/CopyTransactionDialog.tsx`

A new component mirroring `EditTransactionDialog`'s shape.

- **Props:** `{ open, onOpenChange, tx }` where `tx: TransactionResponse` is the
  source row.
- **Kind detection:** same as `EditTransactionDialog` — `transfer` when
  `tx.transactionType === 'transfer'`, otherwise `income` / `expense`.
  `adjustment` renders a short defensive notice ("Balance adjustments can't be
  copied.") — mirror `EditTransactionDialog`'s `AdjustmentNotice` structure
  (`Alert role="alert"` + an OK button) so test selectors stay consistent. In
  practice the trigger is hidden for adjustments, so this is a safety net.
- **Loads** `useAccounts` and `useConfiguration` (for category/label
  dictionaries), like the create dialogs.
- **Seeds defaults** from the source transaction, with the date overridden to
  now:
  - income / expense: `{ ...toIncomeExpenseFormValues(tx, accounts), date: nowDateTimeInput() }`
  - transfer: `{ ...toTransferFormValues(tx, accounts), date: nowDateTimeInput() }`
  - Defaults are computed in a `useMemo` and the form is only mounted once
    `accounts` has loaded — react-hook-form seeds `defaultValues` once and does
    not re-init, the same constraint `EditTransactionDialog` already handles.
- **Renders** the existing form in `mode="create"` (so the submit button is
  enabled immediately — no dirty-gate, since every field is intentionally
  pre-filled). Income/expense categories come from the `income-category` /
  `expense-category` dictionaries (per kind); labels from the `labels`
  dictionary — same selection logic as the create dialogs.
- **Submits** through the existing create hooks and mappers:
  - income → `useCreateIncome` + `toIncomeRequest`
  - expense → `useCreateExpense` + `toExpenseRequest`
  - transfer → `useCreateTransfer` + `toTransferRequest` (resolving source/target
    currencies from `accounts`, exactly as `CreateTransferDialog` does)
  - The three create hooks are instantiated at the top of the component
    (hooks can't be conditional); only the one matching `kind` is invoked on
    submit.
- **Errors:** reuse the **create** dialogs' pattern — `ApiError.fieldErrors` are
  routed to the form via `setFieldError` using the **raw backend field name**
  (i.e. do _not_ reuse `EditTransactionDialog`'s `mapIncomeExpenseFieldError` /
  `mapTransferFieldError` mappers); other failures show the inline destructive
  `Alert` banner. On success the dialog closes.
- **Title:** `TRANSACTION_KIND_LABELS[kind].copyTitle`; description: "Create a
  new transaction from an existing one."

### 3. Entry points — `src/features/transactions/TransactionsPane.tsx`

A single `CopyTransactionDialog` instance driven by local `copying`
(`TransactionResponse | null`) state, with `openCopy(t)` setting it.

- **Context menu:** a `ContextMenuItem` "Duplicate" with a lucide `Copy` icon,
  added next to "Edit". Shown only when `t.transactionType !== 'adjustment'`.
- **Actions cell:** a hover-revealed ghost icon `Button` (`Copy` icon) wrapped in
  the same `Tooltip`/`TooltipContent` pattern as the Cancel control, with
  `aria-label="Duplicate"`. Shown when `t.transactionType !== 'adjustment'`
  (any status). Its `onClick` calls `stopPropagation` so it does not trigger the
  row's `openEdit` double-click/Enter handler.
- Render `<CopyTransactionDialog open onOpenChange={…} tx={copying} />` when
  `copying` is set, closing it by clearing the state (mirrors `editing`).

## Error handling

- `ApiError.fieldErrors` → mapped onto the form fields (same as create).
- Other `ApiError` / unknown errors → inline destructive banner in the dialog;
  the dialog stays open so the user can retry.
- `401` → handled centrally by `ApiClient.onUnauthorized` → sign-out (unchanged).

## Testing

Tests live next to the code (repo convention) and use the `src/test` helpers +
MSW handlers.

- `CopyTransactionDialog.test.tsx`:
  - Income/expense copy: the form is seeded from the source (amount, category,
    description, labels, account) with the **date defaulted to now, not the
    source's date**; submitting POSTs a new transaction and closes.
  - Transfer copy: seeded from both legs (source/target accounts, amount,
    exchangeRate) and submits a new transfer.
  - A field-error `ApiError` surfaces on the right field; a generic error shows
    the inline banner and keeps the dialog open.
  - An `adjustment` source renders the "can't be copied" notice.
- `TransactionsPane.test.tsx` (extend): the "Duplicate" context-menu item and the
  copy icon are present for income/expense/transfer rows (including
  Cancelled/Failed) and absent for adjustment rows; opening either shows the
  copy dialog; clicking the icon does not open the edit dialog.
- Existing create MSW handlers (`POST /api/transactions/...`) already cover the
  submit path; extend only if a gap surfaces.

## Out of scope

- No backend changes — reuses the existing create endpoints.
- No bulk copy / multi-select duplication.
- No copying of balance adjustments (no create flow exists for them).
- No change to the create dialogs or the create flow itself.
