# Create Account — Design

**Date:** 2026-05-06
**Status:** Draft (pre-implementation)
**Issue:** [homeaccounting/web#6](https://github.com/homeaccounting/web/issues/6)
**Scope:** First write path on the web client — create accounts of any subtype.

## 1. Purpose & scope

A signed-in user can open "Create account" from `AccountsPane`, fill in name + currency + initial balance + (optional) overdraft limit + (optional) subtype-specific fields, and submit. On success, the dialog closes, the accounts list refetches, the new account is added to the cache, and the URL changes to `/accounts/<newId>` so the new account is selected.

All five backend subtypes are supported: `cash`, `bankAccount`, `eWallet`, `asset`, `loan`. Each subtype's domain-specific fields are exposed in the form except the free-form `metadata: Map<string, string>` map, which the UI does not surface (out of scope — see §10).

A small backend rule is added in the same iteration: `CreateAccount` rejects a negative `initialBalance` unless `overdraftLimit` is set and `|initialBalance| ≤ overdraftLimit`. Today the backend silently accepts negative starting balances regardless of any limit, despite a stale doctest claiming otherwise. The new rule mirrors the existing debit-side rule (`Domain/Account/CommandHandler.hs:148+`) and closes the gap so any non-web client is held to the same constraint.

### Explicitly out of scope (deferred to follow-up issues)

- Editing an existing account (rename, change subtype, change overdraft limit).
- Sharing accounts and revoking access.
- The free-form `metadata: Map<string, string>` editor.
- Cross-currency UX or non-enum currency support.
- Adding a backend rename endpoint (the issue's "edit later" implies a separate slice).
- Playwright e2e for the create flow (MVP spec keeps e2e local-only and minimal).

## 2. Backend change

A focused server-side change in the Haskell repo (`backend/`). The rule is enforced in two layers — the web handler (so the user gets a per-field error keyed on `overdraftLimit`) and the domain handler (defense-in-depth, so any non-web caller of `handleAccountCommand` is held to the same rule).

### 2.1 New domain error variant

`backend/src/Domain/Account/CommandHandler.hs` (lines 68–81) — add a new nullary constructor to the inline `data AccountError` declaration. This is the bare-rejection-reason type that `handleAccountCommand` returns (`Either AccountError [AccountEvent]`), alongside `AccountAlreadyExists`, `AccountNameEmpty`, `CurrencyMismatch`, etc. The existing `deriving (Show, Eq)` covers the new variant — no other derivation or accessor work is needed.

```haskell
| NegativeInitialBalanceExceedsOverdraftLimit
```

There are two unrelated `AccountError` types in the codebase, easy to confuse. The one above (in `CommandHandler.hs`) is the bare type returned by command handlers. A separate `AccountError` lives in `Domain/Account/Errors.hs` with rich record-style constructors like `InvalidAccountName { invalidAccountNameValue, … }`; the service layer maps the bare values into the rich values for downstream use. We do **not** edit `Errors.hs` for this slice — `handleAccountCommand` doesn't return that type. A third `AccountError` is the wrapping constructor on `DomainError` (just `AccountError Text`) used by `mapDomainError`. §2.4 covers how the bare variant flows through to HTTP.

The variant name covers both subcases (limit absent / limit present but too small) because the user-actionable remedy is the same: raise the limit or shrink the negative balance.

### 2.2 Web-layer check (per-field error)

`backend/src/Web/API/AccountAPI.hs` — `createAccountHandler` (around line 195–206). Today the handler does `validateField "request" $ toCreateAccountCommand …`, which surfaces validation failures with the field key `"request"` (not actionable in the form). Add an explicit pre-check **before** that line, using `throwValidation` (defined in `backend/src/Web/ErrorMapping.hs:257`):

```haskell
-- Reject negative initial balance unless overdraft covers it.
when (request.initialBalance < 0) $ case request.overdraftLimit of
  Nothing ->
    throwValidation "overdraftLimit"
      "Overdraft limit is required when initial balance is negative"
  Just lim
    | abs request.initialBalance > lim ->
        throwValidation "overdraftLimit"
          "Overdraft limit must be at least the absolute value of the initial balance"
    | otherwise -> pure ()
```

`throwValidation` produces a `ValidationErrorResponse` body with `fieldErrors: { overdraftLimit: "..." }`, which the web client maps onto the form (see §3.4).

### 2.3 Domain-layer check (defense in depth)

`backend/src/Domain/Account/CommandHandler.hs` — `handleAccountCommand` for `CreateAccount` (around line 142–165). Add the same rule, returning the new domain variant. This mirrors the existing debit-side overdraft rule (`DebitAccount` branch around lines 195–225, where `newBalance >= -limit` is enforced).

```haskell
-- Pseudocode; integrate with the existing currency-mismatch branch.
when (unMoney initialBalance < 0) $ case overdraftLimit of
  Nothing            -> Left NegativeInitialBalanceExceedsOverdraftLimit
  Just Nothing       -> Left NegativeInitialBalanceExceedsOverdraftLimit
  Just (Just limit)
    | abs (unMoney initialBalance) > unMoney limit ->
        Left NegativeInitialBalanceExceedsOverdraftLimit
    | otherwise -> Right ()
```

The existing currency-mismatch check stays as it is. `Money` itself continues to allow negatives — it legitimately needs to, both for in-progress debits and for accounts that have gone negative post-creation.

### 2.4 How the domain rejection reaches HTTP

The current pipeline collapses domain-level rejections rather than preserving them through to HTTP:

- `handleAccountCommand` returns `Left (AccountError variant)` (where `AccountError` is the bare nullary type defined in `CommandHandler.hs:68-81`).
- `runAccountCmd` (`backend/src/Application/Services/Internal.hs:84-97`) logs the variant via `displayShow err` but then throws `DomainError.AccountError "Account command rejected by domain"` — the generic message constructor on `DomainError`. The specific variant is _erased_ at this boundary.
- `mapDomainError` (`backend/src/Web/ErrorMapping.hs:70-79`) sees the generic `DomainError.AccountError msg` and emits `400` with `code: "ACCOUNT_ERROR"` and `message: "Account command rejected by domain"`.

Every existing domain rejection (`AccountAlreadyExists`, `InvalidAccountName`, `CurrencyMismatch`, etc.) already flows through this exact path. **No change to the pipeline is in scope for this slice** — the new variant inherits the same generic translation. Per-variant HTTP codes / messages would require widening `runAccountCmd` and `DomainError.AccountError` together, which is a separate refactor.

What this means for the create-account feature:

- In normal flow (web client, our React form), the user _never_ sees the domain-layer rejection: the §2.2 web-layer check fires first and produces the actionable `fieldErrors.overdraftLimit` response. This is what the form code (§6.2) maps onto the field.
- If a non-web caller bypasses the web layer (or if §2.2 is removed in a future refactor), the domain check still rejects the command. The rejection appears as a generic 400 / `ACCOUNT_ERROR` — same shape as every other domain rejection today. That is the acceptable defense-in-depth state.

If we ever want distinguishable HTTP codes per domain variant, that should be a separate spec covering all of `AccountError`, not just this one new variant.

### 2.5 Tests

Seven new domain-handler cases in the existing `Domain.Account.CommandHandlerSpec`, exercising the §2.3 check directly on `handleAccountCommand`:

1. positive balance, no limit → accepted
2. positive balance, with limit → accepted
3. zero balance → accepted
4. negative balance, no limit → rejected with `NegativeInitialBalanceExceedsOverdraftLimit`
5. negative balance, with limit, `|balance| > limit` → rejected with `NegativeInitialBalanceExceedsOverdraftLimit`
6. negative balance, with limit, `|balance| < limit` → accepted
7. negative balance, with limit, `|balance| == limit` → accepted (locks in the strict-`>` rejection rule from §2.3)

Two HTTP-level cases in `backend/test/Integration/WebAPISpec.hs` (extending the existing `describe "POST /api/accounts"` block around line 104+ / 251+), exercising the §2.2 web-layer check end-to-end:

8. `POST /api/accounts` with `initialBalance = -100`, no `overdraftLimit` → 400 with `fieldErrors.overdraftLimit` populated.
9. `POST /api/accounts` with `initialBalance = -100`, `overdraftLimit = 50` → 400 with `fieldErrors.overdraftLimit` populated.

(A passing case like "negative balance with sufficient limit returns 201" is already implicitly covered by the existing happy-path Servant test if we extend it; no need for a third dedicated case.)

### 2.6 Stale-comment cleanup

Three comments currently claim "initial balance must be non-negative" and contradict the actual code (and after this slice will contradict the new rule too):

- `backend/src/Domain/Account/Commands.hs:84` (CreateAccount header doc)
- `backend/src/Web/Types.hs:611` (`toCreateAccountCommand` doctest)
- `backend/src/Web/Types.hs:594-595` (false `Left "Money amount must be non-negative"` doctest)

Each must be replaced with the _conditional_ rule, e.g. "initial balance must be non-negative _unless_ an overdraft limit is set and `|initialBalance| ≤ overdraftLimit`." Don't simply delete the lines — leaving the implementer-facing doc silent on the rule is worse than the current stale state.

## 3. Web — API client & DTOs

### 3.1 Request types

`web/src/api/types.ts` — add request DTOs that mirror `backend/src/Web/Types.hs:138-204`. They live next to the existing `AccountResponse`/`AccountListResponse` so the drift policy from the MVP spec (§6.1) keeps applying — a backend DTO change forces a visible diff at the call site.

```ts
// Discriminator strings come from backend toAccountSubtype (Web/Types.hs:740).
export type AccountSubtypeKind = 'cash' | 'bankAccount' | 'eWallet' | 'asset' | 'loan';

// Backend enums (closed sets at the Haskell level; backend also accepts
// freeform OtherCardNetwork/OtherAsset, but the web UI does not expose those).
export type CardNetworkKind = 'visa' | 'mastercard' | 'amex';
export type AssetTypeKind = 'property' | 'vehicle' | 'stocks' | 'retirementFund';

// Mirrors backend AccountSubtypeRequest (Web/Types.hs:153-167). Backend's
// JSON shape is "type plus optional fields"; we keep the same flat shape.
export interface AccountSubtypeRequest {
  type: AccountSubtypeKind;
  storageLocation?: string; // cash
  bankName?: string; // bankAccount
  accountNumber?: string; // bankAccount
  cardNetwork?: CardNetworkKind; // bankAccount
  provider?: string; // eWallet
  accountIdentifier?: string; // eWallet
  assetType?: AssetTypeKind; // asset
  description?: string; // asset
  lender?: string; // loan
  interestRate?: number; // loan, percent
  dueDate?: string; // loan, ISO date "YYYY-MM-DD"
}

export interface CreateAccountRequest {
  name: string;
  initialBalance: number;
  currency: string; // 'UAH' | 'USD' | 'EUR' | 'GBP'
  overdraftLimit?: number; // omit when none
  subtype?: AccountSubtypeRequest;
}
```

### 3.2 Fetcher

`web/src/api/accounts.ts` — extend the existing factory:

```ts
export const accountsApi = (client: ApiClient) => ({
  list: async (): Promise<AccountResponse[]> => {
    /* unchanged */
  },
  create: (body: CreateAccountRequest): Promise<AccountResponse> =>
    client.post<AccountResponse>('/api/accounts', body),
});
```

`ApiClient.post` (`web/src/api/client.ts:30-32`) already adds `Authorization: Bearer …`, parses JSON, and surfaces `ApiError` on non-2xx. Backend returns `201 Created` with the full `AccountResponse` body.

### 3.3 `ApiClient` enhancement to surface `fieldErrors`

`ApiError.fieldErrors` exists in the `ApiError` class shape (`web/src/api/client.ts:9-21`), but the runtime never populates it: `ApiClient.request` (lines 54–57) only reads `message` from the error body via `safeReadMessage` and constructs `new ApiError({ status, message })` with no `code` or `fieldErrors`. **Today every thrown `ApiError` has `fieldErrors === undefined`.** This must be fixed before the form's per-field error mapping (§3.4 below, §6.2) is reachable.

Replace `safeReadMessage` with a helper that reads the full error body shape:

```ts
async function safeReadErrorBody(res: Response): Promise<{
  message?: string;
  code?: string;
  fieldErrors?: Record<string, string>;
}> {
  try {
    const data = (await res.json()) as {
      message?: string;
      code?: string;
      fieldErrors?: Record<string, string>;
      error?: string;
    };
    return {
      message: data.message ?? data.error,
      code: data.code,
      fieldErrors: data.fieldErrors,
    };
  } catch {
    return {};
  }
}
```

Then in `request`:

```ts
if (!res.ok) {
  const body = await safeReadErrorBody(res);
  throw new ApiError({
    status: res.status,
    message: body.message ?? `HTTP ${res.status}`,
    code: body.code,
    fieldErrors: body.fieldErrors,
  });
}
```

This matches the backend's two error body shapes:

- `ValidationErrorResponse` (`backend/src/Web/Types.hs`): `{ message, fieldErrors }`.
- `ErrorResponse`: `{ message, code, details? }`.

`details` (used by `INSUFFICIENT_FUNDS`, etc.) is not surfaced through `ApiError` in this slice — out of scope.

Add a unit test in `web/src/api/client.test.ts` covering a 400 with `fieldErrors` and a 500 with no body, asserting the resulting `ApiError`'s shape on each.

### 3.4 Field-error contract (form mapping)

The form (§6) reads `fieldErrors` from a thrown `ApiError` and calls `setError` on the matching `react-hook-form` field. Anything that doesn't map to a known field is coalesced into a banner above the form.

Field keys the web form recognises: `name`, `currency`, `initialBalance`, `overdraftLimit`.

## 4. Web — validation schema

`web/src/features/accounts/schema.ts` — `react-hook-form` + `@hookform/resolvers/zod` is already in the stack. The schema uses `z.discriminatedUnion` on the subtype kind so each variant gets its own field set with TypeScript safety.

```ts
const cashSchema = z.object({
  type: z.literal('cash'),
  storageLocation: z.string().trim().optional(),
});

const bankAccountSchema = z.object({
  type: z.literal('bankAccount'),
  bankName: z.string().trim().optional(),
  accountNumber: z.string().trim().optional(),
  cardNetwork: z.enum(['visa', 'mastercard', 'amex']).optional(),
});

const eWalletSchema = z.object({
  type: z.literal('eWallet'),
  provider: z.string().trim().optional(),
  accountIdentifier: z.string().trim().optional(),
});

const assetSchema = z.object({
  type: z.literal('asset'),
  assetType: z.enum(['property', 'vehicle', 'stocks', 'retirementFund']).optional(),
  description: z.string().trim().optional(),
});

const loanSchema = z.object({
  type: z.literal('loan'),
  lender: z.string().trim().optional(),
  interestRate: z.coerce.number().min(0).max(100).optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const subtypeSchema = z.discriminatedUnion('type', [
  cashSchema,
  bankAccountSchema,
  eWalletSchema,
  assetSchema,
  loanSchema,
]);

export const createAccountFormSchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required').max(120),
    currency: z.enum(['UAH', 'USD', 'EUR', 'GBP']),
    // The form uses a controlled <input type="number"> with a numeric
    // default (0). z.coerce.number() handles "100" / "100.5"; an empty
    // string would coerce to NaN, which .finite() then rejects with a
    // form-level error. Default of 0 keeps the empty-string case
    // unreachable in the happy path.
    initialBalance: z.coerce.number().finite(),
    // Empty string from the optional input maps to undefined (= no limit).
    overdraftLimit: z
      .union([z.coerce.number().nonnegative(), z.literal('').transform(() => undefined)])
      .optional(),
    subtype: subtypeSchema, // selector defaults to 'cash' when the dialog opens
  })
  // Mirrors the backend rule added in §2.
  .superRefine((v, ctx) => {
    if (v.initialBalance < 0) {
      if (v.overdraftLimit === undefined || v.overdraftLimit === null) {
        ctx.addIssue({
          path: ['overdraftLimit'],
          code: z.ZodIssueCode.custom,
          message: 'Overdraft limit is required when initial balance is negative.',
        });
      } else if (Math.abs(v.initialBalance) > v.overdraftLimit) {
        ctx.addIssue({
          path: ['overdraftLimit'],
          code: z.ZodIssueCode.custom,
          message: 'Overdraft limit must be at least |initial balance|.',
        });
      }
    }
  });

export type CreateAccountFormValues = z.infer<typeof createAccountFormSchema>;
```

A small `toCreateAccountRequest(values: CreateAccountFormValues): CreateAccountRequest` helper sits next to the schema. It strips empty optionals and shapes `subtype` into the backend's flat `AccountSubtypeRequest`.

The schema lives in the feature folder rather than `lib/` because it is used in exactly one place; co-locating it with `CreateAccountDialog.tsx` keeps backend-DTO drift visible at the call site, in line with §6.1 of the MVP spec.

## 5. Web — mutation hook

`web/src/features/accounts/useCreateAccount.ts` — TanStack Query mutation, mirroring `useAccounts.ts`.

```ts
export function useCreateAccount() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<AccountResponse, Error, CreateAccountRequest>({
    mutationFn: (body) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return accountsApi(client).create(body);
    },
    onSuccess: (account) => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      // Seed the cache so navigation to /accounts/:id has the row already.
      queryClient.setQueryData<AccountResponse[] | undefined>(['accounts'], (prev) =>
        prev ? [...prev, account] : [account],
      );
    },
  });
}
```

No optimistic create — submit is rare and not a hot path; the dialog stays open with a spinner on the submit button until the mutation resolves. Inventing a temporary id and reconciling is not worth it for this surface.

The dialog component (§6) subscribes to `mutation.error` / `mutation.isError`. On `ApiError` with `fieldErrors`, it calls `setError` on matching form fields per §3.4. Otherwise it renders an inline alert above the form with the error message; re-clicking submit retries.

## 6. Web — dialog & form components

### 6.1 Vendored shadcn primitives (new)

Add three primitives, copy-pasted into the repo per the MVP rationale (§2 of the MVP spec):

- `web/src/components/ui/dialog.tsx` — wraps `@radix-ui/react-dialog`.
- `web/src/components/ui/select.tsx` — wraps `@radix-ui/react-select`.
- `web/src/components/ui/form.tsx` — small shadcn wrapper around `react-hook-form` providing `FormField` / `FormItem` / `FormLabel` / `FormMessage`.

Add `@radix-ui/react-dialog` and `@radix-ui/react-select` to `dependencies` in `web/package.json`.

### 6.2 `CreateAccountDialog.tsx`

Controlled by the parent. Key pieces:

```tsx
export interface CreateAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateAccountDialog({ open, onOpenChange }: CreateAccountDialogProps) {
  const navigate = useNavigate();
  const { data: config } = useConfiguration();
  // ConfigurationResponse.defaultCurrency is `string` in the backend
  // (see web/src/api/types.ts:152), but the form's enum is closed.
  // Narrow with a guard; fall back to USD if the backend's value is
  // outside the four supported currencies.
  const SUPPORTED = ['UAH', 'USD', 'EUR', 'GBP'] as const;
  type Currency = (typeof SUPPORTED)[number];
  const defaultCurrency: Currency = (SUPPORTED as readonly string[]).includes(
    config?.defaultCurrency ?? '',
  )
    ? (config!.defaultCurrency as Currency)
    : 'USD';

  const form = useForm<CreateAccountFormValues>({
    resolver: zodResolver(createAccountFormSchema),
    defaultValues: {
      name: '',
      currency: defaultCurrency,
      initialBalance: 0,
      overdraftLimit: undefined,
      subtype: { type: 'cash' },
    },
  });

  const create = useCreateAccount();

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const account = await create.mutateAsync(toCreateAccountRequest(values));
      onOpenChange(false);
      form.reset();
      navigate(`/accounts/${account.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          form.setError(field as keyof CreateAccountFormValues, {
            type: 'server',
            message,
          });
        }
      }
    }
  });

  // Dialog body: name, initialBalance, currency, "More options" (overdraftLimit),
  // subtype <select>, <SubtypeFields />, footer (Cancel / Create).
}
```

A general-error banner sits above the form when `create.isError && error instanceof ApiError && !error.fieldErrors`.

The "More options" toggle for `overdraftLimit` is a plain `<button type="button">` flipping a `useState`. The field stays mounted in the form regardless (`undefined` value = "no limit"). When the schema's negative-balance refinement fires, the dialog auto-expands the section so the error is visible.

### 6.3 `SubtypeFields.tsx`

A render-only switch on `useFormContext<CreateAccountFormValues>().watch('subtype.type')`. Five short JSX blocks, no logic. Each block uses `FormField` for accessible labels + error wiring.

### 6.4 `AccountsPane.tsx` changes

Three small additions:

1. A "+ Add account" button at the top of the pane, visible in every state (loading, error, empty, populated).
2. A "Create account" button inside the empty state ("No accounts yet").
3. Local `useState` controlling `<CreateAccountDialog open=… onOpenChange=… />`. Both buttons toggle that state.

The subtype `<select>` order is Cash, Bank account, E-wallet, Asset, Loan.

## 7. Routing & post-success behaviour

No router changes. Existing routes (`web/src/App.tsx:11-22`) already cover `/accounts/:id`. After a successful create:

1. `useCreateAccount.onSuccess` writes the new account into the `['accounts']` cache and invalidates the query.
2. `CreateAccountDialog.tsx` calls `onOpenChange(false)`, then `form.reset()`, then `navigate(`/accounts/${account.id}`)`.
3. `AccountsPane` re-renders with the new row already in cache; its `NavLink` matches the URL and gets the active styling (`AccountsPane.tsx:42-44`).
4. `TransactionsPane` for the new account renders its empty state ("No transactions yet").

Cancellation: closing the dialog (Esc / Cancel / overlay click) calls `onOpenChange(false)`. The form resets the next time the dialog opens.

## 8. Tests

### 8.1 Backend (Haskell)

- `Domain.Account.CommandHandlerSpec` — seven new `CreateAccount` cases per §2.5 (cases 1–7).
- `backend/test/Integration/WebAPISpec.hs` — two new HTTP-level cases per §2.5 (cases 8–9). The describe block already exists at lines 104+ / 251+.

### 8.2 Web — unit (Vitest)

- `features/accounts/schema.test.ts` — required name; currency enum; positive / zero / negative balance with and without overdraft limit (the four boundary cases); ISO date shape on `loan.dueDate`.
- `features/accounts/toCreateAccountRequest.test.ts` — strips empty optionals, shapes each of the five subtype variants into the backend's flat DTO.

### 8.3 Web — component (Vitest + RTL + MSW)

`features/accounts/CreateAccountDialog.test.tsx`:

1. Opens, default values populated (name empty, currency = `defaultCurrency` from `useConfiguration`, balance = 0, subtype = `cash`).
2. Submitting an empty name shows the field error and does not call the API.
3. Submitting `initialBalance = -100` with no overdraft limit shows the inline overdraft-limit error and does not call the API.
4. Switching the subtype dropdown swaps the fields below it (cash → bankAccount renders `bankName`).
5. Happy-path submit calls `POST /api/accounts` with the correct payload (asserted via MSW), closes the dialog, refetches `['accounts']`, and the URL becomes `/accounts/<new-id>`.
6. Server `ValidationErr` with `fieldErrors` maps to per-field errors (one assertion against MSW returning `{status:400, fieldErrors:{name:'…'}}`).
7. Server 500 renders the inline alert above the form (no field errors).

`features/accounts/AccountsPane.test.tsx` — extend existing tests:

1. Empty state shows a "Create account" CTA; clicking it opens the dialog.
2. The pane-top "+" button is visible in the loaded, error, and empty states.

### 8.4 Out of scope for tests

- Playwright e2e for the create flow.
- Visual regression / a11y audit beyond what RTL queries naturally enforce.

## 9. Definition of done

- A signed-in user can open "Create account" from `AccountsPane` (top button, plus a CTA in the empty state).
- The dialog form accepts: name (required), currency (closed `<select>` of UAH/USD/EUR/GBP, defaulted from `defaultCurrency`), initial balance (defaults to 0), an optional overdraft limit behind "More options," and an account-type selector that swaps the subtype-specific fields.
- All five subtypes are creatable with their own fields:
  - cash: `storageLocation`
  - bankAccount: `bankName`, `accountNumber`, `cardNetwork` (Visa/Mastercard/Amex)
  - eWallet: `provider`, `accountIdentifier`
  - asset: `assetType` (property/vehicle/stocks/retirementFund), `description`
  - loan: `lender`, `interestRate` (percent), `dueDate` (YYYY-MM-DD)
- Negative initial balance is rejected unless an overdraft limit is set and `|balance| ≤ limit`. The same rule is enforced both client-side (zod) and server-side (new domain check + 400 response).
- On success: dialog closes, `['accounts']` is invalidated, the new account row appears in the pane, and the URL changes to `/accounts/<newId>` (the row is highlighted as active).
- Backend `ValidationErr` field errors map onto matching form fields; non-field errors render as a banner above the form.
- Tests pass: the Haskell suite includes the seven new `CreateAccount` domain-handler cases plus two HTTP-level cases on `POST /api/accounts`; the web suite includes the schema + DTO unit tests, the `ApiClient` error-body parsing test, the new `CreateAccountDialog` component tests, and the extended `AccountsPane` tests.
- `just check` and `just test` succeed in both repos.

## 10. Flagged follow-ups (not in this slice)

- Editing an existing account: rename (needs a new backend command + endpoint — no rename exists today, see §1), change subtype (backend `PUT /api/accounts/:id/type` already exists), change overdraft limit (backend `PUT /api/accounts/:id/overdraft-limit` already exists).
- `metadata` editor for the subtypes that support it. Frontend-only — backend already accepts a `metadata` map on create. The follow-up is purely a UI add: a dynamic key/value editor and form integration.
- Sharing accounts and revoking access.
- Playwright e2e for the create flow.
- Surfacing the freeform `OtherCardNetwork` / `OtherAsset` backend variants in the UI.
- Surfacing the `details` map on `ApiError` (currently dropped on the floor by the web client; only used by `INSUFFICIENT_FUNDS` today).
