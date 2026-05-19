---
status: draft
---

# Edit Account Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in user edit an account's mutable fields (name, type, optional subtype fields, overdraft limit) from a new account header bar in the transactions view. Currency stays immutable; `initialBalance` is not editable.

**Architecture:** Add a new `PUT /api/accounts/:id/name` backend endpoint; reuse the existing `PUT /api/accounts/:id/type` and `PUT /api/accounts/:id/overdraft-limit` endpoints. The web client extracts the create-account form body into a shared `AccountForm`, adds an `EditAccountDialog` that diffs initial vs. submitted values and fires only the PUTs whose fields changed. After each successful sub-call, the cached `['accounts']` row is patched and a UI-only `editEpoch` counter on the dialog bumps, remounting the inner form so the next diff is correct on partial failure.

**Tech Stack:**

- **Web:** React 18, TypeScript, Vite, Tailwind, shadcn/ui (Radix + Zod + react-hook-form), TanStack Query, MSW + Vitest + Testing Library.
- **Backend (sibling `backend/` repo):** Haskell, Servant, event-sourced domain (`Domain/Account/CommandHandler.hs`, `Events.hs`, `Projection.hs`), `AccountService` application layer, `Web/API/AccountAPI.hs` Servant types and handlers.

**Spec:** `docs/specs/2026-05-11-edit-account-design.md`

**Issue:** [homeaccounting/web#12](https://github.com/homeaccounting/web/issues/12)

---

## File map

### Backend (sibling repo at `../backend/`)

- Modify `backend/src/Domain/Account/Commands.hs` — add `RenameAccount` command.
- Modify `backend/src/Domain/Account/Events.hs` — add `AccountRenamed` event + extend `AccountEvent` sum (`AccountRenamedAccountEvent`).
- Modify `backend/src/Domain/Account/Projection.hs` — extend `handleAccountEvent` to apply rename.
- Modify `backend/src/Domain/Account/CommandHandler.hs` — handle `RenameAccount`; add `AccountNameUnchanged` to the bare `AccountError` sum.
- Modify `backend/src/Application/Services/AccountService.hs` — add `renameAccount :: UserId -> AccountId -> Text -> AppM (Either DomainError ())` (owner-only authz).
- Modify `backend/src/Web/API/AccountAPI.hs` — extend `AccountAPI` type and `accountServer`; add `RenameAccountRequest` DTO and `renameAccountHandler`.
- Modify `backend/test/Domain/Account/CommandHandlerSpec.hs` — three new `RenameAccount` cases.
- Modify `backend/test/Integration/WebAPISpec.hs` — three new HTTP-level cases on `PUT /api/accounts/:id/name`.

### Web (this repo)

- Modify `src/api/types.ts` — add `RenameAccountRequest`, `SetOverdraftLimitRequest`, `SetAccountSubtypeRequest`, `AdjustBalanceRequest`.
- Modify `src/api/accounts.ts` — extend factory with `rename`, `updateOverdraftLimit`, `updateSubtype`, `adjustBalance`.
- Modify `src/features/accounts/schema.ts` — extract `baseAccountFields`, add `editAccountFormSchema`, `EditAccountFormValues`, `fromAccountResponse`.
- Modify `src/features/accounts/schema.test.ts` — extend with edit-schema + `fromAccountResponse` cases.
- Create `src/features/accounts/diffAccount.ts` — `AccountEditDiff`, `diffAccount`, `subtypeEqual`.
- Create `src/features/accounts/diffAccount.test.ts` — unit tests.
- Create `src/features/accounts/AccountForm.tsx` — shared form body (used by both Create and Edit dialogs).
- Modify `src/features/accounts/CreateAccountDialog.tsx` — replace inline form body with `<AccountForm mode="create" …>`.
- Existing `src/features/accounts/CreateAccountDialog.test.tsx` — must continue to pass as the regression bar.
- Create `src/features/accounts/useEditAccount.ts` — mutation hook with `EditAccountVars` (diff + `onSubCallApplied`) and `patchCachedAccount` helper.
- Create `src/features/accounts/useAccountById.ts` — wraps `useAccounts()` and `.find()`s the row.
- Create `src/features/accounts/EditAccountDialog.tsx` — dialog with `editEpoch` counter; renders `<AccountForm mode="edit" key={…}>`.
- Create `src/features/accounts/EditAccountDialog.test.tsx`.
- Create `src/features/accounts/adjustBalanceSchema.ts` — zod schema + `toAdjustBalanceRequest` helper.
- Create `src/features/accounts/adjustBalanceSchema.test.ts`.
- Create `src/features/accounts/useAdjustBalance.ts` — mutation hook.
- Create `src/features/accounts/AdjustBalanceDialog.tsx`.
- Create `src/features/accounts/AdjustBalanceDialog.test.tsx`.
- Create `src/features/transactions/AccountHeader.tsx` — hosts **both** Edit and Adjust-balance dialogs.
- Create `src/features/transactions/AccountHeader.test.tsx`.
- Modify `src/features/transactions/TransactionsPane.tsx` — render `<AccountHeader>` when the account is loaded.
- Modify `src/features/transactions/TransactionsPane.test.tsx` — three new state assertions.
- Modify `src/test/handlers.ts` — add default handlers for the three edit endpoints so tests outside `EditAccountDialog.test.tsx` don't trip MSW's `onUnhandledRequest: 'error'`.

---

## Commit conventions

Per the user's global CLAUDE.md (`Conventional Commits v1.0.0`):

- **Backend commits** use scope `(backend)` where helpful, but the backend repo is separate; commit there directly. Example: `feat(accounts): add rename endpoint`.
- **Web commits** in this repo. Example: `feat(accounts): extract AccountForm`, `feat(accounts): add edit dialog`, `test(accounts): cover partial-save invariant`.
- Frequent commits, one per task or sub-task. Never use `--no-verify`.

---

## Pre-flight

- [ ] **Step 0.1: Verify worktree and branch**

Run: `git status && git branch --show-current`
Expected: clean working tree on `feat/edit-account` (the branch already exists from the brainstorming step).

- [ ] **Step 0.2: Verify checks pass on baseline**

Run: `just check && just test`
Expected: both pass. (If something fails on master, surface to the user — that's not the slice's bug.)

---

# Part A: Backend (Haskell, `../backend/`)

All Part-A tasks operate in the sibling backend repo. Each task ends with a commit in that repo. The backend repo has its own branch convention; use `feat/edit-account-rename` there (or whatever the maintainer prefers — confirm with the user if uncertain).

### Task A1: New `RenameAccount` command + `AccountNameUnchanged` error variant

**Background on file structure (read before starting):**

- `Commands.hs` declares each command as its own record (e.g., `data SetOverdraftLimit = SetOverdraftLimit { overdraftLimit :: Maybe Money, setBy :: UserId }`, see Commands.hs:217–221). The `AccountCommand` sum type is **generated by eventium's Template Haskell** from `accountCommands :: [Name]` (Commands.hs:59–69). Adding a new command means: define the record AND add `''RenameAccount` to the `[Name]` list.
- The corresponding `data RenameAccountAccountCommand RenameAccount` constructor is auto-generated by TH; don't try to add it manually.
- Mirror the closest analogue: `SetOverdraftLimit` (single payload field + a `setBy :: UserId` for ownership-check plumbing).

- [ ] **Step A1.1: Add `RenameAccount` record to `Commands.hs`**

Open `backend/src/Domain/Account/Commands.hs`. Add a new record near `SetOverdraftLimit` (after `SetAccountSubtype`, before the TH `deriveJSON` block):

```haskell
-- | Command to rename an account.
--
-- Business Rules:
--   - Only Owner can rename
--   - New name must differ from the current name (no-op rejection)
--   - Empty / over-length name is rejected at the web layer; the domain
--     handler trusts the input is non-empty.
--
-- If accepted, produces an AccountRenamed event.
data RenameAccount = RenameAccount
  { -- | New human-readable name for the account.
    newName :: Text,
    -- | User issuing the rename (must be Owner).
    renamedBy :: UserId
  }
  deriving (Show, Eq)
```

Then add `''RenameAccount` to the `accountCommands :: [Name]` list:

```haskell
accountCommands =
  [ ''CreateAccount,
    ''ShareAccount,
    ''RevokeAccountAccess,
    ''DebitAccount,
    ''CreditAccount,
    ''SetOverdraftLimit,
    ''SetAccountSubtype,
    ''ChangeAccountCurrency,
    ''RenameAccount  -- new
  ]
```

If the file has a `deriveJSON ''SetOverdraftLimit` block at the bottom (Commands.hs:241+), add `deriveJSON defaultOptions ''RenameAccount` next to it, following the file's convention.

- [ ] **Step A1.2: Add `AccountNameUnchanged` to the inline `AccountError` sum**

Open `backend/src/Domain/Account/CommandHandler.hs` and locate the inline `data AccountError = … deriving (Show, Eq)` declaration (per the create-account spec §2.1, this is the nullary-style type around lines 68–81). Add `| AccountNameUnchanged` as a new variant. The existing `deriving (Show, Eq)` already covers it; no further changes.

- [ ] **Step A1.3: Run the backend build**

Run (in `../backend/`): `cabal build` (or whatever the backend's `justfile` calls — confirm via `just --list` there).
Expected: clean build. The new record, sum entry, and error variant are unused so far, which is fine.

- [ ] **Step A1.4: Commit**

```bash
cd ../backend
git checkout -b feat/edit-account-rename  # if not already on a branch
git add src/Domain/Account/Commands.hs src/Domain/Account/CommandHandler.hs
git commit -m "feat(accounts): add RenameAccount command and AccountNameUnchanged error"
```

---

### Task A2: New `AccountRenamed` event + projection update

**Background on file structure:**

- Like `AccountCommand`, the `AccountEvent` sum is TH-generated from `accountEvents :: [Name]` (Events.hs:58–67). Adding a new event means: define the record AND add `''AccountRenamed` to the `[Name]` list. The `AccountRenamedAccountEvent AccountRenamed` constructor is auto-generated.
- Events in this codebase carry **no timestamp** and **no embedded account id** — see `AccountCreated`, `OverdraftLimitSet`, `AccountAccessGranted`, etc. They carry the payload plus a `by :: UserId` field for audit. The aggregate id is implicit in the event stream's stream-id.
- `handleAccountEvent` in `Projection.hs` uses **Optics lens syntax** (`account & #name .~ newName`, not Haskell record-update). See Projection.hs:272–280 for templates (`OverdraftLimitSet`, `AccountSubtypeSet`, `AccountCurrencyChanged`).

- [ ] **Step A2.1: Add `AccountRenamed` record to `Events.hs`**

Open `backend/src/Domain/Account/Events.hs`. Add near `OverdraftLimitSet` (~line 171):

```haskell
-- | Event emitted when an account is renamed.
--
-- Records the new name and the user who issued the rename.
data AccountRenamed = AccountRenamed
  { -- | New human-readable name for the account.
    newName :: Text,
    -- | User who renamed the account (Owner).
    by :: UserId
  }
  deriving (Show, Eq)
```

Then add `''AccountRenamed` to the `accountEvents :: [Name]` list (after `''AccountCurrencyChanged`). If the file has trailing `deriveJSON ''X` lines (Events.hs:197+), add `deriveJSON defaultOptions ''AccountRenamed` next to them.

- [ ] **Step A2.2: Run the build (no projection yet — should still compile)**

Run: `cabal build`
Expected: clean. The TH machinery now generates `AccountRenamedAccountEvent`; `handleAccountEvent` is defined as a pattern match over the sum and will produce a non-exhaustive-patterns warning (acceptable until A2.3).

- [ ] **Step A2.3: Extend `handleAccountEvent` in `Projection.hs`**

Open `backend/src/Domain/Account/Projection.hs`. After the existing `AccountCurrencyChangedAccountEvent` branch (~line 276–280), add:

```haskell
handleAccountEvent account (AccountRenamedAccountEvent AccountRenamed {..}) =
  account & #name .~ newName
```

The field name on `Account` is `#name` (confirm by reading the surrounding branches; `OverdraftLimitSetAccountEvent` uses `#overdraftLimit`, etc.).

- [ ] **Step A2.4: Run the build**

Run: `cabal build`
Expected: clean. The non-exhaustive warning from A2.2 should be gone.

- [ ] **Step A2.5: Commit**

```bash
git add src/Domain/Account/Events.hs src/Domain/Account/Projection.hs
git commit -m "feat(accounts): add AccountRenamed event and projection"
```

---

### Task A3: TDD — `handleAccountCommand` cases for `RenameAccount`

**Files:**

- Modify: `backend/src/Domain/Account/CommandHandler.hs` — add `RenameAccount` branch.
- Modify: `backend/test/Domain/Account/CommandHandlerSpec.hs` — three new test cases.

**Background:** `handleAccountCommand :: Account -> AccountCommand -> Either AccountError [AccountEvent]` is a **pure** function returning `Either` (CommandHandler.hs:144). No `do/monadic` notation, no timestamps. Mirror `ShareAccount` (CommandHandler.hs:180–193) or `SetOverdraftLimit` for the canonical pattern — guard clauses + `Right [SomeAccountEvent (…)]`.

- [ ] **Step A3.1: Write the three failing tests first**

Open `backend/test/Domain/Account/CommandHandlerSpec.hs` and add a new `describe "RenameAccount"` block at the same nesting level as the existing `describe "CreateAccount"`, `describe "ShareAccount"`, etc. Inspect those blocks first to find the file's account-fixture helpers (e.g., a function returning a saved `Account` with a known owner). Three cases (spec §2.5):

```haskell
describe "RenameAccount" $ do
  it "rejects a rename to the same current name" $ do
    let acc = makeAccount "Savings" ownerId
        cmd = RenameAccountAccountCommand (RenameAccount "Savings" ownerId)
    handleAccountCommand acc cmd `shouldBe` Left AccountNameUnchanged

  it "rejects a rename by a non-owner" $ do
    let acc = makeAccount "Savings" ownerId
        cmd = RenameAccountAccountCommand (RenameAccount "Checking" strangerId)
    handleAccountCommand acc cmd `shouldBe` Left NotAccountOwner

  it "accepts a rename to a different non-empty name" $ do
    let acc = makeAccount "Savings" ownerId
        cmd = RenameAccountAccountCommand (RenameAccount "Checking" ownerId)
    case handleAccountCommand acc cmd of
      Right [AccountRenamedAccountEvent renamed] -> do
        renamed.newName `shouldBe` "Checking"
        renamed.by `shouldBe` ownerId
      other -> expectationFailure $ "expected single AccountRenamed, got: " <> show other
```

Adjust the `makeAccount`/`ownerId`/`strangerId` references to whatever helpers the spec file already provides (look at the `ShareAccount` block for the closest pattern — it uses an owner fixture too).

- [ ] **Step A3.2: Run the tests; verify they fail**

Run (in `../backend/`): `cabal test --test-options="--match RenameAccount"`
Expected: FAIL — likely build error (no `RenameAccount` branch in handler → "Non-exhaustive patterns in function handleAccountCommand").

- [ ] **Step A3.3: Implement the `RenameAccount` branch in `handleAccountCommand`**

Open `backend/src/Domain/Account/CommandHandler.hs`. Add a new branch after the existing `ChangeAccountCurrency` branch (find it by searching `ChangeAccountCurrencyAccountCommand`). Mirror `ShareAccount` style:

```haskell
-- Handle RenameAccount command
handleAccountCommand account (RenameAccountAccountCommand RenameAccount {..})
  | T.null (account ^. #name) = Left AccountDoesNotExist
  | not (isOwner renamedBy account) = Left NotAccountOwner
  | account ^. #name == newName = Left AccountNameUnchanged
  | otherwise =
      Right
        [ AccountRenamedAccountEvent
            AccountRenamed
              { newName = newName,
                by = renamedBy
              }
        ]
```

`isOwner` is imported from elsewhere in the file (search for its usage in `ShareAccount`). `T.null` from `Data.Text` — also already imported.

- [ ] **Step A3.4: Run the tests; verify they pass**

Run: `cabal test --test-options="--match RenameAccount"`
Expected: PASS for all three cases.

- [ ] **Step A3.5: Commit**

```bash
git add src/Domain/Account/CommandHandler.hs test/Domain/Account/CommandHandlerSpec.hs
git commit -m "feat(accounts): handle RenameAccount in command handler"
```

---

### Task A4: Service-layer `renameAccount`

**Files:**

- Modify: `backend/src/Application/Services/AccountService.hs`

**Background:** Authz is enforced inside `handleAccountCommand` via the `isOwner renamedBy account` guard (Task A3.3). The service layer just forwards the user id into the command's `renamedBy` field and dispatches via the existing `runAccountCmd` plumbing. `runAccountCmd` (`backend/src/Application/Services/Internal.hs:84–97`) collapses domain rejections to `DomainError.AccountError`, which the web layer surfaces as a generic 400.

- [ ] **Step A4.1: Add the service function**

Open `backend/src/Application/Services/AccountService.hs`. The closest template is `setOverdraftLimit` (lines 253–265): it uses `runExceptT` with `logInfo` before and after, validates the UUID via `liftEitherWith … mkAccountId`, then calls `runAccountCmd id accountUuid cmd`. The `id` argument is the identity functor (eventium parameterises `runAccountCmd` on a functor; existing call sites use `id`).

Add `renameAccount` next to `setOverdraftLimit`, matching that pattern exactly. Note the `UUID` (not `AccountId`) argument type:

```haskell
-- | Rename an account.
renameAccount ::
  UserId ->
  UUID ->
  Text ->
  AppM (Either DomainError ())
renameAccount requestingUserId accountUuid newName = runExceptT $ do
  lift $ logInfo $ "Renaming account: " <> displayShow accountUuid
  _ <- liftEitherWith (\_ -> NotFound "Account" (tshow accountUuid)) (mkAccountId accountUuid)
  let cmd =
        RenameAccountAccountCommand
          RenameAccount {newName = newName, renamedBy = requestingUserId}
  runAccountCmd id accountUuid cmd
  lift $ logInfo "Account renamed successfully"
```

Export `renameAccount` from the module (find the existing export list and add it alongside `setOverdraftLimit`).

- [ ] **Step A4.2: Run the build**

Run: `cabal build`
Expected: clean.

- [ ] **Step A4.3: Commit**

```bash
git add src/Application/Services/AccountService.hs
git commit -m "feat(accounts): add renameAccount service"
```

---

### Task A5: TDD — `PUT /api/accounts/:id/name` HTTP endpoint

**Files:**

- Modify: `backend/src/Web/API/AccountAPI.hs`
- Modify: `backend/test/Integration/WebAPISpec.hs`

- [ ] **Step A5.1: Write the failing HTTP integration tests**

Open `backend/test/Integration/WebAPISpec.hs`. Find the `describe "POST /api/accounts"` block (per the create-account spec at lines 104+ / 251+) — add a new sibling block:

```haskell
describe "PUT /api/accounts/:id/name" $ do
  it "renames an account and the GET reflects the change" $ do
    -- Create an account via POST /api/accounts.
    -- PUT /api/accounts/:id/name with body { "name": "New Name" }.
    -- Assert 200 (or NoContent per Servant — match existing PUTs which use Put '[JSON] NoContent).
    -- GET /api/accounts/:id and assert the body's `name` equals "New Name".
    pending  -- replace with implementation

  it "rejects empty name with fieldErrors.name" $ do
    -- PUT /api/accounts/:id/name with body { "name": "" } or "   ".
    -- Assert 400 and body.fieldErrors.name is present.
    pending

  it "rejects name longer than 120 characters with fieldErrors.name" $ do
    -- PUT /api/accounts/:id/name with body { "name": String.replicate 121 'x' }.
    -- Assert 400 and body.fieldErrors.name is present.
    pending
```

Match the existing `POST /api/accounts` test block's style (auth header, `request`/`runSession`/etc.).

- [ ] **Step A5.2: Run the tests; verify they fail**

Run: `cabal test --test-options="--match \"PUT /api/accounts/:id/name\""`
Expected: FAIL — endpoint not yet exposed (likely 404 or `noSuchEndpoint`).

- [ ] **Step A5.3: Add the endpoint to `AccountAPI` and `accountServer`**

Open `backend/src/Web/API/AccountAPI.hs`. **Verify the current line numbers** before editing — the citations below are from the spec and may have drifted by a few lines.

1. Add `RenameAccountRequest` type next to `SetOverdraftLimitRequest` (around line 162):

```haskell
data RenameAccountRequest = RenameAccountRequest
  { name :: Text
  } deriving (Show, Eq, Generic)
instance ToJSON RenameAccountRequest
instance FromJSON RenameAccountRequest
```

2. Add a new endpoint to the `AccountAPI` type definition (insert after the `type` endpoint, around line 144):

```haskell
:<|> AuthProtect "jwt"
  :> "api"
  :> "accounts"
  :> Capture "id" UUID
  :> "name"
  :> ReqBody '[JSON] RenameAccountRequest
  :> Put '[JSON] NoContent
```

3. Add `renameAccountHandler` to the export list (around line 51) and add it to the `accountServer` definition (around line 188), in the same position as the type-level entry.

4. Implement `renameAccountHandler` after `setAccountSubtypeHandler` (~line 277):

```haskell
renameAccountHandler :: AuthenticatedUser -> UUID -> RenameAccountRequest -> AppM NoContent
renameAccountHandler user accountUuid RenameAccountRequest {..} = do
  let userId = user.userId
  let trimmed = T.strip name
  when (T.null trimmed) $ throwValidation "name" "Name is required"
  when (T.length trimmed > 120) $ throwValidation "name" "Name must be 120 characters or fewer"
  result <- AccountService.renameAccount userId accountUuid trimmed
  case result of
    Right () -> return NoContent
    Left err -> throwDomainError err
```

Import `Data.Text` as `T` if not already imported.

- [ ] **Step A5.4: Run the tests; verify they pass**

Run: `cabal test --test-options="--match \"PUT /api/accounts/:id/name\""`
Expected: PASS for all three cases.

- [ ] **Step A5.5: Run the full backend test suite**

Run: `cabal test`
Expected: PASS. Confirms no regression in adjacent specs.

- [ ] **Step A5.6: Commit**

```bash
git add src/Web/API/AccountAPI.hs test/Integration/WebAPISpec.hs
git commit -m "feat(accounts): add PUT /api/accounts/:id/name endpoint"
```

- [ ] **Step A5.7: Push backend branch and (optionally) open a PR**

The backend repo has its own PR flow. Confirm with the user before pushing / opening a PR — the user may want to bundle both repos' work first.

---

# Part B: Web — DTOs, schema, diff helper

Switch context back to `web/` repo / `feat/edit-account` branch.

### Task B1: API DTOs for the three edit endpoints

**Files:**

- Modify: `src/api/types.ts`

- [ ] **Step B1.1: Add the three request DTOs**

Open `src/api/types.ts`. After the existing `CreateAccountRequest` (around line 124+), add:

```ts
export interface RenameAccountRequest {
  name: string;
}

// `currency` is JSON-optional (mirrors the backend's SetOverdraftLimitRequest,
// where it defaults to "USD" when missing). Callers MUST set it to the
// account's currency to avoid CurrencyMismatch on non-USD accounts —
// see spec §6.3.
export interface SetOverdraftLimitRequest {
  overdraftLimit?: number;
  currency?: string;
}

export interface SetAccountSubtypeRequest {
  subtype: AccountSubtypeRequest;
}

// PUT /api/accounts/:id/balance. See spec §11.1 for server validation rules.
// `date` is an ISO 8601 timestamp; the AdjustBalanceDialog converts a
// YYYY-MM-DD date input to <YYYY-MM-DD>T00:00:00.000Z before sending.
export interface AdjustBalanceRequest {
  targetBalance: number;
  currency: string;
  date: ISO8601;
  reason: string;
}
```

- [ ] **Step B1.2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step B1.3: Commit**

```bash
git add src/api/types.ts
git commit -m "feat(accounts): add DTOs for rename, set-overdraft, set-subtype"
```

---

### Task B2: API client fetcher methods

**Files:**

- Modify: `src/api/accounts.ts`

- [ ] **Step B2.1: Extend the `accountsApi` factory**

Open `src/api/accounts.ts`. Replace the file with:

```ts
import type {
  AccountListResponse,
  AccountResponse,
  CreateAccountRequest,
  RenameAccountRequest,
  SetAccountSubtypeRequest,
  SetOverdraftLimitRequest,
  UUID,
} from './types';
import type { ApiClient } from './client';

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
  adjustBalance: (id: UUID, body: AdjustBalanceRequest): Promise<TransactionResponse> =>
    client.put<TransactionResponse>(`/api/accounts/${id}/balance`, body),
});
```

Verify `ApiClient.put` exists in `src/api/client.ts` (it does per spec).

- [ ] **Step B2.2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step B2.3: Commit**

```bash
git add src/api/accounts.ts
git commit -m "feat(accounts): add rename/updateOverdraftLimit/updateSubtype fetchers"
```

---

### Task B3: Refactor `schema.ts` — extract `baseAccountFields`

**Files:**

- Modify: `src/features/accounts/schema.ts`
- Tests: existing `src/features/accounts/schema.test.ts` must keep passing (regression bar).

- [ ] **Step B3.1: Run existing schema tests as the baseline**

Run: `pnpm exec vitest run src/features/accounts/schema.test.ts`
Expected: PASS. Note the current test count to verify nothing is lost in the refactor.

- [ ] **Step B3.2: Extract `baseAccountFields`**

Open `src/features/accounts/schema.ts`. Replace the inline object literal inside the existing `createAccountFormSchema = z.object({…})` with a hoisted `baseAccountFields` record, _keeping the behavior identical_:

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
    currency: z.enum(['UAH', 'USD', 'EUR', 'GBP']),
    initialBalance: z.coerce.number().finite(),
  })
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
```

`toCreateAccountRequest` and `CreateAccountFormValues` stay as they are.

- [ ] **Step B3.3: Re-run schema tests**

Run: `pnpm exec vitest run src/features/accounts/schema.test.ts`
Expected: PASS with same test count as Step B3.1.

- [ ] **Step B3.4: Commit**

```bash
git add src/features/accounts/schema.ts
git commit -m "refactor(accounts): hoist baseAccountFields for reuse"
```

---

### Task B4: TDD — edit schema + `fromAccountResponse`

**Files:**

- Modify: `src/features/accounts/schema.ts`
- Modify: `src/features/accounts/schema.test.ts`

- [ ] **Step B4.1: Write failing tests for the edit schema**

Open `src/features/accounts/schema.test.ts` and add:

```ts
import { describe, it, expect } from 'vitest';
import { editAccountFormSchema, fromAccountResponse, type EditAccountFormValues } from './schema';
import type { AccountResponse } from '@/api/types';

describe('editAccountFormSchema', () => {
  it('requires name', () => {
    const result = editAccountFormSchema.safeParse({
      name: '',
      currency: 'USD',
      overdraftLimit: undefined,
      subtype: { type: 'cash' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects name longer than 120 chars', () => {
    const result = editAccountFormSchema.safeParse({
      name: 'x'.repeat(121),
      currency: 'USD',
      overdraftLimit: undefined,
      subtype: { type: 'cash' },
    });
    expect(result.success).toBe(false);
  });

  it('does not require initialBalance', () => {
    const result = editAccountFormSchema.safeParse({
      name: 'Savings',
      currency: 'USD',
      overdraftLimit: undefined,
      subtype: { type: 'cash' },
    });
    expect(result.success).toBe(true);
  });

  it('does not apply the negative-balance refinement', () => {
    // A negative current balance is *not* part of the schema in edit mode
    // (initialBalance isn't there to refine against). This just confirms
    // the schema accepts payloads that the create schema would reject for
    // the wrong reason.
    const result = editAccountFormSchema.safeParse({
      name: 'Savings',
      currency: 'USD',
      overdraftLimit: undefined,
      subtype: { type: 'cash' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts non-enum currency strings', () => {
    const result = editAccountFormSchema.safeParse({
      name: 'Savings',
      currency: 'JPY', // not in the four-currency enum
      overdraftLimit: undefined,
      subtype: { type: 'cash' },
    });
    expect(result.success).toBe(true);
  });
});

describe('fromAccountResponse', () => {
  const fixture: AccountResponse = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name: 'Savings',
    balance: 0,
    currency: 'USD',
    overdraftLimit: null,
    subtype: { type: 'cash', storageLocation: 'wallet' },
    version: 1,
  };

  it('maps fields from AccountResponse to EditAccountFormValues', () => {
    const v = fromAccountResponse(fixture);
    expect(v.name).toBe('Savings');
    expect(v.currency).toBe('USD');
    expect(v.overdraftLimit).toBeUndefined();
    expect(v.subtype).toEqual({ type: 'cash', storageLocation: 'wallet' });
  });

  it('defaults missing subtype to { type: "cash" }', () => {
    const v = fromAccountResponse({ ...fixture, subtype: null });
    expect(v.subtype).toEqual({ type: 'cash' });
  });

  it('preserves a non-enum currency string', () => {
    const v = fromAccountResponse({ ...fixture, currency: 'JPY' });
    expect(v.currency).toBe('JPY');
  });

  it('drops freeform card-network variants to undefined', () => {
    // Backend may return { type: "bankAccount", cardNetwork: "OtherCardNetwork: foo" }
    // or similar. fromAccountResponse should pass through known enum values
    // and replace anything else with undefined.
    const v = fromAccountResponse({
      ...fixture,
      subtype: { type: 'bankAccount', cardNetwork: 'OtherCardNetwork: foo' } as never,
    });
    expect((v.subtype as { cardNetwork?: string }).cardNetwork).toBeUndefined();
  });
});
```

- [ ] **Step B4.2: Run the tests; verify they fail**

Run: `pnpm exec vitest run src/features/accounts/schema.test.ts`
Expected: FAIL — `editAccountFormSchema` / `fromAccountResponse` not exported.

- [ ] **Step B4.3: Implement `editAccountFormSchema` and `EditAccountFormValues`**

Append to `src/features/accounts/schema.ts`:

```ts
// Edit mode widens currency to z.string() because the account being edited
// may have a currency outside the four-currency enum. The control is disabled,
// so the value cannot drift from the loaded account — but the schema must
// accept whatever the cached AccountResponse holds, or zodResolver rejects
// on mount. See spec §4.1.
export const editAccountFormSchema = z.object({
  ...baseAccountFields,
  currency: z.string(),
});

export type EditAccountFormValues = z.infer<typeof editAccountFormSchema>;
```

- [ ] **Step B4.4: Implement `fromAccountResponse` and `normaliseSubtype`**

Append to `src/features/accounts/schema.ts`:

```ts
const CARD_NETWORKS = ['visa', 'mastercard', 'amex'] as const;
const ASSET_TYPES = ['property', 'vehicle', 'stocks', 'retirementFund'] as const;

function asEnum<T extends string>(allowed: readonly T[], value: unknown): T | undefined {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : undefined;
}

function normaliseSubtype(subtype: AccountResponse['subtype']): EditAccountFormValues['subtype'] {
  if (!subtype) return { type: 'cash' };
  const s = subtype as Record<string, unknown> & { type: string };
  switch (s.type) {
    case 'cash':
      return {
        type: 'cash',
        storageLocation: typeof s.storageLocation === 'string' ? s.storageLocation : undefined,
      };
    case 'bankAccount':
      return {
        type: 'bankAccount',
        bankName: typeof s.bankName === 'string' ? s.bankName : undefined,
        accountNumber: typeof s.accountNumber === 'string' ? s.accountNumber : undefined,
        cardNetwork: asEnum(CARD_NETWORKS, s.cardNetwork),
      };
    case 'eWallet':
      return {
        type: 'eWallet',
        provider: typeof s.provider === 'string' ? s.provider : undefined,
        accountIdentifier:
          typeof s.accountIdentifier === 'string' ? s.accountIdentifier : undefined,
      };
    case 'asset':
      return {
        type: 'asset',
        assetType: asEnum(ASSET_TYPES, s.assetType),
        description: typeof s.description === 'string' ? s.description : undefined,
      };
    case 'loan':
      return {
        type: 'loan',
        lender: typeof s.lender === 'string' ? s.lender : undefined,
        interestRate: typeof s.interestRate === 'number' ? s.interestRate : undefined,
        dueDate: typeof s.dueDate === 'string' ? s.dueDate : undefined,
      };
    default:
      return { type: 'cash' };
  }
}

export function fromAccountResponse(account: AccountResponse): EditAccountFormValues {
  return {
    name: account.name,
    currency: account.currency,
    overdraftLimit: account.overdraftLimit ?? undefined,
    subtype: normaliseSubtype(account.subtype),
  };
}
```

Import `AccountResponse` at the top of the file if not already.

- [ ] **Step B4.5: Run tests; verify they pass**

Run: `pnpm exec vitest run src/features/accounts/schema.test.ts`
Expected: PASS for all new and existing cases.

- [ ] **Step B4.6: Commit**

```bash
git add src/features/accounts/schema.ts src/features/accounts/schema.test.ts
git commit -m "feat(accounts): add editAccountFormSchema and fromAccountResponse"
```

---

### Task B6: TDD — adjust-balance schema + `toAdjustBalanceRequest`

**Files:**

- Create: `src/features/accounts/adjustBalanceSchema.ts`
- Create: `src/features/accounts/adjustBalanceSchema.test.ts`

Per spec §11.5 / §11.8.

- [ ] **Step B6.1: Write failing tests**

Create `src/features/accounts/adjustBalanceSchema.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { adjustBalanceFormSchema, toAdjustBalanceRequest } from './adjustBalanceSchema';

const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe('adjustBalanceFormSchema', () => {
  it('accepts a valid payload (today)', () => {
    expect(
      adjustBalanceFormSchema.safeParse({
        targetBalance: 100,
        reason: 'Bank reconcile',
        date: today,
      }).success,
    ).toBe(true);
  });

  it('accepts a past date', () => {
    expect(
      adjustBalanceFormSchema.safeParse({ targetBalance: 0, reason: 'foo', date: yesterday })
        .success,
    ).toBe(true);
  });

  it('rejects an empty reason', () => {
    expect(
      adjustBalanceFormSchema.safeParse({ targetBalance: 100, reason: '', date: today }).success,
    ).toBe(false);
  });

  it('rejects reason longer than 255 chars', () => {
    expect(
      adjustBalanceFormSchema.safeParse({
        targetBalance: 100,
        reason: 'x'.repeat(256),
        date: today,
      }).success,
    ).toBe(false);
  });

  it('rejects a future date', () => {
    expect(
      adjustBalanceFormSchema.safeParse({ targetBalance: 100, reason: 'foo', date: tomorrow })
        .success,
    ).toBe(false);
  });

  it('rejects a malformed date', () => {
    expect(
      adjustBalanceFormSchema.safeParse({ targetBalance: 100, reason: 'foo', date: 'not-a-date' })
        .success,
    ).toBe(false);
  });

  it('accepts targetBalance = 0 and negative values', () => {
    expect(
      adjustBalanceFormSchema.safeParse({ targetBalance: 0, reason: 'foo', date: today }).success,
    ).toBe(true);
    expect(
      adjustBalanceFormSchema.safeParse({ targetBalance: -50, reason: 'foo', date: today }).success,
    ).toBe(true);
  });
});

describe('toAdjustBalanceRequest', () => {
  it('converts the date input to <YYYY-MM-DD>T00:00:00.000Z', () => {
    expect(
      toAdjustBalanceRequest({ targetBalance: 100, reason: 'foo', date: '2025-12-01' }, 'USD'),
    ).toEqual({
      targetBalance: 100,
      currency: 'USD',
      date: '2025-12-01T00:00:00.000Z',
      reason: 'foo',
    });
  });
});
```

- [ ] **Step B6.2: Run; verify fail**

Run: `pnpm exec vitest run src/features/accounts/adjustBalanceSchema.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step B6.3: Implement `adjustBalanceSchema.ts`**

```ts
import { z } from 'zod';
import type { AdjustBalanceRequest } from '@/api/types';

export const adjustBalanceFormSchema = z
  .object({
    targetBalance: z.coerce.number().finite(),
    reason: z.string().trim().min(1, 'Reason is required').max(255),
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

export type AdjustBalanceFormValues = z.infer<typeof adjustBalanceFormSchema>;

export function toAdjustBalanceRequest(
  values: AdjustBalanceFormValues,
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

- [ ] **Step B6.4: Run; verify pass**

Run: `pnpm exec vitest run src/features/accounts/adjustBalanceSchema.test.ts`
Expected: PASS.

- [ ] **Step B6.5: Commit**

```bash
git add src/features/accounts/adjustBalanceSchema.ts src/features/accounts/adjustBalanceSchema.test.ts
git commit -m "feat(accounts): add adjust-balance form schema and DTO helper"
```

---

### Task B5: TDD — `diffAccount` helper

**Files:**

- Create: `src/features/accounts/diffAccount.ts`
- Create: `src/features/accounts/diffAccount.test.ts`

- [ ] **Step B5.1: Write the failing tests**

Create `src/features/accounts/diffAccount.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { diffAccount } from './diffAccount';
import type { EditAccountFormValues } from './schema';

const base: EditAccountFormValues = {
  name: 'Savings',
  currency: 'USD',
  overdraftLimit: undefined,
  subtype: { type: 'cash', storageLocation: 'wallet' },
};

describe('diffAccount', () => {
  it('returns empty diff when nothing changed', () => {
    expect(diffAccount(base, { ...base })).toEqual({});
  });

  it('emits name when name changes', () => {
    expect(diffAccount(base, { ...base, name: 'Checking' })).toEqual({
      name: 'Checking',
    });
  });

  it('emits overdraftLimit: null when overdraft is cleared', () => {
    const initial = { ...base, overdraftLimit: 100 };
    const next = { ...base, overdraftLimit: undefined };
    expect(diffAccount(initial, next)).toEqual({ overdraftLimit: null });
  });

  it('emits overdraftLimit: number when overdraft is set', () => {
    const next = { ...base, overdraftLimit: 100 };
    expect(diffAccount(base, next)).toEqual({ overdraftLimit: 100 });
  });

  it('emits full subtype when an optional field changes (same type)', () => {
    const next = {
      ...base,
      subtype: { type: 'cash', storageLocation: 'safe' } as const,
    };
    expect(diffAccount(base, next)).toEqual({
      subtype: { type: 'cash', storageLocation: 'safe' },
    });
  });

  it('emits full subtype when type changes (no carryover)', () => {
    const next: EditAccountFormValues = {
      ...base,
      subtype: { type: 'loan', lender: 'Bob' },
    };
    const result = diffAccount(base, next);
    expect(result.subtype).toEqual({ type: 'loan', lender: 'Bob' });
    // No storageLocation from the previous cash subtype
    expect((result.subtype as Record<string, unknown>).storageLocation).toBeUndefined();
  });

  it('treats undefined and empty-string string fields as equal', () => {
    const initial: EditAccountFormValues = {
      ...base,
      subtype: { type: 'cash', storageLocation: undefined },
    };
    const next: EditAccountFormValues = {
      ...base,
      subtype: { type: 'cash', storageLocation: '' } as never,
    };
    expect(diffAccount(initial, next)).toEqual({});
  });

  it('throws when currency mismatches', () => {
    expect(() => diffAccount(base, { ...base, currency: 'EUR' })).toThrow();
  });
});
```

- [ ] **Step B5.2: Run the tests; verify they fail**

Run: `pnpm exec vitest run src/features/accounts/diffAccount.test.ts`
Expected: FAIL — module not yet implemented.

- [ ] **Step B5.3: Implement `diffAccount.ts`**

Create `src/features/accounts/diffAccount.ts`:

```ts
import type { AccountSubtypeRequest } from '@/api/types';
import type { EditAccountFormValues } from './schema';

export interface AccountEditDiff {
  name?: string;
  // null = clear the overdraft limit (send body without overdraftLimit field)
  // undefined = no change
  overdraftLimit?: number | null;
  subtype?: AccountSubtypeRequest;
}

export function diffAccount(
  initial: EditAccountFormValues,
  next: EditAccountFormValues,
): AccountEditDiff {
  if (initial.currency !== next.currency) {
    throw new Error(
      `diffAccount: currency cannot change in edit mode (got ${initial.currency} → ${next.currency})`,
    );
  }
  const diff: AccountEditDiff = {};
  if (next.name !== initial.name) diff.name = next.name;
  if ((initial.overdraftLimit ?? null) !== (next.overdraftLimit ?? null)) {
    diff.overdraftLimit = next.overdraftLimit ?? null;
  }
  if (!subtypeEqual(initial.subtype, next.subtype)) {
    diff.subtype = next.subtype as AccountSubtypeRequest;
  }
  return diff;
}

export function subtypeEqual(
  a: EditAccountFormValues['subtype'],
  b: EditAccountFormValues['subtype'],
): boolean {
  if (a.type !== b.type) return false;
  const ar = a as unknown as Record<string, unknown>;
  const br = b as unknown as Record<string, unknown>;
  const keys = new Set([...Object.keys(ar), ...Object.keys(br)]);
  for (const k of keys) {
    if (k === 'type') continue;
    const av = ar[k];
    const bv = br[k];
    // String fields: undefined ≡ '' equivalence.
    const norm = (v: unknown) => (v === '' ? undefined : v);
    if (norm(av) !== norm(bv)) return false;
  }
  return true;
}
```

- [ ] **Step B5.4: Run tests; verify they pass**

Run: `pnpm exec vitest run src/features/accounts/diffAccount.test.ts`
Expected: PASS.

- [ ] **Step B5.5: Commit**

```bash
git add src/features/accounts/diffAccount.ts src/features/accounts/diffAccount.test.ts
git commit -m "feat(accounts): add diffAccount helper for edit submission"
```

---

# Part C: Web — form extraction

### Task C1: Extract `AccountForm` shared body

**Files:**

- Create: `src/features/accounts/AccountForm.tsx`
- Modify: `src/features/accounts/CreateAccountDialog.tsx`
- Existing: `src/features/accounts/CreateAccountDialog.test.tsx` (regression bar)

- [ ] **Step C1.1: Run existing CreateAccountDialog tests as baseline**

Run: `pnpm exec vitest run src/features/accounts/CreateAccountDialog.test.tsx`
Expected: PASS. Note test count.

- [ ] **Step C1.2: Create `AccountForm.tsx` skeleton**

Create `src/features/accounts/AccountForm.tsx` with the inner form body from `CreateAccountDialog.tsx` (lines ~125-296), parametrised by `mode`:

```tsx
import { useEffect, useState } from 'react';
import { useForm, FormProvider, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  createAccountFormSchema,
  editAccountFormSchema,
  type CreateAccountFormValues,
  type EditAccountFormValues,
} from './schema';
import { SubtypeFields } from './SubtypeFields';

const SUPPORTED = ['UAH', 'USD', 'EUR', 'GBP'] as const;

function RequiredMarker() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-destructive">
      *
    </span>
  );
}

export interface AccountFormProps {
  mode: 'create' | 'edit';
  defaultValues: CreateAccountFormValues | EditAccountFormValues;
  isSubmitting: boolean;
  bannerError?: string;
  onSubmit: (values: CreateAccountFormValues | EditAccountFormValues) => void | Promise<void>;
  onCancel: () => void;
  /**
   * Imperative API for the parent to assign per-field errors after a server
   * rejection (replaces the parent's direct form.setError access during the
   * extraction).
   */
  onReady?: (api: {
    setFieldError: (field: string, message: string) => void;
    revealAdvanced: () => void;
  }) => void;
}

export function AccountForm(props: AccountFormProps) {
  const { mode, defaultValues, isSubmitting, bannerError, onSubmit, onCancel, onReady } = props;
  const [showAdvanced, setShowAdvanced] = useState(false);

  const schema = mode === 'create' ? createAccountFormSchema : editAccountFormSchema;
  const form = useForm<CreateAccountFormValues | EditAccountFormValues>({
    resolver: zodResolver(schema) as Resolver<CreateAccountFormValues | EditAccountFormValues>,
    defaultValues,
  });

  useEffect(() => {
    onReady?.({
      setFieldError: (field, message) =>
        form.setError(field as 'name', { type: 'server', message }),
      revealAdvanced: () => setShowAdvanced(true),
    });
  }, [form, onReady]);

  // Auto-expand "More options" when overdraftLimit has an error
  useEffect(() => {
    if (form.formState.errors.overdraftLimit && !showAdvanced) {
      setShowAdvanced(true);
    }
  }, [form.formState.errors.overdraftLimit, showAdvanced]);

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <FormProvider {...form}>
      {bannerError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{bannerError}</AlertDescription>
        </Alert>
      )}
      <form
        onSubmit={(e) => {
          void submit(e);
        }}
        className="space-y-4"
      >
        {/* Name */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Name
                <RequiredMarker />
              </FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Initial balance — only in create mode */}
        {mode === 'create' && (
          <FormField
            control={form.control}
            name={'initialBalance' as 'name' /* see note */}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Initial balance
                  <RequiredMarker />
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="any"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={
                      field.value === undefined ||
                      field.value === null ||
                      (typeof field.value === 'number' && Number.isNaN(field.value))
                        ? ''
                        : (field.value as number | string)
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '' || raw === '-') {
                        field.onChange(raw);
                        return;
                      }
                      const n = e.target.valueAsNumber;
                      field.onChange(Number.isNaN(n) ? raw : n);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Currency: enabled <Select> in create; disabled <Input> in edit */}
        {mode === 'create' ? (
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Currency
                  <RequiredMarker />
                </FormLabel>
                <FormControl>
                  <Select onValueChange={field.onChange} value={field.value as string}>
                    <SelectTrigger aria-label="Currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Currency</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    value={(field.value as string) ?? ''}
                    disabled
                    aria-label="Currency"
                    title="Cannot be changed after creation"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* More options */}
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-sm text-muted-foreground underline"
        >
          {showAdvanced ? 'Hide' : 'More options'}
        </button>
        {showAdvanced && (
          <FormField
            control={form.control}
            name="overdraftLimit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Overdraft limit</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="any"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={(field.value as number | undefined) ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? undefined : e.target.valueAsNumber)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Account type */}
        <FormField
          control={form.control}
          name="subtype.type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Account type
                <RequiredMarker />
              </FormLabel>
              <FormControl>
                <Select
                  onValueChange={(value) =>
                    form.resetField('subtype', { defaultValue: { type: value as 'cash' } })
                  }
                  value={field.value as string}
                >
                  <SelectTrigger aria-label="Account type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="bankAccount">Bank account</SelectItem>
                    <SelectItem value="eWallet">E-wallet</SelectItem>
                    <SelectItem value="asset">Asset</SelectItem>
                    <SelectItem value="loan">Loan</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <SubtypeFields />

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'OK'}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
```

Notes:

- The TS cast `'initialBalance' as 'name'` works around the union-typed form values; replace with a properly discriminated overload if your linter complains.
- `SubtypeFields.tsx` already reads `useFormContext<CreateAccountFormValues>().watch('subtype.type')` — it works for `EditAccountFormValues` because `subtype` has the same shape in both. No change needed.

- [ ] **Step C1.3: Rewrite `CreateAccountDialog.tsx` to use `AccountForm`**

Replace the inner form body in `src/features/accounts/CreateAccountDialog.tsx` with `<AccountForm mode="create" …>`. Keep all wrapper behaviour (post-success navigate, banner, `onOpenChange`, default currency from `useConfiguration`, `setError` mapping). The dialog becomes thin:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ApiError } from '@/api/client';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { toCreateAccountRequest, type CreateAccountFormValues } from './schema';
import { useCreateAccount } from './useCreateAccount';
import { AccountForm } from './AccountForm';

const SUPPORTED = ['UAH', 'USD', 'EUR', 'GBP'] as const;
type SupportedCurrency = (typeof SUPPORTED)[number];

export interface CreateAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateAccountDialog({ open, onOpenChange }: CreateAccountDialogProps) {
  const navigate = useNavigate();
  const { data: config } = useConfiguration();
  const defaultCurrency: SupportedCurrency = (SUPPORTED as readonly string[]).includes(
    config?.defaultCurrency ?? '',
  )
    ? (config!.defaultCurrency as SupportedCurrency)
    : 'USD';

  const create = useCreateAccount();
  const [formApi, setFormApi] = useState<{
    setFieldError: (field: string, message: string) => void;
    revealAdvanced: () => void;
  } | null>(null);

  const showBanner =
    create.isError && !(create.error instanceof ApiError && create.error.fieldErrors);
  const bannerMessage =
    create.error instanceof ApiError
      ? create.error.message
      : 'Something went wrong. Please try again.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create account</DialogTitle>
          <DialogDescription>
            Add a new account to track balances and transactions.
          </DialogDescription>
        </DialogHeader>
        <AccountForm
          mode="create"
          defaultValues={{
            name: '',
            currency: defaultCurrency,
            initialBalance: 0,
            overdraftLimit: undefined,
            subtype: { type: 'cash' },
          }}
          isSubmitting={create.isPending}
          bannerError={showBanner ? bannerMessage : undefined}
          onReady={setFormApi}
          onSubmit={async (values) => {
            try {
              const account = await create.mutateAsync(
                toCreateAccountRequest(values as CreateAccountFormValues),
              );
              onOpenChange(false);
              navigate(`/accounts/${account.id}`);
            } catch (e) {
              if (e instanceof ApiError && e.fieldErrors) {
                for (const [field, message] of Object.entries(e.fieldErrors)) {
                  formApi?.setFieldError(field, message);
                }
                if ('overdraftLimit' in e.fieldErrors) formApi?.revealAdvanced();
              }
            }
          }}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step C1.4: Run existing CreateAccountDialog tests**

Run: `pnpm exec vitest run src/features/accounts/CreateAccountDialog.test.tsx`
Expected: PASS with the same test count as Step C1.1. If anything regresses, fix the extraction — the test is the spec of behavior here.

- [ ] **Step C1.5: Run typecheck and lint**

Run: `pnpm typecheck && pnpm lint`
Expected: PASS. (The `'initialBalance' as 'name'` cast may need refinement; if lint complains, add a properly typed overload to `AccountForm`.)

- [ ] **Step C1.6: Commit**

```bash
git add src/features/accounts/AccountForm.tsx src/features/accounts/CreateAccountDialog.tsx
git commit -m "refactor(accounts): extract AccountForm shared body"
```

---

# Part D: Web — edit dialog and hook

### Task D1: `useAccountById`

**Files:**

- Create: `src/features/accounts/useAccountById.ts`

- [ ] **Step D1.1: Implement**

```ts
import type { UUID } from '@/api/types';
import { useAccounts } from './useAccounts';

export function useAccountById(id: UUID | undefined) {
  const accounts = useAccounts();
  return {
    ...accounts,
    data: id ? accounts.data?.find((a) => a.id === id) : undefined,
  };
}
```

- [ ] **Step D1.2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step D1.3: Commit**

```bash
git add src/features/accounts/useAccountById.ts
git commit -m "feat(accounts): add useAccountById hook"
```

---

### Task D2: `useEditAccount` mutation hook

**Files:**

- Create: `src/features/accounts/useEditAccount.ts`

- [ ] **Step D2.1: Implement**

```ts
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiClient } from '@/api/client';
import { accountsApi } from '@/api/accounts';
import type { AccountResponse, UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';
import type { AccountEditDiff } from './diffAccount';

const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

export interface EditAccountVars {
  diff: AccountEditDiff;
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

      const current = queryClient
        .getQueryData<AccountResponse[]>(['accounts'])
        ?.find((a) => a.id === id);
      if (!current) {
        throw new Error(`useEditAccount: account ${id} not in cache`);
      }

      if (diff.name !== undefined) {
        await api.rename(id, { name: diff.name });
        patchCachedAccount(queryClient, id, { name: diff.name });
        onSubCallApplied();
      }
      if (diff.overdraftLimit !== undefined) {
        await api.updateOverdraftLimit(id, {
          overdraftLimit: diff.overdraftLimit === null ? undefined : diff.overdraftLimit,
          currency: current.currency,
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
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

function patchCachedAccount(queryClient: QueryClient, id: UUID, patch: Partial<AccountResponse>) {
  queryClient.setQueryData<AccountResponse[] | undefined>(['accounts'], (list) =>
    list?.map((a) => (a.id === id ? { ...a, ...patch } : a)),
  );
}
```

- [ ] **Step D2.2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step D2.3: Commit**

```bash
git add src/features/accounts/useEditAccount.ts
git commit -m "feat(accounts): add useEditAccount mutation hook"
```

---

### Task D3: MSW default handlers for edit + adjust-balance endpoints

**Files:**

- Modify: `src/test/handlers.ts`

- [ ] **Step D3.1: Add default success handlers**

So that any component test that incidentally fires these endpoints doesn't trip MSW's `onUnhandledRequest: 'error'`. Read the existing handlers file for the canonical pattern; add new HTTP `put` handlers. Use absolute URLs with the existing `apiBase` constant to match the file's existing style:

```ts
http.put('http://localhost:8080/api/accounts/:id/name', () => new HttpResponse(null, { status: 200 })),
http.put('http://localhost:8080/api/accounts/:id/overdraft-limit', () => new HttpResponse(null, { status: 200 })),
http.put('http://localhost:8080/api/accounts/:id/type', () => new HttpResponse(null, { status: 200 })),
http.put('http://localhost:8080/api/accounts/:id/balance', () =>
  // Return a minimal TransactionResponse-shaped body for the default;
  // per-test overrides can return more realistic data.
  HttpResponse.json({
    id: 'tx-0',
    sourceAccountId: 'a1',
    targetAccountId: 'a1',
    sourceAmount: 0,
    sourceCurrency: 'USD',
    targetAmount: 0,
    targetCurrency: 'USD',
    exchangeRate: null,
    description: 'Adjustment',
    status: 'Completed',
    failureReason: null,
    transferType: 'Adjustment',
    category: null,
    date: '2025-01-01T00:00:00.000Z',
    labels: [],
  }),
),
```

Per-test overrides go through `server.use(...)` and reset automatically.

- [ ] **Step D3.2: Run the full test suite**

Run: `pnpm test`
Expected: PASS — no test should depend on these endpoints failing.

- [ ] **Step D3.3: Commit**

```bash
git add src/test/handlers.ts
git commit -m "test(accounts): default MSW handlers for edit endpoints"
```

---

### Task D4: TDD — `EditAccountDialog` (incremental)

**Files:**

- Create: `src/features/accounts/EditAccountDialog.test.tsx`
- Create: `src/features/accounts/EditAccountDialog.tsx`

Implement in TDD-order: write one component test → implement → repeat. Below the tests are listed in the same order as the spec's §8.3.

- [ ] **Step D4.1: Write tests file with cases 1, 2 (open + empty name)**

Create `src/features/accounts/EditAccountDialog.test.tsx`.

**Setup pattern (read first):** `renderWithProviders` from `src/test/utils.tsx` only wires `QueryClient + MemoryRouter` — **it does NOT wire `AuthProvider`**. Wrap the component manually, mirroring `TransactionsPane.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '@/test/server';
import { renderWithProviders, makeQueryClient } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { EditAccountDialog } from './EditAccountDialog';
import type { AccountResponse } from '@/api/types';

const fixture: AccountResponse = {
  id: 'a1',
  name: 'Savings',
  balance: 100,
  currency: 'USD',
  overdraftLimit: null,
  subtype: { type: 'cash', storageLocation: 'wallet' },
  version: 1,
};

function ui(account: AccountResponse) {
  return (
    <AuthProvider>
      <EditAccountDialog open onOpenChange={() => {}} account={account} />
    </AuthProvider>
  );
}

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
});

describe('EditAccountDialog', () => {
  it('opens with values populated from the account', () => {
    const qc = makeQueryClient();
    qc.setQueryData(['accounts'], [fixture]);
    renderWithProviders(ui(fixture), { queryClient: qc });
    expect(screen.getByLabelText(/name/i)).toHaveValue('Savings');
    expect(screen.getByLabelText(/currency/i)).toBeDisabled();
    // …
  });

  it('rejects empty name without firing API', async () => {
    const qc = makeQueryClient();
    qc.setQueryData(['accounts'], [fixture]);
    let called = false;
    server.use(
      http.put('http://localhost:8080/api/accounts/a1/name', () => {
        called = true;
        return new HttpResponse(null, { status: 200 });
      }),
    );
    renderWithProviders(ui(fixture), { queryClient: qc });
    const nameInput = screen.getByLabelText(/name/i);
    await userEvent.clear(nameInput);
    await userEvent.click(screen.getByRole('button', { name: /ok/i }));
    await waitFor(() => expect(screen.getByText(/name is required/i)).toBeInTheDocument());
    expect(called).toBe(false);
  });
});
```

Use `http.put('http://localhost:8080/api/accounts/...')` (absolute URL with the `apiBase` constant from existing tests) — match the style of `TransactionsPane.test.tsx`. Per-test `server.use(...)` calls must live **inside `it` / `beforeEach`**, not at module scope, because `setup.ts` calls `server.resetHandlers()` after each test.

Cases 1 and 2 only — write these and let them fail first.

- [ ] **Step D4.2: Run; verify fail**

Run: `pnpm exec vitest run src/features/accounts/EditAccountDialog.test.tsx`
Expected: FAIL — file does not exist.

- [ ] **Step D4.3: Implement `EditAccountDialog.tsx`**

```tsx
import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { ApiError } from '@/api/client';
import type { AccountResponse } from '@/api/types';
import { fromAccountResponse, type EditAccountFormValues } from './schema';
import { diffAccount } from './diffAccount';
import { useEditAccount } from './useEditAccount';
import { AccountForm } from './AccountForm';

export interface EditAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AccountResponse;
}

export function EditAccountDialog({ open, onOpenChange, account }: EditAccountDialogProps) {
  const edit = useEditAccount(account.id);
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
  const [formApi, setFormApi] = useState<{
    setFieldError: (field: string, message: string) => void;
    revealAdvanced: () => void;
  } | null>(null);

  const showBanner = edit.isError && !(edit.error instanceof ApiError && edit.error.fieldErrors);
  const bannerMessage =
    edit.error instanceof ApiError ? edit.error.message : 'Something went wrong. Please try again.';

  return (
    <AccountForm
      mode="edit"
      defaultValues={defaultValues}
      isSubmitting={edit.isPending}
      bannerError={showBanner ? bannerMessage : undefined}
      onReady={setFormApi}
      onSubmit={async (values) => {
        try {
          const diff = diffAccount(defaultValues, values as EditAccountFormValues);
          await edit.mutateAsync({ diff, onSubCallApplied });
          onClose();
        } catch (e) {
          if (e instanceof ApiError && e.fieldErrors) {
            for (const [field, message] of Object.entries(e.fieldErrors)) {
              formApi?.setFieldError(field, message);
            }
            if ('overdraftLimit' in e.fieldErrors) formApi?.revealAdvanced();
          }
        }
      }}
      onCancel={onClose}
    />
  );
}
```

- [ ] **Step D4.4: Run; verify cases 1–2 pass**

Run: `pnpm exec vitest run src/features/accounts/EditAccountDialog.test.tsx`
Expected: PASS for the two cases.

- [ ] **Step D4.5: Add cases 3, 4, 5 (single-PUT, ordered PUTs, subtype PUT)**

Add to the test file. Use a shared array pattern for ordered-PUT assertion. **Both the array reset and the `server.use(...)` calls must be inside `beforeEach`** (or inside each `it`) — `setup.ts` calls `server.resetHandlers()` after each test, so module-scope `server.use(...)` would only apply to the first test.

```ts
const requestPaths: string[] = [];

beforeEach(() => {
  requestPaths.length = 0;
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  server.use(
    http.put('http://localhost:8080/api/accounts/:id/name', async ({ request }) => {
      requestPaths.push(new URL(request.url).pathname);
      return new HttpResponse(null, { status: 200 });
    }),
    http.put('http://localhost:8080/api/accounts/:id/overdraft-limit', async ({ request }) => {
      requestPaths.push(new URL(request.url).pathname);
      return new HttpResponse(null, { status: 200 });
    }),
    http.put('http://localhost:8080/api/accounts/:id/type', async ({ request }) => {
      requestPaths.push(new URL(request.url).pathname);
      return new HttpResponse(null, { status: 200 });
    }),
  );
});
```

Case 4 asserts `requestPaths` equals `['/api/accounts/a1/name', '/api/accounts/a1/overdraft-limit']`.

- [ ] **Step D4.6: Run; verify all five cases pass**

Run: `pnpm exec vitest run src/features/accounts/EditAccountDialog.test.tsx`
Expected: PASS.

- [ ] **Step D4.7: Add cases 6, 7 (field error mapping; partial-save invariant)**

Case 7 is load-bearing: rename succeeds, overdraft-limit returns 500. Assert:

- banner visible with the 500 message
- dialog open
- cached `['accounts']` row's name updated
- the rendered name `<input>` shows the new name (because `editEpoch` bumped → remount → new defaults)
- second submit (no further user edits) fires exactly one PUT: the overdraft-limit PUT — verify via `requestPaths` containing only the overdraft path after the second submit.

```ts
// Pseudocode for the second-submit phase:
await user.click(submit);
expect(requestPaths).toEqual([
  `/api/accounts/${id}/name`,
  `/api/accounts/${id}/overdraft-limit`,
  `/api/accounts/${id}/overdraft-limit`,
]);
// (first attempt: name then overdraft; second attempt: only overdraft)
```

- [ ] **Step D4.8: Run; verify cases 6–7 pass**

Run: `pnpm exec vitest run src/features/accounts/EditAccountDialog.test.tsx`
Expected: PASS.

- [ ] **Step D4.9: Add cases 8, 9 (close-reopen freshness; currency in body)**

Case 9: edit name+overdraft, capture the body of the overdraft PUT, assert it includes `currency: account.currency`. Use `await request.json()` inside the MSW handler to read the body.

- [ ] **Step D4.10: Run; verify all 9 cases pass**

Run: `pnpm exec vitest run src/features/accounts/EditAccountDialog.test.tsx`
Expected: PASS.

- [ ] **Step D4.11: Commit**

```bash
git add src/features/accounts/EditAccountDialog.tsx src/features/accounts/EditAccountDialog.test.tsx
git commit -m "feat(accounts): add EditAccountDialog with diff-and-fire submission"
```

---

### Task D5: `useAdjustBalance` mutation hook

**Files:**

- Create: `src/features/accounts/useAdjustBalance.ts`

Per spec §11.4.

- [ ] **Step D5.1: Implement**

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '@/api/client';
import { accountsApi } from '@/api/accounts';
import type { AdjustBalanceRequest, TransactionResponse, UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

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

- [ ] **Step D5.2: Run typecheck**

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step D5.3: Commit**

```bash
git add src/features/accounts/useAdjustBalance.ts
git commit -m "feat(accounts): add useAdjustBalance mutation hook"
```

---

### Task D6: TDD — `AdjustBalanceDialog`

**Files:**

- Create: `src/features/accounts/AdjustBalanceDialog.tsx`
- Create: `src/features/accounts/AdjustBalanceDialog.test.tsx`

Per spec §11.6 / §11.8. Follow the test-setup pattern from D4.1 (`AuthProvider` wrap, `beforeEach` `server.use(...)`, seed `['accounts']` cache).

- [ ] **Step D6.1: Write failing tests (cases 1–3 of §11.8)**

Cases:

1. Opens with `targetBalance` prefilled to `account.balance`, `date` to today, `reason` empty.
2. Empty reason → field error, no API call.
3. Future date → field error, no API call.

Use the test setup pattern from `EditAccountDialog.test.tsx` (AuthProvider wrap, account fixture seeded into `['accounts']`, MSW handlers in `beforeEach`).

- [ ] **Step D6.2: Run; verify fail**

Run: `pnpm exec vitest run src/features/accounts/AdjustBalanceDialog.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step D6.3: Implement `AdjustBalanceDialog.tsx`**

```tsx
import { useMemo, useState } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { ApiError } from '@/api/client';
import type { AccountResponse } from '@/api/types';
import { formatMoney } from '@/lib/format';
import {
  adjustBalanceFormSchema,
  toAdjustBalanceRequest,
  type AdjustBalanceFormValues,
} from './adjustBalanceSchema';
import { useAdjustBalance } from './useAdjustBalance';

export interface AdjustBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AccountResponse;
}

export function AdjustBalanceDialog({ open, onOpenChange, account }: AdjustBalanceDialogProps) {
  const adjust = useAdjustBalance(account.id);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const form = useForm<AdjustBalanceFormValues>({
    resolver: zodResolver(adjustBalanceFormSchema),
    defaultValues: {
      targetBalance: account.balance,
      reason: '',
      date: today,
    },
  });

  const showBanner =
    adjust.isError && !(adjust.error instanceof ApiError && adjust.error.fieldErrors);
  const bannerMessage =
    adjust.error instanceof ApiError
      ? adjust.error.message
      : 'Something went wrong. Please try again.';

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await adjust.mutateAsync(toAdjustBalanceRequest(values, account.currency));
      onOpenChange(false);
      form.reset();
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          form.setError(field as keyof AdjustBalanceFormValues, {
            type: 'server',
            message,
          });
        }
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust balance</DialogTitle>
          <DialogDescription>
            Record a balance adjustment as a synthetic transaction.
          </DialogDescription>
        </DialogHeader>
        {showBanner && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{bannerMessage}</AlertDescription>
          </Alert>
        )}
        <FormProvider {...form}>
          <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
            <div className="text-sm text-muted-foreground">
              Current balance: {formatMoney(account.balance, account.currency)}
            </div>

            <FormField
              control={form.control}
              name="targetBalance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Target balance</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="any"
                      name={field.name}
                      ref={field.ref}
                      onBlur={field.onBlur}
                      value={
                        field.value === undefined ||
                        field.value === null ||
                        (typeof field.value === 'number' && Number.isNaN(field.value))
                          ? ''
                          : field.value
                      }
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '' || raw === '-') {
                          field.onChange(raw);
                          return;
                        }
                        const n = e.target.valueAsNumber;
                        field.onChange(Number.isNaN(n) ? raw : n);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="reason"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reason</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" max={today} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={adjust.isPending}>
                {adjust.isPending ? 'Saving…' : 'OK'}
              </Button>
            </div>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step D6.4: Run; verify cases 1–3 pass**

Run: `pnpm exec vitest run src/features/accounts/AdjustBalanceDialog.test.tsx`
Expected: PASS.

- [ ] **Step D6.5: Add cases 4–6**

Cases: 4. Happy path: fires `PUT /api/accounts/:id/balance` with the exact body shape (assert `date === '<today>T00:00:00.000Z'`, `currency === account.currency`, `targetBalance` matches input, `reason` matches input). On success: dialog closes; both `['accounts']` and `['transactions', accountId]` are invalidated (assert by mounting a fresh observer or by checking query state). 5. Server returns `400` with `fieldErrors: { targetBalance: 'Target balance equals current balance at this date' }` → field error on `targetBalance`, dialog stays open, no cache invalidation. 6. Server returns `400` with `fieldErrors: { date: 'Adjustment date must be in the past or present' }` → field error on `date`, dialog stays open.

- [ ] **Step D6.6: Run; verify all six cases pass**

Run: `pnpm exec vitest run src/features/accounts/AdjustBalanceDialog.test.tsx`
Expected: PASS.

- [ ] **Step D6.7: Commit**

```bash
git add src/features/accounts/AdjustBalanceDialog.tsx src/features/accounts/AdjustBalanceDialog.test.tsx
git commit -m "feat(accounts): add AdjustBalanceDialog"
```

---

# Part E: Web — account header + pane wiring

### Task E1: TDD — `AccountHeader`

**Files:**

- Create: `src/features/transactions/AccountHeader.tsx`
- Create: `src/features/transactions/AccountHeader.test.tsx`

- [ ] **Step E1.1: Write failing tests**

Cases (spec §8.3 + §11.8):

1. Renders name, subtype label, formatted balance for a `cash` account.
2. Renders **two** buttons: "Edit" and "Adjust balance".
3. Clicking "Edit" opens the Edit dialog (assert "Edit account" dialog title appears).
4. Clicking "Adjust balance" opens the Adjust-balance dialog (assert "Adjust balance" dialog title appears).
5. Parametrised: renders the correct human-readable label for each subtype.

Wrap the component manually with `<AuthProvider>` (like `TransactionsPane.test.tsx`) and seed `['accounts']` with a fixture in each test (or in `beforeEach`). `renderWithProviders` does not provide `AuthProvider`.

- [ ] **Step E1.2: Run; verify fail**

Run: `pnpm exec vitest run src/features/transactions/AccountHeader.test.tsx`
Expected: FAIL — component does not exist.

- [ ] **Step E1.3: Implement**

```tsx
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { AccountResponse, AccountSubtypeKind } from '@/api/types';
import { formatMoney } from '@/lib/format';
import { EditAccountDialog } from '@/features/accounts/EditAccountDialog';
import { AdjustBalanceDialog } from '@/features/accounts/AdjustBalanceDialog';

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
  const [adjusting, setAdjusting] = useState(false);
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
        <Button variant="outline" size="sm" onClick={() => setAdjusting(true)}>
          Adjust balance
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
          Edit
        </Button>
      </div>
      <EditAccountDialog open={editing} onOpenChange={setEditing} account={account} />
      <AdjustBalanceDialog open={adjusting} onOpenChange={setAdjusting} account={account} />
    </div>
  );
}
```

- [ ] **Step E1.4: Run; verify pass**

Run: `pnpm exec vitest run src/features/transactions/AccountHeader.test.tsx`
Expected: PASS.

- [ ] **Step E1.5: Commit**

```bash
git add src/features/transactions/AccountHeader.tsx src/features/transactions/AccountHeader.test.tsx
git commit -m "feat(accounts): add AccountHeader with edit entry point"
```

---

### Task E2: TDD — wire `AccountHeader` into `TransactionsPane`

**Files:**

- Modify: `src/features/transactions/TransactionsPane.tsx`
- Modify: `src/features/transactions/TransactionsPane.test.tsx`

- [ ] **Step E2.1: Write failing tests for the three new states**

In `TransactionsPane.test.tsx`, add cases:

1. With an account id in URL and `['accounts']` populated → header renders above the transactions area (assert by role / heading name).
2. With an account id in URL but `['accounts']` still loading → header skeleton renders.
3. With an account id not found in a resolved `['accounts']` list → no header rendered.

Use existing memory-router patterns from the file (route to `/accounts/<id>`).

- [ ] **Step E2.2: Run; verify fail**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx`
Expected: new tests FAIL, existing tests still PASS.

- [ ] **Step E2.3: Implement integration in `TransactionsPane.tsx`**

The existing component uses **early `return` statements** for the placeholder/loading/error/empty states (`TransactionsPane.tsx:19–44`). Refactor so that the header (or its skeleton) renders **above** every state that includes an account id, i.e., above loading / error / empty / populated — but **not** above the "Select an account." placeholder which fires when `!id`.

Restructure to a single wrapper that always wraps the inner content, with the header on top:

```tsx
import { useAccountById } from '@/features/accounts/useAccountById';
import { AccountHeader } from './AccountHeader';

export function TransactionsPane() {
  const { id } = useParams<{ id?: string }>();
  const { data: transactions, isLoading, isError, refetch } = useTransactions(id);
  const { data: account, isLoading: accountLoading } = useAccountById(id);
  const { data: configuration } = useConfiguration();
  const categoryNameById = useDictionaryEntryNames(configuration);

  // No account in URL → existing placeholder, no header.
  if (!id) return <div className="p-6 text-muted-foreground">Select an account.</div>;

  // Header bar (or skeleton) above all id-present states.
  const header = account ? (
    <AccountHeader account={account} />
  ) : accountLoading ? (
    <div className="border-b px-4 py-3">
      <Skeleton className="h-8 w-full" />
    </div>
  ) : null; // account not in cache (id not found post-resolve) — no header.

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div className="space-y-2 p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  } else if (isError) {
    body = (
      <div className="space-y-2 p-4">
        <Alert role="alert" variant="destructive">
          <AlertDescription>Could not load transactions.</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  } else if (!transactions || transactions.length === 0) {
    body = <div className="p-6 text-muted-foreground">No transactions yet.</div>;
  } else {
    body = <table className="w-full text-sm">{/* existing thead/tbody, unchanged */}</table>;
  }

  return (
    <>
      {header}
      {body}
    </>
  );
}
```

Keep the existing table markup verbatim — only the surrounding scaffolding changes.

- [ ] **Step E2.4: Run; verify all tests pass**

Run: `pnpm exec vitest run src/features/transactions/TransactionsPane.test.tsx`
Expected: PASS.

- [ ] **Step E2.5: Commit**

```bash
git add src/features/transactions/TransactionsPane.tsx src/features/transactions/TransactionsPane.test.tsx
git commit -m "feat(accounts): show AccountHeader above transactions"
```

---

# Part F: Verification

### Task F1: Full verification

- [ ] **Step F1.1: Run all checks**

Run: `just check`
Expected: PASS (typecheck + lint + format-check).

- [ ] **Step F1.2: Run all tests**

Run: `just test`
Expected: PASS.

- [ ] **Step F1.3: Run build**

Run: `just build`
Expected: clean build, no errors.

- [ ] **Step F1.4: Manual smoke (optional, recommended)**

Start `just run` and the backend dev server. With both running:

- Open the app, sign in, create an account, then edit it: rename it, switch its type, change the overdraft limit. Verify each save.
- Trigger a partial-failure scenario: open browser devtools, throttle/block the overdraft-limit PUT, attempt to edit name+overdraft. Verify the name persists and re-submit retries only the overdraft PUT.

- [ ] **Step F1.5: Push branch and (optionally) open a PR**

```bash
git push -u origin feat/edit-account
gh pr create --title "feat(accounts): edit account (name, type, subtype fields, overdraft limit)" --body "$(cat <<'EOF'
## Summary

Implements [#12](https://github.com/homeaccounting/web/issues/12). Adds an account header bar above the transactions list with an Edit button that opens a dialog letting the user change name, account type, subtype optional fields, and overdraft limit. Currency stays immutable; initialBalance is not editable.

Backend changes (separate PR in the `backend` repo): new `PUT /api/accounts/:id/name` endpoint with `RenameAccount` command/event. Existing `PUT /api/accounts/:id/type` and `PUT /api/accounts/:id/overdraft-limit` endpoints are reused.

Partial-save invariant: each successful sub-call patches the cached `['accounts']` row and bumps a dialog-local `editEpoch` counter to remount the form with fresh defaults; the next submit's diff is correct.

## Test plan

- [ ] `just check` passes
- [ ] `just test` passes
- [ ] manual: rename → type change → overdraft change → currency disabled
- [ ] manual: partial failure (block overdraft PUT in devtools) → second submit fires only the failing call
EOF
)"
```

Confirm with the user before pushing or creating the PR — they may want to bundle with the backend PR or review the branch locally first.

---

## Done

This plan delivers the full edit-account feature per `docs/specs/2026-05-11-edit-account-design.md`. Out-of-scope items (balance adjustments, currency change, sharing, e2e, metadata, version-based concurrency) are deferred per §10 of the spec.
