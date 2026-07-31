---
status: completed
---

# Web: Merge an Income + Expense Pair into a Single Transfer

Tracker: homeaccounting/tracker#44 (web side). Backend landed in server-infra
`feat/transfer-merge`. Unblocked by tracker#43 (account-as-filter / all-accounts
view, merged to master as #81) — both legs of a cross-account transfer are now
selectable together in the all-accounts / multi-account view.

## Problem

An internal transfer between two of the user's own accounts is frequently
recorded as two independent transactions (an `Expense` on one account, an
`Income` on the other) whenever the legs enter by different means — different
providers, an import + a manual entry, a bank with no import, or a cash
account. The user sees a phantom expense and a phantom income, inflating both
spend and income totals, with no way to reconcile them into one movement.

## Backend contract (already implemented — no web API/DTO change)

The web reuses the **existing** merge endpoint. For a transfer-merge:

- `POST /api/transactions/:id/merge` with `MergeTransactionsRequest { sourceTransactionIds }`.
- `:id` = the **Income** (the survivor); `sourceTransactionIds = [expenseId]`.
- The service detects the opposite-kind shape (target Income + single source
  Expense) and converts the Income into a `Transfer` (source account = the
  expense's account, target = the income's account), keeping the income's
  date/description; cancels the Expense; records a `merge` relation edge.
- Match window: **24h** (relaxed vs import's 5 min). Guards (all HTTP 422):
  - `TRANSFER_MERGE_SAME_ACCOUNT` — both legs on the same account.
  - `TRANSFER_MERGE_LEGS_DO_NOT_MATCH` — not a matching income/expense pair
    (unequal amount/currency, same direction, or outside the 24h window).
  - Wrong shapes (target not Income, source not Expense, >1 source) fall
    through to the same-kind path → `CANNOT_MERGE_INCOMPATIBLE_KINDS`.

`MergeTransactionsRequest`, the `merge` endpoint wrapper, `RelationKind='merge'`,
and `RelationBadge` all already exist on web. The web renders no transaction
history, so the backend's new merge/relation history entries are **out of scope**.

## Design — reuse the existing selection-driven Merge flow

The only changes are the eligibility gating and a dialog branch. No new
endpoint, DTO, hook, route, action-bar button, or cache-invalidation change
(`useMergeTransactions` already invalidates the `['transactions']` prefix, so the
all-accounts and per-account views both refresh).

### 1. Eligibility (`mergeEligibility.ts`)

Today `checkMergeEligibility` rejects any mixed-kind selection (`mixed-kinds`).
Extend it to recognize one extra shape and report which mode applies:

- Success type becomes `{ eligible: true; mode: 'same-kind' | 'transfer' }`.
- **Transfer mode** triggers only for **exactly two** rows that are one Income +
  one Expense, both `Completed`. Its gates mirror the backend guards so the UI
  explains before calling:
  - different real accounts → else new reason `transfer-same-account`.
  - equal amount **and** currency, and dates within **24h** → else new reason
    `transfer-legs-mismatch`. (Opposite direction is guaranteed by the
    one-income + one-expense shape.)
  - Amount/currency read from the categorised leg via existing helpers:
    income → `targetAmount`/`targetCurrency`, expense → `sourceAmount`/`sourceCurrency`.
- **Same-kind mode** = today's logic unchanged (≥2 rows, single supported kind,
  same account, same currency, compatible contacts).
- Any other mixed selection (e.g. 2 income + 1 expense) still returns
  `mixed-kinds` — a transfer-merge is strictly one income + one expense.

New constant `MERGE_TRANSFER_WINDOW_MS = 24 * 60 * 60 * 1000` (mirrors backend
`mergeTransferWindow`). Two new `MERGE_INELIGIBILITY_MESSAGE` entries. Export a
`transferPairOf(txs): { income, expense } | null` helper (reused by the dialog).

### 2. Dialog (`MergeTransactionsDialog.tsx`)

Branch on `eligibility.mode`:

- **same-kind** → exactly as today (survivor radios, combined total, "N cancelled").
- **transfer** → the Income is forced as the survivor (no radios; the reverse
  direction is rejected by the backend). Render a fixed summary:
  **From** = expense's account → **To** = income's account (labels via
  `useAccounts` + `accountLabel`, falling back to `—` while loading), the shared
  **amount**, and the income's date; plus a line: the expense is cancelled and
  linked to the resulting transfer. Title/description switch to transfer wording.
  Submit posts `merge(incomeId, { sourceTransactionIds: [expenseId] })`.

An ineligible transfer attempt (same account / legs mismatch) shows the conflict
alert with the new message, exactly like other ineligible selections today.

### 3. Pane wiring (`TransactionsPane.tsx`)

No structural change. `canMerge`/`mergeDisabledReason` already flow from
`checkMergeEligibility`; they now light up the Merge button for a matching
transfer pair. `SelectionActionBar` is untouched.

## Testing

- `mergeEligibility.test.ts`: transfer-eligible pair (`mode:'transfer'`);
  `transfer-same-account`; `transfer-legs-mismatch` for unequal amount, unequal
  currency, and >24h apart; 24h boundary inclusive; still-`mixed-kinds` for a
  3-row mixed selection; same-kind unchanged (now asserts `mode:'same-kind'`).
- `MergeTransactionsDialog.test.tsx`: transfer branch renders From→To + amount,
  no survivor radios, and posts `{ sourceTransactionIds: [expenseId] }` to the
  income's id; ineligible transfer shows the conflict message.
- `TransactionsPane.merge.test.tsx`: selecting an income + expense (different
  accounts, matching) enables Merge and opens the transfer dialog.

## References

- homeaccounting/tracker#44 — this feature.
- server-infra `docs/specs/2026-07-30-transfer-merge-design.md` — backend design.
- tracker#43 / web #81 — account-as-filter view that makes both legs selectable.
- tracker#30 — the merge command/saga/lineage reused here.
