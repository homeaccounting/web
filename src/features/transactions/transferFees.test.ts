import { describe, expect, it } from 'vitest';
import { feeTotal, transferCredit, transferDebit, transferFeeTotal } from './transferFees';

const fee = (amount: number) => ({ category: 'c', amount });

describe('transferFees', () => {
  it('fee on top: debit = amount + fees, credit = amount', () => {
    const v = { amount: 1000, expenses: [fee(10)], feeMode: 'source' as const };
    expect(transferDebit(v)).toBe(1010);
    expect(transferCredit(v)).toBe(1000);
  });

  it('fee deducted: debit = amount, credit = amount − fees', () => {
    const v = { amount: 1000, expenses: [fee(10)], feeMode: 'target' as const };
    expect(transferDebit(v)).toBe(1000);
    expect(transferCredit(v)).toBe(990);
  });

  it('sums several fees without float noise and ignores blank amounts', () => {
    expect(feeTotal([fee(0.1), fee(0.2), fee(NaN)])).toBe(0.3);
  });

  it('a plain transfer debits and credits the typed amount', () => {
    const v = { amount: 12.345, expenses: [], feeMode: 'source' as const };
    expect(transferDebit(v)).toBe(12.345);
    expect(transferCredit(v)).toBe(12.345);
  });

  it('totals the fee allocations on a stored transfer', () => {
    const money = (amount: number) => ({ amount, currency: 'UAH' });
    expect(
      transferFeeTotal({
        allocations: {
          incomes: [],
          expenses: [
            { categoryId: 'a', amount: money(5) },
            { categoryId: 'b', amount: money(2.5) },
          ],
        },
      }),
    ).toBe(7.5);
  });
});
