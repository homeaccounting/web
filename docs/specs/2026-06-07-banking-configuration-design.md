---
status: draft
---

# Banking Configuration — Design

**Date:** 2026-06-07
**Status:** Draft (pre-implementation)
**Issue:** [homeaccounting/web#23](https://github.com/homeaccounting/web/issues/23)
**Repos:** `server-infra` (backend, prerequisite) + `monorepo`/web (frontend)
**Scope:** Let a user configure banking (monobank) integration from the Profile page: manage one or more named bank connections (provider, token, enabled), map each connection's real monobank accounts to local accounts, edit shared categorization settings (default income/expense categories and the MCC→category map), and trigger an import ("Sync now") from a selected account that is mapped to an enabled connection.

**Predecessors:** [`2026-06-05-user-profile-design.md`](./2026-06-05-user-profile-design.md) (adds the `/profile/:tab` page and the `ProfileDictionariesPane` pattern this feature mirrors).

## 1. Purpose & scope

Issue #23: _"As a user I want to configure banking integration (monobank) in the user profile tab: each bank configured separately (sub-section): enabled/disabled, token, mcc-categories mapping (common for all banks)."_

The backend already imports monobank statements (`POST /api/banking/resync` with an `X-Banking-Token` header) and stores categorization settings (`defaultIncomeCategory`, `defaultExpenseCategory`, `mccExpenseCategoryMap`) via `PUT /api/users/me/configuration/banking`. What is missing: there is **no persisted notion of a bank connection** — no stored token, no enabled flag, no per-bank record. The token is supplied transiently per request. This feature adds persisted, encrypted, per-connection configuration and a UI to manage it, then routes import through the stored token.

This is a **cross-repo feature**: the frontend depends on a new backend contract, so the backend ships first (§2) and the frontend builds against it (§3).

### In scope

- **Backend (`server-infra`):** a `BankConnection` aggregate sub-record (provider, name, encrypted token, enabled, account mapping), AES-256-GCM token encryption at rest, new domain events, connection CRUD endpoints, an endpoint that lists a connection's real monobank accounts (live call), an endpoint to set the external→local account mapping, and a connection-scoped resync endpoint that uses the stored token and routes by external account id.
- **Frontend (web):** a new **Banking** tab on `/profile/:tab` with three cards — connections (CRUD + enable/disable + account mapping), default categories, MCC→category map — and a **Sync now** action relocated to the Accounts toolbar.

### Explicitly out of scope (deferred)

- Non-monobank providers. The model is provider-extensible (`BankProvider` sum type with a single `Monobank` today), but only monobank is exposed.
- Webhook / real-time auto-sync (already deferred to backend Phase 2).
- Key **rotation tooling**. The ciphertext envelope carries a `keyVersion` field so a future rotation is possible, but no re-encryption job is built here.
- Scheduled / automatic imports. "Sync now" is manual and user-triggered.
- Auto-creating local accounts from monobank, or auto-filling a local account's IBAN. The user maps to **existing** local accounts only; no account fields are written by this feature.
- Continuous re-mapping. The mapping is set explicitly by the user; if they later add a new monobank card, they re-open "Link accounts" to refresh and map it.

## 2. Backend dependency (`server-infra`, prerequisite PR)

All of §2 ships before any frontend work. File references below are the current locations to extend.

### 2.0 Respect the global banking feature flag

The server has a **global kill-switch** in `BankingConfig` (`Infrastructure/Config.hs:329`): banking is available only when `cfg.banking.enabled && cfg.banking.providers.monobank.enabled`. Today only the resync handler enforces it (`Web/API/BankingAPI.hs:205`), throwing `FeatureDisabled "banking"` → **404 / `code: "FEATURE_DISABLED"`** (`Web/ErrorMapping.hs:163`), which intentionally hides the endpoint's existence.

This flag is **global, for all users**, and is distinct from a connection's per-user `enabled` field. It must be honored by everything this feature adds:

- **Extract the gate** from `resyncHandler` into a shared helper (e.g. `requireBankingEnabled :: AppM ()`) and apply it at the start of **every new banking-operation endpoint**: connection CRUD (`POST/PUT/PUT token/DELETE …/connections`), set-accounts, external-accounts, and connection resync. All return the same 404 `FEATURE_DISABLED` when off.
- **`GET …/configuration` is NOT gated** (it must keep returning the rest of the config), but it **exposes the flag** so the client can react — see `bankingFeatureEnabled` in §2.4.
- The existing `PUT …/banking` (defaults + MCC map) is categorization-only and stays ungated.

The effective ability to sync is therefore: `bankingFeatureEnabled` (global) **AND** connection `enabled` (per-user) **AND** the account is in that connection's `accountMap`.

### 2.1 Domain model (`Domain/Configuration/Projection.hs`)

`BankingConfiguration` keeps its three existing fields and gains a `connections` map. New types:

```haskell
data BankProvider = Monobank
  deriving (Show, Eq, Ord, Generic)            -- extensible; only Monobank today

newtype BankConnectionId = BankConnectionId UUID
type ExternalAccountId = Text                    -- monobank's stable account id (MonoAccount JSON `id`)

data BankConnection = BankConnection
  { connectionId   :: !BankConnectionId
  , provider       :: !BankProvider
  , name           :: !Text                     -- display label only (NOT a join key); non-empty
  , encryptedToken :: !EncryptedSecret           -- ciphertext envelope; never plaintext
  , tokenHint      :: !Text                      -- non-secret, last ~4 chars for masked display
  , enabled        :: !Bool
  , accountMap     :: !(Map ExternalAccountId AccountId)  -- monobank account → local account
  }

-- BankingConfiguration gains:
--   connections :: Map BankConnectionId BankConnection
-- (defaultIncomeCategory, defaultExpenseCategory, mccExpenseCategoryMap unchanged)
```

**Explicit mapping is the join — no typed identifiers route transactions.** Each connection holds an `accountMap` from monobank's stable `ExternalAccountId` (which the user never types — see §3.4: it is fetched live and chosen from a dropdown) to a local `AccountId`. Import routes strictly by this map (§2.5), replacing the previous exact-IBAN string match. The Sync action and all gating key off the map's local-account _values_. `name` is a human label only; duplicates are allowed.

**At most one connection per local account.** A local account may be the target of at most one connection's mapping. The command handler rejects a mapping whose value is already a target of a different connection, with a field error. **Local `AccountId`s are validated** (exist, belong to the caller, Owner/Editor role). **`ExternalAccountId`s are treated as opaque keys — NOT live-validated on save** (no monobank round-trip when setting the map); a key that matches no real monobank account simply never routes anything during resync (harmless skip, surfaced as unmapped). This keeps `PUT …/accounts` a pure local write; the live monobank list is only fetched by the read-only external-accounts endpoint that populates the picker. If a mapped local account is later deleted, the projection and UI ignore the now-dangling entry (no error).

### 2.2 Token encryption (`Infrastructure/Crypto/SecretBox.hs`, new)

- Algorithm: **AES-256-GCM** via the existing `cryptonite` dependency (already used in `Infrastructure/Auth/{JWT,OAuth,Password}.hs`).
- Envelope serialized as base64 text inside the event:
  ```haskell
  data EncryptedSecret = EncryptedSecret
    { keyVersion :: !Int      -- selects the master key; enables future rotation
    , nonce      :: !Text     -- base64, 12-byte random GCM nonce (fresh per encryption)
    , ciphertext :: !Text     -- base64
    , authTag    :: !Text     -- base64 GCM tag
    }
  ```
- Master key from env **`BANKING_TOKEN_ENC_KEY`** (base64, 32 bytes), wired through `Infrastructure/Config.hs`. Dev provides a default key with a loud warning; production startup **fails fast** if the key is missing/short.
- `encryptSecret :: Key -> PlainToken -> IO EncryptedSecret` (random nonce each call); `decryptSecret :: KeyRing -> EncryptedSecret -> Either CryptoError PlainToken` (selects key by `keyVersion`).
- Encryption happens in the **service/command layer** so only ciphertext ever enters the event log. The projection carries ciphertext opaquely; nothing in the read path decrypts except the resync handler (§2.5).
- **Considered and deferred:** per-user envelope encryption (random per-user DEK wrapped by the master KEK) for blast-radius isolation, and passphrase-derived zero-knowledge keys. Rejected for now — passphrase keys can't cover OAuth-only users and break server-side sync; envelope encryption adds complexity without changing the fundamental fact that sync requires server-side decryption. A single master key is used; in production it should be sourced from a KMS/secret manager rather than a raw env var (ops concern, not built here). The `keyVersion` field leaves room to revisit.

### 2.3 Events (`Domain/Configuration/Events.hs`, additive)

New event constructors (existing currency/dictionary/defaults/MCC events untouched):

| Event                         | Payload                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `BankConnectionAdded`         | `connectionId, provider, name, encryptedToken, tokenHint, enabled` (empty `accountMap`) |
| `BankConnectionRenamed`       | `connectionId, name`                                                                    |
| `BankConnectionTokenChanged`  | `connectionId, encryptedToken, tokenHint`                                               |
| `BankConnectionEnabledSet`    | `connectionId, enabled`                                                                 |
| `BankConnectionAccountMapSet` | `connectionId, accountMap`                                                              |
| `BankConnectionRemoved`       | `connectionId`                                                                          |

The projection folds these into the `connections` map. `Domain/Configuration/Defaults.hs` `defaultMccExpenseCategoryMap` is unaffected.

### 2.4 Configuration API (`Web/API/ConfigurationAPI.hs`)

`BankingConfigurationDTO` gains `connections :: [BankConnectionDTO]`:

```haskell
data BankConnectionDTO = BankConnectionDTO
  { id         :: UUID
  , provider   :: Text                  -- "monobank"
  , name       :: Text
  , enabled    :: Bool
  , tokenSet   :: Bool                  -- always true today; future-proofs "no token yet"
  , tokenHint  :: Text                  -- last ~4 chars, e.g. "3f2"; NEVER the token
  , accountMap :: Map Text UUID         -- externalAccountId → local accountId
  }

-- Returned by the live "list external accounts" call (NOT persisted):
data ExternalAccountDTO = ExternalAccountDTO
  { externalId :: Text     -- stable monobank account id
  , iban       :: Text
  , maskedPan  :: Maybe Text
  , currency   :: Text     -- ISO-4217 alpha, derived from numeric code
  , balance    :: Integer  -- minor units, for display
  }
```

`ConfigurationResponse` also gains a top-level **`bankingFeatureEnabled :: Bool`** (= the global flag from §2.0, `cfg.banking.enabled && monobank.enabled`), populated in the handler from app config. This is how the client learns whether to show the Banking tab and the Sync action at all.

The plaintext token is **never** serialized in any GET response. New routes, siblings of the existing `PUT …/banking`:

| Method & path                                                         | Body                                    | Response                                                                                                                                                                                                              |
| --------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST   /api/users/me/configuration/banking/connections`              | `{provider, name, token, enabled}`      | `BankConnectionDTO` (201)                                                                                                                                                                                             |
| `PUT    /api/users/me/configuration/banking/connections/:id`          | `{name?, enabled?}`                     | `204`                                                                                                                                                                                                                 |
| `PUT    /api/users/me/configuration/banking/connections/:id/token`    | `{token}`                               | `204`                                                                                                                                                                                                                 |
| `DELETE /api/users/me/configuration/banking/connections/:id`          | —                                       | `204`                                                                                                                                                                                                                 |
| `GET    /api/banking/connections/:id/external-accounts`               | —                                       | `[ExternalAccountDTO]` — **live monobank call** using the stored token (decrypts server-side). 502/`BANKING_UPSTREAM` on monobank failure; 429/`BANKING_RATE_LIMITED` when monobank throttles (~1 req/60s per token). |
| `PUT    /api/users/me/configuration/banking/connections/:id/accounts` | `{accountMap: {externalId: accountId}}` | `204` — validates the local account ids (exist, owned, Owner/Editor) and the at-most-one-connection-per-account rule; external ids are opaque keys (not live-validated, see §2.1)                                     |

The existing `PUT /api/users/me/configuration/banking` (defaults + MCC map, partial) is unchanged and still returns the full `BankingConfigurationDTO` (200).

### 2.5 Resync (`Web/API/BankingAPI.hs`) — **breaking change**

- **Remove** the header-based `POST /api/banking/resync` (the `X-Banking-Token` flow). _Decision: replace, not keep — chosen during brainstorming over the additive option._
- **Add** `POST /api/banking/connections/:id/resync` with body `{from, to}` (existing `ResyncRequest`, max 31-day range). The handler:
  1. loads the caller's connection by `:id` (404 if absent),
  2. rejects if `enabled == false` (422/`CONNECTION_DISABLED`),
  3. decrypts the stored token server-side, fetches statements, and routes each monobank account's transactions to the local account via the connection's `accountMap` (lookup by `ExternalAccountId`),
  4. returns the existing `ResyncResponse`; monobank accounts absent from the map are reported as skipped (not an error).
- **Replace** the IBAN-matching `buildBankLink` (`Web/API/BankingAPI.hs:281–323`, exact `props.accountNumber == Just bankIBAN`) with an `accountMap` lookup. The Owner/Editor write-permission check on the target local accounts is preserved. _Decision: route by stable `externalId`, not typed IBAN — chosen during brainstorming to eliminate the typed-identifier fragility._

> **No migration needed.** The header-based resync flow has **no production/runtime callers** — its only users are the backend test spec (`test/Web/API/BankingAPISpec.hs`) and the `scripts/api-test/test-banking.sh` smoke-test. Both are updated to the connection-scoped endpoint as ordinary work within the backend PR. (As a sanity check, the implementer still greps `server-infra` for `X-Banking-Token` to confirm nothing else appeared.)

### 2.6 Backend tests

- Crypto round-trip (`encrypt` then `decrypt` == identity; tampered tag fails; wrong `keyVersion` fails).
- Projection folds for each new event; `accountMap` set/replace; rejection when a local account is already mapped by another connection.
- API: add/rename/enable/changeToken/remove happy paths; GET never leaks token; `tokenHint` reflects last token set; set-accounts validates external ids and the one-connection-per-account rule.
- External-accounts: maps `MonoClientInfo` → `[ExternalAccountDTO]`; surfaces upstream failure as 502 and throttle as 429 (use a stubbed monobank client, no live call in tests).
- Resync: disabled → 422; unknown id → 404; enabled → routes by `accountMap`; monobank account not in the map → reported skipped; Viewer-only target rejected.
- Global feature flag (§2.0): with `banking.enabled=false` (or monobank disabled), every new banking endpoint (connection CRUD, set-accounts, external-accounts, connection resync) returns 404 `FEATURE_DISABLED`; `GET …/configuration` still succeeds and reports `bankingFeatureEnabled=false`.

## 3. Frontend (web)

Builds against §2. Mirrors existing feature conventions (`useCreateAccount` mutation shape, `ProfileDictionariesPane` card layout, `src/test/handlers.ts` MSW).

### 3.1 DTOs (`src/api/types.ts`)

Per the repo's DTO-lockstep rule, cite `server-infra/src/Web/API/ConfigurationAPI.hs` in comments. Add:

```ts
export interface BankConnectionDTO {
  id: UUID;
  provider: string; // "monobank"
  name: string;
  enabled: boolean;
  tokenSet: boolean;
  tokenHint: string; // masked display only
  accountMap: Record<string, UUID>; // externalAccountId → local accountId
}

export interface BankingConfigurationDTO {
  defaultIncomeCategory: UUID | null;
  defaultExpenseCategory: UUID | null;
  mccExpenseCategoryMap: Record<string, UUID>;
  connections: BankConnectionDTO[]; // NEW
}

// ConfigurationResponse gains (top-level, §2.0/§2.4):
//   bankingFeatureEnabled: boolean;    // global kill-switch — gates the whole Banking UI

export interface ExternalAccountDTO {
  // from the live list call; not persisted
  externalId: string;
  iban: string;
  maskedPan: string | null;
  currency: string;
  balance: number; // minor units, display only
}

export interface AddBankConnectionRequest {
  provider: string;
  name: string;
  token: string;
  enabled: boolean;
}
export interface UpdateBankConnectionRequest {
  name?: string;
  enabled?: boolean;
}
export interface ChangeBankTokenRequest {
  token: string;
}
export interface SetAccountMapRequest {
  accountMap: Record<string, UUID>;
}
export interface UpdateBankingRequest {
  defaultIncomeCategory?: UUID | null;
  defaultExpenseCategory?: UUID | null;
  mccExpenseCategoryMap?: Record<string, UUID>;
}
export interface ResyncRequest {
  from: string;
  to: string;
} // ISO-8601 UTC
export interface ResyncResponse {
  accounts: ResyncAccountResult[];
}
```

### 3.2 API client

- `src/api/configuration.ts`: add `updateBanking(body)`, `addConnection(body)`, `updateConnection(id, body)`, `changeToken(id, body)`, `removeConnection(id)`, `setAccountMap(id, body)`.
- `src/api/banking.ts` (new): `resync(connectionId, body): Promise<ResyncResponse>` and `listExternalAccounts(connectionId): Promise<ExternalAccountDTO[]>`.

### 3.3 Hooks (`src/features/configuration/`)

Each mutation follows the existing pattern (ApiClient from `tokenRef`, `onUnauthorized: signOut`, invalidate `['configuration']` on success): `useUpdateBanking`, `useAddConnection`, `useUpdateConnection`, `useChangeToken`, `useRemoveConnection`, `useSetAccountMap`, and `useResync` (in `src/features/banking/` or `accounts/`). `useExternalAccounts(connectionId)` is a **lazy query** (`enabled: false` / fetched on demand when the Link-accounts dialog opens) — it triggers the live monobank call; surface 429 (`BANKING_RATE_LIMITED`) as a "try again in a moment" message with a retry button. Server field errors surface via `ApiError.fieldErrors` → `form.setError`, as in `CreateAccountDialog`.

### 3.4 Banking tab (`src/features/profile/ProfileBankingPane.tsx`, new)

Add `'banking'` to `TABS` in `src/pages/ProfilePage.tsx:8` with a `TabsTrigger` + `TabsContent`, **rendered only when `config.bankingFeatureEnabled` is true** (§2.0). When the global flag is false the tab is hidden entirely, and navigating directly to `/profile/banking` redirects to `/profile/general` (consistent with the backend's "404 hides existence"). As defense-in-depth, any banking call that returns `FEATURE_DISABLED` mid-session is treated the same as the flag being off. The pane stacks three shadcn `Card`s like `ProfileDictionariesPane`:

1. **Bank connections** — list each connection (name, provider badge, masked `••••{tokenHint}`, enabled `Switch`, mapped-account count, **Link accounts**, Edit, Remove) + "Add connection". `BankConnectionDialog.tsx` (react-hook-form + zod): `name` (non-empty), `provider` (monobank), `token` (password, **write-only** — blank on edit means "keep existing"; required on create), `enabled`. Enable/disable toggles inline via `useUpdateConnection`.
   - **Link accounts** (`LinkAccountsDialog.tsx`, separate two-step flow) — opens on a saved connection, calls `useExternalAccounts(id)` to fetch the real monobank accounts, and renders one row per external account: its IBAN / masked card / currency / balance and a `Select` of the user's local accounts (pre-selected from the current `accountMap`; "— not imported —" to leave unmapped). Disallows mapping two external accounts to the same local account. Saves via `useSetAccountMap`. Shows a loading state during the live call and a retryable message on 429.
2. **Default categories** — two selects (income/expense fallback) populated from `config.dictionaries['income-category' | 'expense-category']`; saved via `useUpdateBanking`.
3. **MCC → category mapping** — `MccMappingEditor`: editable rows of `{ mcc, categoryId }` (zod: `mcc` is exactly 4 digits; category is an expense-dictionary entry) with add/remove; saved via `useUpdateBanking` (`mccExpenseCategoryMap`).

shadcn **`switch`** component is added (`pnpm dlx shadcn@latest add switch`) — no toggle exists yet.

### 3.5 "Sync now" account action (`src/features/accounts/AccountsPane.tsx`)

A new toolbar icon button (beside Edit / Adjust / Add), gated by **all** of:

0. the global feature flag is on (`config.bankingFeatureEnabled`, §2.0),
1. an account is selected (`selectedAccount`),
2. the selected account's `id` appears as a **value** in some connection's `accountMap`,
3. that connection is **enabled** (per-user).

This is a pure flag check + id lookup over `config.banking.connections` — no string matching, no dependence on `bankName`. When no enabled connection maps the account, the button is **hidden** (not just disabled), since it is meaningless. On click it calls `useResync(mappedConnection.id, { from, to })` with a **fixed default 30-day window** ending today (no dialog) — _decision from brainstorming over the From/To-dialog option_. Result surfaces as a toast: imported/skipped/failed counts from `ResyncResponse`; errors (e.g. token rejected by monobank) as a destructive toast.

### 3.6 Frontend tests

- MSW handlers in `src/test/handlers.ts` for the connection routes, `PUT …/banking`, set-accounts, external-accounts (incl. a 429 variant), and connection resync.
- Component tests: `ProfileBankingPane` (renders three cards, lists connections, masks token, shows mapped-account count), `BankConnectionDialog` (create requires token; edit allows blank token = keep; field-error mapping), `LinkAccountsDialog` (fetches external accounts, pre-selects from `accountMap`, blocks duplicate local-account selection, 429 retry), `MccMappingEditor` (4-digit validation, add/remove), and `AccountsPane` Sync gating (shown only when `bankingFeatureEnabled` AND the account is a value in an enabled connection's `accountMap`; hidden otherwise; calls resync with a 30-day window). Also: `ProfilePage` hides the Banking tab and redirects `/profile/banking` → `/profile/general` when `bankingFeatureEnabled` is false.
- Playwright smoke: open `/profile/banking`, add a connection, see it listed with masked token.

## 4. Sequencing & deliverables

Two implementation plans, backend first:

1. **`server-infra` plan** — §2 (crypto, events, projection, DTOs, connection CRUD, resync replacement, tests). Ships and defines the contract.
2. **web plan** — §3, built against the shipped contract.

This shared design doc is the seam between them. Each plan is produced via the writing-plans skill after this spec is approved.

## 5. Open risks

- **`buildBankLink` replacement:** routing changes from exact-IBAN match to `accountMap` lookup. The backend test spec and the `test-banking.sh` smoke-test are updated accordingly; verify no other path depends on IBAN matching. (Replacing the header-based resync needs no migration — see §2.5.)
- **Key management:** `BANKING_TOKEN_ENC_KEY` must be provisioned in every backend environment before deploy; a missing key fails startup by design. Losing the key makes stored tokens unrecoverable (users must re-enter tokens) — acceptable, documented.
- **Live monobank call in config:** the external-accounts fetch is rate-limited (~1 req/60s per token). The Link-accounts dialog must handle 429 gracefully (retry affordance), and is the only config step that depends on monobank being reachable.
- **Stale mapping:** if a user adds a new monobank card after mapping, its transactions are skipped until they re-open Link accounts and map it. The Sync result reports skipped (unmapped) external accounts so this is visible. A deleted local account leaves a dangling map entry that is ignored.
