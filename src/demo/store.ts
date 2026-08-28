// Stateful in-memory demo world (VITE_DEMO=1) — issue #62. Bootstrapped from
// the static seed corpus (src/demo/seed) and mutated in place so a browser
// MSW worker (later task) can show writes reflected in subsequent reads —
// the existing Vitest handlers (src/test/handlers.ts) are stateless and
// can't do that. Reports/providers/external-accounts stay static: they are
// served straight from the seed, never recomputed from mutations.
import type {
  AccountResponse,
  Allocations,
  BankProviderDTO,
  ConfigurationResponse,
  ExternalAccountDTO,
  IncomeVsExpenseResponse,
  NetWorthResponse,
  SpendingByCategoryResponse,
  TransactionResponse,
  UserProfileResponse,
} from '@/api/types';
import { externalAccountsFixture } from '@/test/fixtures';
import { AS_OF, getSeed, type SeedVariant } from './seed';

// Subset of CreateAccountRequest the demo store accepts. `overdraftLimit` is
// omitted here (not exercised by any demo flow yet); add if a later task needs it.
export interface DemoCreateAccountRequest {
  name: string;
  initialBalance: number;
  currency: string;
  subtype?: AccountResponse['subtype'];
}

// One category+amount slice as the demo UI supplies it (bare number, no
// Money wrapper) — mirrors backend CategoryAmount, not the Allocation DTO.
export interface DemoCategoryAmount {
  category: string;
  amount: number;
  comment?: string | null;
}

export interface DemoAddExpenseRequest {
  accountId: string;
  description: string;
  date?: string;
  allocations: { expenses: DemoCategoryAmount[]; incomes: DemoCategoryAmount[] };
  labels?: string[];
  contactId?: string | null;
}

export type DemoAddIncomeRequest = DemoAddExpenseRequest;

export interface DemoAddTransferRequest {
  sourceAccountId: string;
  targetAccountId: string;
  amount: number;
  sourceCurrency: string;
  targetCurrency: string;
  exchangeRate?: number;
  description: string;
  date?: string;
  labels?: string[];
}

const toAllocation = (c: DemoCategoryAmount, currency: string) => ({
  categoryId: c.category,
  amount: { amount: c.amount, currency },
  comment: c.comment ?? null,
});

const toAllocations = (
  allocations: { expenses: DemoCategoryAmount[]; incomes: DemoCategoryAmount[] },
  currency: string,
): Allocations => ({
  incomes: allocations.incomes.map((c) => toAllocation(c, currency)),
  expenses: allocations.expenses.map((c) => toAllocation(c, currency)),
});

export class DemoStore {
  private accounts: AccountResponse[];
  private transactions: TransactionResponse[];
  private configuration: ConfigurationResponse;
  private readonly profile: UserProfileResponse;
  private readonly reports: {
    spendingByCategory: SpendingByCategoryResponse;
    incomeVsExpense: IncomeVsExpenseResponse;
    netWorth: NetWorthResponse;
  };
  private accountCounter = 0;
  private transactionCounter = 0;

  constructor(variant: SeedVariant) {
    const seed = structuredClone(getSeed(variant));
    this.accounts = seed.accounts;
    this.transactions = seed.transactions;
    this.configuration = seed.configuration;
    this.profile = seed.profile;
    this.reports = seed.reports;
    this.accountCounter = this.accounts.length;
    this.transactionCounter = this.transactions.length;
  }

  // --- accounts ---

  listAccounts(): { accounts: AccountResponse[]; totalCount: number } {
    return { accounts: this.accounts, totalCount: this.accounts.length };
  }

  createAccount(req: DemoCreateAccountRequest): AccountResponse {
    this.accountCounter += 1;
    const account: AccountResponse = {
      id: `demo-acct-${this.accountCounter}`,
      name: req.name,
      balance: req.initialBalance,
      currency: req.currency,
      overdraftLimit: null,
      subtype: req.subtype ?? null,
      status: 'Opened',
      role: 'owner',
      version: 1,
    };
    this.accounts.push(account);
    return account;
  }

  // --- transactions ---

  listTransactions(url: URL): {
    transactions: TransactionResponse[];
    totalCount: number;
    limit: number;
    offset: number;
  } {
    const limit = Number(url.searchParams.get('limit') ?? '50');
    const offset = Number(url.searchParams.get('offset') ?? '0');
    const page = this.transactions.slice(offset, offset + limit);
    return { transactions: page, totalCount: this.transactions.length, limit, offset };
  }

  private nextTransactionId(): string {
    this.transactionCounter += 1;
    return `demo-tx-${this.transactionCounter}`;
  }

  private buildFlowTransaction(
    req: DemoAddExpenseRequest,
    kind: 'expense' | 'income',
  ): TransactionResponse {
    const account = this.accounts.find((a) => a.id === req.accountId);
    // Permissive: an unknown accountId falls back to USD rather than throwing
    // (demo store, no hard validation).
    const currency = account?.currency ?? 'USD';
    const bucket = kind === 'expense' ? req.allocations.expenses : req.allocations.incomes;
    const total = bucket.reduce((sum, c) => sum + c.amount, 0);
    const signed = kind === 'expense' ? -total : total;
    return {
      id: this.nextTransactionId(),
      sourceAccountId: req.accountId,
      targetAccountId: req.accountId,
      sourceAmount: signed,
      sourceCurrency: currency,
      targetAmount: signed,
      targetCurrency: currency,
      exchangeRate: null,
      description: req.description,
      status: 'Completed',
      failureReason: null,
      transactionType: kind,
      allocations: toAllocations(req.allocations, currency),
      date: req.date ?? AS_OF,
      labels: req.labels ?? [],
      amendmentCount: 0,
      relations: [],
      contactId: req.contactId ?? null,
      bankProviderCategory: null,
      bankProviderContact: null,
    };
  }

  addExpense(req: DemoAddExpenseRequest): TransactionResponse {
    const transaction = this.buildFlowTransaction(req, 'expense');
    this.transactions.unshift(transaction);
    return transaction;
  }

  addIncome(req: DemoAddIncomeRequest): TransactionResponse {
    const transaction = this.buildFlowTransaction(req, 'income');
    this.transactions.unshift(transaction);
    return transaction;
  }

  addTransfer(req: DemoAddTransferRequest): TransactionResponse {
    const exchangeRate = req.exchangeRate ?? null;
    const targetAmount =
      req.sourceCurrency === req.targetCurrency ? req.amount : req.amount * (exchangeRate ?? 1);
    const transaction: TransactionResponse = {
      id: this.nextTransactionId(),
      sourceAccountId: req.sourceAccountId,
      targetAccountId: req.targetAccountId,
      sourceAmount: -req.amount,
      sourceCurrency: req.sourceCurrency,
      targetAmount,
      targetCurrency: req.targetCurrency,
      exchangeRate,
      description: req.description,
      status: 'Completed',
      failureReason: null,
      transactionType: 'transfer',
      allocations: { incomes: [], expenses: [] },
      date: req.date ?? AS_OF,
      labels: req.labels ?? [],
      amendmentCount: 0,
      relations: [],
      contactId: null,
      bankProviderCategory: null,
      bankProviderContact: null,
    };
    this.transactions.unshift(transaction);
    return transaction;
  }

  // --- configuration ---

  getConfiguration(): ConfigurationResponse {
    return this.configuration;
  }

  setCountry(country: string): void {
    this.configuration = { ...this.configuration, country };
  }

  setLanguage(language: string): void {
    this.configuration = { ...this.configuration, language };
  }

  setBaseCurrency(currency: string): void {
    this.configuration = { ...this.configuration, baseCurrency: currency };
  }

  // --- static seed projections (never recomputed from mutations) ---

  getSpendingByCategory(): SpendingByCategoryResponse {
    return this.reports.spendingByCategory;
  }

  getIncomeVsExpense(): IncomeVsExpenseResponse {
    return this.reports.incomeVsExpense;
  }

  getNetWorth(): NetWorthResponse {
    return this.reports.netWorth;
  }

  // The seed corpus carries bank connections under configuration.banking but
  // no standalone provider catalog/external-account listing, so those two
  // reuse the banking test fixtures (src/test/fixtures.ts / src/test/handlers.ts
  // GET .../banking/providers) as the demo's static banking-world data.
  listProviders(): BankProviderDTO[] {
    return [
      {
        id: 'monobank',
        displayName: 'Monobank',
        supportsPull: true,
        supportsFile: false,
        countries: ['UA'],
        inUserCountry: true,
      },
      {
        id: 'privatbank',
        displayName: 'PrivatBank',
        supportsPull: false,
        supportsFile: true,
        countries: ['UA'],
        inUserCountry: true,
      },
    ];
  }

  listExternalAccounts(): ExternalAccountDTO[] {
    return externalAccountsFixture;
  }

  getProfile(): UserProfileResponse {
    return this.profile;
  }
}
