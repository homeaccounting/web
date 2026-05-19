---
status: draft
---

# Edit Account — Design

**Date:** 2026-05-11
**Status:** Draft (pre-implementation)
**Issue:** [homeaccounting/web#12](https://github.com/homeaccounting/web/issues/12)
**Scope:** Second account write path on the web client — edit an existing account's mutable fields.
**Predecessor:** [`2026-05-06-create-account-design.md`](./2026-05-06-create-account-design.md) (§10 flagged this as a follow-up).

## 1. Purpose & scope

A signed-in user can open "Edit account" from a new account header bar in the transactions view and change the account's mutable metadata. Saving the dialog fires only the PUT calls whose values changed, then closes; the accounts list and the selected account refresh.

**Editable fields**

- `name` (required, ≤120 chars).
- Account type discriminator and the type's optional fields (storageLocation, bankName, accountNumber, cardNetwork, provider, accountIdentifier, assetType, description, lender, interestRate, dueDate). Changing the type clears the previous subtype's optional fields server-side — that is the existing `PUT /api/accounts/:id/type` semantics, intentionally preserved.
- `overdraftLimit`.

**Readonly**

- `currency` — disabled in the form with tooltip "Cannot be changed after creation." See §1.1 for why this slice does not attempt currency change.

**Also in scope (added after brainstorming)**

- **Adjust balance** UI surfaced via a separate "Adjust balance" button on the account header bar (sibling to "Edit"). Opens its own dialog with three fields: `targetBalance`, `reason`, `date` (defaulted to today, may not be in the future). On submit, fires the existing backend `PUT /api/accounts/:id/balance` endpoint which records a synthetic adjustment transaction; the UI invalidates the accounts list (balance changed) and the transactions list (new row appears). Kept structurally separate from the Edit dialog so saving metadata never creates a transaction (the original Q2-B brainstorming rationale still holds). Full details in §11.

**Out of scope (not touched in this slice)**

- `initialBalance` — immutable by design. Once an account exists, its initial balance is the genesis event amount; mutating it after the fact would invalidate the ledger's history. The field is not rendered in edit mode at all.
- Currency change in any form (see §1.1).
- Sharing accounts and revoking access (still deferred, as in the create-account spec).
- The free-form `metadata: Map<string, string>` editor (still deferred).
- Concurrent-edit detection / optimistic concurrency via `AccountResponse.version` (last-write-wins, like all other existing endpoints today).
- Playwright e2e coverage (the project's MVP testing posture keeps e2e local-only and minimal).

### 1.1 Why currency is immutable

Balance and every recorded event on an account are denominated in the account currency. Changing the currency requires one of:

1. **Refuse on non-empty ledger** — only allowed if zero transactions ever existed. Narrow value, awkward UX (the dialog control flickers between enabled/disabled based on transaction state).
2. **Convert via exchange rate** — needs an FX-rate input, every past amount gets re-expressed; rounding and rate-source ambiguity are real problems, and the conversion needs to be auditable.
3. **Re-denominate without conversion** — silently invalid (100 UAH becoming 100 USD changes meaning, not just label).

No backend command, event, or service exists today for any of these, and there is no concrete user need on file. Real-world parallel: bank accounts do not change currency; users open a new account in the new currency.

The control is rendered (disabled) rather than hidden, so the readonly contract is visible to the user.

## 2. Backend changes (Haskell, sibling `backend/` repo)

The slice's only new endpoint is rename. Subtype edits and overdraft-limit edits reuse endpoints that already exist (`PUT /api/accounts/:id/type`, `PUT /api/accounts/:id/overdraft-limit`).

### 2.1 New rename endpoint

`backend/src/Web/API/AccountAPI.hs` — extend `AccountAPI` and `accountServer` with:

```haskell
-- PUT /api/accounts/:id/name - Rename account (requires auth, owner only)
:<|> AuthProtect "jwt"
  :> "api"
  :> "accounts"
  :> Capture "id" UUID
  :> "name"
  :> ReqBody '[JSON] RenameAccountRequest
  :> Put '[JSON] NoContent
```

with request DTO:

```haskell
data RenameAccountRequest = RenameAccountRequest
  { name :: Text
  }
  deriving (Show, Eq, Generic)
instance ToJSON RenameAccountRequest
instance FromJSON RenameAccountRequest
```

Handler skeleton (mirrors `setOverdraftLimitHandler` in the same file, which is the closest existing analogue):

```haskell
renameAccountHandler :: AuthenticatedUser -> UUID -> RenameAccountRequest -> AppM NoContent
renameAccountHandler user accountUuid RenameAccountRequest {..} = do
  let userId = user.userId
  -- Web-layer validation: non-empty + length cap, per-field error keyed on "name".
  -- Mirrors the create-account web schema (max 120). The trim happens here so the
  -- domain layer sees the canonical form.
  let trimmed = T.strip name
  when (T.null trimmed) $ throwValidation "name" "Name is required"
  when (T.length trimmed > 120) $ throwValidation "name" "Name must be 120 characters or fewer"
  result <- AccountService.renameAccount userId accountUuid trimmed
  case result of
    Right () -> return NoContent
    Left err -> throwDomainError err
```

### 2.2 New domain command, event, error variant

- `backend/src/Domain/Account/Commands.hs` — new command:
  ```haskell
  data RenameAccount = RenameAccount
    { renameAccountId :: AccountId
    , renameAccountNewName :: Text
    } deriving (Show, Eq, Generic)
  ```
  (Exact module placement/field naming should follow the file's existing convention.)
- `backend/src/Domain/Account/Events.hs` — new event, placed next to existing `AccountCreated`, `OverdraftLimitSet`, `AccountSubtypeSet`:
  ```haskell
  data AccountRenamed = AccountRenamed
    { accountRenamedId :: AccountId
    , accountRenamedNewName :: Text
    , accountRenamedAt :: UTCTime
    } deriving (Show, Eq, Generic)
  ```
  Follow the existing module's `deriveJSON`/`makeFieldsNoPrefix` derivation pattern (see `OverdraftLimitSet` at lines 170–202 for the closest template). Add a new constructor `AccountRenamedAccountEvent AccountRenamed` to the `AccountEvent` sum and extend `Domain/Account/Projection.hs:handleAccountEvent` to apply the rename to the projected state (update `account.name`).
- `backend/src/Domain/Account/CommandHandler.hs` — new branch in `handleAccountCommand` (or its equivalent) producing `[AccountRenamed …]` or rejecting. New bare-`AccountError` variant:

  ```haskell
  | AccountNameUnchanged
  ```

  rejected when the new (trimmed) name equals the current name. This is the no-op guard — silently accepting a no-op rename is mildly confusing in event-sourced storage (a no-op event clutters the log); the rejection bubbles up as a generic `400 ACCOUNT_ERROR` through the existing pipeline (same defense-in-depth treatment as `NegativeInitialBalanceExceedsOverdraftLimit` in the create-account spec §2.4). The web layer never expects to hit this case because it diffs values client-side (§3.3) and skips the call when name is unchanged — defense-in-depth only.

  Empty / over-length names are rejected at the web layer (§2.1) as per-field errors; the domain handler does not duplicate that check (the trimmed string arriving from the web layer is already valid, and there is no second non-web caller today that needs the domain-layer rule).

### 2.3 Service layer

`backend/src/Application/Services/AccountService.hs` — add `renameAccount :: UserId -> AccountId -> Text -> AppM (Either DomainError ())`. Authz: owner-only, mirroring `setOverdraftLimit`. Internals follow the existing `runAccountCmd` pattern.

### 2.4 No changes to subtype-edit and overdraft endpoints

`PUT /api/accounts/:id/type` is used as-is for both type-change and subtype-fields-only edits. No web-layer guard is added (the create-account spec contemplated a same-type guard; this slice deliberately drops it because the user has decided account type _is_ editable).

`PUT /api/accounts/:id/overdraft-limit` is used as-is for overdraft-limit edits.

### 2.5 Backend tests

- `Domain.Account.CommandHandlerSpec` — three new `RenameAccount` cases:
  1. Rename with a different non-empty trimmed name → emits `AccountRenamed` with the trimmed name.
  2. Rename with the same trimmed name as current → rejected with `AccountNameUnchanged`.
  3. (Optional but cheap) Rename then read-back via folding the event stream produces the new name in the projected state.
- `backend/test/Integration/WebAPISpec.hs` — three new HTTP-level cases on `PUT /api/accounts/:id/name`:
  1. Owner, valid trimmed non-empty name → `200`, `GET` after returns updated name.
  2. Empty / whitespace-only body name → `400` with `fieldErrors.name`.
  3. Name length 121 → `400` with `fieldErrors.name`.
- No tests added for `PUT /api/accounts/:id/type` or `PUT /api/accounts/:id/overdraft-limit` — both are already covered.

## 3. Web — API client & DTOs

### 3.1 Request types

`web/src/api/types.ts` — extend mirroring the new backend DTO. The file already houses `CreateAccountRequest`; co-locate.

```ts
export interface RenameAccountRequest {
  name: string;
}

// `currency` is JSON-optional (mirrors the backend's
// `SetOverdraftLimitRequest`, where it defaults to "USD" when missing).
// Callers in this slice MUST set it to the account's currency to avoid
// a `CurrencyMismatch` rejection on non-USD accounts (see §6.3).
export interface SetOverdraftLimitRequest {
  overdraftLimit?: number;
  currency?: string;
}

export interface SetAccountSubtypeRequest {
  subtype: AccountSubtypeRequest;
}
```

`SetOverdraftLimitRequest` and `SetAccountSubtypeRequest` are added even though the endpoints already exist server-side — today's web client has no callers, so the DTOs are missing.

### 3.2 Fetcher

`web/src/api/accounts.ts`:

```ts
export const accountsApi = (client: ApiClient) => ({
  list: async (): Promise<AccountResponse[]> => {
    const res = await client.get<AccountListResponse>('/api/accounts');
    return res.accounts;
  },
  create: (body: CreateAccountRequest): Promise<AccountResponse> =>
    client.post<AccountResponse>('/api/accounts', body),
  rename: (id: UUID, body: RenameAccountRequest): Promise<void> =>
    client.put<void>(`/api/accounts/${id}/name`, body),
  updateOverdraftLimit: (id: UUID, body: SetOverdraftLimitRequest): Promise<void> =>
    client.put<void>(`/api/accounts/${id}/overdraft-limit`, body),
  updateSubtype: (id: UUID, body: SetAccountSubtypeRequest): Promise<void> =>
    client.put<void>(`/api/accounts/${id}/type`, body),
});
```

`ApiClient.put` exists already (`web/src/api/client.ts`) and treats an empty body 2xx response as `void`, matching backend `Put '[JSON] NoContent`.

### 3.3 Field-error contract

Same convention as the create-account spec §3.4. Field keys the edit form recognises:

- `name`
- `overdraftLimit`
- `type` (defense-in-depth — the dropdown is enabled, so the backend should accept any of the five values, but `fieldErrors.type` from a future server-side rule would route correctly)
- `subtype.bankName`, `subtype.accountNumber`, etc. (only relevant if the backend ever surfaces per-subtype field errors)

Anything that doesn't map to a known field is coalesced into the inline banner above the form.

## 4. Web — schema and form shape

### 4.1 Two named schemas sharing a base

`web/src/features/accounts/schema.ts` already encodes most of the shape we need: name, currency, initialBalance, overdraftLimit, discriminated `subtype`. Two named schemas with a shared base object — not a generic factory — keeps Zod's type inference straightforward:

```ts
const baseAccountFields = {
  name: z.string().trim().min(1, 'Name is required').max(120),
  overdraftLimit: z
    .union([z.coerce.number().nonnegative(), z.literal('').transform(() => undefined)])
    .optional(),
  subtype: subtypeSchema,
};

export const createAccountFormSchema = z
  .object({
    ...baseAccountFields,
    // Create mode locks currency to the closed four-currency enum (matches the
    // backend's `parseCurrency` accepted values used by the create endpoint).
    currency: z.enum(['UAH', 'USD', 'EUR', 'GBP']),
    initialBalance: z.coerce.number().finite(),
  })
  .superRefine((v, ctx) => {
    // existing create-time rule (negative initial balance ↔ overdraftLimit)
  });

// Edit mode widens currency to `z.string()` because the account being edited
// may have a currency outside the four-currency enum if older accounts were
// created with a freeform value. The control is disabled in edit mode, so
// the value cannot drift from the loaded account — but the schema must accept
// whatever the cached AccountResponse holds, or zodResolver will reject on mount.
export const editAccountFormSchema = z.object({
  ...baseAccountFields,
  currency: z.string(),
});

export type CreateAccountFormValues = z.infer<typeof createAccountFormSchema>;
export type EditAccountFormValues = z.infer<typeof editAccountFormSchema>;
```

The existing `toCreateAccountRequest` helper stays as-is (it consumes `CreateAccountFormValues`, which still includes `initialBalance`).

A new helper:

```ts
export function fromAccountResponse(account: AccountResponse): EditAccountFormValues {
  return {
    name: account.name,
    currency: account.currency, // EditAccountFormValues.currency is z.string()
    overdraftLimit: account.overdraftLimit ?? undefined,
    subtype: normaliseSubtype(account.subtype),
  };
}
```

`normaliseSubtype` converts `AccountResponse.subtype` (the read shape — `{ type, ...flat fields }`) into the form's `AccountSubtypeRequest` shape. The two shapes are flat-and-aligned per backend `Web/Types.hs`, so this is mostly a typed pass-through with field whitelisting and an enum narrow on `cardNetwork` / `assetType`. If the backend returns a freeform variant (`OtherCardNetwork`, `OtherAsset`) we drop it to `undefined` — those variants are not in the web closed enum (create-account spec §3.1, comment). If `account.subtype` itself is `null`, default to `{ type: 'cash' }` so the form has a valid discriminator (the type dropdown surfaces the value and the user can switch as they wish).

### 4.2 Form values for edit

Edit mode loses the `initialBalance` field, the negative-balance refinement, and the corresponding UI input. The currency field is in the form (the underlying control is rendered for visual continuity) but disabled and excluded from the diff (§4.3).

### 4.3 Diff helper

`web/src/features/accounts/diffAccount.ts` (new):

```ts
export interface AccountEditDiff {
  name?: string;
  overdraftLimit?: number | null; // null = clear the limit; undefined = unchanged
  subtype?: AccountSubtypeRequest;
}

export function diffAccount(
  initial: EditAccountFormValues,
  next: EditAccountFormValues,
): AccountEditDiff {
  const diff: AccountEditDiff = {};
  if (next.name !== initial.name) diff.name = next.name;
  if ((initial.overdraftLimit ?? null) !== (next.overdraftLimit ?? null)) {
    diff.overdraftLimit = next.overdraftLimit ?? null;
  }
  if (!subtypeEqual(initial.subtype, next.subtype)) {
    diff.subtype = next.subtype;
  }
  return diff;
}
```

`subtypeEqual` rules:

1. If `initial.type !== next.type`, return `false` immediately. A type change always emits the full new subtype object in the diff (and the backend's `PUT /api/accounts/:id/type` is the single endpoint that handles both type-change and optional-field-only edits).
2. If types match, compare field-by-field across the union of keys present on either object. The `''`-as-`undefined` equivalence applies to string fields only — `storageLocation`, `bankName`, `accountNumber`, `cardNetwork`, `provider`, `accountIdentifier`, `assetType`, `description`, `lender`, `dueDate`. For numeric fields (`interestRate`), the schema's `z.coerce.number()` plus the empty-string transform already maps `''` to `undefined` before `diffAccount` sees the values, so a plain `===` after the `undefined`-equality check is sufficient. Other values compare with `===`.

Currency is never in the diff (control is disabled, form value cannot drift from initial; defensive check: if someone passes mismatched currency we throw an `Error` rather than silently dropping — keeps the contract loud).

Unit tests for `diffAccount` are listed in §6.

## 5. Web — components

### 5.1 Extract `AccountForm`

Move the form body of `CreateAccountDialog` into a new component `web/src/features/accounts/AccountForm.tsx`. The dialog wrapper (`Dialog`, `DialogHeader`, …, `DialogFooter`) stays in the dialog files; only the inner `<form>` body is shared.

```tsx
export interface AccountFormProps {
  mode: 'create' | 'edit';
  defaultValues: CreateAccountFormValues | EditAccountFormValues;
  isSubmitting: boolean;
  bannerError?: string;
  onSubmit: (values: CreateAccountFormValues | EditAccountFormValues) => void | Promise<void>;
  onCancel: () => void;
}

export function AccountForm({
  mode,
  defaultValues,
  isSubmitting,
  bannerError,
  onSubmit,
  onCancel,
}: AccountFormProps) {
  // Shared form: name, currency (disabled when mode==='edit'),
  // initialBalance (rendered only when mode==='create'),
  // overdraftLimit ("More options"), type selector, <SubtypeFields />,
  // submit/cancel buttons. The component exposes `useForm` internally
  // and stays presentational from the caller's point of view.
}
```

### 5.2 `EditAccountDialog`

`web/src/features/accounts/EditAccountDialog.tsx` (new):

```tsx
export interface EditAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AccountResponse; // pre-loaded; the trigger only opens the dialog with a known account
}

export function EditAccountDialog({ open, onOpenChange, account }: EditAccountDialogProps) {
  const edit = useEditAccount(account.id);
  // UI-only counter incremented by `useEditAccount` after each successful
  // sub-call. The inner form is keyed on this counter so it remounts (and
  // re-derives defaults from the latest cached account) after a partial
  // failure. This signal is independent of any server-managed field, so
  // it cannot be clobbered by a background `['accounts']` refetch.
  const [editEpoch, setEditEpoch] = useState(0);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit account</DialogTitle>
          <DialogDescription>Update account details.</DialogDescription>
        </DialogHeader>
        <EditAccountForm
          key={`${account.id}:${editEpoch}`}
          account={account}
          edit={edit}
          onSubCallApplied={() => setEditEpoch((n) => n + 1)}
          onClose={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditAccountForm({
  account,
  edit,
  onSubCallApplied,
  onClose,
}: {
  account: AccountResponse;
  edit: ReturnType<typeof useEditAccount>;
  onSubCallApplied: () => void;
  onClose: () => void;
}) {
  const defaultValues = useMemo(() => fromAccountResponse(account), [account]);
  return (
    <AccountForm
      mode="edit"
      defaultValues={defaultValues}
      isSubmitting={edit.isPending}
      bannerError={/* see §6.1 */}
      onSubmit={async (values) => {
        const diff = diffAccount(defaultValues, values as EditAccountFormValues);
        await edit.mutateAsync({ diff, onSubCallApplied });
        onClose();
      }}
      onCancel={onClose}
    />
  );
}
```

The currency value in edit mode is always rendered as a **disabled `<Input>`** showing the account's currency text — no `<Select>`. This handles every currency string uniformly (enum or otherwise) and avoids the conditional-rendering ambiguity around `react-hook-form` registration: the input is always registered via `{...form.register('currency')}`, the form value always matches the account's currency, and `diffAccount`'s invariant check (mismatched currency → throw) catches programmer error rather than runtime drift.

**The UI-only `editEpoch` counter is the mechanism for the partial-save invariant** (§6.2). After each successful sub-call inside `useEditAccount.mutationFn`, the hook invokes the `onSubCallApplied` callback the dialog supplied; the dialog increments `editEpoch`; the inner form's `key` changes and it remounts with fresh defaults derived from the (also-patched) cached account. Crucially, `editEpoch` is dialog-local — it does not live on the server-managed `version` field, so background refetches of `['accounts']` (window focus, etc.) cannot clobber it. The user-visible state: dialog stays open, banner shows the failing call's error, but the rename portion is no longer "pending" in the form because it's now the form's default value.

### 5.3 `CreateAccountDialog` refactor

`CreateAccountDialog.tsx` is rewritten to use `AccountForm` with `mode='create'`. The diff is small: the form body is replaced by `<AccountForm … />`. All current behavior (post-success navigate, banner, auto-expand "More options" on overdraft error) is preserved — items that don't fit in `AccountForm`'s contract are kept in the wrapper.

### 5.4 Account header bar

New component `web/src/features/transactions/AccountHeader.tsx` (located in `features/transactions/` because it lives in the transactions view; if it grows responsibilities outside the transactions pane, promote it to `features/accounts/` later).

```tsx
const SUBTYPE_LABELS: Record<AccountSubtypeKind, string> = {
  cash: 'Cash',
  bankAccount: 'Bank account',
  eWallet: 'E-wallet',
  asset: 'Asset',
  loan: 'Loan',
};

export interface AccountHeaderProps {
  account: AccountResponse;
}

export function AccountHeader({ account }: AccountHeaderProps) {
  const [editing, setEditing] = useState(false);
  const subtypeLabel = account.subtype
    ? (SUBTYPE_LABELS[account.subtype.type as AccountSubtypeKind] ?? account.subtype.type)
    : 'Account';
  return (
    <div className="flex items-center justify-between border-b px-4 py-3">
      <div>
        <h2 className="text-lg font-medium">{account.name}</h2>
        <div className="text-xs text-muted-foreground">{subtypeLabel}</div>
      </div>
      <div className="flex items-center gap-4">
        <span className="text-lg font-medium tabular-nums">
          {formatMoney(account.balance, account.currency)}
        </span>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </div>
      <EditAccountDialog open={editing} onOpenChange={setEditing} account={account} />
    </div>
  );
}
```

The `SUBTYPE_LABELS` map is local to this component for now; if a second consumer needs the same labels later, lift it to `features/accounts/`.

### 5.5 `TransactionsPane` wiring

`web/src/features/transactions/TransactionsPane.tsx` — when an account is selected, render `<AccountHeader account={…} />` above the existing transactions UI. The pane needs the loaded `AccountResponse`, not just the id.

A new helper hook `web/src/features/accounts/useAccountById.ts`. The cleanest approach is to wrap the existing `useAccounts()` hook (which already handles auth, query function, and subscription) and narrow to one account:

```ts
export function useAccountById(id: UUID | undefined) {
  const accounts = useAccounts();
  return {
    ...accounts,
    data: id ? accounts.data?.find((a) => a.id === id) : undefined,
  };
}
```

This avoids a parallel `useQuery({ queryKey: ['accounts'], ... })` call (which would require duplicating or extracting the `queryFn` — out of scope for this slice) while keeping a single `['accounts']` cache subscription. Consumers re-render on any change to the accounts list, not just to this account; that's fine for this app's size and avoids the refactor.

States:

- Account loaded → render `<AccountHeader account={data} />` above the transactions area.
- Account not yet in cache (sidebar list still loading or empty) → render a one-line skeleton placeholder where the header would go; the transactions area below renders its own loading/empty state as today.
- Account not found after the list resolved (stale URL after deletion or invalid id) → do not render the header at all. The pane keeps its existing rendering for the transactions area; this slice does not add a new "Account not found" message because doing so changes a shipping pane's contract for a case unrelated to editing.

The "Select an account." empty state stays as-is — no header bar without an account.

## 6. Web — mutation hook

`web/src/features/accounts/useEditAccount.ts` (new):

```ts
export interface EditAccountVars {
  diff: AccountEditDiff;
  // Invoked after each successful sub-call so the dialog can bump its
  // local editEpoch counter and remount the form with fresh defaults.
  onSubCallApplied: () => void;
}

export function useEditAccount(id: UUID) {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<void, Error, EditAccountVars>({
    mutationFn: async ({ diff, onSubCallApplied }) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      const api = accountsApi(client);

      // Read the cached account so we know its currency (needed by
      // overdraft-limit endpoint).
      const current = queryClient
        .getQueryData<AccountResponse[]>(['accounts'])
        ?.find((a) => a.id === id);
      if (!current) {
        // Defensive — should never happen because the dialog only opens
        // with a loaded account. Throwing keeps the contract loud.
        throw new Error(`useEditAccount: account ${id} not in cache`);
      }

      // Fixed order. After each successful sub-call, patch the cached
      // ['accounts'] row and notify the dialog so the form remounts
      // with fresh defaults (see §5.2 and §6.2).
      if (diff.name !== undefined) {
        await api.rename(id, { name: diff.name });
        patchCachedAccount(queryClient, id, { name: diff.name });
        onSubCallApplied();
      }
      if (diff.overdraftLimit !== undefined) {
        await api.updateOverdraftLimit(id, {
          overdraftLimit: diff.overdraftLimit === null ? undefined : diff.overdraftLimit,
          currency: current.currency, // mandatory: see §6.3
        });
        patchCachedAccount(queryClient, id, {
          overdraftLimit: diff.overdraftLimit ?? null,
        });
        onSubCallApplied();
      }
      if (diff.subtype !== undefined) {
        await api.updateSubtype(id, { subtype: diff.subtype });
        patchCachedAccount(queryClient, id, { subtype: diff.subtype });
        onSubCallApplied();
      }
    },
    onSuccess: () => {
      // After full success, invalidate so the next list fetch reflects
      // any server-side derived fields (e.g., balance) that we didn't
      // patch locally. The patched-row state is already correct for the
      // fields we touched.
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

// Helper. Mutates the ['accounts'] query data in place by replacing the
// matching row. Does NOT touch `version` — the remount-trigger lives on
// the dialog as a UI-only counter (§5.2), not on the server-managed
// version field.
function patchCachedAccount(queryClient: QueryClient, id: UUID, patch: Partial<AccountResponse>) {
  queryClient.setQueryData<AccountResponse[] | undefined>(['accounts'], (list) =>
    list?.map((a) => (a.id === id ? { ...a, ...patch } : a)),
  );
}
```

No optimistic update across the full submit — the dialog stays open with a disabled submit until the mutation resolves. Per-sub-call patching only happens after a successful round-trip, so the cache never displays a state the server has not confirmed.

### 6.1 Error mapping

The dialog wraps `mutateAsync(diff)` in `try/catch` and applies the existing `ApiError.fieldErrors → setError` mapping (same code path as `CreateAccountDialog`'s `onSubmit`). Errors thrown from any of the three PUTs surface to the same handler. A non-`ApiError` error or one without `fieldErrors` renders the inline banner above the form.

### 6.2 Partial-save semantics (the key invariant)

Suppose rename succeeds and `updateOverdraftLimit` fails:

1. Inside `mutationFn`, after the successful `rename` PUT, `patchCachedAccount` updates the cached `['accounts']` row's `name`. Then `onSubCallApplied()` runs, which the dialog has wired to `setEditEpoch((n) => n + 1)`.
2. `mutationFn` proceeds to the overdraft-limit call, which throws.
3. TanStack Query marks the mutation as errored, the thrown error is re-raised to the `try/catch` in the dialog's `onSubmit`, which maps it to a field error or banner.
4. Meanwhile, the cache update from step 1 triggers a re-render. `AccountHeader` (subscribed via `useAccountById`) gets a new `account` prop. `editEpoch` has also incremented. The `<EditAccountForm key={`${account.id}:${editEpoch}`}>` key changes, so the inner form **remounts**.
5. Remount: `useForm` re-initializes with `defaultValues = fromAccountResponse(newAccount)`. The new defaults reflect that `name` was applied.
6. The user fixes the overdraft input and re-submits. `diffAccount(newDefaults, values)` correctly sees no change for `name` (it now matches), only the overdraft. Only the overdraft PUT fires.

Why `editEpoch` rather than the account's `version`: the cached `['accounts']` row could be replaced wholesale by a background refetch (window focus, mount of another `useAccounts` subscriber) between sub-calls. Such a refetch would write the _server's_ `version` over the patched row, so a key derived from `version` could remain numerically equal even after a successful sub-call, breaking the remount signal. `editEpoch` is a dialog-local `useState` counter — independent of any cache contents — and so cannot be clobbered.

If the user cancels mid-failure, the cached row already reflects the partial server state, the sidebar shows the new name, and a subsequent re-open recomputes defaults from that patched row — the form starts where the server is.

This invariant is what test §8.3 case 7 must lock in (see updated test list).

### 6.3 Currency on the overdraft-limit endpoint

The backend's `setOverdraftLimitHandler` requires the request's `currency` to match the account's currency, or the underlying `mkMoney` rejects with a currency-mismatch error. The handler defaults missing `currency` to `"USD"` (`backend/src/Web/API/AccountAPI.hs:266`), which would break for UAH/EUR/GBP accounts. The mutation always sends `currency: current.currency` from the cached account; this is mandatory, not optional, on the call site even though the field is optional in the DTO.

If the cached account is unavailable when the mutation runs (a defensive case that shouldn't happen because the dialog only opens with a loaded account), throw a runtime `Error` rather than silently sending undefined.

## 7. Routing & post-success behaviour

No router changes. After a successful edit:

1. `useEditAccount.mutationFn` completes (or completes partially per §6.2).
2. `onSuccess` invalidates `['accounts']`. The sidebar list and the `AccountHeader` (which derives from the same list) re-render with updated values.
3. `EditAccountDialog`'s submit handler calls `onOpenChange(false)`.
4. URL is unchanged; the user remains on `/accounts/:id`.

Cancellation: closing the dialog (Esc / Cancel / overlay click) calls `onOpenChange(false)`. Form state is per-dialog-instance (the dialog unmounts on close), so the next open recomputes `defaultValues` from the current `account` prop and starts fresh.

## 8. Tests

### 8.1 Backend

Per §2.5:

- `Domain.Account.CommandHandlerSpec` — three new `RenameAccount` cases.
- `backend/test/Integration/WebAPISpec.hs` — three new HTTP-level cases on `PUT /api/accounts/:id/name`.

### 8.2 Web — unit (Vitest)

- `features/accounts/schema.test.ts` — extend with new cases for `editAccountFormSchema`: name required, name max-length 120, schema _does not_ require `initialBalance`, schema _does not_ apply the negative-balance refinement, schema accepts non-enum currency strings (`z.string()`).
- `features/accounts/diffAccount.test.ts` (new):
  - No changes → empty diff.
  - Name-only change → only `name`.
  - Overdraft set → cleared → `overdraftLimit: null`.
  - Overdraft cleared → set → `overdraftLimit: <number>`.
  - Subtype optional-field changed (same `type`) → `subtype` carries the full new object.
  - Subtype type changed → `subtype` carries the new type's object (old type's fields not present).
  - Mismatched currency between `initial` and `next` → throws.
- `features/accounts/fromAccountResponse.test.ts` (new):
  - All five subtypes round-trip through `fromAccountResponse`.
  - Freeform `OtherCardNetwork` / `OtherAsset` (if simulable in a fixture) come back as `undefined` enum values.

### 8.3 Web — component (Vitest + RTL + MSW)

`features/accounts/EditAccountDialog.test.tsx`:

1. Opens with values populated from the supplied `AccountResponse`. Currency control is disabled (assert `disabled` attribute is set on the input).
2. Submitting an empty name shows the field error and does not call the API.
3. Editing only the name fires exactly one PUT (`/api/accounts/:id/name`); the dialog closes, `['accounts']` is invalidated (assert via TanStack Query test utilities or via the next list fetch firing).
4. Editing name + overdraftLimit fires two PUTs in order: first `/api/accounts/:id/name`, then `/api/accounts/:id/overdraft-limit`. Assert order via a shared array each MSW handler pushes its path into, then assert the array contents at the end. This is deterministic because `mutationFn` awaits each PUT sequentially.
5. Editing the subtype type fires the subtype PUT with the new type body.
6. Server `ValidationErr` with `fieldErrors.name` on the rename call maps to the name field error and keeps the dialog open.
7. Rename succeeds, overdraft-limit call returns 500. Assertions:
   - Banner shows the 500 error message.
   - Dialog stays open.
   - The cached `['accounts']` row now contains the new name (per §6.2 step 1).
   - The form's `name` input is now populated with the new name (it became the new default after version-keyed remount).
   - On a second submit (with no further user edits), exactly one PUT fires: the overdraft-limit PUT — _not_ the rename PUT. Use the same shared-array technique as case 4 to assert the captured paths. This is the load-bearing assertion for §6.2.
8. Closing the dialog mid-edit and reopening shows the latest server state (defaults recomputed from the current `account` prop).
9. Overdraft-limit PUT request body always includes `currency` matching the account's currency (asserted by inspecting the captured MSW request).

`features/transactions/AccountHeader.test.tsx`:

1. Renders account name, human-readable subtype label, and formatted balance.
2. Clicking Edit opens the dialog.
3. Renders for every subtype variant (parametrised test, asserting the label mapping in §5.4).

`features/transactions/TransactionsPane.test.tsx` (extend existing):

1. With an account id in URL and `['accounts']` populated → header bar renders above transactions.
2. With an account id in URL but `['accounts']` still loading → header skeleton renders; transactions area renders its own loading state.
3. With an account id not found in a resolved `['accounts']` list → no header rendered; transactions area renders as before.

`features/accounts/CreateAccountDialog.test.tsx`:

- All existing test cases continue to pass after the `AccountForm` refactor — this is the regression bar.

`features/accounts/AccountsPane.test.tsx`:

- Existing tests continue to pass; no new tests added unless a regression is uncovered during the extraction.

### 8.4 Out of scope for tests

- Playwright e2e for the edit flow.
- Cross-currency / non-enum-currency display rendering paths beyond the unit-level enum narrow in `fromAccountResponse`.

## 9. Definition of done

- A signed-in user with an account selected sees a header bar above the transactions list showing the account's name, subtype, and balance, plus an **Edit** button.
- Clicking **Edit** opens a dialog prefilled with the account's current values. Currency is disabled with the readonly tooltip. Account type and the subtype optional fields are enabled; switching the type swaps the visible subtype fields (consistent with create-account behaviour). Overdraft limit lives behind the "More options" toggle, as in create.
- On submit, only the fields whose values changed produce server calls (rename, overdraft, subtype) — verified by the `diffAccount` unit tests and the `EditAccountDialog` component tests.
- On full success: dialog closes, the sidebar list and the header bar refresh.
- On partial success: prior writes stay applied (server state), the cached row is patched, the dialog stays open with the inline error, and the next submit's diff reflects the latest state.
- Backend `ValidationErr` field errors map onto matching form fields; non-field errors render as a banner above the form.
- Tests pass: the Haskell suite includes the three new `RenameAccount` domain-handler cases plus three HTTP-level cases on `PUT /api/accounts/:id/name`; the web suite includes the new schema/diff/fromAccountResponse unit tests, the new `EditAccountDialog` and `AccountHeader` component tests, and the existing `CreateAccountDialog` and `AccountsPane` tests after the `AccountForm` extraction.
- `just check` and `just test` succeed in both repos.

## 10. Flagged follow-ups (not in this slice)

- Currency change in any form (see §1.1 for why this is unlikely to ever be in scope).
- Optimistic concurrency via `AccountResponse.version` on edits.
- Sharing accounts and revoking access; `metadata` map editor.
- Playwright e2e for the edit flow.
- Surfacing freeform `OtherCardNetwork` / `OtherAsset` backend variants in the UI.

## 11. Adjust balance (added)

### 11.1 Backend endpoint (already implemented)

`PUT /api/accounts/:id/balance` (`backend/src/Web/API/AccountAPI.hs:150-157`, handler at lines 300-321).

- **Body** (`AdjustBalanceRequest`, `Web/Types.hs:388-398`):
  - `targetBalance: Double` — desired balance after adjustment, in the account's currency.
  - `currency: Text` — must equal the account's currency (server rejects with field error keyed on `"currency"`).
  - `date: UTCTime` — required, must be `≤ now` (server rejects with field error keyed on `"date"` and message "Adjustment date must be in the past or present").
  - `reason: Text` — stored as the synthetic transaction's description.
- **Response**: `TransactionResponse` for the new adjustment row (so the client can optimistically append to the transactions cache if desired; this slice will simply invalidate the cache and refetch).
- **Server-side rules to be aware of** (per `Application/Services/AccountService.hs:adjustAccountBalance`):
  - Currency mismatch → 400 with `fieldErrors.currency`.
  - Date in the future → 400 with `fieldErrors.date`.
  - `targetBalance == balance_at(date)` (no delta) → 400 with `fieldErrors.targetBalance` and message "Target balance equals current balance at this date". The web cannot precompute this because it depends on the historical balance at the chosen date — let the server be the authority.
  - Overdraft violation (resulting balance would push below `-overdraftLimit`) → 400 (same handler infrastructure as create-account; field-error key not verified here, surface whatever the server returns).

### 11.2 Web DTO

`web/src/api/types.ts` — add:

```ts
export interface AdjustBalanceRequest {
  targetBalance: number;
  currency: string;
  date: ISO8601; // ISO 8601 timestamp; the dialog converts a YYYY-MM-DD picker
  // value to <YYYY-MM-DD>T00:00:00.000Z before sending.
  reason: string;
}
```

### 11.3 Web fetcher

`web/src/api/accounts.ts`:

```ts
adjustBalance: (id: UUID, body: AdjustBalanceRequest): Promise<TransactionResponse> =>
  client.put<TransactionResponse>(`/api/accounts/${id}/balance`, body),
```

### 11.4 Web mutation hook

`web/src/features/accounts/useAdjustBalance.ts` (new). TanStack Query `useMutation`:

```ts
export function useAdjustBalance(id: UUID) {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<TransactionResponse, Error, AdjustBalanceRequest>({
    mutationFn: (body) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return accountsApi(client).adjustBalance(id, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['transactions', id] });
    },
  });
}
```

No optimistic update — the dialog stays open with a disabled submit until resolution.

### 11.5 Form

`web/src/features/accounts/adjustBalanceSchema.ts`:

```ts
export const adjustBalanceFormSchema = z
  .object({
    targetBalance: z.coerce.number().finite(),
    reason: z.string().trim().min(1, 'Reason is required').max(255),
    // YYYY-MM-DD from the native date input. The submit handler converts to
    // <YYYY-MM-DD>T00:00:00.000Z. The min-1-char rule prevents an unfilled
    // input from passing as a "today" default — the dialog will always
    // initialise it with today's value, so this is just defense-in-depth.
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date is required'),
  })
  .superRefine((v, ctx) => {
    const today = new Date().toISOString().slice(0, 10);
    if (v.date > today) {
      ctx.addIssue({
        path: ['date'],
        code: z.ZodIssueCode.custom,
        message: 'Date cannot be in the future.',
      });
    }
  });
```

Helper to shape values into the backend DTO:

```ts
export function toAdjustBalanceRequest(
  values: z.infer<typeof adjustBalanceFormSchema>,
  currency: string,
): AdjustBalanceRequest {
  return {
    targetBalance: values.targetBalance,
    currency,
    date: `${values.date}T00:00:00.000Z`,
    reason: values.reason,
  };
}
```

### 11.6 Dialog

`web/src/features/accounts/AdjustBalanceDialog.tsx` (new). Plain form (no `AccountForm` reuse — fields don't overlap):

```tsx
export interface AdjustBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AccountResponse;
}

export function AdjustBalanceDialog({ open, onOpenChange, account }: AdjustBalanceDialogProps) {
  const adjust = useAdjustBalance(account.id);
  const today = new Date().toISOString().slice(0, 10);
  const form = useForm<AdjustBalanceFormValues>({
    resolver: zodResolver(adjustBalanceFormSchema),
    defaultValues: {
      targetBalance: account.balance,
      reason: '',
      date: today,
    },
  });
  // ...standard onSubmit with try/catch and ApiError.fieldErrors mapping
  //    same pattern as EditAccountDialog / CreateAccountDialog
}
```

Body lays out the three controls (number, textarea or input, `<input type="date" max={today}>`), with a small "Current balance: 1234.56 USD" line above the targetBalance input for context (read directly from `account.balance` / `account.currency`).

### 11.7 Header wiring

`AccountHeader` (§5.4) renders **two buttons**: `Edit` and `Adjust balance`. Each manages its own `useState<boolean>` and renders the corresponding dialog. The header layout puts both buttons in the right cluster, with `Adjust balance` first (more frequently used) and `Edit` second.

### 11.8 Tests

`features/accounts/adjustBalanceSchema.test.ts`:

- Required reason; reason max-length 255.
- Required `targetBalance` (finite number); rejects empty, accepts `0`, accepts negative.
- Required `date`; rejects malformed; rejects `today + 1d`; accepts today and any past date.
- `toAdjustBalanceRequest` produces `<YYYY-MM-DD>T00:00:00.000Z` and forwards the supplied currency.

`features/accounts/AdjustBalanceDialog.test.tsx`:

1. Opens with `targetBalance` prefilled to `account.balance`, `date` prefilled to today, `reason` empty.
2. Submitting with empty reason shows the field error, no API call fires.
3. Submitting with a future date shows the field error, no API call fires.
4. Happy path: fires `PUT /api/accounts/:id/balance` with the expected body (assert `date` is the ISO-at-midnight conversion of the date input). On success, dialog closes; both `['accounts']` and `['transactions', accountId]` are invalidated.
5. Server `fieldErrors.targetBalance` (no-delta rejection) maps to the `targetBalance` field error; dialog stays open.
6. Server `fieldErrors.date` (future-date rejection at server side; e.g., if the user manages to bypass client validation) maps to the `date` field error.

`features/transactions/AccountHeader.test.tsx` extended:

- Renders both buttons; each opens the corresponding dialog.

### 11.9 Definition of done (additions)

- Header bar shows two buttons: **Edit** and **Adjust balance**.
- The Adjust balance dialog accepts target balance (prefilled with current), reason (required), and date (defaulted to today, may not be in the future).
- Submit calls `PUT /api/accounts/:id/balance` with the expected DTO shape (date converted to ISO midnight UTC).
- On success: dialog closes, the account row's balance updates in the sidebar, and the transactions list refetches with the new adjustment row.
- Server field errors (`targetBalance`, `date`, `currency`) map onto the matching form fields; non-field errors render as a banner above the form.
- Tests pass: new schema unit tests + new dialog component tests + extended header test.
