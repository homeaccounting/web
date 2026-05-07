# Create Account — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the first write path on the web client — a modal "Create account" form that supports all five backend subtypes — and a small backend rule that rejects negative `initialBalance` unless an overdraft limit covers it.

**Architecture:** Two coordinated changes across two repos. Backend (Haskell/Servant) gets a web-layer pre-check that emits a per-field `ValidationErr` plus a defense-in-depth domain handler check. Web (React/Vite/TypeScript) gets an enhanced `ApiClient` that parses `fieldErrors` from response bodies, a new `useCreateAccount` mutation, a discriminated-union zod schema for the form, a vendored shadcn `Dialog`/`Select`/`Form` set, and a controlled `CreateAccountDialog` opened from `AccountsPane`.

**Tech Stack:**

- **Backend:** Haskell, Servant, hspec, hspec-discover, ormolu, hlint, `cabal test`
- **Web:** React 18, Vite 6, TypeScript (strict), TanStack Query 5, react-hook-form 7 + zod 3 + `@hookform/resolvers`, Radix UI primitives via shadcn, Tailwind, Vitest 3 + @testing-library + MSW 2

**Spec:** `web/docs/specs/2026-05-06-create-account-design.md`

**Repos and branches**

| Repo                     | Branch                                       | PR title                                                                   |
| ------------------------ | -------------------------------------------- | -------------------------------------------------------------------------- |
| `homeaccounting/web`     | `feat/create-account` (already exists)       | `feat: create account dialog with all subtypes`                            |
| `homeaccounting/backend` | `feat/negative-balance-overdraft-rule` (new) | `feat(account): reject negative initialBalance unless overdraft covers it` |

Backend changes (Phase 1) ship as their own PR first, since the web work depends on the new field-error response shape. Web changes (Phases 2–3) come second.

---

## Phase 1 — Backend (`backend/`)

All commands run from `/Users/oleksandrsy/Projects/Self/HomeAccounting/backend`. Format with `just format`, lint with `just lint`, run tests with `just test`. PostgreSQL is required for integration tests — start it once with `just db-up` if not already running.

### Task 1: Branch off backend repo

**Files:** none (git operation).

- [ ] **Step 1: Create the backend feature branch**

```bash
cd /Users/oleksandrsy/Projects/Self/HomeAccounting/backend
git checkout master
git pull --ff-only
git checkout -b feat/negative-balance-overdraft-rule
```

Expected: `Switched to a new branch 'feat/negative-balance-overdraft-rule'`.

---

### Task 2: Add the new domain error variant (TDD: extend `CreateAccount` cases)

**Files:**

- Modify: `backend/src/Domain/Account/CommandHandler.hs:68-81` (add the new constructor)
- Modify: `backend/src/Domain/Account/CommandHandler.hs:142-165` (add the rule in `handleAccountCommand`)
- Test: `backend/test/Domain/Account/CommandHandlerSpec.hs` (add seven `it` cases inside `createAccountSpec`)

This single task adds both the domain variant and the rule, because the rule is what the new variant is for. The seven test cases come first (TDD).

- [ ] **Step 1: Add seven failing test cases to `createAccountSpec`**

Add a new `context "Given empty account, when initial balance is negative"` block at the end of `createAccountSpec` in `backend/test/Domain/Account/CommandHandlerSpec.hs`. The block follows the existing case structure (look at `createAccountSpec` around line 100 for the shape — `let account = emptyAccount`, `let command = CreateAccountAccountCommand $ CreateAccount {...}`, `let result = handleAccountCommand account command`, then assertions).

The seven cases (matching spec §2.5 cases 1–7):

```haskell
context "Given empty account, when applying CreateAccount with various balance/limit combinations" $ do
  it "Then accepts positive balance with no limit" $ do
    -- (case 1) initialBalance > 0, overdraftLimit = Nothing → Right
  it "Then accepts positive balance with limit" $ do
    -- (case 2) initialBalance > 0, overdraftLimit = Just (Just (mockMoney 50)) → Right
  it "Then accepts zero balance" $ do
    -- (case 3) initialBalance = mockMoney 0, overdraftLimit = Nothing → Right
  it "Then rejects negative balance with no limit" $ do
    -- (case 4) initialBalance = mockMoney (-100), overdraftLimit = Nothing
    --         → Left NegativeInitialBalanceExceedsOverdraftLimit
  it "Then rejects negative balance when |balance| > limit" $ do
    -- (case 5) initialBalance = mockMoney (-100), overdraftLimit = Just (Just (mockMoney 50))
    --         → Left NegativeInitialBalanceExceedsOverdraftLimit
  it "Then accepts negative balance when |balance| < limit" $ do
    -- (case 6) initialBalance = mockMoney (-50), overdraftLimit = Just (Just (mockMoney 100)) → Right
  it "Then accepts negative balance when |balance| == limit" $ do
    -- (case 7) initialBalance = mockMoney (-100), overdraftLimit = Just (Just (mockMoney 100)) → Right
```

Each case should follow the same shape as the existing tests around line 104–127: build the command, call `handleAccountCommand`, then assert `Right events` with one `AccountCreatedAccountEvent` (cases 1–3, 6, 7) or `Left NegativeInitialBalanceExceedsOverdraftLimit` (cases 4, 5).

For negative `Money` values, `mockMoney (-100)` should work — `mkMoney` accepts negatives (`Domain/Core/Types.hs:247-248`). Verify at the REPL or by reading the existing `mockMoney` definition in the test helpers if uncertain.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
just test 2>&1 | tail -40
```

Expected: build failure with `Data constructor not in scope: ‘NegativeInitialBalanceExceedsOverdraftLimit’` because the variant doesn't exist yet.

- [ ] **Step 3: Add the new constructor to the bare `AccountError`**

Edit `backend/src/Domain/Account/CommandHandler.hs`. The bare type is at lines 68–81. Add the new constructor as the last variant before `deriving (Show, Eq)`:

```haskell
data AccountError
  = AccountAlreadyExists
  | AccountNameEmpty
  | AccountDoesNotExist
  | ExternalAccountCannotBeShared
  | NotAccountOwner
  | CannotShareWithSelf
  | CannotRevokeOwner
  | UserHasNoAccess
  | InsufficientFunds
  | CurrencyMismatch
  | ExternalTypeNotSettable
  | AccountCurrencyLocked
  | NegativeInitialBalanceExceedsOverdraftLimit  -- NEW
  deriving (Show, Eq)
```

- [ ] **Step 4: Add the rule to `handleAccountCommand` for `CreateAccount`**

The existing branch is at `CommandHandler.hs:142-165`. The current shape (preserved verbatim aside from the addition):

```haskell
handleAccountCommand account (CreateAccountAccountCommand CreateAccount {..})
  | not (T.null (account ^. #name)) = Left AccountAlreadyExists
  | T.null name = Left AccountNameEmpty
  | otherwise =
      case overdraftLimit of
        Just (Just limit)
          | moneyCurrency limit /= moneyCurrency initialBalance -> Left CurrencyMismatch
        _ -> Right ()
        >> let resolvedLimit = ...
            in Right [AccountCreatedAccountEvent ...]
```

Add a new guarded branch for the negative-balance / overdraft-limit rule, between the `T.null name` guard and the `otherwise` branch:

```haskell
handleAccountCommand account (CreateAccountAccountCommand CreateAccount {..})
  | not (T.null (account ^. #name)) = Left AccountAlreadyExists
  | T.null name = Left AccountNameEmpty
  | unMoney initialBalance < 0
      && case overdraftLimit of
           Just (Just lim) -> abs (unMoney initialBalance) > unMoney lim
           _              -> True
      = Left NegativeInitialBalanceExceedsOverdraftLimit
  | otherwise =
      case overdraftLimit of
        Just (Just limit)
          | moneyCurrency limit /= moneyCurrency initialBalance -> Left CurrencyMismatch
        _ -> Right ()
        >> let resolvedLimit = case overdraftLimit of
                 ...  -- unchanged
            in Right [...]
```

The new guard fires when:

- balance is strictly negative, **and**
- either no explicit limit exists (`Nothing`/`Just Nothing`) or `|balance| > limit`.

The `>` is strict, so case 7 (`|balance| == limit`) falls through to `otherwise` and is accepted.

- [ ] **Step 5: Run tests to verify they pass**

```bash
just test 2>&1 | tail -40
```

Expected: `7 examples, 0 failures` for the new context (alongside everything else passing).

- [ ] **Step 6: Format and lint**

```bash
just format
just lint
```

Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add src/Domain/Account/CommandHandler.hs test/Domain/Account/CommandHandlerSpec.hs
git commit -m "feat(account): reject negative initialBalance unless overdraft covers it

Adds a new bare AccountError variant
NegativeInitialBalanceExceedsOverdraftLimit to handleAccountCommand,
enforcing |initialBalance| <= overdraftLimit when initialBalance < 0.
Mirrors the existing debit-side overdraft rule. Seven new domain
test cases cover all balance/limit combinations including the
boundary |balance| == limit."
```

---

### Task 3: Web-layer pre-check for per-field error response

**Files:**

- Modify: `backend/src/Web/API/AccountAPI.hs:195-206` (`createAccountHandler`)
- Modify: `backend/test/Integration/WebAPISpec.hs` (extend `accountCreationSpec` around line 251+, and update the existing case at line 294 that expected 201 for negative balance)

This is the second backend task. The domain rule from Task 2 is the source of truth, but it returns a generic 400 because `runAccountCmd` collapses variants. To get a per-field `fieldErrors.overdraftLimit` payload that the web form can use, add a pre-check in the HTTP handler.

- [ ] **Step 1: Update the existing "negative balance" integration test (case the new rule breaks)**

The existing test at `backend/test/Integration/WebAPISpec.hs:294-304` reads "accepts account creation with negative balance — returns 201". This fixture has `initialBalance = -100`, no `overdraftLimit`, which is now invalid. Replace its body so it is now a `400` test:

```haskell
describe "rejects negative balance with no overdraft limit" $ with mkApp $ do
  it "returns 400 with fieldErrors.overdraftLimit" $ do
    token <- liftIO generateTestToken
    let payload =
          object
            [ "name" .= ("Test" :: Text),
              "initialBalance" .= (-100.0 :: Double),
              "currency" .= ("USD" :: Text)
            ]

    response <- postJSONAuth "/api/accounts" token (encode payload)
    liftIO $ do
      statusCode (simpleStatus response) `shouldBe` 400
      let body = simpleBody response
      let parsed = decode body :: Maybe Aeson.Value
      parsed `shouldSatisfy` hasFieldError "overdraftLimit"
```

If a `hasFieldError` helper does not exist, define it as a local helper in this file (or inline the JSON-shape assertion):

```haskell
hasFieldError :: Text -> Maybe Aeson.Value -> Bool
hasFieldError field (Just (Aeson.Object o)) = case Aeson.lookup "fieldErrors" o of
  Just (Aeson.Object fe) -> Aeson.member (Aeson.Key.fromText field) fe
  _                      -> False
hasFieldError _ _ = False
```

Add a second new case for the "limit too small" path:

```haskell
describe "rejects negative balance with insufficient overdraft limit" $ with mkApp $ do
  it "returns 400 with fieldErrors.overdraftLimit" $ do
    token <- liftIO generateTestToken
    let payload =
          object
            [ "name" .= ("Test" :: Text),
              "initialBalance" .= (-100.0 :: Double),
              "currency" .= ("USD" :: Text),
              "overdraftLimit" .= (50.0 :: Double)
            ]

    response <- postJSONAuth "/api/accounts" token (encode payload)
    liftIO $ do
      statusCode (simpleStatus response) `shouldBe` 400
      let body = simpleBody response
      let parsed = decode body :: Maybe Aeson.Value
      parsed `shouldSatisfy` hasFieldError "overdraftLimit"
```

- [ ] **Step 2: Run integration tests to verify they fail**

```bash
just test 2>&1 | tail -30
```

Expected: the two new cases fail (still returning 201) and the renamed-old test fails (still expecting 201 but the domain check from Task 2 now returns 400 with code `ACCOUNT_ERROR`, no `fieldErrors` populated yet).

- [ ] **Step 3: Add the pre-check to `createAccountHandler`**

Edit `backend/src/Web/API/AccountAPI.hs`. Find `createAccountHandler` (around line 195–206). Today the body is:

```haskell
createAccountHandler user request = do
  let userId = user.userId
  createCmd <- validateField "request" $ toCreateAccountCommand userId request
  result <- AccountService.createAccount createCmd
  case result of
    Right (accountId, account) -> return $ fromAccountData accountId account
    Left err -> throwDomainError err
```

Insert an explicit pre-check **before** the `validateField` line. Add `import Web.ErrorMapping (throwValidation)` (and import `Control.Monad (when)` if not already imported by RIO):

```haskell
createAccountHandler user request = do
  let userId = user.userId

  -- Reject negative initial balance unless overdraft covers it.
  -- Mirrors handleAccountCommand's domain rule for a per-field 400 response.
  when (request.initialBalance < 0) $ case request.overdraftLimit of
    Nothing ->
      throwValidation "overdraftLimit"
        "Overdraft limit is required when initial balance is negative"
    Just lim
      | abs request.initialBalance > lim ->
          throwValidation "overdraftLimit"
            "Overdraft limit must be at least the absolute value of the initial balance"
      | otherwise -> pure ()

  createCmd <- validateField "request" $ toCreateAccountCommand userId request
  result <- AccountService.createAccount createCmd
  case result of
    Right (accountId, account) -> return $ fromAccountData accountId account
    Left err -> throwDomainError err
```

`throwValidation` lives in `backend/src/Web/ErrorMapping.hs:257` and produces a `ValidationErrorResponse` body. `request.initialBalance` and `request.overdraftLimit` are already accessible — `CreateAccountRequest` is a record (`backend/src/Web/Types.hs:138-145`) and the module uses `OverloadedRecordDot` (verify by looking at the existing handler, line 197: `let userId = user.userId`).

- [ ] **Step 4: Run integration tests to verify they pass**

```bash
just test 2>&1 | tail -30
```

Expected: both new cases pass (400 with `fieldErrors.overdraftLimit`), the renamed test passes, all other tests still pass.

- [ ] **Step 5: Format and lint**

```bash
just format
just lint
```

- [ ] **Step 6: Commit**

```bash
git add src/Web/API/AccountAPI.hs test/Integration/WebAPISpec.hs
git commit -m "feat(account-api): per-field error for negative balance / overdraft

POST /api/accounts now returns 400 with fieldErrors.overdraftLimit
when initialBalance is negative and overdraftLimit is missing or
smaller than |initialBalance|. The domain handler still enforces the
same rule (defense-in-depth); this change adds a web-layer pre-check
so the response is actionable in a form."
```

---

### Task 4: Stale-comment cleanup

**Files:**

- Modify: `backend/src/Domain/Account/Commands.hs:84` (CreateAccount header doc)
- Modify: `backend/src/Web/Types.hs:611` (`toCreateAccountCommand` doctest)
- Modify: `backend/src/Web/Types.hs:594-595` (false `Left "Money amount must be non-negative"` doctest)

Each currently claims "initial balance must be non-negative" — wrong both before and after this slice. Replace with the _conditional_ rule.

- [ ] **Step 1: Replace the three stale comments**

For each location, replace the wrong claim with text describing the actual rule. Example replacement at `Commands.hs:84`:

```haskell
-- Old: "Initial balance must be non-negative (enforced by Money type)"
-- New: "Initial balance must be non-negative unless an overdraft limit
--       is set and |initialBalance| <= overdraftLimit"
```

For the Web/Types.hs:594-595 doctest specifically, the old example shows `toDomainMoney (-50.0)` returning `Left ...`. Since `toDomainMoney` actually returns `Right`, fix the doctest to show the real behaviour, e.g.:

```haskell
-- >>> toDomainMoney USD (-50.0)
-- Right (Money ((-50) % 1) USD)
```

- [ ] **Step 2: Verify nothing breaks**

```bash
just test 2>&1 | tail -10
```

Expected: all tests still pass.

- [ ] **Step 3: Commit**

```bash
git add src/Domain/Account/Commands.hs src/Web/Types.hs
git commit -m "docs(account): fix stale 'non-negative' balance comments

Three comments claimed initial balance must be non-negative; the
code never enforced that and after the new rule allows negative
balances when overdraft covers them. Replace with the actual
conditional rule."
```

---

### Task 5: Open backend PR

**Files:** none (git/gh operation).

- [ ] **Step 1: Push and open the PR**

```bash
git push -u origin feat/negative-balance-overdraft-rule
gh pr create --title "feat(account): reject negative initialBalance unless overdraft covers it" --body "$(cat <<'EOF'
## Summary
- Add `NegativeInitialBalanceExceedsOverdraftLimit` to the bare `AccountError` and enforce the rule in `handleAccountCommand`.
- Add a web-layer pre-check in `createAccountHandler` that returns 400 with `fieldErrors.overdraftLimit` so the web form can map the error onto the right input.
- Fix three stale comments that claimed initial balance must be non-negative.

Driven by the create-account web feature spec at `web/docs/specs/2026-05-06-create-account-design.md` (§2). The web client depends on the new `fieldErrors` shape — this PR ships first.

## Test plan
- [ ] Seven new domain-handler cases in `Domain.Account.CommandHandlerSpec.createAccountSpec` cover all positive/negative × no-limit/limit-too-small/limit-equal/limit-larger combinations.
- [ ] Two new HTTP-level cases in `Integration.WebAPISpec.accountCreationSpec` assert 400 + `fieldErrors.overdraftLimit` for the no-limit and limit-too-small paths.
- [ ] The previous "negative balance returns 201" case has been replaced with a 400 case (it would have flipped to failing under the new rule).
- [ ] `just check && just test` passes locally.
EOF
)"
```

Wait for CI to go green before merging.

- [ ] **Step 2: Merge the backend PR**

After CI is green and the PR is approved, merge via `gh pr merge --squash`. Note the new commit on `master` is needed before Phase 2 web testing depends on the new endpoint shape — but you can develop the web side against the local backend or MSW mocks while the PR is in review.

---

## Phase 2 — Web foundations (`web/`)

All commands run from `/Users/oleksandrsy/Projects/Self/HomeAccounting/web`. The branch `feat/create-account` already exists (currently containing the spec). Switch to it before starting.

```bash
cd /Users/oleksandrsy/Projects/Self/HomeAccounting/web
git switch feat/create-account
```

### Task 6: Enhance `ApiClient` to parse `fieldErrors` and `code`

**Files:**

- Modify: `web/src/api/client.ts` (replace `safeReadMessage` with `safeReadErrorBody`; thread `code` and `fieldErrors` into the thrown `ApiError`)
- Test: `web/src/api/client.test.ts` (add cases for `fieldErrors`, `code`, and the no-body case)

- [ ] **Step 1: Add failing tests in `client.test.ts`**

Read the existing test file first (`web/src/api/client.test.ts`) to follow its setup/teardown style and how it spins up `ApiClient`. Add three new cases at the end of the existing `describe`:

```ts
it('parses fieldErrors out of a 400 response body', async () => {
  // Use msw or fetch-mock as the existing tests do; assert the thrown ApiError
  // has fieldErrors: { name: 'Name is required' }
});

it('parses code out of an ErrorResponse-style 400 body', async () => {
  // Body: { message: 'Banking error', code: 'BANKING_ERROR' }
  // Assert thrown ApiError.code === 'BANKING_ERROR'
});

it('falls back to "HTTP <status>" message when the body is not JSON', async () => {
  // Body: empty / non-JSON 500
  // Assert thrown ApiError.message === 'HTTP 500'
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm exec vitest run src/api/client.test.ts
```

Expected: the three new cases fail because `ApiError` instances don't carry `fieldErrors`/`code`.

- [ ] **Step 3: Replace `safeReadMessage` with `safeReadErrorBody` and update `request`**

Edit `web/src/api/client.ts`:

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

In `request`, replace the `if (!res.ok)` block:

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

`ApiError`'s constructor (lines 9–21) already accepts those fields — no class change needed.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm exec vitest run src/api/client.test.ts
just check
```

Expected: every test in `client.test.ts` passes; `just check` (typecheck + lint + format-check) is clean.

- [ ] **Step 5: Commit**

```bash
git add src/api/client.ts src/api/client.test.ts
git commit -m "feat(api): parse fieldErrors and code from error response body

ApiError already had fieldErrors and code on its class shape, but the
client only read 'message'. Replace safeReadMessage with
safeReadErrorBody and thread the parsed values through to the thrown
ApiError. Required for the create-account form's per-field error
mapping."
```

---

### Task 7: Add request DTOs

**Files:**

- Modify: `web/src/api/types.ts` (append new exports)

DTOs are types, not runtime code, so there's no test to write — but `just check` (typecheck) is the verifier.

- [ ] **Step 1: Append the new types to `web/src/api/types.ts`**

After the existing `AccountListResponse` interface (around line 96), add:

```ts
// Request DTOs for POST /api/accounts. Mirror backend Web/Types.hs:138-204.

export type AccountSubtypeKind = 'cash' | 'bankAccount' | 'eWallet' | 'asset' | 'loan';

// Backend enums (closed sets at the Haskell level; backend also accepts
// freeform OtherCardNetwork/OtherAsset, but the web UI does not expose those).
export type CardNetworkKind = 'visa' | 'mastercard' | 'amex';
export type AssetTypeKind = 'property' | 'vehicle' | 'stocks' | 'retirementFund';

// Mirrors backend AccountSubtypeRequest (Web/Types.hs:153-167). Backend's
// JSON shape is "type plus optional fields"; we keep the same flat shape.
export interface AccountSubtypeRequest {
  type: AccountSubtypeKind;
  storageLocation?: string;
  bankName?: string;
  accountNumber?: string;
  cardNetwork?: CardNetworkKind;
  provider?: string;
  accountIdentifier?: string;
  assetType?: AssetTypeKind;
  description?: string;
  lender?: string;
  interestRate?: number;
  dueDate?: string; // ISO date 'YYYY-MM-DD'
}

export interface CreateAccountRequest {
  name: string;
  initialBalance: number;
  currency: string; // 'UAH' | 'USD' | 'EUR' | 'GBP'
  overdraftLimit?: number; // omit when none
  subtype?: AccountSubtypeRequest;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
just check
```

Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/api/types.ts
git commit -m "feat(api): add CreateAccountRequest and AccountSubtypeRequest DTOs

Mirror backend Web/Types.hs:138-204 for the create endpoint."
```

---

### Task 8: Extend `accountsApi` with `create`

**Files:**

- Modify: `web/src/api/accounts.ts`

- [ ] **Step 1: Add the `create` method**

Replace the file body with:

```ts
import type { AccountListResponse, AccountResponse, CreateAccountRequest } from './types';
import type { ApiClient } from './client';

export const accountsApi = (client: ApiClient) => ({
  list: async (): Promise<AccountResponse[]> => {
    const res = await client.get<AccountListResponse>('/api/accounts');
    return res.accounts;
  },
  create: (body: CreateAccountRequest): Promise<AccountResponse> =>
    client.post<AccountResponse>('/api/accounts', body),
});
```

- [ ] **Step 2: Verify typecheck**

```bash
just check
```

- [ ] **Step 3: Commit**

```bash
git add src/api/accounts.ts
git commit -m "feat(api): add accountsApi.create

Posts to POST /api/accounts and returns the new AccountResponse."
```

---

### Task 9: Vendor shadcn `dialog`, `select`, `form`

**Files:**

- Create: `web/src/components/ui/dialog.tsx`
- Create: `web/src/components/ui/select.tsx`
- Create: `web/src/components/ui/form.tsx`
- Modify: `web/package.json` (add `@radix-ui/react-dialog`, `@radix-ui/react-select`)
- Modify: `web/pnpm-lock.yaml` (auto-updated by pnpm)

Use `pnpm dlx shadcn-ui@latest add` to copy the canonical files. The existing `components.json` already has the right `aliases`/`tsx`/`tailwind` config — `shadcn-ui` will Just Work.

- [ ] **Step 1: Run shadcn add for the three primitives**

```bash
pnpm dlx shadcn@latest add dialog select form
```

(If your local pnpm cache only has the older `shadcn-ui` package name, `pnpm dlx shadcn-ui@latest add ...` works too.)

This will:

- Add `@radix-ui/react-dialog` and `@radix-ui/react-select` to `package.json` (the `form` primitive uses peer deps already in the project: `react-hook-form`, `@radix-ui/react-label`, `@radix-ui/react-slot`).
- Create `src/components/ui/dialog.tsx`, `src/components/ui/select.tsx`, `src/components/ui/form.tsx`.

If `pnpm dlx` is blocked or the CLI prompts interactively, fall back to manually copying from <https://ui.shadcn.com/docs/components/{dialog,select,form}> — the files belong to the project after vendoring, so any minor diff is acceptable as long as the exports match the shadcn convention.

- [ ] **Step 2: Verify the new files compile**

```bash
just check
```

Expected: clean. If TypeScript complains about a missing peer (e.g. `@radix-ui/react-dialog`), make sure `pnpm install` ran — `shadcn-ui add` should have triggered it, but a manual `pnpm install` is a safe re-do.

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/dialog.tsx src/components/ui/select.tsx src/components/ui/form.tsx package.json pnpm-lock.yaml
git commit -m "chore(ui): vendor shadcn dialog, select, form primitives

Required by the upcoming create-account dialog. Copies the canonical
shadcn implementations into src/components/ui/, owned by us per the
MVP rationale (no opaque framework lock-in)."
```

---

## Phase 3 — Web feature module (`web/src/features/accounts/`)

### Task 10: Add zod schema and `toCreateAccountRequest` helper

**Files:**

- Create: `web/src/features/accounts/schema.ts`
- Test: `web/src/features/accounts/schema.test.ts`

- [ ] **Step 1: Write failing tests in `schema.test.ts`**

Add `web/src/features/accounts/schema.test.ts` with cases that exercise the boundaries (per spec §8.2):

```ts
import { describe, expect, it } from 'vitest';
import { createAccountFormSchema, toCreateAccountRequest } from './schema';

describe('createAccountFormSchema', () => {
  const base = {
    name: 'Checking',
    currency: 'USD',
    initialBalance: 0,
    subtype: { type: 'cash' },
  } as const;

  it('rejects empty name', () => {
    const r = createAccountFormSchema.safeParse({ ...base, name: '' });
    expect(r.success).toBe(false);
  });

  it('accepts a valid cash account', () => {
    const r = createAccountFormSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('rejects negative balance with no overdraft limit', () => {
    const r = createAccountFormSchema.safeParse({ ...base, initialBalance: -100 });
    expect(r.success).toBe(false);
    if (!r.success) {
      const overdraftIssue = r.error.issues.find((i) => i.path[0] === 'overdraftLimit');
      expect(overdraftIssue).toBeDefined();
    }
  });

  it('rejects negative balance when |balance| > limit', () => {
    const r = createAccountFormSchema.safeParse({
      ...base,
      initialBalance: -100,
      overdraftLimit: 50,
    });
    expect(r.success).toBe(false);
  });

  it('accepts negative balance when |balance| <= limit', () => {
    const r = createAccountFormSchema.safeParse({
      ...base,
      initialBalance: -50,
      overdraftLimit: 100,
    });
    expect(r.success).toBe(true);
  });

  it('accepts zero balance with no limit', () => {
    expect(createAccountFormSchema.safeParse({ ...base, initialBalance: 0 }).success).toBe(true);
  });

  it('rejects an unknown currency', () => {
    expect(createAccountFormSchema.safeParse({ ...base, currency: 'JPY' }).success).toBe(false);
  });

  it('rejects malformed loan dueDate', () => {
    const r = createAccountFormSchema.safeParse({
      ...base,
      subtype: { type: 'loan', dueDate: '2026/05/06' },
    });
    expect(r.success).toBe(false);
  });
});

describe('toCreateAccountRequest', () => {
  it('strips empty optionals from cash subtype', () => {
    const dto = toCreateAccountRequest({
      name: 'Wallet',
      currency: 'USD',
      initialBalance: 0,
      subtype: { type: 'cash' },
    });
    expect(dto.subtype).toEqual({ type: 'cash' });
    expect(dto).not.toHaveProperty('overdraftLimit');
  });

  it('shapes a bankAccount subtype with all fields', () => {
    const dto = toCreateAccountRequest({
      name: 'BoA',
      currency: 'USD',
      initialBalance: 100,
      overdraftLimit: 200,
      subtype: { type: 'bankAccount', bankName: 'BoA', accountNumber: '123', cardNetwork: 'visa' },
    });
    expect(dto).toEqual({
      name: 'BoA',
      currency: 'USD',
      initialBalance: 100,
      overdraftLimit: 200,
      subtype: { type: 'bankAccount', bankName: 'BoA', accountNumber: '123', cardNetwork: 'visa' },
    });
  });

  it('shapes a loan subtype', () => {
    const dto = toCreateAccountRequest({
      name: 'Mortgage',
      currency: 'USD',
      initialBalance: -100000,
      overdraftLimit: 100000,
      subtype: { type: 'loan', lender: 'Bank', interestRate: 5, dueDate: '2030-01-01' },
    });
    expect(dto.subtype).toEqual({
      type: 'loan',
      lender: 'Bank',
      interestRate: 5,
      dueDate: '2030-01-01',
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm exec vitest run src/features/accounts/schema.test.ts
```

Expected: cannot import (`schema.ts` does not exist).

- [ ] **Step 3: Implement `schema.ts`**

Create `web/src/features/accounts/schema.ts`. Follow spec §4 exactly:

```ts
import { z } from 'zod';
import type { CreateAccountRequest } from '@/api/types';

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
    initialBalance: z.coerce.number().finite(),
    overdraftLimit: z
      .union([z.coerce.number().nonnegative(), z.literal('').transform(() => undefined)])
      .optional(),
    subtype: subtypeSchema,
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

export type CreateAccountFormValues = z.infer<typeof createAccountFormSchema>;

// Strip empty optionals and shape values into the backend DTO.
export function toCreateAccountRequest(values: CreateAccountFormValues): CreateAccountRequest {
  const subtype: CreateAccountRequest['subtype'] = stripEmpty(values.subtype);
  const out: CreateAccountRequest = {
    name: values.name,
    currency: values.currency,
    initialBalance: values.initialBalance,
    subtype,
  };
  if (values.overdraftLimit !== undefined) out.overdraftLimit = values.overdraftLimit;
  return out;
}

function stripEmpty<T extends object>(obj: T): T {
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined && v !== '') cleaned[k] = v;
  }
  return cleaned as T;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm exec vitest run src/features/accounts/schema.test.ts
just check
```

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/schema.ts src/features/accounts/schema.test.ts
git commit -m "feat(accounts): zod schema and DTO helper for create-account form

Discriminated union over the five subtypes plus the negative-balance/
overdraft refinement that mirrors the backend rule for fast feedback."
```

---

### Task 11: Add `useCreateAccount` mutation hook + MSW handler

**Files:**

- Create: `web/src/features/accounts/useCreateAccount.ts`
- Modify: `web/src/test/handlers.ts` (add `POST /api/accounts` handler returning a new fixture)
- Modify: `web/src/test/fixtures.ts` (add a `createdAccountFixture` if helpful — optional)

There's no dedicated unit test for the hook itself; component tests in Task 13 exercise it. The hook follows the pattern of `useAccounts.ts`.

- [ ] **Step 1: Implement `useCreateAccount`**

Create `web/src/features/accounts/useCreateAccount.ts`:

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '@/api/client';
import { accountsApi } from '@/api/accounts';
import type { AccountResponse, CreateAccountRequest } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

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
      queryClient.setQueryData<AccountResponse[] | undefined>(['accounts'], (prev) =>
        prev ? [...prev, account] : [account],
      );
    },
  });
}
```

- [ ] **Step 2: Add a default success handler in `web/src/test/handlers.ts`**

After the existing `http.get(... /api/accounts ...)` line, append:

```ts
http.post(`${apiBase}/api/accounts`, async ({ request }) => {
  const body = (await request.json()) as { name: string; currency: string };
  return HttpResponse.json(
    {
      id: 'new-account-id',
      name: body.name,
      balance: 0,
      currency: body.currency,
      overdraftLimit: null,
      subtype: { type: 'cash' },
      version: 1,
    },
    { status: 201 },
  );
}),
```

This is the _default_ happy-path response; individual tests in Task 13 override it via `server.use(...)`.

- [ ] **Step 3: Verify typecheck**

```bash
just check
```

- [ ] **Step 4: Commit**

```bash
git add src/features/accounts/useCreateAccount.ts src/test/handlers.ts
git commit -m "feat(accounts): add useCreateAccount mutation hook + MSW handler

Posts the form payload, invalidates the accounts query on success and
seeds the cache so the new id is queryable before the refetch lands.
Default MSW handler returns a 201 with a stub account."
```

---

### Task 12: Add `SubtypeFields.tsx`

**Files:**

- Create: `web/src/features/accounts/SubtypeFields.tsx`

This is a pure render switch on the watched subtype. It has no internal logic, so component tests in Task 13 cover it implicitly via the dialog tests.

- [ ] **Step 1: Implement the component**

```tsx
import { useFormContext } from 'react-hook-form';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import type { CreateAccountFormValues } from './schema';

export function SubtypeFields() {
  const { watch } = useFormContext<CreateAccountFormValues>();
  const kind = watch('subtype.type');

  if (kind === 'cash') {
    return (
      <FormField
        name="subtype.storageLocation"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Storage location (optional)</FormLabel>
            <FormControl>
              <Input {...field} value={field.value ?? ''} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    );
  }
  if (kind === 'bankAccount') {
    return (
      <>
        <FormField
          name="subtype.bankName"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bank name (optional)</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="subtype.accountNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account number (optional)</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="subtype.cardNetwork"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Card network (optional)</FormLabel>
              <FormControl>
                <Select onValueChange={field.onChange} value={field.value ?? ''}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="visa">Visa</SelectItem>
                    <SelectItem value="mastercard">Mastercard</SelectItem>
                    <SelectItem value="amex">Amex</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </>
    );
  }
  if (kind === 'eWallet') {
    return (
      <>
        <FormField
          name="subtype.provider"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Provider (optional)</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="subtype.accountIdentifier"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account identifier (optional)</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </>
    );
  }
  if (kind === 'asset') {
    return (
      <>
        <FormField
          name="subtype.assetType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Asset type (optional)</FormLabel>
              <FormControl>
                <Select onValueChange={field.onChange} value={field.value ?? ''}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select…" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="property">Property</SelectItem>
                    <SelectItem value="vehicle">Vehicle</SelectItem>
                    <SelectItem value="stocks">Stocks</SelectItem>
                    <SelectItem value="retirementFund">Retirement fund</SelectItem>
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="subtype.description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description (optional)</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </>
    );
  }
  if (kind === 'loan') {
    return (
      <>
        <FormField
          name="subtype.lender"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Lender (optional)</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="subtype.interestRate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Interest rate (% APR, optional)</FormLabel>
              <FormControl>
                <Input type="number" step="0.01" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          name="subtype.dueDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Due date (YYYY-MM-DD, optional)</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </>
    );
  }
  return null;
}
```

- [ ] **Step 2: Verify typecheck**

```bash
just check
```

Expected: clean. If typecheck complains about a missing `value={field.value ?? ''}` cast, narrow the field type or use `String(field.value ?? '')`.

- [ ] **Step 3: Commit**

```bash
git add src/features/accounts/SubtypeFields.tsx
git commit -m "feat(accounts): add SubtypeFields render switch

Renders only the inputs belonging to the watched subtype kind. Pure
presentational; no internal state."
```

---

### Task 13: Add `CreateAccountDialog` + tests

**Files:**

- Create: `web/src/features/accounts/CreateAccountDialog.tsx`
- Test: `web/src/features/accounts/CreateAccountDialog.test.tsx`

The dialog is the most complex piece. Follow TDD with seven cases (per spec §8.3). Test order matters — start with the simplest (defaults + cancel) and build up.

- [ ] **Step 1: Write failing component tests**

Create `web/src/features/accounts/CreateAccountDialog.test.tsx`. Mirror the style and harness used in `AccountsPane.test.tsx` (`renderWithProviders`, `saveSession`, MSW `server.use(...)`):

```tsx
import { describe, it, expect } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { saveSession } from '@/auth/storage';
import { CreateAccountDialog } from './CreateAccountDialog';
import { useState } from 'react';

const apiBase = 'http://localhost:8080';

function Wrapper() {
  const [open, setOpen] = useState(true);
  return <CreateAccountDialog open={open} onOpenChange={setOpen} />;
}

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
});

describe('CreateAccountDialog', () => {
  it('renders default values (name empty, currency from configuration, balance 0, subtype cash)', async () => {
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    expect(await screen.findByRole('dialog', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toHaveValue('');
    expect(screen.getByLabelText(/initial balance/i)).toHaveValue(0);
    // configurationFixture.defaultCurrency is 'USD'
    expect(screen.getByRole('combobox', { name: /currency/i })).toHaveTextContent('USD');
  });

  it('blocks submission with an empty name and shows the inline error', async () => {
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.post(`${apiBase}/api/accounts`, () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await user.click(await screen.findByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('blocks submission with negative balance and no overdraft limit', async () => {
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.post(`${apiBase}/api/accounts`, () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await user.type(screen.getByLabelText(/name/i), 'Test');
    await user.clear(screen.getByLabelText(/initial balance/i));
    await user.type(screen.getByLabelText(/initial balance/i), '-100');
    await user.click(await screen.findByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/overdraft limit is required/i)).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('swaps subtype-specific fields when the type changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    // Default: cash → "Storage location" visible
    expect(await screen.findByLabelText(/storage location/i)).toBeInTheDocument();
    // Switch to bankAccount via the type Select
    await user.click(screen.getByRole('combobox', { name: /account type/i }));
    await user.click(screen.getByRole('option', { name: /bank account/i }));
    expect(await screen.findByLabelText(/bank name/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/storage location/i)).not.toBeInTheDocument();
  });

  it('happy path posts the right payload, refetches, navigates', async () => {
    const user = userEvent.setup();
    let postedBody: unknown = null;
    server.use(
      http.post(`${apiBase}/api/accounts`, async ({ request }) => {
        postedBody = await request.json();
        return HttpResponse.json(
          {
            id: 'new-id',
            name: 'Test',
            balance: 0,
            currency: 'USD',
            overdraftLimit: null,
            subtype: { type: 'cash' },
            version: 1,
          },
          { status: 201 },
        );
      }),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await user.type(screen.getByLabelText(/name/i), 'Test');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() => {
      expect(postedBody).toMatchObject({
        name: 'Test',
        currency: 'USD',
        initialBalance: 0,
        subtype: { type: 'cash' },
      });
    });
    // Dialog closed after success
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('maps backend fieldErrors onto inputs', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${apiBase}/api/accounts`, () =>
        HttpResponse.json(
          { message: 'Validation failed', fieldErrors: { name: 'Already taken' } },
          { status: 400 },
        ),
      ),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await user.type(screen.getByLabelText(/name/i), 'Test');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText(/already taken/i)).toBeInTheDocument();
  });

  it('renders an inline alert on a 500 with no fieldErrors', async () => {
    const user = userEvent.setup();
    server.use(http.post(`${apiBase}/api/accounts`, () => new HttpResponse(null, { status: 500 })));
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await user.type(screen.getByLabelText(/name/i), 'Test');
    await user.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
```

Notes:

- The wrapper uses `useState(true)` so the dialog is open from the start of each test.
- `screen.getByLabelText(/initial balance/i)` requires the label-input association to be wired in `CreateAccountDialog.tsx`. The shadcn `Form` primitive does this automatically via `FormField` + `FormLabel`.
- The currency `defaultCurrency` comes from `configurationFixture` (`web/src/test/fixtures.ts:55-68`), already returning `'USD'`.

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm exec vitest run src/features/accounts/CreateAccountDialog.test.tsx
```

Expected: cannot import (`CreateAccountDialog.tsx` does not exist).

- [ ] **Step 3: Implement `CreateAccountDialog.tsx`**

Create the file. The implementation follows spec §6.2 closely:

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { ApiError } from '@/api/client';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import {
  createAccountFormSchema,
  toCreateAccountRequest,
  type CreateAccountFormValues,
} from './schema';
import { useCreateAccount } from './useCreateAccount';
import { SubtypeFields } from './SubtypeFields';

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

  const [showAdvanced, setShowAdvanced] = useState(false);

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
          form.setError(field as keyof CreateAccountFormValues, { type: 'server', message });
        }
        if ('overdraftLimit' in e.fieldErrors) setShowAdvanced(true);
      }
    }
  });

  // Auto-expand the "More options" section when the schema flagged overdraftLimit.
  const overdraftError = form.formState.errors.overdraftLimit;
  if (overdraftError && !showAdvanced) setShowAdvanced(true);

  const showBanner =
    create.isError && create.error instanceof ApiError && !create.error.fieldErrors;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create account</DialogTitle>
        </DialogHeader>

        {showBanner && create.error instanceof ApiError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{create.error.message}</AlertDescription>
          </Alert>
        )}

        <FormProvider {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Name</FormLabel>
                  <FormControl>
                    <Input autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="initialBalance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Initial balance</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      step="0.01"
                      {...field}
                      value={field.value as number}
                      onChange={(e) => field.onChange(e.target.valueAsNumber)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              name="currency"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Currency</FormLabel>
                  <FormControl>
                    <Select onValueChange={field.onChange} value={field.value}>
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

            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="text-sm text-muted-foreground underline"
            >
              {showAdvanced ? 'Hide' : 'More options'}
            </button>
            {showAdvanced && (
              <FormField
                name="overdraftLimit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Overdraft limit (optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        value={field.value ?? ''}
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

            <FormField
              name="subtype.type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Account type</FormLabel>
                  <FormControl>
                    <Select
                      onValueChange={(value) => form.setValue('subtype', { type: value as 'cash' })}
                      value={field.value}
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

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Creating…' : 'Create account'}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
```

Key implementation notes:

- The "subtype.type" `Select` resets the whole `subtype` object via `form.setValue('subtype', { type: ... })` so stale per-subtype fields (e.g. `bankName` left over from a previous selection) are dropped — important for the discriminated union to validate.
- `Input type="number"` with `valueAsNumber` keeps the field a real number for zod's `.coerce.number()` (no string-coercion surprises).
- `aria-label` on `SelectTrigger` provides the accessible name for `getByRole('combobox', { name: ... })` queries.

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm exec vitest run src/features/accounts/CreateAccountDialog.test.tsx
just check
```

Expect every case to pass. If a case fails, debug one at a time — most failures will be query selectors (`getByLabelText` not finding the right element). Adjust labels in the implementation rather than weakening the test queries.

- [ ] **Step 5: Commit**

```bash
git add src/features/accounts/CreateAccountDialog.tsx src/features/accounts/CreateAccountDialog.test.tsx
git commit -m "feat(accounts): create-account modal dialog

Modal dialog opened from AccountsPane with name, currency, initial
balance, optional overdraft limit (under More options), and a subtype
selector with conditional per-subtype fields. Validates client-side
with zod, maps backend fieldErrors onto inputs, navigates to
/accounts/<newId> on success."
```

---

### Task 14: Wire the trigger button + dialog into `AccountsPane`

**Files:**

- Modify: `web/src/features/accounts/AccountsPane.tsx`
- Modify: `web/src/features/accounts/AccountsPane.test.tsx`

- [ ] **Step 1: Extend the AccountsPane tests with two new cases**

Add to the existing `describe('AccountsPane')` block:

```tsx
import userEvent from '@testing-library/user-event';

it('renders an "Add account" button at the top of the pane', async () => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  renderWithProviders(ui(), { initialPath: '/' });
  expect(await screen.findByRole('button', { name: /add account/i })).toBeInTheDocument();
});

it('opens the create-account dialog from the empty-state CTA', async () => {
  const user = userEvent.setup();
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  server.use(
    http.get(`${apiBase}/api/accounts`, () => HttpResponse.json({ accounts: [], totalCount: 0 })),
  );
  renderWithProviders(ui(), { initialPath: '/' });
  const cta = await screen.findByRole('button', { name: /create account/i });
  await user.click(cta);
  expect(await screen.findByRole('dialog', { name: /create account/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm exec vitest run src/features/accounts/AccountsPane.test.tsx
```

Expected: both new cases fail (button doesn't exist yet).

- [ ] **Step 3: Update `AccountsPane.tsx` to wire the dialog**

Modify `web/src/features/accounts/AccountsPane.tsx` to include the trigger button at the top, the empty-state CTA, and the controlled dialog:

```tsx
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { useAccounts } from './useAccounts';
import { CreateAccountDialog } from './CreateAccountDialog';

export function AccountsPane() {
  const { data, isLoading, isError, refetch } = useAccounts();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">Accounts</span>
        <Button size="sm" onClick={() => setCreating(true)}>
          + Add account
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2 p-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <div className="space-y-2 p-3">
          <Alert role="alert" variant="destructive">
            <AlertDescription>Could not load accounts.</AlertDescription>
          </Alert>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && (!data || data.length === 0) && (
        <div className="flex flex-col items-start gap-2 p-3">
          <span className="text-sm text-muted-foreground">No accounts yet.</span>
          <Button size="sm" onClick={() => setCreating(true)}>
            Create account
          </Button>
        </div>
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <ul className="space-y-1 p-2">
          {data.map((a) => (
            <li key={a.id}>
              <NavLink
                to={`/accounts/${a.id}`}
                className={({ isActive }) =>
                  cn(
                    'block rounded-md p-2 text-sm hover:bg-muted',
                    isActive && 'bg-muted font-medium',
                  )
                }
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span>{a.name}</span>
                  <span className="tabular-nums">{formatMoney(a.balance, a.currency)}</span>
                </div>
                {a.subtype?.type && (
                  <div className="text-xs text-muted-foreground">{a.subtype.type}</div>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      )}

      <CreateAccountDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm exec vitest run src/features/accounts/AccountsPane.test.tsx
just check
just test
```

Expected: all tests pass; full suite green.

- [ ] **Step 5: Manual UI smoke (golden path + edge cases)**

```bash
just run  # or `pnpm dev`
```

Open the app at `http://localhost:5173/app/`. Sign in (use a real backend or rely on the seeded auth-storage from previous testing). Verify:

1. The "+ Add account" button is visible at the top of the AccountsPane in every state.
2. The empty state shows the "Create account" CTA when the user has no accounts.
3. Opening the dialog: defaults populated, subtype = Cash, currency from configuration, balance = 0.
4. Switching the subtype dropdown swaps the fields below.
5. Submitting an empty name shows the inline error and does not call the API.
6. Submitting `-100` initial balance shows the overdraft-limit error; expanding "More options" and entering `100` allows submit.
7. Happy-path submit: dialog closes, the new account row appears in the pane, the URL becomes `/accounts/<new-id>`.

If any of these regressions appear, fix before moving on. Type checking and tests are not enough for UI behavior.

- [ ] **Step 6: Commit**

```bash
git add src/features/accounts/AccountsPane.tsx src/features/accounts/AccountsPane.test.tsx
git commit -m "feat(accounts): add 'Add account' trigger and wire dialog

Button at the top of AccountsPane (always visible) plus a CTA in the
empty state — both open the controlled CreateAccountDialog. URL-driven
selection on success kept intact."
```

---

### Task 15: Open the web PR

**Files:** none (git/gh operation).

- [ ] **Step 1: Final pre-flight check**

```bash
just check && just test && just build
```

All three must pass. `just build` catches Vite/TypeScript prod-mode issues that `tsc --noEmit` doesn't.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/create-account
gh pr create --title "feat: create account dialog with all subtypes" --body "$(cat <<'EOF'
## Summary
- New "Create account" modal opened from `AccountsPane` (top button + empty-state CTA), supporting all five backend subtypes (cash, bankAccount, eWallet, asset, loan) with their domain-specific fields.
- Discriminated-union zod schema with the negative-balance / overdraft-limit refinement that mirrors the new backend rule.
- `ApiClient` now parses `fieldErrors` and `code` from response bodies; the form maps `fieldErrors` onto the matching inputs.
- Vendored shadcn `dialog`, `select`, `form` primitives.
- New `useCreateAccount` mutation; cache is seeded + invalidated on success; navigates to `/accounts/<newId>`.

Depends on `homeaccounting/backend#<PR>` for the per-field `overdraftLimit` error response.

Spec: `docs/specs/2026-05-06-create-account-design.md`.
Plan: `docs/plans/2026-05-06-create-account.md`.

## Test plan
- [ ] `just check` (typecheck + lint + format-check) — clean.
- [ ] `just test` — all unit & component tests pass, including:
  - `client.test.ts` covers `fieldErrors` parsing.
  - `schema.test.ts` covers required name, currency enum, the four boundary cases of the negative-balance rule, malformed loan dueDate; `toCreateAccountRequest` shaping.
  - `CreateAccountDialog.test.tsx` covers defaults, validation, subtype field swap, happy path, server fieldErrors mapping, server 500 banner.
  - `AccountsPane.test.tsx` extended with new "Add account" button + empty-state CTA cases.
- [ ] Manual smoke (in dev server): create one account of each subtype against a real backend and confirm the row appears + URL navigates correctly.
EOF
)"
```

---

## Definition of done (full plan)

- Both PRs (`backend/feat/negative-balance-overdraft-rule`, `web/feat/create-account`) merged to their default branches.
- Backend CI green: `just check && just test`.
- Web CI green: `just check && just test && just build`.
- A signed-in user can:
  - Open "Create account" from the pane (top button) or the empty state.
  - Pick any of the five subtypes; subtype-specific fields render.
  - Submit; on success the dialog closes, the row appears, the URL changes to `/accounts/<newId>`.
  - See per-field validation errors when the backend rejects the input (`name`, `currency`, `initialBalance`, `overdraftLimit`).
- Backend rejects negative `initialBalance` unless an overdraft limit covers it (rule enforced at both the web handler and the domain handler).
