// Synthetic seed corpus for the demo build (VITE_DEMO=1) — issue #62.
// This is the single source of truth for the demo world: an MSW-backed
// in-memory store (added in a later task) is bootstrapped from these seeds.
// Field shapes mirror the real DTOs in @/api/types (typecheck is the arbiter);
// transaction shape mirrors `transactionFixture` in src/test/fixtures.ts
// (allocations, relations: [], contactId, bankProvider* — NOT the outdated
// flat-`category` bodies in src/test/handlers.ts).
import type {
  AccountResponse,
  ConfigurationResponse,
  IncomeVsExpenseResponse,
  NetWorthResponse,
  SpendingByCategoryResponse,
  TransactionResponse,
  UserProfileResponse,
} from '@/api/types';
import { acmeContactId, foodCategoryId, salaryCategoryId, tripLabelId } from '@/test/fixtures';

// Pinned "now" for the demo — every screenshot and relative-date computation
// in later tasks is anchored to this instant instead of the real clock.
export const AS_OF = '2026-06-15T12:00:00.000Z';

export interface DemoReports {
  spendingByCategory: SpendingByCategoryResponse;
  incomeVsExpense: IncomeVsExpenseResponse;
  netWorth: NetWorthResponse;
}

export interface DemoSeed {
  profile: UserProfileResponse;
  configuration: ConfigurationResponse;
  accounts: AccountResponse[];
  transactions: TransactionResponse[];
  reports: DemoReports;
}

// --- populatedSeed ids ---
// Category/contact/label ids beyond the ones reused from fixtures.ts are
// local to the demo world only — "ca" (category) prefix keeps them distinct
// from the fixture ids at a glance.
const demoUserId = '00000000-0000-0000-0000-00000000d001';
const demoExternalAccountId = '00000000-0000-0000-0000-00000000e001';

const bankUahAccountId = '00000000-0000-0000-0000-0000000000a1';
const bankUsdAccountId = '00000000-0000-0000-0000-0000000000a2';
const cashUahAccountId = '00000000-0000-0000-0000-0000000000a3';

const rentCategoryId = '00000000-0000-0000-0000-00000000ca01';
const transportCategoryId = '00000000-0000-0000-0000-00000000ca02';
const entertainmentCategoryId = '00000000-0000-0000-0000-00000000ca03';
const utilitiesCategoryId = '00000000-0000-0000-0000-00000000ca04';
const freelanceCategoryId = '00000000-0000-0000-0000-00000000ca05';

const demoBankConnectionId = '00000000-0000-0000-0000-00000000cc01';

// --- populatedSeed: profile ---

const demoProfile: UserProfileResponse = {
  userId: demoUserId,
  email: 'demo@example.com',
  hasPassword: true,
  oauthIdentities: [],
  telegramIdentity: null,
  externalAccountId: demoExternalAccountId,
};

// --- populatedSeed: accounts ---
// >=3 accounts, spanning 2 currencies (UAH/USD) and 2 subtypes (bankAccount/cash).

const demoAccounts: AccountResponse[] = [
  {
    id: bankUahAccountId,
    name: 'Monobank Card',
    balance: 45230.75,
    currency: 'UAH',
    overdraftLimit: null,
    subtype: { type: 'bankAccount', bankName: 'Monobank', cardNetwork: 'visa' },
    status: 'Opened',
    role: 'owner',
    version: 1,
  },
  {
    id: bankUsdAccountId,
    name: 'USD Savings',
    balance: 3745,
    currency: 'USD',
    overdraftLimit: null,
    subtype: { type: 'bankAccount', bankName: 'Wise' },
    status: 'Opened',
    role: 'owner',
    version: 1,
  },
  {
    id: cashUahAccountId,
    name: 'Cash Wallet',
    balance: 1200,
    currency: 'UAH',
    overdraftLimit: null,
    subtype: { type: 'cash', storageLocation: 'Home' },
    status: 'Opened',
    role: 'owner',
    version: 1,
  },
];

// --- populatedSeed: transactions ---
// ~30 days of activity in the 30 days before AS_OF (2026-05-16 -> 2026-06-15):
// salary + freelance income, a spread of categorised expenses, one
// multi-allocation expense with a contact + label, and one cross-currency
// transfer.

// Common defaults shared by every seed transaction below: completed, no
// labels/relations/contact/bank-provider metadata, no exchange rate. Each
// literal only spells out what makes it distinct, and tsc still enforces
// that every TransactionResponse field is accounted for.
function tx(
  t: Pick<
    TransactionResponse,
    | 'id'
    | 'date'
    | 'description'
    | 'transactionType'
    | 'sourceAccountId'
    | 'targetAccountId'
    | 'sourceAmount'
    | 'sourceCurrency'
    | 'targetAmount'
    | 'targetCurrency'
    | 'allocations'
  > &
    Partial<TransactionResponse>,
): TransactionResponse {
  return {
    status: 'Completed',
    failureReason: null,
    labels: [],
    amendmentCount: 0,
    relations: [],
    contactId: null,
    bankProviderCategory: null,
    bankProviderContact: null,
    exchangeRate: null,
    ...t,
  };
}

const demoTransactions: TransactionResponse[] = [
  tx({
    id: '00000000-0000-0000-0000-000000000001',
    sourceAccountId: bankUahAccountId,
    targetAccountId: bankUahAccountId,
    sourceAmount: 32000,
    sourceCurrency: 'UAH',
    targetAmount: 32000,
    targetCurrency: 'UAH',
    description: 'Salary',
    transactionType: 'income',
    allocations: {
      incomes: [{ categoryId: salaryCategoryId, amount: { amount: 32000, currency: 'UAH' } }],
      expenses: [],
    },
    date: '2026-05-16T09:00:00.000Z',
  }),
  tx({
    id: '00000000-0000-0000-0000-000000000002',
    sourceAccountId: bankUahAccountId,
    targetAccountId: bankUahAccountId,
    sourceAmount: -12000,
    sourceCurrency: 'UAH',
    targetAmount: -12000,
    targetCurrency: 'UAH',
    description: 'Rent',
    transactionType: 'expense',
    allocations: {
      incomes: [],
      expenses: [{ categoryId: rentCategoryId, amount: { amount: 12000, currency: 'UAH' } }],
    },
    date: '2026-05-17T08:00:00.000Z',
  }),
  tx({
    id: '00000000-0000-0000-0000-000000000003',
    sourceAccountId: cashUahAccountId,
    targetAccountId: cashUahAccountId,
    sourceAmount: -850,
    sourceCurrency: 'UAH',
    targetAmount: -850,
    targetCurrency: 'UAH',
    description: 'Groceries',
    transactionType: 'expense',
    allocations: {
      incomes: [],
      expenses: [{ categoryId: foodCategoryId, amount: { amount: 850, currency: 'UAH' } }],
    },
    date: '2026-05-18T17:30:00.000Z',
  }),
  tx({
    id: '00000000-0000-0000-0000-000000000004',
    sourceAccountId: cashUahAccountId,
    targetAccountId: cashUahAccountId,
    sourceAmount: -120,
    sourceCurrency: 'UAH',
    targetAmount: -120,
    targetCurrency: 'UAH',
    description: 'Coffee',
    transactionType: 'expense',
    allocations: {
      incomes: [],
      expenses: [{ categoryId: foodCategoryId, amount: { amount: 120, currency: 'UAH' } }],
    },
    date: '2026-05-19T08:15:00.000Z',
  }),
  tx({
    id: '00000000-0000-0000-0000-000000000005',
    sourceAccountId: bankUahAccountId,
    targetAccountId: bankUahAccountId,
    sourceAmount: -300,
    sourceCurrency: 'UAH',
    targetAmount: -300,
    targetCurrency: 'UAH',
    description: 'Metro pass',
    transactionType: 'expense',
    allocations: {
      incomes: [],
      expenses: [{ categoryId: transportCategoryId, amount: { amount: 300, currency: 'UAH' } }],
    },
    date: '2026-05-20T07:45:00.000Z',
  }),
  tx({
    // Multi-allocation expense: dinner + taxi in one transaction, with a
    // contact and a label attached.
    id: '00000000-0000-0000-0000-000000000006',
    sourceAccountId: bankUahAccountId,
    targetAccountId: bankUahAccountId,
    sourceAmount: -950,
    sourceCurrency: 'UAH',
    targetAmount: -950,
    targetCurrency: 'UAH',
    description: 'Client dinner & taxi',
    transactionType: 'expense',
    allocations: {
      incomes: [],
      expenses: [
        {
          categoryId: foodCategoryId,
          amount: { amount: 600, currency: 'UAH' },
          comment: 'Dinner with client',
        },
        {
          categoryId: transportCategoryId,
          amount: { amount: 350, currency: 'UAH' },
          comment: 'Taxi there and back',
        },
      ],
    },
    date: '2026-05-21T19:00:00.000Z',
    labels: [tripLabelId],
    contactId: acmeContactId,
  }),
  tx({
    id: '00000000-0000-0000-0000-000000000007',
    sourceAccountId: bankUahAccountId,
    targetAccountId: bankUahAccountId,
    sourceAmount: -500,
    sourceCurrency: 'UAH',
    targetAmount: -500,
    targetCurrency: 'UAH',
    description: 'Cinema',
    transactionType: 'expense',
    allocations: {
      incomes: [],
      expenses: [{ categoryId: entertainmentCategoryId, amount: { amount: 500, currency: 'UAH' } }],
    },
    date: '2026-05-23T20:00:00.000Z',
  }),
  tx({
    id: '00000000-0000-0000-0000-000000000008',
    sourceAccountId: cashUahAccountId,
    targetAccountId: cashUahAccountId,
    sourceAmount: -700,
    sourceCurrency: 'UAH',
    targetAmount: -700,
    targetCurrency: 'UAH',
    description: 'Groceries',
    transactionType: 'expense',
    allocations: {
      incomes: [],
      expenses: [{ categoryId: foodCategoryId, amount: { amount: 700, currency: 'UAH' } }],
    },
    date: '2026-05-25T18:10:00.000Z',
  }),
  tx({
    id: '00000000-0000-0000-0000-000000000009',
    sourceAccountId: bankUahAccountId,
    targetAccountId: bankUahAccountId,
    sourceAmount: -950,
    sourceCurrency: 'UAH',
    targetAmount: -950,
    targetCurrency: 'UAH',
    description: 'Electricity & water',
    transactionType: 'expense',
    allocations: {
      incomes: [],
      expenses: [{ categoryId: utilitiesCategoryId, amount: { amount: 950, currency: 'UAH' } }],
    },
    date: '2026-05-27T10:00:00.000Z',
  }),
  tx({
    id: '00000000-0000-0000-0000-00000000000a',
    sourceAccountId: bankUsdAccountId,
    targetAccountId: bankUsdAccountId,
    sourceAmount: 450,
    sourceCurrency: 'USD',
    targetAmount: 450,
    targetCurrency: 'USD',
    description: 'Freelance project',
    transactionType: 'income',
    allocations: {
      incomes: [{ categoryId: freelanceCategoryId, amount: { amount: 450, currency: 'USD' } }],
      expenses: [],
    },
    date: '2026-05-28T14:30:00.000Z',
  }),
  tx({
    // Cross-currency transfer: UAH bank account -> USD bank account.
    id: '00000000-0000-0000-0000-00000000000b',
    sourceAccountId: bankUahAccountId,
    targetAccountId: bankUsdAccountId,
    sourceAmount: -5000,
    sourceCurrency: 'UAH',
    targetAmount: 135,
    targetCurrency: 'USD',
    description: 'Move savings to USD account',
    transactionType: 'transfer',
    allocations: { incomes: [], expenses: [] },
    date: '2026-05-29T11:00:00.000Z',
    exchangeRate: 0.027,
  }),
  tx({
    id: '00000000-0000-0000-0000-00000000000c',
    sourceAccountId: cashUahAccountId,
    targetAccountId: cashUahAccountId,
    sourceAmount: -150,
    sourceCurrency: 'UAH',
    targetAmount: -150,
    targetCurrency: 'UAH',
    description: 'Coffee',
    transactionType: 'expense',
    allocations: {
      incomes: [],
      expenses: [{ categoryId: foodCategoryId, amount: { amount: 150, currency: 'UAH' } }],
    },
    date: '2026-05-30T08:20:00.000Z',
  }),
  tx({
    id: '00000000-0000-0000-0000-00000000000d',
    sourceAccountId: bankUahAccountId,
    targetAccountId: bankUahAccountId,
    sourceAmount: -300,
    sourceCurrency: 'UAH',
    targetAmount: -300,
    targetCurrency: 'UAH',
    description: 'Streaming subscription',
    transactionType: 'expense',
    allocations: {
      incomes: [],
      expenses: [{ categoryId: entertainmentCategoryId, amount: { amount: 300, currency: 'UAH' } }],
    },
    date: '2026-06-01T09:00:00.000Z',
  }),
  tx({
    id: '00000000-0000-0000-0000-00000000000e',
    sourceAccountId: cashUahAccountId,
    targetAccountId: cashUahAccountId,
    sourceAmount: -900,
    sourceCurrency: 'UAH',
    targetAmount: -900,
    targetCurrency: 'UAH',
    description: 'Groceries',
    transactionType: 'expense',
    allocations: {
      incomes: [],
      expenses: [{ categoryId: foodCategoryId, amount: { amount: 900, currency: 'UAH' } }],
    },
    date: '2026-06-02T18:00:00.000Z',
  }),
  tx({
    id: '00000000-0000-0000-0000-00000000000f',
    sourceAccountId: bankUahAccountId,
    targetAccountId: bankUahAccountId,
    sourceAmount: -250,
    sourceCurrency: 'UAH',
    targetAmount: -250,
    targetCurrency: 'UAH',
    description: 'Metro pass',
    transactionType: 'expense',
    allocations: {
      incomes: [],
      expenses: [{ categoryId: transportCategoryId, amount: { amount: 250, currency: 'UAH' } }],
    },
    date: '2026-06-03T07:45:00.000Z',
  }),
  tx({
    id: '00000000-0000-0000-0000-000000000010',
    sourceAccountId: bankUahAccountId,
    targetAccountId: bankUahAccountId,
    sourceAmount: -1100,
    sourceCurrency: 'UAH',
    targetAmount: -1100,
    targetCurrency: 'UAH',
    description: 'Electricity & water',
    transactionType: 'expense',
    allocations: {
      incomes: [],
      expenses: [{ categoryId: utilitiesCategoryId, amount: { amount: 1100, currency: 'UAH' } }],
    },
    date: '2026-06-05T10:00:00.000Z',
  }),
  tx({
    id: '00000000-0000-0000-0000-000000000011',
    sourceAccountId: bankUsdAccountId,
    targetAccountId: bankUsdAccountId,
    sourceAmount: -40,
    sourceCurrency: 'USD',
    targetAmount: -40,
    targetCurrency: 'USD',
    description: 'Dinner out',
    transactionType: 'expense',
    allocations: {
      incomes: [],
      expenses: [{ categoryId: foodCategoryId, amount: { amount: 40, currency: 'USD' } }],
    },
    date: '2026-06-07T19:30:00.000Z',
  }),
  tx({
    id: '00000000-0000-0000-0000-000000000012',
    sourceAccountId: bankUahAccountId,
    targetAccountId: bankUahAccountId,
    sourceAmount: -600,
    sourceCurrency: 'UAH',
    targetAmount: -600,
    targetCurrency: 'UAH',
    description: 'Concert tickets',
    transactionType: 'expense',
    allocations: {
      incomes: [],
      expenses: [{ categoryId: entertainmentCategoryId, amount: { amount: 600, currency: 'UAH' } }],
    },
    date: '2026-06-09T20:00:00.000Z',
  }),
  tx({
    id: '00000000-0000-0000-0000-000000000013',
    sourceAccountId: cashUahAccountId,
    targetAccountId: cashUahAccountId,
    sourceAmount: -800,
    sourceCurrency: 'UAH',
    targetAmount: -800,
    targetCurrency: 'UAH',
    description: 'Groceries',
    transactionType: 'expense',
    allocations: {
      incomes: [],
      expenses: [{ categoryId: foodCategoryId, amount: { amount: 800, currency: 'UAH' } }],
    },
    date: '2026-06-11T17:00:00.000Z',
  }),
  tx({
    id: '00000000-0000-0000-0000-000000000014',
    sourceAccountId: cashUahAccountId,
    targetAccountId: cashUahAccountId,
    sourceAmount: -130,
    sourceCurrency: 'UAH',
    targetAmount: -130,
    targetCurrency: 'UAH',
    description: 'Coffee',
    transactionType: 'expense',
    allocations: {
      incomes: [],
      expenses: [{ categoryId: foodCategoryId, amount: { amount: 130, currency: 'UAH' } }],
    },
    date: '2026-06-13T08:05:00.000Z',
  }),
  tx({
    id: '00000000-0000-0000-0000-000000000015',
    sourceAccountId: bankUahAccountId,
    targetAccountId: bankUahAccountId,
    sourceAmount: 32000,
    sourceCurrency: 'UAH',
    targetAmount: 32000,
    targetCurrency: 'UAH',
    description: 'Salary',
    transactionType: 'income',
    allocations: {
      incomes: [{ categoryId: salaryCategoryId, amount: { amount: 32000, currency: 'UAH' } }],
      expenses: [],
    },
    date: AS_OF,
  }),
];

// --- populatedSeed: configuration ---
// Based on configurationFixture's shape, but banking-enabled and set up for
// a UAH-base demo household with one connected bank.

const demoConfiguration: ConfigurationResponse = {
  baseCurrency: 'UAH',
  defaultCurrency: 'UAH',
  language: 'en',
  country: 'UA',
  baseCurrencyEditable: true,
  bankingFeatureEnabled: true,
  dictionaries: {
    expense: {
      roots: [
        { id: foodCategoryId, name: 'Food', type: 'item', children: [] },
        { id: rentCategoryId, name: 'Rent', type: 'item', children: [] },
        { id: transportCategoryId, name: 'Transport', type: 'item', children: [] },
        { id: entertainmentCategoryId, name: 'Entertainment', type: 'item', children: [] },
        { id: utilitiesCategoryId, name: 'Utilities', type: 'item', children: [] },
      ],
    },
    income: {
      roots: [
        { id: salaryCategoryId, name: 'Salary', type: 'item', children: [] },
        { id: freelanceCategoryId, name: 'Freelance', type: 'item', children: [] },
      ],
    },
    contact: { roots: [{ id: acmeContactId, name: 'Acme', type: 'item', children: [] }] },
    label: { roots: [{ id: tripLabelId, name: 'Trip', type: 'item', children: [] }] },
  },
  defaults: {
    incomeCategory: salaryCategoryId,
    expenseCategory: foodCategoryId,
    account: bankUahAccountId,
    subtypeAccounts: {
      BankAccountKind: bankUahAccountId,
      CashKind: cashUahAccountId,
    },
  },
  banking: {
    expenseCategoryMap: {},
    incomeCategoryMap: {},
    contactMap: {},
    connections: [
      {
        id: demoBankConnectionId,
        provider: 'monobank',
        name: 'Monobank',
        enabled: true,
        tokenSet: true,
        tokenHint: 'a1b',
        accountMap: { 'ext-acc-1': bankUahAccountId },
      },
    ],
  },
};

// --- populatedSeed: reports ---
// Base-currency (UAH) totals that plausibly match demoTransactions above
// (USD legs converted at an illustrative ~37 UAH/USD demo rate).

const demoReports: DemoReports = {
  spendingByCategory: {
    categories: [
      { categoryId: foodCategoryId, total: { amount: 5730, currency: 'UAH' } },
      { categoryId: rentCategoryId, total: { amount: 12000, currency: 'UAH' } },
      { categoryId: transportCategoryId, total: { amount: 900, currency: 'UAH' } },
      { categoryId: entertainmentCategoryId, total: { amount: 1400, currency: 'UAH' } },
      { categoryId: utilitiesCategoryId, total: { amount: 2050, currency: 'UAH' } },
    ],
    total: { amount: 22080, currency: 'UAH' },
  },
  incomeVsExpense: {
    income: { amount: 80650, currency: 'UAH' },
    expense: { amount: 22080, currency: 'UAH' },
    net: { amount: 58570, currency: 'UAH' },
  },
  netWorth: {
    accounts: [
      {
        accountId: bankUahAccountId,
        balance: { amount: 45230.75, currency: 'UAH' },
        baseBalance: { amount: 45230.75, currency: 'UAH' },
      },
      {
        accountId: bankUsdAccountId,
        balance: { amount: 3745, currency: 'USD' },
        baseBalance: { amount: 138565, currency: 'UAH' },
      },
      {
        accountId: cashUahAccountId,
        balance: { amount: 1200, currency: 'UAH' },
        baseBalance: { amount: 1200, currency: 'UAH' },
      },
    ],
    total: { amount: 184995.75, currency: 'UAH' },
  },
};

export const populatedSeed: DemoSeed = {
  profile: demoProfile,
  configuration: demoConfiguration,
  accounts: demoAccounts,
  transactions: demoTransactions,
  reports: demoReports,
};

// --- freshSeed ---
// Pre-onboarding state: a brand-new user, no accounts/transactions yet, and
// `configuration.country: null` so the app routes into onboarding.

const freshUserId = '00000000-0000-0000-0000-00000000d002';
const freshExternalAccountId = '00000000-0000-0000-0000-00000000e002';

const freshProfile: UserProfileResponse = {
  userId: freshUserId,
  email: 'newuser@example.com',
  hasPassword: false,
  oauthIdentities: [],
  telegramIdentity: null,
  externalAccountId: freshExternalAccountId,
};

const freshConfiguration: ConfigurationResponse = {
  baseCurrency: 'USD',
  defaultCurrency: 'USD',
  language: 'en',
  country: null,
  baseCurrencyEditable: true,
  bankingFeatureEnabled: false,
  dictionaries: {
    expense: { roots: [] },
    income: { roots: [] },
    contact: { roots: [] },
    label: { roots: [] },
  },
  defaults: {
    incomeCategory: null,
    expenseCategory: null,
    account: null,
    subtypeAccounts: {},
  },
  banking: {
    expenseCategoryMap: {},
    incomeCategoryMap: {},
    contactMap: {},
    connections: [],
  },
};

const freshReports: DemoReports = {
  spendingByCategory: { categories: [], total: { amount: 0, currency: 'USD' } },
  incomeVsExpense: {
    income: { amount: 0, currency: 'USD' },
    expense: { amount: 0, currency: 'USD' },
    net: { amount: 0, currency: 'USD' },
  },
  netWorth: { accounts: [], total: { amount: 0, currency: 'USD' } },
};

export const freshSeed: DemoSeed = {
  profile: freshProfile,
  configuration: freshConfiguration,
  accounts: [],
  transactions: [],
  reports: freshReports,
};
