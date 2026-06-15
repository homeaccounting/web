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
  version: number;
}

export interface AccountListResponse {
  accounts: AccountResponse[];
  totalCount: number;
}

// Request DTOs for POST /api/accounts. Mirror backend Web/Types.hs:138-204.

// Single source of truth for the closed enum values that mirror backend
// `Web.Types`. Components, schemas, and label maps import these arrays so
// no call site repeats the literal list.
export const ACCOUNT_SUBTYPE_KINDS = ['cash', 'bankAccount', 'eWallet', 'asset', 'loan'] as const;
export type AccountSubtypeKind = (typeof ACCOUNT_SUBTYPE_KINDS)[number];

// Backend enums (closed sets at the Haskell level; backend also accepts
// freeform OtherCardNetwork/OtherAsset, but the web UI does not expose those).
export const CARD_NETWORK_KINDS = ['visa', 'mastercard', 'amex'] as const;
export type CardNetworkKind = (typeof CARD_NETWORK_KINDS)[number];

export const ASSET_TYPE_KINDS = ['property', 'vehicle', 'stocks', 'retirementFund'] as const;
export type AssetTypeKind = (typeof ASSET_TYPE_KINDS)[number];

// Currencies the web UI offers at account creation. Matches the backend's
// `parseCurrency` accepted values for the create endpoint.
export const SUPPORTED_CURRENCIES = ['UAH', 'USD', 'EUR', 'GBP'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

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
  currency: string; // SupportedCurrency at creation; widens to string at rest
  overdraftLimit?: number; // omit when none
  subtype?: AccountSubtypeRequest;
}

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
// Mirrors backend Web/Types.hs:349-380 (IncomeRequest and ExpenseRequest are
// structurally identical there). `category` is sent as JSON `Text` but the
// backend parses it to a `DictionaryEntryId` UUID via `parseCategoryId`
// (Web/Types.hs:1076-1080), so we type it as `UUID` (a string) on the wire.
// One category slice on a create request. Mirrors backend Web/Types.hs
// `CategoryAmount { category :: UUID, amount :: Double }`. Note `amount` is a
// bare number here (Double), unlike the Money-wrapped `Allocation` used by the
// set-allocations / amend endpoints below.
export interface CategoryAmount {
  category: UUID; // dictionary entry UUID
  amount: number;
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

// Mirrors backend Web/Types.hs `IncomeRequest`/`ExpenseRequest` (structurally
// identical). There is no top-level `amount`; the categorised total is the sum
// of the allocation slices across both buckets.
export interface IncomeRequest {
  accountId: UUID;
  currency: string;
  allocations: AllocationsRequest;
  description: string;
  date?: ISO8601; // omit → backend defaults to server time
  labels?: UUID[];
}

export type ExpenseRequest = IncomeRequest;

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
  // Two-bucket; required by the backend only on a cross-kind amendment.
  // This slice always omits it for within-kind amount edits and uses the
  // dedicated PATCH /allocations endpoint for allocation changes.
  newAllocations?: Allocations;
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
export type TransferTypeText = 'income' | 'expense' | 'transfer' | 'adjustment' | (string & {});

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
  transactionType: TransferTypeText;
  category: string | null;
  date: ISO8601;
  labels: UUID[];
  // Count of completed amendments; always 0 if never amended.
  // Source: backend Web/Types.hs `data TransactionResponse` (amendmentCount :: Word).
  amendmentCount: number;
}

export interface TransactionListResponse {
  transactions: TransactionResponse[];
  totalCount: number; // all matches before paging
  // Effective page size/offset applied by the server (after defaulting).
  // Source: backend Web/Types.hs:565-575 (TransactionListResponse).
  limit: number;
  offset: number;
}

// --- Configuration ---
// JSON shape from backend/src/Web/API/ConfigurationAPI.hs (ConfigurationResponse,
// DictionaryResponse, DictionaryEntryResponse, BankingConfigurationDTO).

export interface DictionaryEntryResponse {
  id: UUID;
  name: string;
}

export interface DictionaryResponse {
  entries: DictionaryEntryResponse[];
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
export interface ResyncAccountResult {
  externalAccountId: string;
  localAccountId: UUID;
  importedCount: number;
  skippedCount: number;
  failureCount: number;
}
export interface ResyncResponse {
  accounts: ResyncAccountResult[];
}

export interface BankingConfigurationDTO {
  defaultIncomeCategory: UUID | null;
  defaultExpenseCategory: UUID | null;
  mccExpenseCategoryMap: Record<string, UUID>;
  connections: BankConnectionDTO[];
}

export interface ConfigurationResponse {
  baseCurrency: string;
  defaultCurrency: string;
  dictionaries: Record<string, DictionaryResponse>;
  banking: BankingConfigurationDTO;
  bankingFeatureEnabled: boolean;
  // Backend Web.API.ConfigurationAPI.ConfigurationResponse adds these:
  // booksClosedThrough has been present on the backend since the books-close
  // slice landed; baseCurrencyEditable is added in the issue-#16 backend PR.
  booksClosedThrough?: ISO8601 | null;
  baseCurrencyEditable: boolean;
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

// Mirrors backend Web/API/ConfigurationAPI.hs:236-243.
export interface AddEntryRequest {
  name: string;
}

// Mirrors backend Web/API/ConfigurationAPI.hs:246-254.
export interface AddEntryResponse {
  id: UUID;
  name: string;
}

// Mirrors backend Web/API/ConfigurationAPI.hs:257-264.
export interface RenameEntryRequest {
  name: string;
}

// --- API errors ---

export interface ApiError {
  status: number;
  code?: string;
  message: string;
  fieldErrors?: Record<string, string>;
}
