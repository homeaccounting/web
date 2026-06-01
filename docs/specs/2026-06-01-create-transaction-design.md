---
status: draft
---

# Create Transaction — Design

**Date:** 2026-06-01
**Status:** Draft (pre-implementation)
**Issue:** [homeaccounting/web#13](https://github.com/homeaccounting/web/issues/13)
**Scope:** First write path for transactions on the web client — create income, expense, and internal-transfer transactions from the transactions view.
**Predecessors:** [`2026-05-06-create-account-design.md`](./2026-05-06-create-account-design.md), [`2026-05-11-edit-account-design.md`](./2026-05-11-edit-account-design.md) — same dialog/form conventions are reused here.

## 1. Purpose & scope

A signed-in user opens the transactions view (`TransactionsPane`) and uses a control bar at the top of the pane to create one of three transaction kinds:

- **Income** — credits a regular account from an External account.
- **Expense** — debits a regular account into an External account.
- **Internal transfer** — moves money between two regular accounts (optionally cross-currency).

On submit the dialog closes, the transactions list for the affected account(s) refetches, and the account balances refresh. The user stays on the currently-viewed account; we do not navigate away.

The control bar is rendered even when no account is selected; opening any dialog from that state shows an empty account picker so the user can choose. When an account is selected (e.g., navigated to `/accounts/:id`), the selected account is pre-filled in the picker but remains editable.

### 1.1 Reuse for Edit Transaction (later)

The two form components (`IncomeExpenseForm`, `TransferForm`) are designed `mode`-aware (`'create' | 'edit'`) so a future Edit Transaction slice can reuse them with `mode="edit"` and a different submit handler, mirroring how `AccountForm` is reused between `CreateAccountDialog` and `EditAccountDialog`. The mappers in `schema.ts` are create-only for this slice; edit-mode mappers will be added in the follow-up issue without changing the schemas.

### Explicitly out of scope (deferred)

- Editing an existing transaction (description, date, allocations, labels, amendment).
- Cancelling/deleting an existing transaction.
- Multi-allocation income/expense (one allocation = one category — current MVP).
- A free-text category that is not in the dictionary (backend rejects, and we do not work around that here).
- Foreign-currency income/expense (currency is locked to the selected account's currency).
- Playwright e2e for the transfer flow (MVP keeps e2e minimal — one happy-path spec is added; see §6).

## 2. Backend dependency

No backend changes. The web client consumes existing endpoints:

| Endpoint                          | Source                                               |
| --------------------------------- | ---------------------------------------------------- |
| `POST /api/transactions/income`   | `server-infra/src/Web/API/TransactionAPI.hs:104-111` |
| `POST /api/transactions/expense`  | `server-infra/src/Web/API/TransactionAPI.hs:112-118` |
| `POST /api/transactions/transfer` | `server-infra/src/Web/API/TransactionAPI.hs:119-125` |

Request DTOs `IncomeRequest`, `ExpenseRequest`, `InternalTransferRequest` mirror `server-infra/src/Web/Types.hs:349-380` (Income + Expense) and `406-422` (InternalTransfer). `AdjustBalanceRequest` lives between them (`382-405`) and is unrelated. The response DTO `TransactionResponse` already exists on the web side (`src/api/types.ts:186-202`) and matches `server-infra/src/Web/Types.hs:538-563`.

All three endpoints require `AuthProtect "jwt"`; `ApiClient` already injects the bearer token and normalises non-2xx responses to `ApiError` with `fieldErrors` (`src/api/client.ts`).

## 3. UI

### 3.1 Control bar

A new component `ControlBar` is rendered at the top of `TransactionsPane`, above the optional `AccountHeader`. Layout mirrors the accounts control bar (`src/features/accounts/AccountsPane.tsx:26-59`):

- A small header row (`flex items-center justify-between border-b px-3 py-2`) with a "Transactions" label on the left and three ghost icon buttons on the right.
- Buttons (left → right): **Add income** (`ArrowDownToLine`), **Add expense** (`ArrowUpFromLine`), **Add transfer** (`ArrowLeftRight`). Each has an `aria-label` matching its action.
- All three buttons are **always enabled**, regardless of whether an account is selected. The currently-selected account (if any) is passed into each dialog as a pre-fill hint.

### 3.2 Dialogs

Three thin dialog components — `CreateIncomeDialog`, `CreateExpenseDialog`, `CreateTransferDialog`. Each:

- Renders a shadcn `Dialog` with the relevant title ("Add income" / "Add expense" / "Add transfer").
- Owns its mutation (`useCreateIncome` / `useCreateExpense` / `useCreateTransfer`).
- Renders the appropriate form component with `mode="create"`.
- Shows a destructive `Alert` banner for generic errors (`ApiError` without `fieldErrors`, or any other error).
- Maps server-side `fieldErrors` into the form via the form's imperative API (same pattern as `src/features/accounts/CreateAccountDialog.tsx:39-60`).
- On success, closes the dialog and resets the form. No navigation.

### 3.3 Forms

#### 3.3.1 `IncomeExpenseForm`

Shared between income and expense — the field set is identical; only the submit endpoint and a couple of strings differ.

Props (concise — full TypeScript in §4):

- `kind: 'income' | 'expense'` — switches button text and currency-direction hints.
- `mode: 'create' | 'edit'`.
- `accounts: AccountResponse[]` — pickable accounts (sourced from `useAccounts()`; the backend already returns only user-owned regular accounts).
- `categories: DictionaryEntryResponse[]` — from `configuration.dictionaries.categories.entries` (dictionary id `"categories"`).
- `labels: DictionaryEntryResponse[]` — from `configuration.dictionaries.labels.entries` (dictionary id `"labels"`).
- `defaultValues`, `isSubmitting`, `onSubmit`, `onCancel`, `onReady` (imperative `setFieldError`).

Fields (top → bottom):

1. **Account** — required single `Select` of `accounts`. Default = currently-selected account (if any). Changing the selection updates the locked currency (read-only badge under the account picker).
2. **Amount** — `Input type="number" step="any"`, strictly positive. The number-input UX matches `AdjustBalanceDialog` (handles transient `-`/empty states).
3. **Currency** — read-only badge derived from the selected account; _not_ user-editable in the UI. It is still a field in the form schema (§4) so the value participates in `react-hook-form` state and is sent on the DTO; the form keeps it in sync by `watch`-ing `accountId` and calling `setValue('currency', account.currency)` whenever the account selection changes (do not derive it only in `onSubmit` — keeping it in form state ensures the DTO and validation see the current value).
4. **Category** — required single-select combobox over `categories`. Stores the dictionary entry UUID.
5. **Description** — `Input` (1–500 chars).
6. **Date** — optional `Input type="date"`. Empty by default; placeholder/help text "Defaults to today". When the user leaves it empty (or clears it), the mapper omits `date` from the DTO and the backend applies its server-time default (`server-infra/src/Web/Types.hs:356` `date :: Maybe UTCTime`).
7. **Labels** — optional multi-select chip picker over `labels`. Stores `UUID[]`.

Submit button label: "Add income" or "Add expense"; "Saving…" while pending. Cancel button calls `onCancel`.

#### 3.3.2 `TransferForm`

Props:

- `mode: 'create' | 'edit'`.
- `accounts`, `labels` (no `categories` — transfers have no category).
- `defaultValues`, `isSubmitting`, `onSubmit`, `onCancel`, `onReady`.

Fields:

1. **Source account** — required `Select`. Default = currently-selected account.
2. **Target account** — required `Select`. Must differ from source (Zod refinement with error on `targetAccountId`).
3. **Amount** — strictly positive number, in source-account currency. A read-only badge shows the source currency.
4. **Exchange rate** — optional number, shown **only when** `source.currency !== target.currency`. The user enters one amount (source); the backend computes the target amount.
5. **Description**, **Date** (same optional/default-today behavior as §3.3.1), **Labels** — same as §3.3.1.

Submit button: "Add transfer".

### 3.4 Visual notes

- All three icon buttons reuse the existing `Button size="icon" variant="ghost" className="h-7 w-7"` recipe (`AccountsPane.tsx:30-37`).
- Forms use the existing shadcn primitives (`Dialog`, `Form*`, `Input`, `Select`, `Alert`).
- A multi-select for labels does not yet exist as a vendored shadcn primitive in this repo; we add a small `LabelMultiSelect` component **inside** `src/features/transactions/` (not in `src/components/ui/`, which is reserved for shadcn-vendored primitives). It renders selected labels as chips and exposes a checkbox dropdown of available labels, controlled via RHF. Implementation detail; not a new primitive.

## 4. Form schemas (Zod) and DTO mappers

New file `src/features/transactions/schema.ts`. Style mirrors `src/features/accounts/schema.ts` and `adjustBalanceSchema.ts`.

```ts
import { z } from 'zod';
import type { IncomeRequest, ExpenseRequest, InternalTransferRequest, UUID } from '@/api/types';

const uuid = z.string().uuid();
const positiveAmount = z.coerce.number().positive('Amount must be positive');
const optionalIsoDate = z
  .union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Invalid date'), z.literal('')])
  .optional()
  .transform((v) => (v === '' || v === undefined ? undefined : v));
const description = z.string().min(1, 'Description is required').max(500);

export const incomeExpenseFormSchema = z.object({
  accountId: uuid,
  amount: positiveAmount,
  currency: z.string().min(1),
  category: uuid,
  description,
  date: optionalIsoDate,
  labels: z.array(uuid).default([]),
});
export type IncomeExpenseFormValues = z.infer<typeof incomeExpenseFormSchema>;

export const transferFormSchema = z
  .object({
    sourceAccountId: uuid,
    targetAccountId: uuid,
    amount: positiveAmount,
    currency: z.string().min(1),
    description,
    exchangeRate: z.coerce.number().positive().optional(),
    date: optionalIsoDate,
    labels: z.array(uuid).default([]),
  })
  .refine((v) => v.sourceAccountId !== v.targetAccountId, {
    message: 'Source and target accounts must differ',
    path: ['targetAccountId'],
  });
export type TransferFormValues = z.infer<typeof transferFormSchema>;
```

### 4.1 Mappers

```ts
const isoDay = (yyyyMmDd: string) => `${yyyyMmDd}T00:00:00.000Z`;
const labelsOrUndefined = (xs: UUID[]) => (xs.length === 0 ? undefined : xs);

export function toIncomeRequest(v: IncomeExpenseFormValues): IncomeRequest {
  return {
    accountId: v.accountId,
    amount: v.amount,
    currency: v.currency,
    category: v.category,
    description: v.description,
    date: v.date ? isoDay(v.date) : undefined,
    labels: labelsOrUndefined(v.labels),
  };
}

export const toExpenseRequest = toIncomeRequest as (v: IncomeExpenseFormValues) => ExpenseRequest;

export function toTransferRequest(
  v: TransferFormValues,
  sourceCurrency: string,
  targetCurrency: string,
): InternalTransferRequest {
  return {
    sourceAccountId: v.sourceAccountId,
    targetAccountId: v.targetAccountId,
    amount: v.amount,
    currency: v.currency,
    description: v.description,
    exchangeRate: sourceCurrency === targetCurrency ? undefined : v.exchangeRate,
    date: v.date ? isoDay(v.date) : undefined,
    labels: labelsOrUndefined(v.labels),
  };
}
```

The `exchangeRate` field is intentionally dropped when source and target currencies match — sending it would force a foreign-currency code path on the backend. Source/target currencies are available in the dialog from the accounts list and passed into the mapper.

## 5. API layer changes

### 5.1 `src/api/types.ts`

Add three new request interfaces (after the existing `AdjustBalanceRequest`, before the Transactions response section so the source/response shapes stay grouped near each other):

```ts
// Mirrors backend Web/Types.hs:349-380 (IncomeRequest, ExpenseRequest).
// `category` is `Text` on the wire (Web/Types.hs:354,371); the backend
// parses it to a DictionaryEntryId UUID via `parseCategoryId`
// (Web/Types.hs:1076-1080), so we type it as `UUID` (string) here.
export interface IncomeRequest {
  accountId: UUID;
  amount: number;
  currency: string;
  category: UUID; // wire type: string; must be a dictionary entry UUID
  description: string;
  date?: ISO8601;
  labels?: UUID[];
}

export type ExpenseRequest = IncomeRequest;

// Mirrors backend Web/Types.hs:406-422.
export interface InternalTransferRequest {
  sourceAccountId: UUID;
  targetAccountId: UUID;
  amount: number;
  currency: string;
  description: string;
  exchangeRate?: number;
  date?: ISO8601;
  labels?: UUID[];
}
```

### 5.2 `src/api/transactions.ts`

Extend the existing module with three new methods on top of the current `list`:

```ts
export const transactionsApi = (client: ApiClient) => ({
  list: async (params: { accountId: UUID }) => {
    /* unchanged */
  },

  createIncome: (body: IncomeRequest) =>
    client.post<IncomeRequest, TransactionResponse>('/api/transactions/income', body),

  createExpense: (body: ExpenseRequest) =>
    client.post<ExpenseRequest, TransactionResponse>('/api/transactions/expense', body),

  createTransfer: (body: InternalTransferRequest) =>
    client.post<InternalTransferRequest, TransactionResponse>('/api/transactions/transfer', body),
});
```

(Method names use `post`/`get` consistent with the existing `ApiClient` surface in `src/api/client.ts`. The slice will use whatever helper the file already exposes; if a different signature is in use, the calls adapt to it — `client` is the only abstraction we touch.)

## 6. Hooks and cache invalidation

Three new TanStack hooks, one per kind. Each mirrors the structure of `useCreateAccount.ts`.

### 6.1 `useCreateIncome` / `useCreateExpense`

```ts
export function useCreateIncome() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<TransactionResponse, Error, IncomeRequest>({
    mutationFn: (body) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return transactionsApi(client).createIncome(body);
    },
    onSuccess: (_tx, body) => {
      void queryClient.invalidateQueries({ queryKey: ['transactions', body.accountId] });
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}
```

`useCreateExpense` is structurally identical with `createExpense`.

### 6.2 `useCreateTransfer`

Same shape; invalidates both involved accounts' transaction lists:

```ts
onSuccess: (_tx, body) => {
  void queryClient.invalidateQueries({ queryKey: ['accounts'] });
  for (const id of [body.sourceAccountId, body.targetAccountId]) {
    void queryClient.invalidateQueries({ queryKey: ['transactions', id] });
  }
},
```

### 6.3 Query keys — what exists today

Only two query keys are touched:

- `['transactions', accountId]` — owned by `useTransactions` in this feature (`src/features/transactions/useTransactions.ts`).
- `['accounts']` — owned by `useAccounts` (`src/features/accounts/useAccounts.ts`).

`useAccountById` (`src/features/accounts/useAccountById.ts`) is a pure derived selector over `useAccounts.data` — it does **not** register its own query, so there is no `['account', accountId]` key in the cache. Invalidating `['accounts']` is what refreshes the selected account's balance after a create. We deliberately do not introduce a new `['account', id]` key in this slice.

## 7. Error handling

Mirrors `CreateAccountDialog`:

- **Generic errors (network, 5xx, `ApiError` without `fieldErrors`)** → a destructive `Alert` above the form. Message: `error.message` for `ApiError`, otherwise `"Something went wrong. Please try again."`.
- **`ApiError.fieldErrors`** → each `(field, message)` is pushed to the form via the imperative API. The form maps backend field names directly: `accountId`, `amount`, `currency`, `category`, `description`, `date`, `labels`, `sourceAccountId`, `targetAccountId`, `exchangeRate`. Unknown field names fall back to the banner.
- **401 Unauthorized** → handled globally by `ApiClient.onUnauthorized` → `signOut`. No special handling here.
- **Same-account refinement on transfer** → Zod refinement on `targetAccountId`; no server round trip needed.

## 8. Testing

Vitest + Testing Library + happy-dom + MSW, colocated `*.test.tsx`. MSW handlers added in `src/test/handlers.ts`.

| File                                                | Coverage                                                                                                                                                                                                                                                    |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `schema.test.ts`                                    | Positive/negative amount, missing required fields, mapper output (ISO date when date set; `date` omitted when empty; `labels` omitted when empty; `exchangeRate` dropped when currencies match); same-account refinement.                                   |
| `IncomeExpenseForm.test.tsx`                        | All fields render; selecting a different account updates the locked currency badge; submit calls `onSubmit` with parsed values; the `onReady` `setFieldError` API surfaces server errors under the named field.                                             |
| `TransferForm.test.tsx`                             | `exchangeRate` hidden when source/target currencies match, shown when they differ; same-account refinement renders an inline error on `targetAccountId`.                                                                                                    |
| `CreateIncomeDialog.test.tsx` (+ Expense, Transfer) | Happy path: form values → MSW handler → success → dialog closes → expected query keys invalidated. Server `fieldErrors` for `amount` map to the form; banner appears on `ApiError` without `fieldErrors`. Empty `date` is omitted from the request payload. |
| `TransactionsPane.test.tsx`                         | The control bar renders all three icon buttons; clicking each opens the right dialog title; selected account is pre-filled in the form (read-only at the time of dialog open).                                                                              |

E2E: one Playwright spec (`e2e/create-transaction.spec.ts`) covers the happy path of adding an expense to an existing account against the dev server. Transfer and income are left to unit/component tests for MVP.

## 9. File-by-file summary

| File                                                          | New/Modified                                                                        |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `src/api/types.ts`                                            | Modified — add `IncomeRequest`, `ExpenseRequest`, `InternalTransferRequest`.        |
| `src/api/transactions.ts`                                     | Modified — add `createIncome`, `createExpense`, `createTransfer`.                   |
| `src/features/transactions/TransactionsPane.tsx`              | Modified — render `<ControlBar selectedAccount={account} />` above `AccountHeader`. |
| `src/features/transactions/ControlBar.tsx`                    | New.                                                                                |
| `src/features/transactions/IncomeExpenseForm.tsx`             | New.                                                                                |
| `src/features/transactions/TransferForm.tsx`                  | New.                                                                                |
| `src/features/transactions/CreateIncomeDialog.tsx`            | New.                                                                                |
| `src/features/transactions/CreateExpenseDialog.tsx`           | New.                                                                                |
| `src/features/transactions/CreateTransferDialog.tsx`          | New.                                                                                |
| `src/features/transactions/schema.ts`                         | New.                                                                                |
| `src/features/transactions/useCreateIncome.ts`                | New.                                                                                |
| `src/features/transactions/useCreateExpense.ts`               | New.                                                                                |
| `src/features/transactions/useCreateTransfer.ts`              | New.                                                                                |
| `src/features/transactions/labels.ts`                         | New — short text labels (e.g., "Add income" / "Add expense" / "Add transfer").      |
| `src/test/handlers.ts`                                        | Modified — add success/error handlers for the three POST endpoints.                 |
| `e2e/create-transaction.spec.ts`                              | New (one happy-path spec for the expense flow).                                     |
| Colocated `*.test.{ts,tsx}` next to each new component/module | New.                                                                                |

## 10. Decision log

- **Three icon buttons (not one Plus + picker, not a dropdown menu).** Faster path to action; mirrors the multi-action header in `AccountsPane`. (Q1)
- **Always-enabled buttons (not disabled-when-no-account).** Lets the user create a transaction from any view; the form picker handles the empty case. (Q-disable)
- **Selected account pre-filled but editable.** Matches user expectation when they switch context inside the form. (Q-defaults)
- **Currency locked to the selected (source) account.** Foreign-currency income/expense is out of scope; the locked badge prevents currency-mismatch errors at the boundary. (Q-currency)
- **Date optional, defaults to today on the backend.** Empty date is omitted from the request DTO; the server applies its default. (User clarification, 2026-06-01)
- **Exchange rate input only when source ≠ target currency.** Avoids forcing a foreign-currency code path when none is needed. (Q-exchange-rate)
- **User enters source amount only on transfers; backend computes the target amount.** Fewer inputs; lower friction. (Q-transfer-amounts)
- **Two reusable forms (`IncomeExpenseForm`, `TransferForm`), three thin dialogs.** Income and expense share fields and submit shape; transfer differs structurally. Both forms are `mode`-aware so the future Edit Transaction slice can reuse them. (Approach decision)
