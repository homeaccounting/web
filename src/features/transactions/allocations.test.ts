import { describe, it, expect } from 'vitest';
import {
  allocationCategoryIds,
  allocationComments,
  sliceArraysFromTx,
  dropEmptySlices,
  normalizeComment,
} from './allocations';
import type { TransactionResponse } from '@/api/types';

type Row = [categoryId: string, amount: number, comment?: string];
const tx = (incomes: Row[], expenses: Row[]) =>
  ({
    allocations: {
      incomes: incomes.map(([categoryId, a, comment]) => ({
        categoryId,
        amount: { amount: a, currency: 'USD' },
        comment,
      })),
      expenses: expenses.map(([categoryId, a, comment]) => ({
        categoryId,
        amount: { amount: a, currency: 'USD' },
        comment,
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
      incomes: [{ category: 'inc', amount: 5000, comment: '' }],
      expenses: [{ category: 'exp', amount: 500, comment: '' }],
    });
  });

  it('carries each slice comment as a string, blank when absent', () => {
    const { incomes, expenses } = sliceArraysFromTx(tx([['c1', 10, 'salary']], [['c2', 5]]));
    expect(incomes[0]!.comment).toBe('salary');
    expect(expenses[0]!.comment).toBe('');
  });
});

describe('normalizeComment', () => {
  it('trims and turns blank/whitespace into undefined', () => {
    expect(normalizeComment('  milk ')).toBe('milk');
    expect(normalizeComment('   ')).toBeUndefined();
    expect(normalizeComment('')).toBeUndefined();
    expect(normalizeComment(undefined)).toBeUndefined();
    expect(normalizeComment(null)).toBeUndefined();
  });
});

describe('allocationComments', () => {
  it('collects non-empty trimmed comments, incomes then expenses, in order', () => {
    expect(
      allocationComments(
        tx(
          [['c1', 10, ' salary ']],
          [
            ['c2', 5, 'milk'],
            ['c3', 2, '  '],
            ['c4', 1],
          ],
        ),
      ),
    ).toEqual(['salary', 'milk']);
  });

  it('returns [] when no slice has a comment', () => {
    expect(allocationComments(tx([], [['c2', 5]]))).toEqual([]);
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
