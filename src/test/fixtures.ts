import type {
  AccountResponse,
  AuthResponse,
  ConfigurationResponse,
  TelegramLinkCodeResponse,
  TransactionResponse,
  UserProfileResponse,
} from '@/api/types';

export const foodCategoryId = '00000000-0000-0000-0000-00000000f00d';

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
  transferType: 'Expense',
  category: foodCategoryId,
  date: '2026-04-27T08:00:00Z',
  labels: [],
};

export const configurationFixture: ConfigurationResponse = {
  baseCurrency: 'USD',
  defaultCurrency: 'USD',
  dictionaries: {
    categories: {
      entries: [{ id: foodCategoryId, name: 'Food' }],
    },
  },
  banking: {
    defaultIncomeCategory: null,
    defaultExpenseCategory: null,
    mccExpenseCategoryMap: {},
  },
};
