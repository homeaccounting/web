import { describe, it, expect } from 'vitest';
import { diffIncomeExpense, diffTransfer } from './diffTransaction';
import type { TransactionResponse } from '@/api/types';
import type { IncomeExpenseFormValues, TransferFormValues } from './schema';

const baseTx: TransactionResponse = {
  id: 'tx-1',
  sourceAccountId: 'ext',
  targetAccountId: 'a1',
  sourceAmount: 10,
  sourceCurrency: 'USD',
  targetAmount: 10,
  targetCurrency: 'USD',
  exchangeRate: null,
  description: 'old',
  status: 'Completed',
  failureReason: null,
  transactionType: 'income',
  category: 'cat-1',
  date: '2026-03-04T00:00:00.000Z',
  labels: ['l1'],
  amendmentCount: 0,
};

const ieInitial: IncomeExpenseFormValues = {
  accountId: 'a1',
  amount: 10,
  currency: 'USD',
  category: 'cat-1',
  description: 'old',
  date: '2026-03-04',
  labels: ['l1'],
};

describe('diffIncomeExpense', () => {
  it('returns empty diff when nothing changed', () => {
    expect(diffIncomeExpense(ieInitial, ieInitial, baseTx)).toEqual({});
  });

  it('description change only', () => {
    const d = diffIncomeExpense(ieInitial, { ...ieInitial, description: 'new' }, baseTx);
    expect(d).toEqual({ description: 'new' });
  });

  it('date change becomes a UTC start-of-day ISO string', () => {
    const d = diffIncomeExpense(ieInitial, { ...ieInitial, date: '2026-04-05' }, baseTx);
    expect(d).toEqual({ date: '2026-04-05T00:00:00.000Z' });
  });

  it('labels change (including clearing to [])', () => {
    expect(diffIncomeExpense(ieInitial, { ...ieInitial, labels: ['l2'] }, baseTx)).toEqual({
      labels: ['l2'],
    });
    expect(diffIncomeExpense(ieInitial, { ...ieInitial, labels: [] }, baseTx)).toEqual({
      labels: [],
    });
  });

  it('amount change emits amendment + allocations (income → target leg)', () => {
    const d = diffIncomeExpense(ieInitial, { ...ieInitial, amount: 25 }, baseTx);
    expect(d.amendment).toEqual({
      sourceAccountId: 'ext',
      targetAccountId: 'a1',
      sourceAmount: 25,
      sourceCurrency: 'USD',
      targetAmount: 25,
      targetCurrency: 'USD',
    });
    expect(d.allocations).toEqual({
      incomes: [{ categoryId: 'cat-1', amount: { amount: 25, currency: 'USD' } }],
      expenses: [],
    });
    expect(d.description).toBeUndefined();
  });

  it('account change (same currency) emits amendment + allocations with the new regular leg', () => {
    const d = diffIncomeExpense(ieInitial, { ...ieInitial, accountId: 'a2' }, baseTx);
    expect(d.amendment).toMatchObject({
      sourceAccountId: 'ext',
      targetAccountId: 'a2',
      sourceAmount: 10,
      targetAmount: 10,
    });
    expect(d.allocations).toEqual({
      incomes: [{ categoryId: 'cat-1', amount: { amount: 10, currency: 'USD' } }],
      expenses: [],
    });
  });

  it('expense account change touches the source leg, not target', () => {
    const expenseTx: TransactionResponse = {
      ...baseTx,
      transactionType: 'expense',
      sourceAccountId: 'a1',
      targetAccountId: 'ext',
    };
    const initial = { ...ieInitial, accountId: 'a1' };
    const d = diffIncomeExpense(initial, { ...initial, accountId: 'a2' }, expenseTx);
    expect(d.amendment).toMatchObject({
      sourceAccountId: 'a2',
      targetAccountId: 'ext',
    });
  });

  it('category change alone emits allocations only', () => {
    const d = diffIncomeExpense(ieInitial, { ...ieInitial, category: 'cat-2' }, baseTx);
    expect(d.allocations).toEqual({
      incomes: [{ categoryId: 'cat-2', amount: { amount: 10, currency: 'USD' } }],
      expenses: [],
    });
    expect(d.amendment).toBeUndefined();
  });

  it('amount + category change emits both, with the new pair', () => {
    const d = diffIncomeExpense(ieInitial, { ...ieInitial, amount: 30, category: 'cat-2' }, baseTx);
    expect(d.amendment).toMatchObject({ sourceAmount: 30, targetAmount: 30 });
    expect(d.allocations).toEqual({
      incomes: [{ categoryId: 'cat-2', amount: { amount: 30, currency: 'USD' } }],
      expenses: [],
    });
  });
});

const transferTx: TransactionResponse = {
  ...baseTx,
  transactionType: 'transfer',
  sourceAccountId: 'a1',
  targetAccountId: 'a2',
  sourceAmount: 50,
  sourceCurrency: 'USD',
  targetAmount: 50,
  targetCurrency: 'USD',
  exchangeRate: null,
  category: null,
};

const trInitial: TransferFormValues = {
  sourceAccountId: 'a1',
  targetAccountId: 'a2',
  amount: 50,
  currency: 'USD',
  description: 'old',
  exchangeRate: undefined,
  date: '2026-03-04',
  labels: ['l1'],
};

describe('diffTransfer', () => {
  it('clean diff is empty', () => {
    expect(diffTransfer(trInitial, trInitial, transferTx)).toEqual({});
  });

  it('same-currency amount change → amendment only (no allocations on transfer)', () => {
    const d = diffTransfer(trInitial, { ...trInitial, amount: 75 }, transferTx);
    expect(d.amendment).toMatchObject({
      sourceAccountId: 'a1',
      targetAccountId: 'a2',
      sourceAmount: 75,
      targetAmount: 75,
      sourceCurrency: 'USD',
      targetCurrency: 'USD',
    });
    expect(d.amendment?.exchangeRate).toBeUndefined();
    expect(d.allocations).toBeUndefined();
  });

  it('cross-currency: amount + exchangeRate change emits both currencies and rate', () => {
    const crossTx: TransactionResponse = {
      ...transferTx,
      sourceCurrency: 'USD',
      targetCurrency: 'EUR',
      targetAmount: 45,
      exchangeRate: 0.9,
    };
    const initial: TransferFormValues = { ...trInitial, currency: 'USD', exchangeRate: 0.9 };
    const d = diffTransfer(initial, { ...initial, amount: 100, exchangeRate: 0.8 }, crossTx);
    expect(d.amendment).toMatchObject({
      sourceAmount: 100,
      sourceCurrency: 'USD',
      targetAmount: 80,
      targetCurrency: 'EUR',
      exchangeRate: 0.8,
    });
  });

  it('swapping source/target accounts emits amendment with the new ids', () => {
    const d = diffTransfer(
      trInitial,
      { ...trInitial, sourceAccountId: 'a3', targetAccountId: 'a4' },
      transferTx,
    );
    expect(d.amendment).toMatchObject({
      sourceAccountId: 'a3',
      targetAccountId: 'a4',
    });
  });
});
