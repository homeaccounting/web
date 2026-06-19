import { describe, it, expect } from 'vitest';
import { allocationCategoryIds, sliceArraysFromTx, dropEmptySlices } from './allocations';
import type { TransactionResponse } from '@/api/types';

const tx = (incomes: [string, number][], expenses: [string, number][]) =>
  ({
    allocations: {
      incomes: incomes.map(([categoryId, a]) => ({
        categoryId,
        amount: { amount: a, currency: 'USD' },
      })),
      expenses: expenses.map(([categoryId, a]) => ({
        categoryId,
        amount: { amount: a, currency: 'USD' },
      })),
    },
  }) as unknown as TransactionResponse;

describe('allocationCategoryIds', () => {
  it('returns incomes ids then expenses ids', () => {
    expect(
      allocationCategoryIds(
        tx(
          [
            ['inc1', 1],
            ['inc2', 2],
          ],
          [['exp1', 3]],
        ),
      ),
    ).toEqual(['inc1', 'inc2', 'exp1']);
  });
});

describe('sliceArraysFromTx', () => {
  it('maps categoryId -> category and Money.amount -> amount', () => {
    expect(sliceArraysFromTx(tx([['inc', 5000]], [['exp', 500]]))).toEqual({
      incomes: [{ category: 'inc', amount: 5000 }],
      expenses: [{ category: 'exp', amount: 500 }],
    });
  });
});

describe('dropEmptySlices', () => {
  it('drops fully-empty rows and keeps partial rows', () => {
    const slices = [
      { category: '' as const, amount: NaN },
      { category: 'cat', amount: NaN },
      { category: '' as const, amount: 100 },
      { category: 'cat2', amount: 200 },
    ];
    expect(dropEmptySlices(slices)).toEqual([
      { category: 'cat', amount: NaN },
      { category: '', amount: 100 },
      { category: 'cat2', amount: 200 },
    ]);
  });
});
