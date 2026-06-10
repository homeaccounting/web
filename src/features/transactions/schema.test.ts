import { describe, expect, it } from 'vitest';
import {
  incomeExpenseFormSchema,
  transferFormSchema,
  toIncomeRequest,
  toExpenseRequest,
  toTransferRequest,
  toIncomeExpenseFormValues,
  toTransferFormValues,
} from './schema';
import type { AccountResponse, TransactionResponse } from '@/api/types';

const ACC_A = '11111111-1111-1111-1111-111111111111';
const ACC_B = '22222222-2222-2222-2222-222222222222';
const CAT = '33333333-3333-3333-3333-333333333333';
const LBL = '44444444-4444-4444-4444-444444444444';

describe('incomeExpenseFormSchema', () => {
  const valid = {
    accountId: ACC_A,
    amount: 12.5,
    currency: 'USD',
    category: CAT,
    description: 'Lunch',
    date: '2026-06-01',
    labels: [LBL],
  };

  it('parses a valid input', () => {
    expect(incomeExpenseFormSchema.parse(valid)).toMatchObject(valid);
  });

  it('rejects non-positive amounts', () => {
    expect(incomeExpenseFormSchema.safeParse({ ...valid, amount: 0 }).success).toBe(false);
    expect(incomeExpenseFormSchema.safeParse({ ...valid, amount: -1 }).success).toBe(false);
  });

  it('accepts an empty description (optional)', () => {
    expect(incomeExpenseFormSchema.safeParse({ ...valid, description: '' }).success).toBe(true);
  });

  it('accepts empty date (omitted) and empty labels', () => {
    const parsed = incomeExpenseFormSchema.parse({ ...valid, date: '', labels: [] });
    expect(parsed.date).toBeUndefined();
    expect(parsed.labels).toEqual([]);
  });

  it('defaults labels to empty when omitted', () => {
    const without = { ...valid } as Partial<typeof valid>;
    delete without.labels;
    const parsed = incomeExpenseFormSchema.parse(without);
    expect(parsed.labels).toEqual([]);
  });
});

describe('toIncomeRequest / toExpenseRequest', () => {
  const values = {
    accountId: ACC_A,
    amount: 12.5,
    currency: 'USD',
    category: CAT,
    description: 'Lunch',
    date: '2026-06-01',
    labels: [LBL],
  } as const;

  it('produces the full DTO with ISO timestamp', () => {
    expect(toIncomeRequest({ ...values })).toEqual({
      accountId: ACC_A,
      amount: 12.5,
      currency: 'USD',
      category: CAT,
      description: 'Lunch',
      date: '2026-06-01T00:00:00.000Z',
      labels: [LBL],
    });
  });

  it('omits date when undefined', () => {
    const dto = toIncomeRequest({ ...values, date: undefined });
    expect(dto.date).toBeUndefined();
  });

  it('omits labels when empty', () => {
    const dto = toIncomeRequest({ ...values, labels: [] });
    expect(dto.labels).toBeUndefined();
  });

  it('toExpenseRequest equals toIncomeRequest for the same input', () => {
    expect(toExpenseRequest({ ...values })).toEqual(toIncomeRequest({ ...values }));
  });
});

describe('transferFormSchema', () => {
  const valid = {
    sourceAccountId: ACC_A,
    targetAccountId: ACC_B,
    amount: 100,
    currency: 'USD',
    description: 'Top-up',
    exchangeRate: undefined,
    date: '2026-06-01',
    labels: [],
  };

  it('parses a valid input', () => {
    expect(transferFormSchema.parse(valid)).toMatchObject(valid);
  });

  it('rejects source === target', () => {
    const r = transferFormSchema.safeParse({ ...valid, targetAccountId: ACC_A });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.join('.') === 'targetAccountId')).toBe(true);
    }
  });

  it('rejects non-positive exchangeRate', () => {
    expect(transferFormSchema.safeParse({ ...valid, exchangeRate: 0 }).success).toBe(false);
    expect(transferFormSchema.safeParse({ ...valid, exchangeRate: -0.5 }).success).toBe(false);
  });
});

describe('toTransferRequest', () => {
  const values = {
    sourceAccountId: ACC_A,
    targetAccountId: ACC_B,
    amount: 100,
    currency: 'USD',
    description: 'Top-up',
    exchangeRate: 1.25,
    date: '2026-06-01',
    labels: [LBL],
  } as const;

  it('drops exchangeRate when currencies match', () => {
    expect(toTransferRequest({ ...values }, 'USD', 'USD').exchangeRate).toBeUndefined();
  });

  it('keeps exchangeRate when currencies differ', () => {
    expect(toTransferRequest({ ...values }, 'USD', 'EUR').exchangeRate).toBe(1.25);
  });

  it('omits date when empty', () => {
    expect(toTransferRequest({ ...values, date: undefined }, 'USD', 'USD').date).toBeUndefined();
  });

  it('omits labels when empty', () => {
    expect(toTransferRequest({ ...values, labels: [] }, 'USD', 'USD').labels).toBeUndefined();
  });
});

const acc = (id: string, currency = 'USD'): AccountResponse => ({
  id,
  name: id,
  currency,
  balance: 0,
  overdraftLimit: null,
  subtype: { type: 'cash' },
  version: 1,
});

const baseTx = (overrides: Partial<TransactionResponse>): TransactionResponse => ({
  id: 'tx-1',
  sourceAccountId: 'ext',
  targetAccountId: 'a1',
  sourceAmount: 10,
  sourceCurrency: 'USD',
  targetAmount: 10,
  targetCurrency: 'USD',
  exchangeRate: null,
  description: 'd',
  status: 'Completed',
  failureReason: null,
  transactionType: 'income',
  category: 'cat-1',
  date: '2026-03-04T15:00:00.000Z',
  labels: ['l1'],
  amendmentCount: 0,
  ...overrides,
});

describe('toIncomeExpenseFormValues', () => {
  it('income → regular leg is the target', () => {
    const v = toIncomeExpenseFormValues(baseTx({ transactionType: 'income' }), [acc('a1')]);
    expect(v).toEqual({
      accountId: 'a1',
      amount: 10,
      currency: 'USD',
      category: 'cat-1',
      description: 'd',
      date: '2026-03-04',
      labels: ['l1'],
    });
  });

  it('expense → regular leg is the source', () => {
    const tx = baseTx({
      transactionType: 'expense',
      sourceAccountId: 'a1',
      targetAccountId: 'ext',
    });
    const v = toIncomeExpenseFormValues(tx, [acc('a1')]);
    expect(v.accountId).toBe('a1');
  });

  it('defensive: missing category collapses to empty string', () => {
    const v = toIncomeExpenseFormValues(baseTx({ category: null }), [acc('a1')]);
    expect(v.category).toBe('');
  });
});

describe('toTransferFormValues', () => {
  it('seeds source/target ids and currency from the source account', () => {
    const tx = baseTx({
      transactionType: 'transfer',
      sourceAccountId: 'a1',
      targetAccountId: 'a2',
      sourceAmount: 50,
      sourceCurrency: 'USD',
      targetAmount: 45,
      targetCurrency: 'EUR',
      exchangeRate: 0.9,
      category: null,
    });
    const v = toTransferFormValues(tx, [acc('a1', 'USD'), acc('a2', 'EUR')]);
    expect(v).toEqual({
      sourceAccountId: 'a1',
      targetAccountId: 'a2',
      amount: 50,
      currency: 'USD',
      description: 'd',
      exchangeRate: 0.9,
      date: '2026-03-04',
      labels: ['l1'],
    });
  });
});
