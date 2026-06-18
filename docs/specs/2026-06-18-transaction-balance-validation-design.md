---
status: draft
issue: 46
---

# Ensure Balance Validation in Create Transaction — Design

## Problem

> Now there is no validation on the UI/Dialog of the source account balance for
> transfer/expense which causes the failed transaction on backend. We need to
> prevent this on UI: if debit amount is more than balance (with overdraft
> limit) then we should forbid to create such transaction.
> — GitHub issue #46

Creating an expense or transfer whose debit exceeds the source account's
available funds currently passes client-side validation and is only rejected by
the backend (HTTP 422 `INSUFFICIENT_FUNDS`). We want to catch this in the create
dialog before submission.

## Backend contract (source of truth)

`../server-infra/src/Domain/Account/CommandHandler.hs:217-238` validates a debit
(the backend repo is a sibling of this monorepo, at `../server-infra`):

```haskell
case account ^. #overdraftLimit of
  Nothing  -> Right [...]                              -- no check, unlimited debit
  Just lim -> if balance - amount >= negate lim        -- inclusive
                then Right [...] else Left InsufficientFunds
```

Implications for the wire type `AccountResponse.overdraftLimit: number | null`
(`src/api/types.ts:92-101`):

- **`overdraftLimit === null`** → no limit; the debit is **never** rejected for
  funds. (Loan and external accounts.) The UI must **skip** the check.
- **`overdraftLimit` is a number `N`** → the resulting balance must stay
  `>= -N`, i.e. `amount <= balance + N`. Regular accounts default to `0`
  (serialized as `0`, not `null`).
- The comparison is **inclusive** (`>=`): a debit that lands the balance exactly
  at `-N` is allowed.
- The debit is always applied in the **source account's own currency**
  (`sourceAmount`); there is no FX conversion at the debit step. The create form
  already locks the `currency` field to the selected source account's currency,
  so the form's `amount` is in that currency — no conversion is needed in the UI
  check.
- On failure the backend returns HTTP 422, code `INSUFFICIENT_FUNDS`, message
  "Insufficient funds" (`../server-infra/src/Web/ErrorMapping.hs:118-132`).

## Decisions (from brainstorming)

1. **Scope: create only**, for **expense** and **transfer**. Income only credits
   the target account, so it is never funds-constrained and is left unchanged.
   Edit is excluded: the existing transaction has already moved the displayed
   balance, so checking an edit against the current balance would double-count.
2. **Rule:** `available = balance + overdraftLimit`; block when
   `overdraftLimit !== null && amount > available`. Inclusive boundary
   (`amount === available` is allowed), mirroring the backend `>=`.
3. **Presentation:** inline `<FormMessage />` under the **Amount** field via a
   Zod refinement, which also fails form submission — the established pattern.

## Existing infrastructure

- **Schemas** (`src/features/transactions/schema.ts`): module-level
  `incomeExpenseFormSchema` and `transferFormSchema`, already carrying
  refinements (e.g. transfer's source ≠ target). These are consumed by both the
  create and edit dialogs, by the `toIncomeRequest` / `toExpenseRequest` /
  `toTransferRequest` mappers, and by tests.
- **Forms** (`IncomeExpenseForm.tsx`, `TransferForm.tsx`): build their
  `zodResolver` from the static schema, already receive `accounts:
AccountResponse[]`, and already lock `currency` to the selected source via a
  `useEffect` (`IncomeExpenseForm.tsx:52-56`, `TransferForm.tsx:47-54`).
- **Create dialogs**: `CreateExpenseDialog`, `CreateTransferDialog`,
  `CreateIncomeDialog` — each fetches accounts via `useAccounts()` and renders
  the shared form in `mode="create"`.
- **Error display**: `<FormMessage />` (`src/components/ui/form.tsx`) is
  react-hook-form-aware and renders the `amount` field error in red.
- **Currency formatting**: existing helper in `src/lib` (`format.ts`) for the
  message text.

## Approach

Add the balance check as **schema factories** that close over `accounts` (a
static schema cannot see the watched source-account balance), leaving the
existing module-level schemas untouched (strictly additive).

### `schema.ts`

- `makeIncomeExpenseFormSchema(accounts, kind)` — returns
  `incomeExpenseFormSchema` for `kind === 'income'`; for `kind === 'expense'`
  returns it extended with a `superRefine` that:
  - looks up the source account by `accountId`;
  - if found and `overdraftLimit !== null` and `Number.isFinite(amount)` and
    `amount > balance + overdraftLimit`, adds an issue at `path: ['amount']`
    with a message like `Exceeds available balance (1,250.00 USD)`.
- `makeTransferFormSchema(accounts)` — `transferFormSchema` with the same
  `superRefine` **chained** (keyed off `sourceAccountId`). Note
  `transferFormSchema` is already a `ZodEffects` (it carries the source ≠ target
  `.refine`), so use `transferFormSchema.superRefine(...)` — not `.extend()`,
  which is unavailable on `ZodEffects`. `incomeExpenseFormSchema` is a plain
  `ZodObject`, so `.superRefine(...)` applies directly. Adding a `superRefine`
  does not change the inferred output type, so the existing
  `as Resolver<…FormValues>` casts in the forms are reused verbatim.
- The `superRefine` runs only when the base fields parse, so an invalid/empty
  `amount` (caught by `positiveAmount`) won't reach it; the `Number.isFinite`
  guard is belt-and-suspenders.
- Existing `incomeExpenseFormSchema` / `transferFormSchema` exports stay as-is.

### Forms

- `IncomeExpenseForm` and `TransferForm` gain an optional
  `enforceBalance?: boolean` prop. When `true`, the resolver is built from the
  factory (`makeIncomeExpenseFormSchema(accounts, kind)` /
  `makeTransferFormSchema(accounts)`), memoized on `accounts` (and `kind`);
  otherwise it uses the static schema as today.

### Dialogs

- `CreateExpenseDialog` and `CreateTransferDialog` pass `enforceBalance`.
- `CreateIncomeDialog` and both edit dialogs are unchanged.

## Edge cases

- **`overdraftLimit === null`** → no check (unlimited). Verified explicitly.
- **Inclusive boundary** → `amount === balance + overdraftLimit` is allowed.
- **No source selected / empty amount** → base-field validation handles it; the
  refine no-ops.
- **Stale balance**: the check uses the `accounts` snapshot from `useAccounts()`.
  This is best-effort UI prevention; the backend remains the authority and its
  422 is still mapped to a field error as today (unchanged fallback). A rapid
  sequence of debits against the same account before `useAccounts()` refetches
  is the most likely false-negative — covered by the 422 fallback.

## Testing (TDD)

- **Schema factories** (`schema.test.ts` or new): expense/transfer under-limit
  passes; over-limit fails on `amount`; exactly-at-limit passes (inclusive);
  `overdraftLimit === null` always passes; **source account not found in the
  snapshot → no error** (refine no-ops); income factory never adds the check.
- **Dialog/component**: `CreateExpenseDialog` (and `CreateTransferDialog`) block
  submission and surface the amount error when the entered amount exceeds the
  selected source account's available balance; succeed when within it.

## Out of scope

- Edit-transaction balance validation (double-counting concern).
- Income transactions.
- Any change to the backend or to the existing 422 → field-error fallback.
