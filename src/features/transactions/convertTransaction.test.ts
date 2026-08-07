import { describe, it, expect } from 'vitest';
import type { AccountResponse, TransactionResponse } from '@/api/types';
import {
  toConvertIncomeExpenseDefaults,
  toConvertTransferDefaults,
  toIncomeExpenseAmendment,
  toTransferAmendment,
} from './convertTransaction';

const EXT = 'ext-1';
const A = 'acc-A';
const B = 'acc-B';

const accounts: AccountResponse[] = [
  {
    id: A,
    name: 'A',
    balance: 0,
    currency: 'USD',
    overdraftLimit: null,
    subtype: { type: 'cash' },
    status: 'Opened',
    role: 'owner',
    version: 1,
  },
  {
    id: B,
    name: 'B',
    balance: 0,
    currency: 'EUR',
    overdraftLimit: null,
    subtype: { type: 'cash' },
    status: 'Opened',
    role: 'owner',
    version: 1,
  },
];

const base: TransactionResponse = {
  id: 'tx-1',
  sourceAccountId: A,
  targetAccountId: EXT,
  sourceAmount: -42,
  sourceCurrency: 'USD',
  targetAmount: -42,
  targetCurrency: 'USD',
  exchangeRate: null,
  description: 'Lunch',
  status: 'Completed',
  failureReason: null,
  transactionType: 'expense',
  allocations: {
    incomes: [],
    expenses: [{ categoryId: 'cat-x', amount: { amount: 42, currency: 'USD' } }],
  },
  date: '2026-01-15T08:00:00.000Z',
  labels: ['lbl-1'],
  amendmentCount: 0,
  contactId: null,
  bankProviderCategory: null,
  bankProviderContact: null,
  relations: [],
};

describe('toConvertIncomeExpenseDefaults', () => {
  it('expense → income seeds a single income slice on the source (regular) leg', () => {
    const d = toConvertIncomeExpenseDefaults(base, 'income', accounts, 'def-income');
    expect(d.accountId).toBe(A);
    expect(d.currency).toBe('USD');
    // One seeded row in the income bucket carrying the magnitude; expenses empty.
    expect(d.incomes).toEqual([{ category: 'def-income', amount: 42, comment: '' }]);
    expect(d.expenses).toEqual([]);
    expect(d.description).toBe('Lunch');
    expect(d.labels).toEqual(['lbl-1']);
  });

  it('income → expense seeds a single expense slice on the target (regular) leg', () => {
    const income: TransactionResponse = {
      ...base,
      transactionType: 'income',
      sourceAccountId: EXT,
      targetAccountId: B,
      sourceAmount: 100,
      targetAmount: 100,
      sourceCurrency: 'EUR',
      targetCurrency: 'EUR',
    };
    const d = toConvertIncomeExpenseDefaults(income, 'expense', accounts, 'def-expense');
    expect(d.accountId).toBe(B);
    expect(d.currency).toBe('EUR');
    expect(d.expenses).toEqual([{ category: 'def-expense', amount: 100, comment: '' }]);
    expect(d.incomes).toEqual([]);
  });

  it('transfer → income keeps the "to" leg; transfer → expense keeps the "from" leg', () => {
    const transfer: TransactionResponse = {
      ...base,
      transactionType: 'transfer',
      sourceAccountId: A,
      targetAccountId: B,
      sourceAmount: 30,
      targetAmount: 30,
      sourceCurrency: 'USD',
      targetCurrency: 'EUR',
      allocations: { incomes: [], expenses: [] },
    };
    expect(toConvertIncomeExpenseDefaults(transfer, 'income', accounts, null).accountId).toBe(B);
    expect(toConvertIncomeExpenseDefaults(transfer, 'expense', accounts, null).accountId).toBe(A);
  });

  it('falls back to an empty category when no default is configured', () => {
    expect(toConvertIncomeExpenseDefaults(base, 'income', accounts, null).incomes).toEqual([
      { category: '', amount: 42, comment: '' },
    ]);
  });

  it('carries the contact from the source transaction', () => {
    const withContact: TransactionResponse = { ...base, contactId: 'c1' };
    expect(toConvertIncomeExpenseDefaults(withContact, 'income', accounts, null).contactId).toBe(
      'c1',
    );
  });

  it('seeds a null contact when the source has none', () => {
    expect(toConvertIncomeExpenseDefaults(base, 'income', accounts, null).contactId).toBeNull();
  });
});

describe('toConvertTransferDefaults', () => {
  it('expense → transfer keeps the source leg and leaves the target empty', () => {
    const d = toConvertTransferDefaults(base, accounts);
    expect(d.sourceAccountId).toBe(A);
    expect(d.targetAccountId).toBe('');
    expect(d.amount).toBe(42);
    expect(d.currency).toBe('USD');
  });

  it('income → transfer keeps the target leg and leaves the source empty', () => {
    const income: TransactionResponse = {
      ...base,
      transactionType: 'income',
      sourceAccountId: EXT,
      targetAccountId: B,
      sourceAmount: 100,
      targetAmount: 100,
      sourceCurrency: 'EUR',
      targetCurrency: 'EUR',
    };
    const d = toConvertTransferDefaults(income, accounts);
    expect(d.sourceAccountId).toBe('');
    expect(d.targetAccountId).toBe(B);
    expect(d.amount).toBe(100);
  });

  it('does not carry a contact (transfers have none)', () => {
    const withContact: TransactionResponse = { ...base, contactId: 'c1' };
    const d = toConvertTransferDefaults(withContact, accounts);
    expect(Object.prototype.hasOwnProperty.call(d, 'contactId')).toBe(false);
  });
});

describe('toIncomeExpenseAmendment', () => {
  it('income orients External→Regular and puts the slice in the incomes bucket', () => {
    const a = toIncomeExpenseAmendment(
      'income',
      {
        accountId: A,
        currency: 'USD',
        incomes: [
          { category: 'c', amount: 42 },
          { category: 'd', amount: 8 },
        ],
        expenses: [],
        description: '',
        date: '2026-06-01',
        labels: [],
        contactId: null,
      },
      EXT,
    );
    expect(a.sourceAccountId).toBe(EXT);
    expect(a.targetAccountId).toBe(A);
    // Total is the sum of all slice amounts across both buckets.
    expect(a.sourceAmount).toBe(50);
    expect(a.targetAmount).toBe(50);
    expect(a.newAllocations).toEqual({
      incomes: [
        { categoryId: 'c', amount: { amount: 42, currency: 'USD' } },
        { categoryId: 'd', amount: { amount: 8, currency: 'USD' } },
      ],
      expenses: [],
    });
  });

  it('expense orients Regular→External and puts the slice in the expenses bucket', () => {
    const a = toIncomeExpenseAmendment(
      'expense',
      {
        accountId: A,
        currency: 'USD',
        incomes: [],
        expenses: [{ category: 'c', amount: 42 }],
        description: '',
        date: '2026-06-01',
        labels: [],
        contactId: null,
      },
      EXT,
    );
    expect(a.sourceAccountId).toBe(A);
    expect(a.targetAccountId).toBe(EXT);
    expect(a.sourceAmount).toBe(42);
    expect(a.targetAmount).toBe(42);
    expect(a.newAllocations).toEqual({
      incomes: [],
      expenses: [{ categoryId: 'c', amount: { amount: 42, currency: 'USD' } }],
    });
  });

  it('carries the form contact', () => {
    const a = toIncomeExpenseAmendment(
      'expense',
      {
        accountId: A,
        currency: 'USD',
        incomes: [],
        expenses: [{ category: 'c', amount: 42 }],
        description: '',
        date: '2026-06-01',
        labels: [],
        contactId: 'c1',
      },
      EXT,
    );
    expect(a.contactId).toBe('c1');
  });

  it('sends a null contact when the form has none', () => {
    const a = toIncomeExpenseAmendment(
      'expense',
      {
        accountId: A,
        currency: 'USD',
        incomes: [],
        expenses: [{ category: 'c', amount: 42 }],
        description: '',
        date: '2026-06-01',
        labels: [],
        contactId: null,
      },
      EXT,
    );
    expect(a.contactId).toBeNull();
  });
});

describe('toTransferAmendment', () => {
  it('same-currency transfer omits the exchange rate', () => {
    const a = toTransferAmendment(
      {
        sourceAccountId: A,
        targetAccountId: B,
        amount: 50,
        currency: 'USD',
        exchangeRate: undefined,
        description: '',
        date: '2026-06-01',
        labels: [],
      },
      'USD',
      'USD',
    );
    expect(a).toMatchObject({
      sourceAccountId: A,
      targetAccountId: B,
      sourceAmount: 50,
      targetAmount: 50,
    });
    expect(a.exchangeRate).toBeUndefined();
    expect(a.newAllocations).toBeUndefined();
  });

  it('cross-currency transfer applies the exchange rate to the target amount', () => {
    const a = toTransferAmendment(
      {
        sourceAccountId: A,
        targetAccountId: B,
        amount: 50,
        currency: 'USD',
        exchangeRate: 2,
        description: '',
        date: '2026-06-01',
        labels: [],
      },
      'USD',
      'EUR',
    );
    expect(a.sourceAmount).toBe(50);
    expect(a.targetAmount).toBe(100);
    expect(a.exchangeRate).toBe(2);
  });
});
