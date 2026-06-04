---
status: draft
---

# Edit Transaction — Design

**Date:** 2026-06-04
**Status:** Draft (pre-implementation)
**Issue:** [homeaccounting/web#14](https://github.com/homeaccounting/web/issues/14)
**Scope:** Edit an existing `Completed` transaction (income, expense, or internal transfer) from the transactions view.
**Predecessors:** [`2026-06-01-create-transaction-design.md`](./2026-06-01-create-transaction-design.md) — the create slice deliberately left forms `mode`-aware so this slice reuses them with `mode="edit"`. The diff/orchestration pattern follows [`2026-05-11-edit-account-design.md`](./2026-05-11-edit-account-design.md).

## 1. Purpose & scope

A signed-in user opens the transactions view (`TransactionsPane`) and edits an existing transaction by double-clicking the row OR right-clicking the row and selecting **Edit** from a context menu. The dialog reuses the existing `IncomeExpenseForm` (income/expense) and `TransferForm` (transfer) in `mode="edit"`, seeded with the row's values.

Editable fields per the issue:

- description
- amount
- date
- allocations (income/expense — single-allocation MVP, i.e. category)

On save the dialog closes, the transactions list and account balances refetch, and the user stays on the currently-viewed account.

### Explicitly out of scope (deferred)

- Cross-kind amendment (income ↔ expense ↔ transfer). The dialog is dispatched off `tx.transferType` and stays single-kind for its lifetime. The account picker(s) only show user-owned regular accounts (External accounts are filtered out by `useAccounts`), so the kind invariant holds structurally.
- Foreign-currency income/expense. In edit mode the income/expense account picker is **filtered to accounts with the same currency** as the original transaction; cross-currency income/expense remains out of scope as in the create slice.
- Multi-allocation editing (split one income/expense across categories). Single-allocation MVP from `2026-06-01-create-transaction-design.md` is preserved; the `category` field stays a single dictionary entry and we send a one-element `Allocations` list to the backend.
- Editing labels of a transfer with foreign-currency amendment (we send only what changed; the amendment path mirrors create).
- Cancelling/deleting a transaction.
- Editing transactions whose status is not `Completed` — the dialog opens in **read-only** mode in that case (see §3).
- An undo mechanism after partial failures (we re-seed from a refetch; the user retries manually).

## 2. Backend dependency

No backend changes. The web client consumes the existing per-field edit endpoints:

| Endpoint                                  | Source                                               |
| ----------------------------------------- | ---------------------------------------------------- |
| `PUT /api/transactions/:id/description`   | `server-infra/src/Web/API/TransactionAPI.hs:151-158` |
| `PUT /api/transactions/:id/date`          | `server-infra/src/Web/API/TransactionAPI.hs:159-166` |
| `PUT /api/transactions/:id/labels`        | `server-infra/src/Web/API/TransactionAPI.hs:135-142` |
| `PATCH /api/transactions/:id/allocations` | `server-infra/src/Web/API/TransactionAPI.hs:143-150` |
| `PUT /api/transactions/:id/amendment`     | `server-infra/src/Web/API/TransactionAPI.hs:167-174` |

Request DTOs mirror `server-infra/src/Web/Types.hs:408-484`. All endpoints require `AuthProtect "jwt"`; `ApiClient` already injects the bearer token and normalises non-2xx responses to `ApiError` with `fieldErrors` (`src/api/client.ts`).

Backend rejections that can be surfaced to the user but not predicted client-side:

- `CannotEditUncompletedTransaction` — `Web/ErrorMapping.hs:223`.
- `Cannot edit a transaction in a closed period` — `Web/ErrorMapping.hs:298`.

Both come back as generic `ApiError` (no `fieldErrors`) and route into the dialog's destructive `Alert` banner (§5).

## 3. UI

### 3.1 Row activation

`TransactionsPane.tsx` currently renders rows as plain `<tr>` inside a `<table>`. We add row-level interactivity:

- **Double-click** on any row → opens `EditTransactionDialog` for that row's transaction.
- **Right-click** on any row → shadcn `ContextMenu` containing a single `Edit` item that opens the same dialog. We vendor `src/components/ui/context-menu.tsx` via `pnpm dlx shadcn@latest add context-menu` (no hand-edits — `components.json` rules).
- Rows get `cursor-pointer` and a hover style for affordance.
- Keyboard a11y: rows become `role="button" tabIndex={0}`; `Enter`/`Space` open the dialog. The context menu remains pointer-only for this slice (a row-actions button can be added later if needed).
- Non-`Completed` rows (`Pending`, `Failed`, or any other backend status reachable through `TransactionStatusText`'s open `string & {}` branch — e.g. a future `Cancelled`) still trigger the dialog — the dialog itself handles the read-only branch (§3.3).

### 3.2 Dispatch

`EditTransactionDialog` takes a `TransactionResponse` and derives the kind from `transferType`:

- `Income` / `Expense` → render `IncomeExpenseForm` with the matching `kind` and `mode="edit"`.
- `Transfer` → render `TransferForm` with `mode="edit"`.

The dialog title is `Edit income` / `Edit expense` / `Edit transfer`.

### 3.3 Status-aware guard

`EditTransactionDialog` reads `tx.status`:

- If `tx.status === 'Completed'`, render the form normally (full edit mode).
- Otherwise, render the form with all inputs disabled, no submit button, and an inline notice above the form: _"This transaction is `{status}` and cannot be edited."_ The Cancel button still closes the dialog.

A closed-period rejection cannot be detected client-side (no period info on the wire), so we still allow submission of `Completed` rows and surface the backend error via the generic-error banner.

### 3.4 Form changes (mode-conditional)

The create slice (`2026-06-01-create-transaction-design.md`) already shipped `mode`-aware forms. Additions:

- **Account pickers stay editable in edit mode.** Income/expense: the picker is **filtered to accounts whose currency matches the original transaction's currency** (`accounts.filter(a => a.currency === initialCurrency)`). Transfer: both source and target pickers remain unrestricted — transfer already supports cross-currency via `exchangeRate`. The same-currency filter is passed in by `EditTransactionDialog` as a derived `accounts` prop, so the forms themselves are unchanged on this front.
- **Hide the "Defaults to today on the server" helper text** in edit mode — the date field already has a value, so the hint is confusing.
- **Submit button label** becomes `Save` in edit mode for all three kinds (a new `editSubmit` entry per kind in `src/features/transactions/labels.ts`).
- **Submit disabled when clean** (`!formState.isDirty`) in edit mode, so no-op edits aren't possible from the UI.

Currency badge behavior is unchanged: the existing `watch('accountId') → setValue('currency')` effect updates the badge when the user picks a different (same-currency) income/expense account; for transfer, switching either account leg updates the relevant currency display as today.

### 3.5 Visual notes

- The dialog reuses `Dialog`, `Form*`, `Input`, `Select`, `Alert` shadcn primitives — no new primitives apart from the vendored `context-menu`.
- Row hover style: `hover:bg-muted/50`.
- No layout changes to the table header or columns.

## 4. Form defaults, diff, and orchestration

### 4.1 `toFormValues` mapper

Add to `src/features/transactions/schema.ts`:

```ts
import type { AccountResponse, TransactionResponse } from '@/api/types';

const dateToYyyyMmDd = (iso: string) => iso.slice(0, 10);

export function toIncomeExpenseFormValues(
  tx: TransactionResponse,
  accounts: AccountResponse[],
): IncomeExpenseFormValues {
  // For income, the user-facing account is the target leg; for expense it
  // is the source leg. The other leg is the External account.
  const isIncome = tx.transferType === 'Income';
  const accountId = isIncome ? tx.targetAccountId : tx.sourceAccountId;
  const amount = isIncome ? tx.targetAmount : tx.sourceAmount;
  const currency =
    accounts.find((a) => a.id === accountId)?.currency ??
    (isIncome ? tx.targetCurrency : tx.sourceCurrency);
  return {
    accountId,
    amount,
    currency,
    category: tx.category ?? '',
    description: tx.description,
    date: dateToYyyyMmDd(tx.date),
    labels: tx.labels,
  };
}

export function toTransferFormValues(
  tx: TransactionResponse,
  accounts: AccountResponse[],
): TransferFormValues {
  return {
    sourceAccountId: tx.sourceAccountId,
    targetAccountId: tx.targetAccountId,
    amount: tx.sourceAmount,
    currency: accounts.find((a) => a.id === tx.sourceAccountId)?.currency ?? tx.sourceCurrency,
    description: tx.description,
    exchangeRate: tx.exchangeRate ?? undefined,
    date: dateToYyyyMmDd(tx.date),
    labels: tx.labels,
  };
}
```

For income/expense, `tx.category` is guaranteed by the create flow (single-allocation MVP), so the `?? ''` is defensive.

### 4.2 Diff

New file `src/features/transactions/diffTransaction.ts`, mirrors `src/features/accounts/diffAccount.ts`:

```ts
import type {
  Allocation,
  AmendTransactionRequest,
  ISO8601,
  TransactionResponse,
  UUID,
} from '@/api/types';
import type { IncomeExpenseFormValues, TransferFormValues } from './schema';

export interface TransactionEditDiff {
  description?: string;
  date?: ISO8601;
  labels?: UUID[];
  amendment?: AmendTransactionRequest;
  allocations?: Allocation[];
}

const isoDayUtc = (yyyyMmDd: string): ISO8601 => `${yyyyMmDd}T00:00:00.000Z`;
const sameLabels = (a: UUID[], b: UUID[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);
```

Two diff entry points — one per form shape. Both consume `(initial, next, tx)` so the amendment carries the canonical (possibly unchanged) leg identity from `tx` while overlaying whatever the form changed.

`diffIncomeExpense` (income/expense — single allocation, single currency):

- `description` set if `next.description !== initial.description`.
- `date` set (full ISO string) if `next.date !== initial.date`.
- `labels` set if `!sameLabels(initial.labels, next.labels)`.
- **Amendment** is set if either the regular account or the amount changed. The amendment body uses the **regular-account leg** from `next.accountId` (target for income, source for expense) and keeps the External-account leg from `tx`. Currency is `next.currency` (the picker is same-currency-filtered, so this equals `initial.currency`); source and target amounts both equal `next.amount`.
- **Allocations** is set when the amendment is set (sum-against-total invariant) OR when only the category changed. Body is always `[{ category: next.category, amount: next.amount, currency: next.currency }]`.

`diffTransfer`:

- `description`, `date`, `labels` as above.
- **Amendment** is set if `sourceAccountId`, `targetAccountId`, `amount`, or (when cross-currency) `exchangeRate` changed. The body carries the (possibly new) account ids, the source and target currencies derived from the chosen accounts, `sourceAmount = next.amount`, `targetAmount = next.amount * (next.exchangeRate ?? 1)` when cross-currency, else equal. `exchangeRate` is passed through when source/target currencies differ, otherwise omitted (matches the create-flow rule).
- No `allocations` for transfers.

Pure function, no side effects, fully unit-testable.

### 4.3 Orchestration

New hook `src/features/transactions/useEditTransaction.ts`:

```ts
export interface EditTransactionInput {
  id: UUID;
  accountIds: UUID[]; // for cache invalidation (1 or 2 ids)
  diff: TransactionEditDiff;
}

export function useEditTransaction() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<TransactionResponse | null, ApiError, EditTransactionInput>({
    mutationFn: async ({ id, diff }) => {
      const api = transactionsApi(
        new ApiClient({ baseUrl, getToken: () => tokenRef.current, onUnauthorized: signOut }),
      );
      let last: TransactionResponse | null = null;
      if (diff.amendment) last = await api.amend(id, diff.amendment);
      if (diff.allocations)
        last = await api.setAllocations(id, { newAllocations: diff.allocations });
      if (diff.description !== undefined)
        last = await api.setDescription(id, { description: diff.description });
      if (diff.date) last = await api.setDate(id, { at: diff.date });
      // diff.labels presence — not truthiness — gates the request; an
      // empty array is the user's explicit "clear labels" and must be sent.
      if (diff.labels !== undefined) last = await api.setLabels(id, { labels: diff.labels });
      return last;
    },
    onSettled: (_data, _err, { accountIds }) => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      for (const acc of accountIds) {
        void queryClient.invalidateQueries({ queryKey: ['transactions', acc] });
      }
    },
  });
}
```

Order is deliberate: amendment (saga) first, then the cheap fact updates. The mutation **throws** the `ApiError` as-is on the first failure; the dialog catches it for field-error routing and the banner. `onSettled` runs in both success and failure paths so partial state always reaches the cache and the form re-seeds from the refetch (§5).

### 4.4 New API client methods

`src/api/transactions.ts`:

```ts
export const transactionsApi = (client: ApiClient) => ({
  list: /* unchanged */,
  createIncome: /* unchanged */,
  createExpense: /* unchanged */,
  createTransfer: /* unchanged */,

  setDescription: (id: UUID, body: ChangeTransactionDescriptionRequest) =>
    client.put<TransactionResponse>(`/api/transactions/${id}/description`, body),
  setDate: (id: UUID, body: ChangeTransactionDateRequest) =>
    client.put<TransactionResponse>(`/api/transactions/${id}/date`, body),
  setLabels: (id: UUID, body: SetTransactionLabelsRequest) =>
    client.put<TransactionResponse>(`/api/transactions/${id}/labels`, body),
  setAllocations: (id: UUID, body: SetTransactionAllocationsRequest) =>
    client.patch<TransactionResponse>(`/api/transactions/${id}/allocations`, body),
  amend: (id: UUID, body: AmendTransactionRequest) =>
    client.put<TransactionResponse>(`/api/transactions/${id}/amendment`, body),
});
```

Existing `ApiClient` methods are single-`<T>` (response type only — see `src/api/client.ts:26-40`). The new `patch<T>(path, body?)` follows the same shape; it is the only HTTP verb the existing client doesn't expose. No other client changes.

## 5. API types

Add to `src/api/types.ts`, mirroring `server-infra/src/Web/Types.hs:408-484`:

```ts
export interface Allocation {
  category: UUID;
  amount: number;
  currency: string;
}

export interface SetTransactionLabelsRequest {
  labels: UUID[];
}
export interface SetTransactionAllocationsRequest {
  newAllocations: Allocation[];
}
export interface ChangeTransactionDescriptionRequest {
  description: string;
}
export interface ChangeTransactionDateRequest {
  at: ISO8601;
}
export interface AmendTransactionRequest {
  sourceAccountId: UUID;
  targetAccountId: UUID;
  sourceAmount: number;
  sourceCurrency: string;
  targetAmount: number;
  targetCurrency: string;
  exchangeRate?: number;
  newAllocations?: Allocation[];
}
```

`newAllocations` on `AmendTransactionRequest` is optional and **omitted by the diff in this slice** — we always use the dedicated `PATCH /allocations` for allocation changes. The field is included on the type for wire fidelity and to leave room for cross-kind amendments later.

## 6. Error handling

Mirrors `EditAccountDialog` + `CreateAccountDialog`.

- **Generic errors** (network, 5xx, `ApiError` without `fieldErrors`, or any non-`ApiError`) → destructive `Alert` above the form. Backend messages `Cannot edit a transaction in a closed period` and `Transaction is not Completed` land here.
- **`ApiError.fieldErrors`** → routed through the existing `onReady({ setFieldError })` API. Mappings (all known backend field names, fall back to banner for anything else):

  | Backend field                    | Form field (income/expense)                                   | Form field (transfer)   |
  | -------------------------------- | ------------------------------------------------------------- | ----------------------- |
  | `description`                    | `description`                                                 | `description`           |
  | `at`                             | `date`                                                        | `date`                  |
  | `labels`                         | `labels`                                                      | `labels`                |
  | `sourceAmount`                   | `amount`                                                      | `amount`                |
  | `targetAmount`                   | `amount`                                                      | `amount`                |
  | `sourceCurrency`                 | `amount`                                                      | `amount`                |
  | `targetCurrency`                 | `amount`                                                      | `amount`                |
  | `exchangeRate`                   | `amount`                                                      | `exchangeRate`          |
  | `sourceAccountId`                | `accountId` (expense) / banner (income — leg not user-facing) | `sourceAccountId`       |
  | `targetAccountId`                | `accountId` (income) / banner (expense — leg not user-facing) | `targetAccountId`       |
  | `newAllocations` / `allocations` | `category`                                                    | banner (no allocations) |

  The mapping is implemented as a small `mapEditFieldError(backendField, kind)` helper colocated with the dialog. For income, `sourceAccountId` corresponds to the External leg (not user-facing) — its errors route to the banner; `targetAccountId` is the user-facing regular leg and routes to `accountId`. Mirror for expense.

- **401 Unauthorized** → handled globally by `ApiClient.onUnauthorized` → `signOut`. No special handling here.

### 6.1 Partial-failure recovery

After any error, `onSettled` invalidates `['transactions', accountId]` and `['accounts']`. The dialog watches the mutation result and, on error:

1. Resets the form via `form.reset(toFormValues(refetchedTx, accounts))` — successful steps appear as clean, the failing field stays dirty (its value is still the user's edit).
2. Shows the error in the banner.
3. Routes `fieldErrors` per §6.

The dialog stays open. Cancel discards the unsaved field.

## 7. Testing

Vitest + Testing Library + happy-dom + MSW, colocated `*.test.{ts,tsx}`. MSW handlers added in `src/test/handlers.ts`.

| File                                  | Coverage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `diffTransaction.test.ts`             | Pure unit tests: only-description, only-date, only-labels, only-amount (income/expense → amendment + allocations), only-category (income/expense → allocations only), only-account (income/expense → amendment + allocations, with the new regular-leg id and unchanged External leg), amount+category combined, transfer same-currency amount change, transfer cross-currency amount + exchange-rate change, transfer account-swap, clean diff is empty, `YYYY-MM-DD` → ISO at start-of-day UTC.                                                                                                                                                                                |
| `IncomeExpenseForm.test.tsx` (extend) | `mode="edit"` keeps the account select enabled but only lists accounts whose currency matches the seeded currency (the form receives the filtered `accounts` prop and renders it as-is); helper text "Defaults to today" is absent; submit label is "Save"; Save disabled when form is clean.                                                                                                                                                                                                                                                                                                                                                                                    |
| `TransferForm.test.tsx` (extend)      | `mode="edit"` keeps both account selects enabled with the full account list; helper text absent; submit label "Save"; Save disabled when clean.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `EditTransactionDialog.test.tsx`      | Opens with defaults seeded from the row; non-`Completed` row renders read-only with the status notice; description-only edit fires exactly one request (PUT description); amount edit fires amendment + allocations in order; account-only edit (income, switching to another same-currency account) fires amendment + allocations; the picker for income/expense lists only same-currency accounts; first-failure stops further requests and shows the banner; refetch reseeds form (successful steps clean, failing field dirty); `fieldErrors.at` maps to the form's `date` field; `fieldErrors.targetAccountId` on an income amendment maps to the form's `accountId` field. |
| `TransactionsPane.test.tsx` (extend)  | Double-click on a row opens the dialog; right-click opens the context menu with the `Edit` item; `Enter` on a focused row opens the dialog.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `src/test/handlers.ts`                | MSW handlers for the five edit endpoints (success + a representative `fieldErrors` case on amendment).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `e2e/edit-transaction.spec.ts`        | One happy-path Playwright spec: open the row context menu → Edit → change description → Save → list reflects the new description.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |

## 8. File-by-file summary

| File                                                        | New / Modified                                                                                                                                                                                    |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/api/types.ts`                                          | Modified — add `Allocation`, `SetTransactionLabelsRequest`, `SetTransactionAllocationsRequest`, `ChangeTransactionDescriptionRequest`, `ChangeTransactionDateRequest`, `AmendTransactionRequest`. |
| `src/api/transactions.ts`                                   | Modified — add `setDescription`, `setDate`, `setLabels`, `setAllocations`, `amend`.                                                                                                               |
| `src/api/client.ts`                                         | Modified — add `patch<TReq, TRes>(path, body)` if not already present.                                                                                                                            |
| `src/features/transactions/diffTransaction.ts`              | New — pure diff and endpoint plan (`diffIncomeExpense`, `diffTransfer`).                                                                                                                          |
| `src/features/transactions/schema.ts`                       | Modified — add `toIncomeExpenseFormValues`, `toTransferFormValues` mappers.                                                                                                                       |
| `src/features/transactions/IncomeExpenseForm.tsx`           | Modified — disable account select and hide helper text when `mode==='edit'`; use `editSubmit` label; disable Save when clean.                                                                     |
| `src/features/transactions/TransferForm.tsx`                | Modified — same mode-conditional adjustments (both account selects disabled).                                                                                                                     |
| `src/features/transactions/labels.ts`                       | Modified — add `editSubmit` per kind ("Save"); add edit-mode dialog titles.                                                                                                                       |
| `src/features/transactions/EditTransactionDialog.tsx`       | New — dispatch by `transferType`, status guard, orchestration via `useEditTransaction`, banner + field-error routing.                                                                             |
| `src/features/transactions/useEditTransaction.ts`           | New — mutation that runs the diff plan sequentially; invalidates `['transactions', accountId]` + `['accounts']` on settled.                                                                       |
| `src/features/transactions/TransactionsPane.tsx`            | Modified — wrap rows in `ContextMenu`; add double-click + `Enter`/`Space` handlers; track which row is being edited; render `<EditTransactionDialog />`.                                          |
| `src/components/ui/context-menu.tsx`                        | New — vendored shadcn primitive via `pnpm dlx shadcn@latest add context-menu`.                                                                                                                    |
| `src/test/handlers.ts`                                      | Modified — MSW handlers for the five edit endpoints.                                                                                                                                              |
| `e2e/edit-transaction.spec.ts`                              | New — one happy-path spec.                                                                                                                                                                        |
| Colocated `*.test.{ts,tsx}` next to each new/changed module | New / extended (per §7).                                                                                                                                                                          |

## 9. Decision log

- **Reuse `IncomeExpenseForm`/`TransferForm` with `mode="edit"`.** Both forms were built `mode`-aware in the create slice precisely for this. No fork. (Q-reuse-forms)
- **Both double-click AND right-click context menu.** Issue lists both; we implement both. Keyboard `Enter`/`Space` for a11y. (Q-triggers)
- **Account pickers stay editable in edit mode.** External accounts are filtered out of `useAccounts()` at the source, so swapping the regular-account leg can never flip a transaction's kind. For income/expense the picker is additionally filtered to same-currency accounts to keep foreign-currency income/expense out of scope. Transfer pickers are unrestricted because the transfer flow already supports cross-currency via `exchangeRate`. (Q-account-edit, revised 2026-06-04)
- **Single-allocation MVP preserved.** "Edit allocations" reduces to "edit the category" (and we resend the allocation with the new amount when the amount changes, to maintain the sum-against-total invariant). (Q-allocations)
- **Diff is computed client-side and orchestrated sequentially, stopping on first error.** Same pattern as `EditAccountDialog`. Avoids the partial-state ambiguity of parallel fan-out. (Q-multi-call)
- **Form values seeded from the in-list `TransactionResponse`.** No extra GET on dialog open; the refetch on settle keeps the form honest after partial failures. (Q-source-of-truth)
- **Partial-failure recovery: refetch + stay open + banner + reseed.** Keeps the user in context; mirrors `EditAccountDialog`. (Q-failure-ux)
- **Read-only mode for non-`Completed` transactions.** Cheap UX guard that surfaces the backend's edit-window rule without a round trip. Closed-period errors still surface via the banner because the period boundary isn't on the wire.
- **Save disabled when form is clean.** Visually communicates "nothing to save" and prevents no-op submissions.
- **PATCH on `ApiClient`** added now (one-line addition) — it's the only HTTP verb the existing client doesn't expose, and the allocations endpoint needs it.
