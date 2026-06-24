---
status: draft
---

# Adjust Balance Consistency — Design

## Problem

The **Adjust balance** action behaves differently from Income / Expense /
Transfer in the transactions control bar:

- Income / Expense / Transfer buttons are **always enabled**, and the user picks
  the account(s) **inside** the dialog via a dropdown.
- The **Adjust balance** button is **disabled** unless an account is already
  selected in the accounts list, and its dialog has **no account picker** — the
  account is fixed via a prop and the dialog shows that account's current
  balance.

This is inconsistent. We want all four actions to follow one model.

## Goal

1. Adjust balance lets the user choose the account **inside** the dialog (like
   the other dialogs), pre-selecting the currently-highlighted account.
2. A single, consistent no-accounts rule across all four actions: **when there
   are no accounts, all four buttons are disabled**, with a tooltip explaining
   why.

## Context & existing code

- `src/features/transactions/ControlBar.tsx` — renders the four icon buttons.
  Currently `Adjust balance` has `disabled={!selectedAccount}` and the
  `AdjustBalanceDialog` is only rendered when `selectedAccount` is truthy. The
  other three buttons are always enabled.
- `src/features/accounts/AdjustBalanceDialog.tsx` — takes a fixed
  `account: AccountResponse` prop, calls `useAdjustBalance(account.id)`, and
  shows the account's current balance (read-only) plus target balance,
  description, and date fields. No account selector.
- `src/features/transactions/CreateIncomeDialog.tsx` (and Expense/Transfer) —
  fetch accounts via `useAccounts()`, default the account to
  `accounts.find((a) => a.id === selectedAccountId) ?? accounts[0]`, render the
  account dropdown inside the form, and have an in-dialog empty-state branch
  (`"Create an account first to record income."`) when there are no accounts.
- `src/features/transactions/IncomeExpenseForm.tsx` — the account `<select>`
  markup to mirror.

## Design

### Button row — `ControlBar.tsx`

- `ControlBar` calls `useAccounts()` itself (same hook the dialogs use; cached by
  TanStack Query, so no extra request) to compute
  `hasAccounts = (accounts?.length ?? 0) > 0`.
- **All four** buttons are disabled when `!hasAccounts`.
- The disabled state carries an explanatory tooltip — when disabled, the
  `TooltipContent` reads **"Create an account first"**; otherwise it shows the
  existing action label.
- **Tooltip-on-disabled-button caveat:** a native `disabled` button does not
  fire pointer events, so the Radix tooltip will not open on hover. To keep the
  explanatory tooltip working, wrap the disabled button in a focusable
  `<span tabIndex={0}>` used as the `TooltipTrigger` (in `ControlBar.tsx` — do
  **not** hand-edit the vendored `src/components/ui/tooltip.tsx`). The button
  keeps its native `disabled` for click/keyboard semantics; the span carries the
  hover/focus target.
- The `Adjust balance` button drops its `disabled={!selectedAccount}` guard.
- `AdjustBalanceDialog` is always rendered (drop the
  `{selectedAccount && ...}` conditional) and receives `selectedAccountId`
  instead of a fixed `account`.

### Dialog — `AdjustBalanceDialog.tsx`

- Props change from `account: AccountResponse` to `selectedAccountId?: UUID`,
  matching the other create dialogs. The dialog fetches accounts via
  `useAccounts()`.
- An **Account** dropdown is added at the top of the form, using the same markup
  as `IncomeExpenseForm`'s account `<select>`. `accountId` becomes a form field,
  defaulting to `accounts.find((a) => a.id === selectedAccountId) ?? accounts[0]`.
- **Current balance** display and its currency become **reactive** to the
  selected account — derived from the watched `accountId`
  (`accounts.find((a) => a.id === watchedAccountId)`). This watched account also
  feeds the `currency` argument of `toAdjustBalanceRequest(values, currency)`
  (currently sourced from the fixed `account.currency`) so the request currency
  switches with the dropdown.
- `useAdjustBalance(accountId)` is called with the watched `accountId` at
  hook-call time (the hook closes the id at call time, not at `mutateAsync`
  time, and builds its invalidation key from it — so passing the watched value
  re-creates the mutation when the account changes, which is acceptable here).
  The mutation therefore targets the chosen account.
- Because buttons can't open the dialog without accounts, the `accounts[0]`
  default is always safe. For defensiveness against future callers, keep a
  no-accounts fallback branch consistent with the other dialogs
  (e.g. "Create an account first to adjust a balance.").

### Transfer's two-account requirement

The disable rule covers the **zero-accounts** case for all four buttons. Transfer
additionally needs **two** accounts to be usable, but with exactly one account
the Transfer button stays enabled and its existing in-dialog empty state
(`"Create at least two accounts first to make a transfer."`,
`CreateTransferDialog.tsx`) handles that case. This is intentional — we are not
expanding the disable rule per-button; the single shared rule is purely "no
accounts → all disabled", and Transfer's stricter requirement remains handled
inside its dialog as today.

### Unreachable empty states

The existing in-dialog empty-state branches in the income/expense/transfer
dialogs become unreachable once the buttons are disabled without accounts. They
are **kept** as a defensive fallback rather than removed — harmless and guards
against future direct callers.

## Testing

- Update `AdjustBalanceDialog` tests for the new `selectedAccountId` prop and the
  account selector.
- Add: switching the account in the dropdown updates the displayed current
  balance and currency.
- Add: submitting targets the account chosen in the dropdown.
- `ControlBar`: all four buttons are disabled (with the "Create an account
  first" tooltip) when there are no accounts, and enabled when there is at least
  one.

## Out of scope

- No backend changes — `useAdjustBalance` and the adjust endpoint are unchanged.
- No changes to the income/expense/transfer form fields beyond the shared
  disabled-button rule.
