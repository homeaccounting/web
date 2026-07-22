import type {
  AccountResponse,
  AuthResponse,
  BankConnectionDTO,
  ConfigurationResponse,
  ExternalAccountDTO,
  IncomeVsExpenseResponse,
  NetWorthResponse,
  SpendingByCategoryResponse,
  TelegramLinkCodeResponse,
  TransactionResponse,
  UserProfileResponse,
} from '@/api/types';

export const foodCategoryId = '00000000-0000-0000-0000-00000000f00d';
export const tripLabelId = '00000000-0000-0000-0000-0000000017a1';

export const authResponseFixture: AuthResponse = {
  token: 'jwt-test',
  userId: 'user-1',
  email: 'alice@example.com',
  expiresIn: 3600,
};

export const profileFixture: UserProfileResponse = {
  userId: 'user-1',
  email: 'alice@example.com',
  hasPassword: true,
  oauthIdentities: [],
  telegramIdentity: null,
  externalAccountId: 'ext-1',
};

export const accountFixture: AccountResponse = {
  id: 'a1',
  name: 'Checking',
  balance: 1234.56,
  currency: 'USD',
  overdraftLimit: null,
  subtype: { type: 'bankAccount', bankName: 'ACME' },
  status: 'Opened',
  role: 'owner',
  version: 1,
};

export const closedAccountFixture: AccountResponse = {
  id: 'a2',
  name: 'Old Savings',
  balance: 0,
  currency: 'USD',
  overdraftLimit: null,
  subtype: { type: 'bankAccount', bankName: 'ACME' },
  status: 'Closed',
  role: 'owner',
  version: 1,
};

export const telegramLinkCodeFixture: TelegramLinkCodeResponse = {
  deepLink: 'https://t.me/HomeAccountingBot?start=LINK_test-token',
  expiresAt: '2026-04-29T12:34:56Z',
};

export const transactionFixture: TransactionResponse = {
  id: 't1',
  sourceAccountId: 'a1',
  targetAccountId: 'a1',
  sourceAmount: -3.5,
  sourceCurrency: 'USD',
  targetAmount: -3.5,
  targetCurrency: 'USD',
  exchangeRate: null,
  description: 'Coffee',
  status: 'Completed',
  failureReason: null,
  transactionType: 'expense',
  allocations: {
    incomes: [],
    expenses: [
      { categoryId: foodCategoryId, amount: { amount: 3.5, currency: 'USD' }, comment: 'latte' },
    ],
  },
  date: '2026-04-27T08:00:00Z',
  labels: [],
  amendmentCount: 0,
  relations: [],
  mcc: null,
};

export const salaryCategoryId = '00000000-0000-0000-0000-00000005a1a0';

// Mirrors the backend's real dictionary ids — see
// server-infra/src/Domain/Configuration/Defaults.hs and
// ConfigurationService.hs. Income and expense have separate dictionaries;
// `labels` is a single dictionary.
export const configurationFixture: ConfigurationResponse = {
  baseCurrency: 'USD',
  defaultCurrency: 'USD',
  baseCurrencyEditable: true,
  bankingFeatureEnabled: false,
  dictionaries: {
    expense: {
      roots: [{ id: foodCategoryId, name: 'Food', type: 'item', children: [] }],
    },
    income: {
      roots: [{ id: salaryCategoryId, name: 'Salary', type: 'item', children: [] }],
    },
    label: { roots: [{ id: tripLabelId, name: 'Trip', type: 'item', children: [] }] },
  },
  defaults: {
    incomeCategory: null,
    expenseCategory: null,
    account: null,
    subtypeAccounts: {},
  },
  banking: {
    mccExpenseCategoryMap: {},
    connections: [],
  },
};

export const spendingByCategoryFixture: SpendingByCategoryResponse = {
  categories: [
    { categoryId: foodCategoryId, total: { amount: 120, currency: 'USD' } },
    { categoryId: salaryCategoryId, total: { amount: 30, currency: 'USD' } },
  ],
  total: { amount: 150, currency: 'USD' },
};

export const incomeVsExpenseFixture: IncomeVsExpenseResponse = {
  income: { amount: 500, currency: 'USD' },
  expense: { amount: 150, currency: 'USD' },
  net: { amount: 350, currency: 'USD' },
};

export const netWorthFixture: NetWorthResponse = {
  accounts: [
    {
      accountId: 'a1',
      balance: { amount: 1234.56, currency: 'USD' },
      baseBalance: { amount: 1234.56, currency: 'USD' },
    },
  ],
  total: { amount: 1234.56, currency: 'USD' },
};

export const bankConnectionFixture: BankConnectionDTO = {
  id: 'conn-1',
  provider: 'monobank',
  name: 'Monobank',
  enabled: true,
  tokenSet: true,
  tokenHint: '3f2',
  accountMap: {},
};

export const externalAccountsFixture: ExternalAccountDTO[] = [
  {
    externalId: 'ext-acc-1',
    iban: 'UA213223130000026007233566001',
    maskedPan: '537541******1234',
    currency: 'UAH',
    balance: 123456,
  },
  {
    externalId: 'ext-acc-2',
    iban: 'UA213223130000026007233566002',
    maskedPan: null,
    currency: 'USD',
    balance: 50000,
  },
];

// `configurationFixture.bankingFeatureEnabled` stays `false` so existing
// ProfilePage/profile tests keep their current behavior. Banking-specific tests
// opt into a banking-enabled config via `server.use(...)` returning this variant
// from an overridden GET /configuration handler.
export const bankingEnabledConfigurationFixture: ConfigurationResponse = {
  ...configurationFixture,
  bankingFeatureEnabled: true,
  banking: {
    ...configurationFixture.banking,
    connections: [bankConnectionFixture],
  },
};
