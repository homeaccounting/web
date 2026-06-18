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
  category: 'cat-x',
  date: '2026-01-15T08:00:00.000Z',
  labels: ['lbl-1'],
  amendmentCount: 0,
};

describe('toConvertIncomeExpenseDefaults', () => {
  it('expense → income keeps the source (regular) leg and seeds the default category', () => {
    const d = toConvertIncomeExpenseDefaults(base, 'income', accounts, 'def-income');
    expect(d.accountId).toBe(A);
    expect(d.amount).toBe(42); // magnitude
    expect(d.currency).toBe('USD');
    expect(d.category).toBe('def-income');
    expect(d.description).toBe('Lunch');
    expect(d.labels).toEqual(['lbl-1']);
  });

  it('income → expense keeps the target (regular) leg', () => {
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
    expect(d.amount).toBe(100);
    expect(d.currency).toBe('EUR');
    expect(d.category).toBe('def-expense');
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
      category: null,
    };
    expect(toConvertIncomeExpenseDefaults(transfer, 'income', accounts, null).accountId).toBe(B);
    expect(toConvertIncomeExpenseDefaults(transfer, 'expense', accounts, null).accountId).toBe(A);
  });

  it('falls back to an empty category when no default is configured', () => {
    expect(toConvertIncomeExpenseDefaults(base, 'income', accounts, null).category).toBe('');
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
});

describe('toIncomeExpenseAmendment', () => {
  it('income orients External→Regular and puts the slice in the incomes bucket', () => {
    const a = toIncomeExpenseAmendment(
      'income',
      {
        accountId: A,
        amount: 42,
        currency: 'USD',
        category: 'c',
        description: '',
        date: undefined,
        labels: [],
      },
      EXT,
    );
    expect(a.sourceAccountId).toBe(EXT);
    expect(a.targetAccountId).toBe(A);
    expect(a.targetAmount).toBe(42);
    expect(a.newAllocations).toEqual({
      incomes: [{ categoryId: 'c', amount: { amount: 42, currency: 'USD' } }],
      expenses: [],
    });
  });

  it('expense orients Regular→External and puts the slice in the expenses bucket', () => {
    const a = toIncomeExpenseAmendment(
      'expense',
      {
        accountId: A,
        amount: 42,
        currency: 'USD',
        category: 'c',
        description: '',
        date: undefined,
        labels: [],
      },
      EXT,
    );
    expect(a.sourceAccountId).toBe(A);
    expect(a.targetAccountId).toBe(EXT);
    expect(a.newAllocations).toEqual({
      incomes: [],
      expenses: [{ categoryId: 'c', amount: { amount: 42, currency: 'USD' } }],
    });
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
        date: undefined,
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
        date: undefined,
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
