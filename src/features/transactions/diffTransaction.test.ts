import { describe, it, expect } from 'vitest';
import { diffIncomeExpense, diffTransfer } from './diffTransaction';
import type { TransactionResponse } from '@/api/types';
import type { IncomeExpenseFormValues, TransferFormValues } from './schema';

const baseTx: TransactionResponse = {
  id: 'tx-1',
  sourceAccountId: 'ext',
  targetAccountId: 'a1',
  sourceAmount: 100,
  sourceCurrency: 'USD',
  targetAmount: 100,
  targetCurrency: 'USD',
  exchangeRate: null,
  description: 'old',
  status: 'Completed',
  failureReason: null,
  transactionType: 'income',
  allocations: {
    incomes: [{ categoryId: 'cat-1', amount: { amount: 100, currency: 'USD' } }],
    expenses: [],
  },
  date: '2026-03-04T00:00:00.000Z',
  labels: ['l1'],
  amendmentCount: 0,
  contactId: null,
  mcc: null,
  relations: [],
};

const ieInitial: IncomeExpenseFormValues = {
  accountId: 'a1',
  currency: 'USD',
  incomes: [{ category: 'cat-1', amount: 100 }],
  expenses: [],
  description: 'old',
  date: '2026-03-04',
  labels: ['l1'],
  contactId: null,
};

// An expense transaction + matching initial form values.
const expenseTx: TransactionResponse = {
  ...baseTx,
  transactionType: 'expense',
  sourceAccountId: 'a1',
  targetAccountId: 'ext',
};
const expenseInitial: IncomeExpenseFormValues = {
  ...ieInitial,
  incomes: [],
  expenses: [{ category: 'cat-1', amount: 100 }],
};

describe('diffIncomeExpense', () => {
  it('returns empty diff when nothing changed', () => {
    expect(diffIncomeExpense(ieInitial, ieInitial, baseTx)).toEqual({});
  });

  it('description change only — no amendment/allocations', () => {
    const d = diffIncomeExpense(ieInitial, { ...ieInitial, description: 'new' }, baseTx);
    expect(d).toEqual({ description: 'new' });
    expect(d.amendment).toBeUndefined();
    expect(d.allocations).toBeUndefined();
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

  it('TOTAL CHANGE (expense 100 → 120): amendment with newAllocations, no separate allocations', () => {
    const d = diffIncomeExpense(
      expenseInitial,
      { ...expenseInitial, expenses: [{ category: 'cat-1', amount: 120 }] },
      expenseTx,
    );
    expect(d.amendment).toMatchObject({
      sourceAccountId: 'a1',
      targetAccountId: 'ext',
      sourceAmount: 120,
      targetAmount: 120,
    });
    expect(d.amendment?.newAllocations?.expenses).toEqual([
      { categoryId: 'cat-1', amount: { amount: 120, currency: 'USD' } },
    ]);
    expect(d.amendment?.newAllocations?.expenses).toHaveLength(1);
    expect(d.allocations).toBeUndefined();
  });

  describe('comments', () => {
    const withExpense = (comment: string): IncomeExpenseFormValues => ({
      ...expenseInitial,
      expenses: [{ category: 'cat-1', amount: 100, comment }],
    });

    it('treats a comment-only change as a re-split (PATCH /allocations, no amendment)', () => {
      const d = diffIncomeExpense(withExpense('old'), withExpense('new'), expenseTx);
      expect(d.amendment).toBeUndefined();
      expect(d.allocations?.expenses[0]!.comment).toBe('new');
    });

    it('does not diff when only trailing whitespace differs', () => {
      const d = diffIncomeExpense(withExpense('milk'), withExpense('milk '), expenseTx);
      expect(d.allocations).toBeUndefined();
      expect(d.amendment).toBeUndefined();
    });

    it('normalizes a blank comment to undefined on the built allocation', () => {
      const d = diffIncomeExpense(withExpense('milk'), withExpense('   '), expenseTx);
      expect(d.allocations?.expenses[0]!.comment).toBeUndefined();
    });
  });

  it('SAME-TOTAL RE-SPLIT (expense [100] → [60,40]): allocations only, no amendment', () => {
    const d = diffIncomeExpense(
      expenseInitial,
      {
        ...expenseInitial,
        expenses: [
          { category: 'cat-1', amount: 60 },
          { category: 'cat-2', amount: 40 },
        ],
      },
      expenseTx,
    );
    expect(d.amendment).toBeUndefined();
    expect(d.allocations?.expenses).toHaveLength(2);
    expect(d.allocations).toEqual({
      incomes: [],
      expenses: [
        { categoryId: 'cat-1', amount: { amount: 60, currency: 'USD' } },
        { categoryId: 'cat-2', amount: { amount: 40, currency: 'USD' } },
      ],
    });
  });

  it('ACCOUNT CHANGE, same total (income → target leg): amendment with newAllocations', () => {
    const d = diffIncomeExpense(ieInitial, { ...ieInitial, accountId: 'a2' }, baseTx);
    expect(d.amendment).toMatchObject({
      sourceAccountId: 'ext',
      targetAccountId: 'a2',
      sourceAmount: 100,
      targetAmount: 100,
    });
    expect(d.amendment?.newAllocations).toEqual({
      incomes: [{ categoryId: 'cat-1', amount: { amount: 100, currency: 'USD' } }],
      expenses: [],
    });
    expect(d.allocations).toBeUndefined();
  });

  it('expense account change touches the source leg, not target', () => {
    const d = diffIncomeExpense(expenseInitial, { ...expenseInitial, accountId: 'a2' }, expenseTx);
    expect(d.amendment).toMatchObject({
      sourceAccountId: 'a2',
      targetAccountId: 'ext',
    });
    expect(d.amendment?.newAllocations?.expenses).toHaveLength(1);
  });

  it('INCOME reimbursement total change: amendment carries BOTH buckets, newTotal=5600', () => {
    const incomeInitial: IncomeExpenseFormValues = {
      ...ieInitial,
      incomes: [{ category: 'cat-1', amount: 5000 }],
      expenses: [{ category: 'cat-2', amount: 500 }],
    };
    const d = diffIncomeExpense(
      incomeInitial,
      {
        ...incomeInitial,
        incomes: [{ category: 'cat-1', amount: 5000 }],
        expenses: [{ category: 'cat-2', amount: 600 }],
      },
      baseTx,
    );
    expect(d.amendment?.sourceAmount).toBe(5600);
    expect(d.amendment?.targetAmount).toBe(5600);
    expect(d.amendment?.newAllocations).toEqual({
      incomes: [{ categoryId: 'cat-1', amount: { amount: 5000, currency: 'USD' } }],
      expenses: [{ categoryId: 'cat-2', amount: { amount: 600, currency: 'USD' } }],
    });
    expect(d.allocations).toBeUndefined();
  });

  describe('contact', () => {
    const withContact = (contactId: string | null): IncomeExpenseFormValues => ({
      ...expenseInitial,
      contactId,
    });

    it('contact-only change → diff.contactId, no amendment', () => {
      const d = diffIncomeExpense(withContact('c1'), withContact('c2'), expenseTx);
      expect(d.contactId).toBe('c2');
      expect(d.amendment).toBeUndefined();
    });

    it('amount change + unchanged contact → amendment carries contactId, no diff.contactId', () => {
      const d = diffIncomeExpense(
        withContact('c1'),
        { ...withContact('c1'), expenses: [{ category: 'cat-1', amount: 120 }] },
        expenseTx,
      );
      expect(d.amendment?.contactId).toBe('c1');
      expect(d.contactId).toBeUndefined();
    });

    it('amount change + contact change → amendment carries new contactId, no diff.contactId', () => {
      const d = diffIncomeExpense(
        withContact('c1'),
        { ...withContact('c2'), expenses: [{ category: 'cat-1', amount: 120 }] },
        expenseTx,
      );
      expect(d.amendment?.contactId).toBe('c2');
      expect(d.contactId).toBeUndefined();
    });

    it('clear contact only → diff.contactId null, no amendment', () => {
      const d = diffIncomeExpense(withContact('c1'), withContact(null), expenseTx);
      expect(d.contactId).toBeNull();
      expect(d.amendment).toBeUndefined();
    });
  });

  it('NO categorised change (only description edited): neither amendment nor allocations', () => {
    const incomeInitial: IncomeExpenseFormValues = {
      ...ieInitial,
      incomes: [{ category: 'cat-1', amount: 5000 }],
      expenses: [{ category: 'cat-2', amount: 500 }],
    };
    const d = diffIncomeExpense(incomeInitial, { ...incomeInitial, description: 'new' }, baseTx);
    expect(d.description).toBe('new');
    expect(d.amendment).toBeUndefined();
    expect(d.allocations).toBeUndefined();
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
  allocations: { incomes: [], expenses: [] },
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
