---
status: draft
---

# Account as a filter — all / subset / single account scope — design

## Context

Today the web client shows transactions **one account at a time**. The account is a
mandatory scope, not a filter: the route is `/accounts/:id`, `HomePage` reads `:id`
from the URL, the sidebar (`AccountsPane`) is a `NavLink` list that sets that single
`:id`, and `TransactionsPane` fetches with `useWindowedTransactions(id, …)`. The
account also anchors several behaviours — the displayed amount leg, the create
actions, the natural-language Quick add, and view persistence all key off that single
`id`.

This makes searching and analysing history painful: users cannot see their whole
history or compare a few accounts at once, and cross-account activity (transfers,
reconciliation) is invisible in a single-account view. Every other dimension (date,
category, labels) already behaves as a filter; account should too.

tracker#43 asks to **demote account from a mandatory single scope to a filter**:
view **all** accounts, a **subset**, or a **single** account, with search/filtering
operating over whatever scope is selected, each row identifying its account when more
than one is in view, and the scope persisting/restoring like the rest of the view.

### Backend contract (already sufficient — no backend change)

The transactions list endpoint already supports an all-accounts fetch:
`transactionsApi.list({ dateFrom, dateTo, limit, offset })` with **no `accountId`**
returns transactions across every account. The dormant hook
`useAllAccountsWindowedTransactions(from, to)` (`src/features/transactions/useWindowedTransactions.ts`)
already wraps that paging loop. There is **no** multi-account/subset query parameter,
so a subset is served client-side (fetch all, filter to the selected ids). This
confirms the issue's open question: **tracker#43 is web-only.**

## Goals

- View transactions across **all** accounts, a **selected subset**, or a **single**
  account, with account presented as a filter alongside date/category/labels.
- Search and existing filters apply over whatever account scope is selected.
- Each row clearly identifies its owning account when more than one account is in view.
- The selected scope persists and restores with the rest of the transactions view
  (URL + `lastView`), consistent with existing persistence.
- Backward-compatible: existing `/accounts/:id` deep links keep working.

## Non-goals (YAGNI)

- No backend change (no multi-account query param; subset is client-filtered).
- No cross-account **running balance** or aggregate balance in the multi/all header
  (meaningless across mixed currencies).
- No new **selection / merge / link / bulk** mechanics. Cross-account rows now simply
  coexist on screen; the existing transaction-based eligibility helpers already
  handle that. (This unblocks tracker#44 transfer-merge, which is out of scope here.)
- No "one row per transfer leg" splitting — each transaction still renders once.
- No retirement of the `/accounts/:id` route — it is kept as a permanent redirect.

## Scope model & routing

Account scope is carried in the URL query param **`accounts`** — the single source of
truth, joining `period`/`from`/`to` which are already URL-based:

| URL                              | Scope                        |
| -------------------------------- | ---------------------------- |
| `/transactions`                  | **all accounts** (default)   |
| `/transactions?accounts=a1`      | single account `a1`          |
| `/transactions?accounts=a1,a2`   | subset (union of a1, a2)     |

- **Absence** of the param = all accounts. A single id is just a one-element set.
- `/transactions` becomes the canonical page and renders the existing two-pane
  `HomePage` (accounts sidebar + transactions main).
- **Backward-compat redirects** (client `<Navigate replace>`, so the address bar
  converges on the canonical form):
  - `/accounts/:id` → `/transactions?accounts=:id` (preserving `?period/from/to`)
  - `/accounts` → `/transactions`
  - bare `/` runs the existing cold-start restore (see Persistence), redirecting into
    `/transactions[?accounts=…&period=…]`. With **no** `lastView`, `/` resolves to
    `/transactions` (all accounts, default period) — the all-accounts default makes
    the empty case unambiguous. `/` and `/transactions` therefore both render
    `HomePage`; `/` only ever restores-then-redirects and never shows content itself.

### `accountScope.ts` (new)

A focused module owns scope parsing/serialisation and subset filtering, keeping
`TransactionsPane` from absorbing more responsibility:

```ts
type AccountScope = { kind: 'all' } | { kind: 'accounts'; ids: UUID[] };

parseAccountScope(searchParams, accounts): AccountScope   // drops ids not in accounts
scopeToParam(scope): string | null                        // null ⇒ omit ?accounts
isSingle(scope): UUID | null                              // the sole id, or null
```

- **Defensive filtering:** ids absent from the user's current accounts are dropped
  (same spirit as today's deleted-account guard in `useRestoreLastAccount`). If a
  subset filters down to empty, it falls back to **all**.
- **Async accounts list:** the accounts list loads asynchronously, so unknown-id
  filtering only runs once `accounts` has loaded (`isSuccess`). Until then the raw
  parsed ids are used as-is, so a valid subset is never transiently emptied to "all"
  while accounts are still fetching.
- **Single conversion boundary:** the runtime scope
  (`{kind:'all'} | {kind:'accounts';ids}`) and the persisted form (`'all' | UUID[]`)
  are two representations of the same thing. `accountScope.ts` owns the only
  conversion between them so the two shapes cannot drift.

## Data fetching — `useScopedTransactions(scope, from, to)` (new)

Wraps the existing hooks; no backend change:

- **single** → `useWindowedTransactions(id, from, to)` (efficient one-account query).
- **all** → `useAllAccountsWindowedTransactions(from, to)`.
- **subset** → `useAllAccountsWindowedTransactions(from, to)`, then client-filter to
  rows whose `affectedAccountIds(t)` intersects the subset ids.

`affectedAccountIds(t)` already exists in `TransactionsPane` (income → target;
expense → source; transfer/adjustment → both); it moves alongside the scope helpers
so both the fetch filter and the account-cell renderer share one definition.

Ordering and paging guarantees are inherited unchanged from the underlying hooks.
Cache invalidation is unchanged: mutations already invalidate the `['transactions']`
query-key prefix, which covers the single, `['transactions','all',…]`, and subset keys.

**Data volume:** all/subset fetches page the whole date-bounded window across every
account (the existing all-accounts hook already does this for the link picker). The
date range is the natural bound; no extra windowing/UX guard is introduced now
(explicit non-goal). If volume proves a problem it is a later, separable concern.
Subset reuses the same cached `['transactions','all',…]` result, so switching between
all and subsets does not refetch.

## Sidebar (`AccountsPane`) — scope shortcuts

- A new **"All accounts"** row at the top → `/transactions` (no `accounts` param).
  Active (highlighted) when scope is all.
- Each account row → `/transactions?accounts=:id` (preserving the current `period`/
  `from`/`to` search but **overriding** any existing `accounts` param — the click sets
  a fresh single scope, it does not merge into the current subset).
  Active only when it is the **sole** scope; when a subset or all is active, no single
  row is highlighted.
- Account management (create/edit/share/adjust-balance) is unchanged.
- **Single-click = single scope** (replaces scope). **Subsets are chosen from the
  filter chip**, not the sidebar — this keeps the sidebar's one-click model intact and
  avoids inventing a modifier-click multi-select.

## Account filter chip — `AccountMultiSelect` (new)

"Account is just another filter." A multi-select mirroring `LabelMultiSelect` is added
to `TransactionFilterBar`, listing all accounts with bank-qualified labels via
`accountLabel(account, siblings)`:

- Reads/writes the `accounts` URL param directly (like the period control, which is
  also URL-based — distinct from the in-state `TransactionFilters`).
- **Empty selection = all accounts.** Selecting one is equivalent to the sidebar
  single-click; selecting several forms a subset.

## Header

- **Single** scope → keep `AccountHeader` (name · bank qualifier · balance).
- **All / subset** scope → a lightweight scope header ("All accounts" / "N accounts",
  the names available on hover). **No balance** — cross-account/mixed-currency balance
  is out of scope.

## List — Account column & amount

- **Account column** is shown only when scope spans **more than one** account (all, or
  a subset of ≥2). In single scope the column is hidden (unchanged from today).
- **Account cell content by type** (labels via `accountLabel`):
  - income → target account
  - expense → source account
  - transfer / adjustment → "Source → Target" (both labels, muted arrow)
- **Amount** via a new helper `transactionDisplayAmount(t, scope)`:
  - **single** scope → today's viewed-account leg logic is preserved
    (`isTarget = targetAccountId === id ? +targetAmount : −sourceAmount`).
  - **multi / all** scope →
    - income → `+targetAmount` / `targetCurrency` (green)
    - expense → `−sourceAmount` / `sourceCurrency` (red)
    - transfer / adjustment → **neutral** (unchanged from the recent
      "render transfer/adjustment amounts neutrally" commit); display the source leg.
- Each transaction still renders **exactly once** (the backend returns it once).

## Create actions & Quick add

- **Create** (Income / Expense / Transfer / Adjust) **stay enabled in every scope.**
  `selectedAccountId` is passed to `ControlBar` only when scope is exactly one account
  (prefilling the dialog's account field); otherwise it is undefined and the user
  picks the account inside the dialog. (The create dialogs already contain an account
  picker; the design must verify they behave with no preselected account.)
- **Quick add** (`QuickAddPrompt`) renders **only when exactly one account is scoped**
  — it needs a single target account. In multi/all scope it is hidden.

## Persistence (`lastView`)

`TxLastView` changes its account field from a single id to a scope:

```ts
// before: accountId: string
// after:  accounts: 'all' | UUID[]
```

- **Tolerant parse / migration:** an old persisted `{ accountId: "x", … }` is read as
  `accounts: ["x"]`; a missing/invalid value falls back to `'all'`. Follows the
  existing tolerant-parse pattern in `lastView.ts`.
- **Restore on open:** `useRestoreLastAccount` (bare `/`) reconstructs the scope +
  period into `/transactions[?accounts=…&period=…]`. All-scope → `/transactions`
  (no `accounts` param). Stored ids absent from the current accounts are dropped; if a
  subset empties out, it restores to all.

## Targeted cleanup

`TransactionsPane.tsx` is already ~960 lines. Rather than pile scope logic in, this
work extracts two focused modules it will consume:

- `accountScope.ts` — scope type, parse/serialise, `affectedAccountIds`, subset filter.
- `transactionDisplayAmount.ts` — the amount-leg + account-cell derivation per type.

No unrelated refactoring.

## Component / data flow

```
URL (?accounts, ?period)                 lastView (localStorage)
        │                                        │
        ▼                                        ▼
parseAccountScope(params, accounts) ── restore ──┘
        │
        ▼
AccountScope ──► useScopedTransactions(scope, from, to) ──► rows
        │                                                     │
        ├─► AccountsPane (active row / "All accounts")        │
        ├─► AccountMultiSelect (chip in filter bar)           │
        ├─► header (AccountHeader | scope header)             │
        ├─► ControlBar (selectedAccountId only if single)     │
        ├─► QuickAddPrompt (rendered only if single)          ▼
        └─► TransactionsPane list ──► transactionDisplayAmount(t, scope)
                                      + Account column (if scope > 1 account)
```

## Testing

- **Unit**
  - `accountScope`: param ↔ scope round-trip; defensive drop of unknown ids;
    empty-subset → all; `isSingle`.
  - subset filter via `affectedAccountIds` intersection (income/expense/transfer).
  - `lastView` migration: old `{accountId}` → `accounts:['id']`; invalid → all.
  - `transactionDisplayAmount`: single-scope leg logic preserved; multi-scope
    income/expense sign + colour; transfer/adjustment neutral + source leg.
- **Component**
  - `TransactionsPane` in single / subset / all scope: Account column presence,
    transfer "From → Target" cell, amounts, header variant, QuickAdd/create gating.
  - `AccountMultiSelect` writes the `accounts` param; empty = all.
  - `AccountsPane` "All accounts" row and active states.
- **E2E (`@local` Playwright smoke)**
  - Open all-accounts view → rows from multiple accounts + Account column.
  - Pick a subset via the chip → list narrows; single account restores the header.
  - `/accounts/:id` redirects to `/transactions?accounts=:id`.

## Acceptance criteria (from tracker#43)

- [ ] View all transactions across all accounts in a single list.
- [ ] Select multiple accounts and see the combined transactions.
- [ ] Single-account view still works (existing behaviour preserved).
- [ ] Account is presented as a filter (multi-select, clearable), not a hard scope.
- [ ] Search and other filters apply over the selected multi/all set.
- [ ] Each row indicates its owning account when more than one account is in view.
- [ ] Selected scope persists/restores with the rest of the view state.
