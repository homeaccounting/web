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

export interface AccountResponse {
  id: UUID;
  name: string;
  balance: number;
  currency: string;
  overdraftLimit: number | null;
  subtype: AccountSubtype | null;
  version: number;
}

export interface AccountListResponse {
  accounts: AccountResponse[];
  totalCount: number;
}

// --- Transactions ---
// JSON shape from backend/src/Web/Types.hs:455-472 (`TransactionResponse`).

// Backend status text, see `fromTransactionStatus` in backend/src/Web/Types.hs.
export type TransactionStatusText = 'Pending' | 'Completed' | 'Failed' | (string & {});

// Backend `transferType` discriminator, see `transferTypeToText` in backend/src/Web/Types.hs.
// Confirm exact strings in Step 8.1; the MVP UI does not branch on this.
export type TransferTypeText = 'Income' | 'Expense' | 'Transfer' | (string & {});

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
  transferType: TransferTypeText;
  category: string | null;
  date: ISO8601;
  labels: UUID[];
}

export interface TransactionListResponse {
  transactions: TransactionResponse[];
  totalCount: number;
}

// --- API errors ---

export interface ApiError {
  status: number;
  code?: string;
  message: string;
  fieldErrors?: Record<string, string>;
}
