import { describe, expect, it } from 'vitest';
import {
  incomeExpenseFormSchema,
  transferFormSchema,
  toIncomeRequest,
  toExpenseRequest,
  toTransferRequest,
} from './schema';

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

  it('rejects missing description', () => {
    expect(incomeExpenseFormSchema.safeParse({ ...valid, description: '' }).success).toBe(false);
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
