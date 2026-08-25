// Mirrors backend/src/Web/Types.hs and Domain/Core/Types.hs.
// Field-by-field source references in the plan, Task 8 header. Drift policy: spec §6.1.

export type UUID = string;
export type ISO8601 = string;

// --- OAuth provider (PascalCase JSON) ---

// JSON enum from Haskell `OAuthProvider` (Domain/Core/Types.hs:925-933) — Generic-derived,
// so values arrive PascalCased in JSON. The URL path capture (`/api/auth/oauth/:provider`)
// accepts lowercase ("google") because the backend parses it manually; the JSON body
// of `link-oauth` and entries in `oauthIdentities` are PascalCase. We intentionally use
// PascalCase as the canonical TS type and convert to/from URL slugs at the call site.
export type OAuthProviderName = 'Google' | 'GitHub' | 'Microsoft';

// --- Auth ---

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface OAuthRedirectResponse {
  redirectUrl: string;
  state: string;
}

export interface TelegramLinkCodeResponse {
  deepLink: string;
  expiresAt: ISO8601;
}

export interface LinkOAuthRequest {
  provider: OAuthProviderName;
  code: string;
  state: string;
}

export interface RefreshTokenRequest {
  token: string;
}

export interface AuthResponse {
  token: string;
  userId: UUID;
  email: string | null;
  expiresIn: number; // seconds
}

// --- Users ---

export interface OAuthIdentity {
  provider: OAuthProviderName;
  subject: string;
}

export interface TelegramIdentity {
  id: number;
  username: string | null;
  firstName: string;
}

export interface UserProfileResponse {
  userId: UUID;
  email: string | null;
  hasPassword: boolean;
  oauthIdentities: OAuthIdentity[];
  telegramIdentity: TelegramIdentity | null;
  externalAccountId: UUID;
}

// --- Accounts ---
// JSON shape from backend/src/Web/Types.hs:248-258 (`AccountResponse`).

export interface AccountSubtype {
  // Discriminator: "cash" | "bankAccount" | "eWallet" | "asset" | "loan".
  // Other fields vary by type — see backend/src/Web/Types.hs `fromAccountSubtype` for
  // the per-discriminator field set. The MVP UI only reads `.type` for display.
  type: string;
  [key: string]: unknown;
}

// Account lifecycle status. Mirrors backend fromAccountStatus
// (../server-infra/src/Web/Types.hs:793-795): every account starts "Opened".
export type AccountStatus = 'Opened' | 'Closed';

export interface AccountResponse {
  id: UUID;
  name: string;
  balance: number;
  currency: string;
  overdraftLimit: number | null;
  subtype: AccountSubtype | null;
  status: AccountStatus; // backend Web/Types.hs:260
  role: AccountRole; // tracker#29 — current user's role on this account
  version: number;
}

export interface AccountListResponse {
  accounts: AccountResponse[];
  totalCount: number;
}

// GET /api/sync/version — per-user counter that strictly increases whenever
// any writer mutates transactions/accounts the user can see. tracker#45.
export interface SyncVersionResponse {
  version: number;
}

// Request DTOs for POST /api/accounts. Mirror backend Web/Types.hs:138-204.

// Single source of truth for the closed enum values that mirror backend
// `Web.Types`. Components, schemas, and label maps import these arrays so
// no call site repeats the literal list.
// The account subtype *discriminator* — the `type` tag the backend emits/accepts
// on an AccountSubtype object (Web/Types.hs `fromAccountSubtype`: "cash", …).
// Distinct from AccountSubtypeKind (the CashKind/… enum used as map keys); see
// SUBTYPE_TYPE_TO_KIND below.
export const ACCOUNT_SUBTYPE_TYPES = ['cash', 'bankAccount', 'eWallet', 'asset', 'loan'] as const;
export type AccountSubtypeType = (typeof ACCOUNT_SUBTYPE_TYPES)[number];

// Account roles — mirrors backend AccountRole (Domain/Core/Types.hs). Wire tokens
// are lowercase (see backend roleToText).
export const ACCOUNT_ROLES = ['owner', 'editor', 'viewer'] as const;
export type AccountRole = (typeof ACCOUNT_ROLES)[number];

// Backend enums (closed sets at the Haskell level; backend also accepts
// freeform OtherCardNetwork/OtherAsset). The card-network UI exposes only the
// named set; the asset-type UI surfaces the freeform OtherAsset fallback via an
// "Other…" entry, so `assetType` below is a plain string, not this enum.
export const CARD_NETWORKS = ['visa', 'mastercard', 'amex'] as const;
export type CardNetwork = (typeof CARD_NETWORKS)[number];

// The named asset categories the UI offers directly. A user can also enter a
// freeform value via "Other…" (backend OtherAsset), so a stored/submitted
// assetType is any string — this list only drives the named Select options,
// their i18n labels, and secondary grouping.
export const ASSET_TYPES = [
  'property',
  'vehicle',
  'stocks',
  'retirementFund',
  'electronics',
  'equipment',
  'furniture',
] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

// Currencies the web UI offers at account creation. Matches the backend's
// `parseCurrency` accepted values for the create endpoint.
export const SUPPORTED_CURRENCIES = ['UAH', 'USD', 'EUR', 'GBP'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

// Mirrors backend AccountSubtypeRequest (Web/Types.hs:153-167). Backend's
// JSON shape is "type plus optional fields"; we keep the same flat shape.
export interface AccountSubtypeRequest {
  type: AccountSubtypeType;
  storageLocation?: string;
  bankName?: string;
  accountNumber?: string;
  cardNetwork?: CardNetwork;
  provider?: string;
  accountIdentifier?: string;
  assetType?: string;
  description?: string;
  lender?: string;
  interestRate?: number;
  dueDate?: string; // ISO date 'YYYY-MM-DD'
}

export interface CreateAccountRequest {
  name: string;
  initialBalance: number;
  currency: string; // SupportedCurrency at creation; widens to string at rest
  overdraftLimit?: number; // omit when none
  subtype?: AccountSubtypeRequest;
}

export interface RenameAccountRequest {
  name: string;
}

// POST /api/accounts/:id/share — backend AccountAPI.hs ShareAccountRequest.
export interface ShareAccountRequest {
  userId: UUID;
  role: AccountRole;
}

// GET /api/accounts/:id/access — backend AccountAPI.hs AccountAccessEntry.
// email/telegramUsername are display labels; either may be absent (backend omits
// Nothing fields from JSON).
export interface AccountAccessEntry {
  userId: UUID;
  role: AccountRole;
  email?: string | null;
  telegramUsername?: string | null;
}

export interface AccountAccessListResponse {
  access: AccountAccessEntry[];
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
// Mirrors backend Web/Types.hs `AdjustBalanceRequest`. `description` is stored as
// the synthetic adjustment transaction's description (AccountService.hs); it is
// optional (empty string allowed), matching the income/expense/transfer DTOs.
export interface AdjustBalanceRequest {
  targetBalance: number;
  currency: string;
  date: ISO8601;
  description: string;
}

// --- Transaction request DTOs ---
// Mirrors backend Web/Types.hs:349-389. ExpenseRequest is the base; IncomeRequest
// extends it with an optional `relation` field (Web/Types.hs:389). `category` is
// sent as JSON `Text` but the backend parses it to a `DictionaryEntryId` UUID via
// `parseCategoryId` (Web/Types.hs:1076-1080), so we type it as `UUID` on the wire.

// One category slice on a create request. Mirrors backend Web/Types.hs
// `CategoryAmount { category :: UUID, amount :: Double }`. Note `amount` is a
// bare number here (Double), unlike the Money-wrapped `Allocation` used by the
// set-allocations / amend endpoints below.
export interface CategoryAmount {
  category: UUID; // dictionary entry UUID
  amount: number;
  // Web/Types.hs:350 — comment :: Maybe Text. Free-text item note; trimmed and
  // blank → null server-side (Domain/Core/Types.hs:1077 normalizeComment).
  comment?: string | null;
}

// Two-bucket allocations on a create request. Mirrors backend Web/Types.hs
// `AllocationsRequest { incomes :: [CategoryAmount], expenses :: [CategoryAmount] }`.
// For an income the category goes in `incomes`; for an expense in `expenses`.
// The two-bucket (contra-reimbursement) case is not surfaced by the single-
// category UI, which always sends one slice in the bucket matching the kind.
export interface AllocationsRequest {
  incomes: CategoryAmount[];
  expenses: CategoryAmount[];
}

// Typed transaction relationships. Mirrors backend Web/Types.hs:649
// (TransactionRelation) — used for BOTH request and response. relationKind wire
// tokens come from Domain/Core/Types.hs renderRelationKind.
export type RelationKind = 'refund' | 'merge' | 'split' | 'associated';

export interface TransactionRelation {
  relatedTransactionId: UUID;
  relationKind: RelationKind;
}

// Mirrors POST /api/transactions/:id/relations body (backend Web/Types.hs TransactionRelation).
export type LinkRelationRequest = TransactionRelation;

// Mirrors POST /api/transactions/:id/merge body (backend Web/Types.hs
// `MergeTransactionsRequest`). `:id` is the merge TARGET (the survivor); each
// listed source is folded into it (allocations + amount combined) and then
// cancelled, with a `merge` lineage edge recorded source→target. Must be
// non-empty.
export interface MergeTransactionsRequest {
  sourceTransactionIds: UUID[];
}

// Mirrors backend Web/Types.hs:661 (GET /api/transactions/:id/relations).
export interface TransactionRelationsResponse {
  outbound: TransactionRelation[];
  inbound: TransactionRelation[];
}

// Mirrors backend Web/Types.hs `ExpenseRequest` (Web/Types.hs:349-380). There
// is no top-level `amount`; the categorised total is the sum of the allocation
// slices across both buckets. ExpenseRequest has no relation field.
export interface ExpenseRequest {
  accountId: UUID;
  currency: string;
  allocations: AllocationsRequest;
  description: string;
  date?: ISO8601; // omit → backend defaults to server time
  labels?: UUID[];
  // backend Web/Types.hs ExpenseRequest.contactId :: Maybe UUID
  contactId?: UUID | null;
}

// Mirrors backend Web/Types.hs:389 (IncomeRequest.relation :: Maybe TransactionRelation).
// IncomeRequest is a superset of ExpenseRequest — it adds an optional `relation`
// field used when creating a refund (or other linked income transaction).
export type IncomeRequest = ExpenseRequest & { relation?: TransactionRelation };

// Mirrors backend Web/Types.hs:406-422. `currency` here is the SOURCE
// account's currency (the form locks it to the source); the backend computes
// the target amount via `exchangeRate` (or its default if omitted).
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

// Edit transaction — per-field DTOs.
// Mirrors backend Web/Types.hs:408-484.

// Mirrors backend Domain/Core/Types.hs:228-249 (Money). The `amount` field
// on an Allocation is this Money object, not a bare number.
export interface Money {
  amount: number;
  currency: string;
}

// Mirrors backend Domain/Core/Types.hs (Allocation).
export interface Allocation {
  categoryId: UUID;
  amount: Money;
  // Domain/Core/Types.hs:1050 — comment :: Maybe Text.
  comment?: string | null;
}

// Two-bucket categorised side of a transaction. Mirrors backend
// Domain/Core/Types.hs `Allocations { incomes :: [Allocation], expenses :: [Allocation] }`.
// Carried by the set-allocations (PATCH) and amend endpoints. The single-
// category UI places its one slice in the bucket matching the transaction kind.
export interface Allocations {
  incomes: Allocation[];
  expenses: Allocation[];
}

export interface SetTransactionLabelsRequest {
  labels: UUID[];
}

export interface SetTransactionAllocationsRequest {
  newAllocations: Allocations;
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
  // Two-bucket allocations. The backend requires these on EVERY categorised
  // (income/expense) amendment — there is no within-kind/cross-kind
  // distinction; omitting them is rejected with
  // AllocationsRequiredForCategorisedKind. Optional here only because transfer
  // amendments (uncategorised) carry none. Allocation-only edits that leave the
  // total unchanged use the dedicated PATCH /allocations endpoint instead.
  newAllocations?: Allocations;
  // FULL desired state — absent/null CLEARS the contact; resend current to preserve (Web/Types.hs AmendTransactionRequest).
  contactId?: UUID | null;
}

// Body for PUT /api/transactions/:id/contact — replaces or (via null) clears
// the contact on a Completed transaction. Mirrors SetTransactionLabelsRequest.
export interface SetTransactionContactRequest {
  contactId: UUID | null;
}

// --- Transactions ---
// JSON shape from backend/src/Web/Types.hs:455-472 (`TransactionResponse`).

// Backend status text, see `fromTransactionStatus` in backend/src/Web/Types.hs.
export type TransactionStatusText =
  | 'Pending'
  | 'Completed'
  | 'Failed'
  | 'Cancelled'
  | (string & {});

// Backend `transactionType` discriminator. Serialized as lowercase by
// backend/src/Web/Types.hs `transactionTypeToText`:
//   Income _   -> "income"
//   Expense _  -> "expense"
//   Transfer   -> "transfer"
//   Adjustment -> "adjustment"
// Runtime values for the discriminator. Compare `transactionType` against
// these instead of hardcoding the string literals at each call site.
export const TRANSACTION_TYPE = {
  income: 'income',
  expense: 'expense',
  transfer: 'transfer',
  adjustment: 'adjustment',
} as const;

export type TransactionTypeText =
  | (typeof TRANSACTION_TYPE)[keyof typeof TRANSACTION_TYPE]
  | (string & {});

export interface TransactionResponse {
  id: UUID;
  sourceAccountId: UUID;
  targetAccountId: UUID;
  sourceAmount: number;
  sourceCurrency: string;
  targetAmount: number;
  targetCurrency: string;
  exchangeRate: number | null;
  description: string;
  status: TransactionStatusText;
  failureReason: string | null;
  transactionType: TransactionTypeText;
  // Two-bucket categorisation of the transaction. Mirrors backend
  // Web/Types.hs `TransactionResponse.allocations`. The previously flattened
  // `category :: string | null` was removed when the backend started returning
  // the full `Allocations` instead.
  allocations: Allocations;
  date: ISO8601;
  labels: UUID[];
  // Count of completed amendments; always 0 if never amended.
  // Source: backend Web/Types.hs `data TransactionResponse` (amendmentCount :: Word).
  amendmentCount: number;
  // Relations this transaction participates in. Mirrors backend Web/Types.hs:633
  // (TransactionResponse.relations :: [TransactionRelation]). Always present in
  // responses; empty array when the transaction has no relations.
  relations: TransactionRelation[];
  // Counterparty dictionary-entry id (id-only, no resolved name); `null` when
  // the transaction has no contact. Mirrors backend
  // Web/Types.hs TransactionResponse.contactId :: Maybe UUID.
  contactId: UUID | null;
  // Original provider category signal for imported transactions; `null` for
  // manual entries and providers that supply none. A tagged value: an
  // ISO-18245 merchant category code (`kind: 'mcc'`, 4-digit zero-padded) or a
  // provider's own label (`kind: 'label'`). Mirrors backend Web/Types.hs
  // `TransactionResponse.bankProviderCategory :: Maybe BankProviderCategory`
  // (serialised by Domain/Core/Types.hs `instance ToJSON BankProviderCategory`).
  // Lets the user read the signal of a miscategorised import and adjust their
  // provider-category → category mapping.
  bankProviderCategory: BankProviderCategory | null;
  // Raw provider counterparty token for imported transactions; `null` for
  // manual entries, transfers/adjustments, and providers that supply none. A
  // PLAIN string (unlike the tagged bankProviderCategory) — the backend key is
  // the bare trimmed token. Mirrors server-infra Web/Types.hs:693
  // `TransactionResponse.bankProviderContact :: Maybe BankProviderContact`
  // (plain-string ToJSON at Domain/Core/Types.hs). Lets the user map an
  // unmapped merchant to a contact from the edit dialog.
  bankProviderContact: string | null;
}

// A provider's category signal for a transaction, tagged by kind. `mcc` values
// are the 4-digit zero-padded code; `label` values are the provider's own
// free-text token; `counterparty` values are a universal counterparty token
// (EDRPOU / IBAN / stable descriptor — the same signal used for
// `bankProviderContact`). Mirrors backend `Domain.Core.Types.BankProviderCategory`
// (`{ "kind": "mcc" | "label" | "counterparty", "value": <string> }`, tracker#55).
export interface BankProviderCategory {
  kind: 'mcc' | 'label' | 'counterparty';
  value: string;
}

export interface TransactionListResponse {
  transactions: TransactionResponse[];
  totalCount: number; // all matches before paging
  // Effective page size/offset applied by the server (after defaulting).
  // Source: backend Web/Types.hs:565-575 (TransactionListResponse).
  limit: number;
  offset: number;
}

// Prompt (natural-language) DTOs — mirror server-infra/src/Web/API/PromptAPI.hs.
// PromptRequest { text :: Text, account :: Maybe AccountId }.
export interface PromptRequest {
  text: string;
  account?: UUID;
}

// One failed transaction in the response envelope: { index, reason }.
// `index` is the zero-based position in the parsed list.
export interface PromptFailure {
  index: number;
  reason: string;
}

// Kind-tagged success envelope from POST /api/prompt. Named `PromptResponse` to
// mirror the backend wire type (the backend's internal `PromptResult` domain
// type is a different thing). `succeeded` are full transactions; `failed` are
// commit-good/report-bad entries.
export interface PromptResponse {
  kind: 'transactions';
  succeeded: TransactionResponse[];
  failed: PromptFailure[];
}

// --- Configuration ---
// JSON shape from server-infra/src/Web/API/ConfigurationAPI.hs (ConfigurationResponse,
// ConfigurationDefaultsDTO, DictionaryResponse, BankingConfigurationDTO).
// Defaults are nested under `defaults` (incomeCategory/expenseCategory/account/
// subtypeAccounts); set via PUT /api/users/me/configuration/defaults.

// A committed/selectable entry, flattened out of the tree for the pickers.
// `id` is a DictionaryEntryId UUID; `name` is typically the full path
// ("Food / Groceries") as produced by flattenDictionary in api/dictionary.ts.
export interface DictionaryEntryResponse {
  id: UUID;
  name: string;
}

// Structural role of a dictionary entry (ADR 002, server-infra
// Domain/Core/Types.hs EntryRole): a "group" is a pure, non-assignable
// container; an "item" is an always-assignable leaf. The role is declared at
// creation and immutable.
export type EntryRole = 'group' | 'item';

// A node in the server-materialised dictionary tree. Mirrors backend
// Web/API/ConfigurationAPI.hs DictionaryEntryNode: role is carried explicitly
// (an empty group still has type "group"), and only groups may have children.
export interface DictionaryEntryNode {
  id: UUID;
  name: string;
  type: EntryRole;
  children: DictionaryEntryNode[];
}

// Server-materialised tree per dictionary. Mirrors backend
// Web/API/ConfigurationAPI.hs DictionaryResponse — `roots` carries the nested
// tree directly; there is no per-dictionary `groupsAssignable` flag (ADR 002).
export interface DictionaryResponse {
  roots: DictionaryEntryNode[];
}

export interface BankConnectionDTO {
  id: UUID;
  provider: string; // "monobank"
  name: string;
  enabled: boolean;
  tokenSet: boolean;
  tokenHint: string; // masked display only
  accountMap: Record<string, UUID>; // externalAccountId → local accountId
}

export interface ExternalAccountDTO {
  externalId: string;
  iban: string;
  maskedPan: string | null;
  currency: string;
  balance: number; // minor units, display only
}

// Mirrors backend Web/API/BankingAPI.hs AddConnectionRequest. `token` is
// optional server-side (bank providers may not require an upfront credential,
// e.g. file-import-only providers) — see tracker#38 pluggable bank providers.
export interface AddConnectionRequest {
  provider: string;
  name: string;
  token?: string;
  enabled: boolean;
}
// Mirrors backend Web/API/BankingAPI.hs UpdateConnectionRequest.
export interface UpdateConnectionRequest {
  name?: string;
  enabled?: boolean;
}
// Mirrors backend Web/API/BankingAPI.hs ChangeTokenRequest.
export interface ChangeTokenRequest {
  token: string;
}
export interface SetAccountMapRequest {
  accountMap: Record<string, UUID>;
}
export interface UpdateBankingRequest {
  // Keys are tagged provider-category strings (`"mcc:0742"` / `"label:…"` /
  // `"counterparty:…"`). Present replaces the whole map; absent means no change.
  // Mirrors backend Web/API/ConfigurationAPI.hs `UpdateBankingRequest.expenseCategoryMap`.
  expenseCategoryMap?: Record<string, UUID>;
  // Present replaces the whole income category map (set-semantics); absent = no
  // change. Keys are tagged provider-category strings (in practice only
  // `"counterparty:…"` — income carries no MCC/label). Mirrors backend
  // Web/API/ConfigurationAPI.hs:566 `UpdateBankingRequest.incomeCategoryMap` (tracker#55).
  incomeCategoryMap?: Record<string, UUID>;
  // Present replaces the whole contact map (set-semantics); absent = no change.
  // Keys are bare trimmed provider tokens. Mirrors server-infra
  // Web/API/ConfigurationAPI.hs:565 `UpdateBankingRequest.contactMap`.
  contactMap?: Record<string, UUID>;
}
export interface UpdateDefaultsRequest {
  incomeCategory?: UUID | null;
  expenseCategory?: UUID | null;
  account?: UUID | null;
  // Present = replaces the whole per-subtype map wholesale (omit a key to clear it).
  subtypeAccounts?: Partial<Record<AccountSubtypeKind, UUID>>;
}
// Mirrors backend Web/API/BankingAPI.hs ConnectionImportRequest (renamed from
// ResyncRequest) — the pull date-window body for
// POST /api/banking/connections/:id/import.
export interface ConnectionImportRequest {
  from: string;
  to: string;
} // ISO-8601 UTC
// Mirrors backend Web/API/BankingAPI.hs AccountImportSummary (renamed from
// ResyncAccountResult).
export interface AccountImportSummary {
  externalAccountId: string;
  localAccountId: UUID;
  importedCount: number;
  // Human-readable reason per skipped transaction (dedup, currency mismatch, …);
  // backend changed this from a bare `skippedCount: number`.
  skipped: string[];
  failureCount: number;
}
// Mirrors backend Web/API/BankingAPI.hs ImportResponse (renamed from
// ResyncResponse; adds `unresolved`). Returned by BOTH the pull import
// endpoint (POST /api/banking/connections/:id/import) and the file import
// endpoint (POST /api/banking/connections/:id/import/file).
export interface ImportResponse {
  accounts: AccountImportSummary[];
  unresolved: string[];
}

// Mirrors backend Web/API/ConfigurationAPI.hs BankProviderDTO — returned by
// GET /api/users/me/configuration/banking/providers.
export interface BankProviderDTO {
  id: string;
  displayName: string;
  supportsPull: boolean;
  supportsFile: boolean;
  // Backend Web/API/ConfigurationAPI.hs BankProviderDTO (countries/inUserCountry, tracker#47).
  countries: string[];
  inUserCountry: boolean;
}

export interface BankingConfigurationDTO {
  // The unified user-editable provider-category → category map. Keys are tagged
  // strings (`"mcc:0742"` / `"label:eating_out"`), seeded from banking defaults
  // (universal MCC defaults ∪ each provider's label defaults). Mirrors backend
  // Web/API/ConfigurationAPI.hs `BankingConfigurationDTO.expenseCategoryMap`.
  expenseCategoryMap: Record<string, UUID>;
  // User-editable provider-category → income-category map. Keys are tagged
  // strings (in practice only `"counterparty:…"` — income carries no MCC/label).
  // Starts empty (no seed; a counterparty token is user-specific). Mirrors
  // backend Web/API/ConfigurationAPI.hs:314 `BankingConfigurationDTO.incomeCategoryMap` (tracker#55).
  incomeCategoryMap: Record<string, UUID>;
  // User-editable provider-token → contact map. Keys are bare trimmed provider
  // counterparty tokens (no mcc:/label: tag). Starts empty (no seed). Mirrors
  // server-infra Web/API/ConfigurationAPI.hs:314 `BankingConfigurationDTO.contactMap`.
  contactMap: Record<string, UUID>;
  connections: BankConnectionDTO[];
}

// The account subtype *kind* — the backend `AccountSubtypeKind` enum
// (Domain/Core/Types.hs), whose constructor names ("CashKind", …) are used
// verbatim as the JSON keys of the `subtypeAccounts` map. SUBTYPE_TYPE_TO_KIND
// maps each discriminator type (cash, …) to its kind (CashKind, …).
export const SUBTYPE_TYPE_TO_KIND = {
  cash: 'CashKind',
  bankAccount: 'BankAccountKind',
  eWallet: 'EWalletKind',
  asset: 'AssetKind',
  loan: 'LoanKind',
} as const satisfies Record<AccountSubtypeType, string>;
export type AccountSubtypeKind = (typeof SUBTYPE_TYPE_TO_KIND)[AccountSubtypeType];

export interface ConfigurationDefaultsDTO {
  incomeCategory: UUID | null;
  expenseCategory: UUID | null;
  account: UUID | null;
  subtypeAccounts: Partial<Record<AccountSubtypeKind, UUID>>;
}

export interface ConfigurationResponse {
  baseCurrency: string;
  defaultCurrency: string;
  dictionaries: Record<string, DictionaryResponse>;
  defaults: ConfigurationDefaultsDTO;
  banking: BankingConfigurationDTO;
  bankingFeatureEnabled: boolean;
  // Backend Web/API/ConfigurationAPI.hs ConfigurationResponse (language ~449, country ~451).
  language: string;
  country: string | null;
  // Backend Web.API.ConfigurationAPI.ConfigurationResponse adds these:
  // booksClosedThrough has been present on the backend since the books-close
  // slice landed; baseCurrencyEditable is added in the issue-#16 backend PR.
  booksClosedThrough?: ISO8601 | null;
  baseCurrencyEditable: boolean;
}

// Mirrors backend Web/API/ConfigurationAPI.hs LocalizationOptionsResponse (~555).
export interface LocalizationOptionsResponse {
  languages: string[];
  countries: string[];
}
// Mirrors backend ChangeCountryRequest / ChangeLanguageRequest (~543/533).
export interface ChangeCountryRequest {
  country: string;
}
export interface ChangeLanguageRequest {
  language: string;
}

// Mirrors backend Web/API/UserAPI.hs:122-130.
export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

// Mirrors backend Web/API/ConfigurationAPI.hs:226-233.
export interface ChangeCurrencyRequest {
  currency: string;
}

// Mirrors backend Web/API/ConfigurationAPI.hs AddEntryRequest. `type` declares
// the immutable role (group container vs. item leaf); `parentId` nests under a
// group, or is absent/null for a root-level node.
export interface AddEntryRequest {
  name: string;
  type: EntryRole;
  parentId?: UUID | null;
}

// Mirrors backend Web/API/ConfigurationAPI.hs AddEntryResponse.
export interface AddEntryResponse {
  id: UUID;
  name: string;
}

// Mirrors backend Web/API/ConfigurationAPI.hs RenameEntryRequest.
export interface RenameEntryRequest {
  name: string;
}

// Mirrors backend Web/API/ConfigurationAPI.hs MoveEntryRequest — moves an entry
// under a new parent group, or to the root level when null/absent. Consumed by
// PATCH /api/users/me/configuration/dictionaries/:dictId/entries/:entryId/parent.
export interface MoveEntryRequest {
  parentId: UUID | null;
}

// --- API errors ---

export interface ApiError {
  status: number;
  code?: string;
  message: string;
  fieldErrors?: Record<string, string>;
}

// --- Reporting (mirrors server-infra/src/Web/Types.hs:683-737) ---

// CategorySpend { categoryId :: Text, total :: Money } — categoryId is a
// dictionary-entry UUID (same wire format as allocation DTOs).
export interface CategorySpend {
  categoryId: string;
  total: Money;
}

// SpendingByCategoryResponse { categories :: [CategorySpend], total :: Money }
// All amounts in base currency.
export interface SpendingByCategoryResponse {
  categories: CategorySpend[];
  total: Money;
}

// IncomeVsExpenseResponse { income, expense, net :: Money } — base currency.
export interface IncomeVsExpenseResponse {
  income: Money;
  expense: Money;
  net: Money;
}

// AccountNetWorth { accountId :: UUID, balance :: Money, baseBalance :: Money }
// balance is the account's NATIVE currency; baseBalance is its base-currency
// equivalent.
export interface AccountNetWorth {
  accountId: string;
  balance: Money;
  baseBalance: Money;
}

// NetWorthResponse { accounts :: [AccountNetWorth], total :: Money } — total in
// base currency. Period-independent (endpoint takes no date params).
export interface NetWorthResponse {
  accounts: AccountNetWorth[];
  total: Money;
}
