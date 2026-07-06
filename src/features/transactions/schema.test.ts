import { describe, expect, it } from 'vitest';
import {
  incomeExpenseFormSchema,
  transferFormSchema,
  makeIncomeExpenseFormSchema,
  makeTransferFormSchema,
  toIncomeRequest,
  toExpenseRequest,
  toTransferRequest,
  toIncomeExpenseFormValues,
  toTransferFormValues,
  type IncomeExpenseFormValues,
} from './schema';
import type { AccountResponse, TransactionResponse } from '@/api/types';

const ACC_A = '11111111-1111-1111-1111-111111111111';
const ACC_B = '22222222-2222-2222-2222-222222222222';
const CAT = '33333333-3333-3333-3333-333333333333';
const CAT2 = '55555555-5555-5555-5555-555555555555';
const LBL = '44444444-4444-4444-4444-444444444444';

describe('incomeExpenseFormSchema', () => {
  const valid = {
    accountId: ACC_A,
    currency: 'USD',
    incomes: [{ category: CAT, amount: 12.5 }],
    expenses: [],
    description: 'Lunch',
    date: '2026-06-01',
    labels: [LBL],
  };

  it('parses a valid input', () => {
    expect(incomeExpenseFormSchema.parse(valid)).toMatchObject(valid);
  });

  it('rejects non-positive slice amounts', () => {
    expect(
      incomeExpenseFormSchema.safeParse({
        ...valid,
        incomes: [{ category: CAT, amount: 0 }],
      }).success,
    ).toBe(false);
    expect(
      incomeExpenseFormSchema.safeParse({
        ...valid,
        incomes: [{ category: CAT, amount: -1 }],
      }).success,
    ).toBe(false);
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
  const values: IncomeExpenseFormValues = {
    accountId: ACC_A,
    currency: 'USD',
    incomes: [{ category: CAT, amount: 12.5 }],
    expenses: [],
    description: 'Lunch',
    date: '2026-06-01',
    labels: [LBL],
  };

  it('produces the full DTO with ISO timestamp and one income slice', () => {
    expect(toIncomeRequest({ ...values })).toEqual({
      accountId: ACC_A,
      currency: 'USD',
      allocations: {
        incomes: [{ category: CAT, amount: 12.5 }],
        expenses: [],
      },
      description: 'Lunch',
      date: '2026-06-01T00:00:00.000Z',
      labels: [LBL],
    });
  });

  it('maps two income rows into the incomes bucket', () => {
    const dto = toIncomeRequest({
      ...values,
      incomes: [
        { category: CAT, amount: 10 },
        { category: CAT2, amount: 5 },
      ],
    });
    expect(dto.allocations.incomes).toHaveLength(2);
    expect(dto.allocations.expenses).toHaveLength(0);
  });

  it('income with a reimbursement (one income + one expense) fills both buckets', () => {
    const dto = toIncomeRequest({
      ...values,
      incomes: [{ category: CAT, amount: 10 }],
      expenses: [{ category: CAT2, amount: 3 }],
    });
    expect(dto.allocations).toEqual({
      incomes: [{ category: CAT, amount: 10 }],
      expenses: [{ category: CAT2, amount: 3 }],
    });
  });

  it('carries trimmed allocation comments and omits blank ones', () => {
    const dto = toIncomeRequest({
      ...values,
      incomes: [{ category: CAT, amount: 10, comment: '  salary ' }],
      expenses: [{ category: CAT2, amount: 5, comment: '   ' }],
    });
    expect(dto.allocations.incomes[0]!.comment).toBe('salary');
    expect(dto.allocations.expenses[0]!.comment).toBeUndefined();
  });

  it('omits date when undefined', () => {
    const dto = toIncomeRequest({ ...values, date: undefined });
    expect(dto.date).toBeUndefined();
  });

  it('omits labels when empty', () => {
    const dto = toIncomeRequest({ ...values, labels: [] });
    expect(dto.labels).toBeUndefined();
  });

  it('toExpenseRequest maps two expense rows into the expenses bucket', () => {
    const dto = toExpenseRequest({
      ...values,
      incomes: [],
      expenses: [
        { category: CAT, amount: 4 },
        { category: CAT2, amount: 6 },
      ],
    });
    expect(dto.allocations).toEqual({
      incomes: [],
      expenses: [
        { category: CAT, amount: 4 },
        { category: CAT2, amount: 6 },
      ],
    });
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
  status: 'Opened',
  version: 1,
});

const money = (amount: number, currency = 'USD') => ({ amount, currency });

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
  allocations: {
    incomes: [{ categoryId: 'cat-1', amount: money(10) }],
    expenses: [],
  },
  date: '2026-03-04T15:00:00.000Z',
  labels: ['l1'],
  amendmentCount: 0,
  ...overrides,
});

describe('toIncomeExpenseFormValues', () => {
  it('income → regular leg is the target, slices seeded from allocations', () => {
    const v = toIncomeExpenseFormValues(baseTx({ transactionType: 'income' }), [acc('a1')]);
    expect(v).toEqual({
      accountId: 'a1',
      currency: 'USD',
      incomes: [{ category: 'cat-1', amount: 10, comment: '' }],
      expenses: [],
      description: 'd',
      date: '2026-03-04T15:00',
      labels: ['l1'],
      targetMode: false,
      targetTotal: '',
    });
  });

  it('seeds target mode off when editing an existing transaction', () => {
    // Expense path — the income snapshot above already covers the income case;
    // this asserts the seed on the other kind.
    const tx = baseTx({
      transactionType: 'expense',
      sourceAccountId: 'a1',
      targetAccountId: 'ext',
      allocations: { incomes: [], expenses: [{ categoryId: 'cat-2', amount: money(10) }] },
    });
    const values = toIncomeExpenseFormValues(tx, [acc('a1')]);
    expect(values.targetMode).toBe(false);
    expect(values.targetTotal).toBe('');
  });

  it('expense → regular leg is the source', () => {
    const tx = baseTx({
      transactionType: 'expense',
      sourceAccountId: 'a1',
      targetAccountId: 'ext',
      allocations: {
        incomes: [],
        expenses: [{ categoryId: 'cat-2', amount: money(10) }],
      },
    });
    const v = toIncomeExpenseFormValues(tx, [acc('a1')]);
    expect(v.accountId).toBe('a1');
    expect(v.expenses).toEqual([{ category: 'cat-2', amount: 10, comment: '' }]);
    expect(v.incomes).toEqual([]);
  });

  it('seeds both buckets for a reimbursement income', () => {
    const tx = baseTx({
      transactionType: 'income',
      allocations: {
        incomes: [{ categoryId: 'cat-1', amount: money(10) }],
        expenses: [{ categoryId: 'cat-2', amount: money(3) }],
      },
    });
    const v = toIncomeExpenseFormValues(tx, [acc('a1')]);
    expect(v.incomes).toEqual([{ category: 'cat-1', amount: 10, comment: '' }]);
    expect(v.expenses).toEqual([{ category: 'cat-2', amount: 3, comment: '' }]);
  });
});

const accBal = (id: string, balance: number, overdraftLimit: number | null): AccountResponse => ({
  id,
  name: id,
  currency: 'USD',
  balance,
  overdraftLimit,
  subtype: { type: 'cash' },
  status: 'Opened',
  version: 1,
});

describe('makeIncomeExpenseFormSchema (allocation refinement)', () => {
  const base = {
    accountId: ACC_A,
    currency: 'USD',
    description: '',
    date: '',
    labels: [] as string[],
  };

  it('rejects when both buckets are empty (issue at expenses)', () => {
    const schema = makeIncomeExpenseFormSchema(null, 'income');
    const res = schema.safeParse({ ...base, incomes: [], expenses: [] });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path[0] === 'expenses')).toBe(true);
    }
  });

  it('rejects an expense carrying income categories (issue at incomes)', () => {
    const schema = makeIncomeExpenseFormSchema(null, 'expense');
    const res = schema.safeParse({
      ...base,
      incomes: [{ category: CAT, amount: 5 }],
      expenses: [{ category: CAT2, amount: 5 }],
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path[0] === 'incomes')).toBe(true);
    }
  });

  it('rejects a slice with a non-positive amount', () => {
    const schema = makeIncomeExpenseFormSchema(null, 'income');
    expect(
      schema.safeParse({ ...base, incomes: [{ category: CAT, amount: 0 }], expenses: [] }).success,
    ).toBe(false);
  });

  it('accepts a valid income with two income rows', () => {
    const schema = makeIncomeExpenseFormSchema(null, 'income');
    expect(
      schema.safeParse({
        ...base,
        incomes: [
          { category: CAT, amount: 10 },
          { category: CAT2, amount: 5 },
        ],
        expenses: [],
      }).success,
    ).toBe(true);
  });

  describe('expense balance check', () => {
    it('passes when the expense total is below available (balance + overdraftLimit)', () => {
      const schema = makeIncomeExpenseFormSchema([accBal(ACC_A, 100, 0)], 'expense');
      expect(
        schema.safeParse({ ...base, incomes: [], expenses: [{ category: CAT, amount: 50 }] })
          .success,
      ).toBe(true);
    });

    it('passes at the inclusive boundary (total === available)', () => {
      const schema = makeIncomeExpenseFormSchema([accBal(ACC_A, 100, 20)], 'expense');
      expect(
        schema.safeParse({ ...base, incomes: [], expenses: [{ category: CAT, amount: 120 }] })
          .success,
      ).toBe(true);
    });

    it('fails when the expense total exceeds available, with the error on the expenses path', () => {
      const schema = makeIncomeExpenseFormSchema([accBal(ACC_A, 100, 20)], 'expense');
      const res = schema.safeParse({
        ...base,
        incomes: [],
        expenses: [
          { category: CAT, amount: 100 },
          { category: CAT2, amount: 20.01 },
        ],
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some((i) => i.path[0] === 'expenses')).toBe(true);
      }
    });

    it('skips the check when overdraftLimit is null (unlimited)', () => {
      const schema = makeIncomeExpenseFormSchema([accBal(ACC_A, 0, null)], 'expense');
      expect(
        schema.safeParse({ ...base, incomes: [], expenses: [{ category: CAT, amount: 999999 }] })
          .success,
      ).toBe(true);
    });

    it('skips the check when accounts is null', () => {
      const schema = makeIncomeExpenseFormSchema(null, 'expense');
      expect(
        schema.safeParse({ ...base, incomes: [], expenses: [{ category: CAT, amount: 999999 }] })
          .success,
      ).toBe(true);
    });

    it('never adds the balance check for income', () => {
      const schema = makeIncomeExpenseFormSchema([accBal(ACC_A, 0, 0)], 'income');
      expect(
        schema.safeParse({ ...base, incomes: [{ category: CAT, amount: 999999 }], expenses: [] })
          .success,
      ).toBe(true);
    });
  });

  describe('target total gate', () => {
    const t = { ...base, currency: 'USD' };

    it('passes when sum equals the target', () => {
      const schema = makeIncomeExpenseFormSchema(null, 'expense');
      const res = schema.safeParse({
        ...t,
        incomes: [],
        expenses: [{ category: CAT, amount: 80 }],
        targetMode: true,
        targetTotal: 80,
      });
      expect(res.success).toBe(true);
    });

    it('rejects (issue at expenses) when sum is short of the target', () => {
      const schema = makeIncomeExpenseFormSchema(null, 'expense');
      const res = schema.safeParse({
        ...t,
        incomes: [],
        expenses: [{ category: CAT, amount: 55 }],
        targetMode: true,
        targetTotal: 80,
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        const issue = res.error.issues.find((i) => i.path[0] === 'expenses');
        expect(issue?.message).toContain('short');
        expect(issue?.message).toContain('$25.00');
      }
    });

    it('rejects (issue at expenses) when sum is over the target', () => {
      const schema = makeIncomeExpenseFormSchema(null, 'expense');
      const res = schema.safeParse({
        ...t,
        incomes: [],
        expenses: [{ category: CAT, amount: 90 }],
        targetMode: true,
        targetTotal: 80,
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        const issue = res.error.issues.find((i) => i.path[0] === 'expenses');
        expect(issue?.message).toContain('over');
        expect(issue?.message).toContain('$10.00');
      }
    });

    it('rejects (issue at targetTotal) when target mode is on but target is blank', () => {
      const schema = makeIncomeExpenseFormSchema(null, 'expense');
      const res = schema.safeParse({
        ...t,
        incomes: [],
        expenses: [{ category: CAT, amount: 55 }],
        targetMode: true,
        targetTotal: '',
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some((i) => i.path[0] === 'targetTotal')).toBe(true);
      }
    });

    it('treats a sub-cent difference as balanced', () => {
      const schema = makeIncomeExpenseFormSchema(null, 'expense');
      const res = schema.safeParse({
        ...t,
        incomes: [],
        expenses: [
          { category: CAT, amount: 26.66 },
          { category: CAT2, amount: 26.67 },
          { category: CAT, amount: 26.67 },
        ],
        targetMode: true,
        targetTotal: 80,
      });
      expect(res.success).toBe(true);
    });

    it('ignores the target when target mode is off', () => {
      const schema = makeIncomeExpenseFormSchema(null, 'expense');
      const res = schema.safeParse({
        ...t,
        incomes: [],
        expenses: [{ category: CAT, amount: 55 }],
        targetMode: false,
        targetTotal: 80,
      });
      expect(res.success).toBe(true);
    });

    it('defaults targetMode to false when omitted', () => {
      const parsed = incomeExpenseFormSchema.parse({
        accountId: ACC_A,
        currency: 'USD',
        incomes: [{ category: CAT, amount: 12.5 }],
        expenses: [],
        description: '',
        date: '',
        labels: [],
      });
      expect(parsed.targetMode).toBe(false);
      expect(parsed.targetTotal).toBe('');
    });
  });
});

describe('makeTransferFormSchema (source balance check)', () => {
  const base = {
    sourceAccountId: ACC_A,
    targetAccountId: ACC_B,
    currency: 'USD',
    description: '',
    date: '',
    labels: [] as string[],
  };

  it('fails when amount exceeds the source available balance', () => {
    const schema = makeTransferFormSchema([accBal(ACC_A, 100, 0), accBal(ACC_B, 0, 0)]);
    const res = schema.safeParse({ ...base, amount: 150 });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path[0] === 'amount')).toBe(true);
    }
  });

  it('passes when amount is within the source available balance', () => {
    const schema = makeTransferFormSchema([accBal(ACC_A, 100, 50), accBal(ACC_B, 0, 0)]);
    expect(schema.safeParse({ ...base, amount: 120 }).success).toBe(true);
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
      allocations: { incomes: [], expenses: [] },
    });
    const v = toTransferFormValues(tx, [acc('a1', 'USD'), acc('a2', 'EUR')]);
    expect(v).toEqual({
      sourceAccountId: 'a1',
      targetAccountId: 'a2',
      amount: 50,
      currency: 'USD',
      description: 'd',
      exchangeRate: 0.9,
      date: '2026-03-04T15:00',
      labels: ['l1'],
    });
  });
});
