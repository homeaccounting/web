import { describe, expect, it } from 'vitest';
import {
  toTransferAmendment,
  transferCredit,
  transferDebit,
  transferFeeTotal,
  transferTargetAmount,
} from './transferFees';

const A = 'acc-A';
const B = 'acc-B';
const fee = (amount: number) => ({ category: 'c', amount });

describe('transferFees', () => {
  it('fee on top: debit = amount + fees, credit = amount', () => {
    const v = { amount: 1000, fees: [fee(10)], feeMode: 'source' as const };
    expect(transferDebit(v)).toBe(1010);
    expect(transferCredit(v)).toBe(1000);
  });

  it('fee deducted: debit = amount, credit = amount − fees', () => {
    const v = { amount: 1000, fees: [fee(10)], feeMode: 'target' as const };
    expect(transferDebit(v)).toBe(1000);
    expect(transferCredit(v)).toBe(990);
  });

  it('sums several fees without float noise and ignores blank amounts', () => {
    const v = { amount: 1, fees: [fee(0.1), fee(0.2), fee(NaN)], feeMode: 'source' as const };
    expect(transferDebit(v)).toBe(1.3);
  });

  it('converts the credit only when cross-currency, to the cent', () => {
    expect(transferTargetAmount(100, 0.92371, true)).toBe(92.37);
    expect(transferTargetAmount(100, 0.92371, false)).toBe(100);
    expect(transferTargetAmount(100, undefined, true)).toBe(100);
  });

  it('a plain transfer debits and credits the typed amount', () => {
    const v = { amount: 12.345, fees: [], feeMode: 'source' as const };
    expect(transferDebit(v)).toBe(12.345);
    expect(transferCredit(v)).toBe(12.345);
  });

  it('totals the fee allocations on a stored transfer', () => {
    const money = (amount: number) => ({ amount, currency: 'UAH' });
    expect(
      transferFeeTotal({
        incomes: [],
        expenses: [
          { categoryId: 'a', amount: money(5) },
          { categoryId: 'b', amount: money(2.5) },
        ],
      }),
    ).toBe(7.5);
  });
});

describe('toTransferAmendment', () => {
  it('carries fees: debits amount + fee and sends them as newAllocations', () => {
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
        fees: [{ category: 'c1', amount: 2 }],
        feeMode: 'source',
      },
      'USD',
      'USD',
    );
    expect(a).toMatchObject({ sourceAmount: 52, targetAmount: 50 });
    expect(a.newAllocations?.expenses).toHaveLength(1);
  });

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
        fees: [],
        feeMode: 'source',
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
        fees: [],
        feeMode: 'source',
      },
      'USD',
      'EUR',
    );
    expect(a.sourceAmount).toBe(50);
    expect(a.targetAmount).toBe(100);
    expect(a.exchangeRate).toBe(2);
  });
});
