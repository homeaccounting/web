import { describe, it, expect } from 'vitest';
import {
  allocationCategoryIds,
  allocationComments,
  collapseSlices,
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

describe('collapseSlices', () => {
  it('merges rows sharing a category: sums amounts, joins distinct comments with ", "', () => {
    expect(
      collapseSlices([
        { category: 'groceries', amount: 10, comment: 'milk' },
        { category: 'rent', amount: 500, comment: '' },
        { category: 'groceries', amount: 5, comment: 'bread' },
      ]),
    ).toEqual([
      { category: 'groceries', amount: 15, comment: 'milk, bread' },
      { category: 'rent', amount: 500, comment: '' },
    ]);
  });

  it('de-duplicates identical comments so a repeat does not double up', () => {
    expect(
      collapseSlices([
        { category: 'groceries', amount: 10, comment: 'milk' },
        { category: 'groceries', amount: 5, comment: 'milk' },
      ]),
    ).toEqual([{ category: 'groceries', amount: 15, comment: 'milk' }]);
  });

  it('normalizes comments (trim/blank) when joining, dropping empties', () => {
    expect(
      collapseSlices([
        { category: 'c', amount: 1, comment: '  milk ' },
        { category: 'c', amount: 2, comment: '   ' },
        { category: 'c', amount: 3, comment: 'bread' },
      ]),
    ).toEqual([{ category: 'c', amount: 6, comment: 'milk, bread' }]);
  });

  it('keeps a blank comment when no member has one', () => {
    expect(
      collapseSlices([
        { category: 'c', amount: 1, comment: '' },
        { category: 'c', amount: 2, comment: '' },
      ]),
    ).toEqual([{ category: 'c', amount: 3, comment: '' }]);
  });

  it('preserves order by first occurrence of each category', () => {
    expect(
      collapseSlices([
        { category: 'b', amount: 1, comment: '' },
        { category: 'a', amount: 2, comment: '' },
        { category: 'b', amount: 3, comment: '' },
        { category: 'a', amount: 4, comment: '' },
      ]),
    ).toEqual([
      { category: 'b', amount: 4, comment: '' },
      { category: 'a', amount: 6, comment: '' },
    ]);
  });

  it('sums only finite amounts; stays NaN when a group has none', () => {
    const [merged] = collapseSlices([
      { category: 'c', amount: NaN, comment: '' },
      { category: 'c', amount: NaN, comment: '' },
    ]);
    expect(merged!.category).toBe('c');
    expect(Number.isNaN(merged!.amount)).toBe(true);

    expect(
      collapseSlices([
        { category: 'c', amount: NaN, comment: '' },
        { category: 'c', amount: 5, comment: '' },
      ]),
    ).toEqual([{ category: 'c', amount: 5, comment: '' }]);
  });

  it('leaves blank-category rows untouched and un-grouped', () => {
    expect(
      collapseSlices([
        { category: '', amount: NaN, comment: '' },
        { category: '', amount: 3, comment: 'x' },
        { category: 'c', amount: 1, comment: '' },
        { category: 'c', amount: 2, comment: '' },
      ]),
    ).toEqual([
      { category: '', amount: NaN, comment: '' },
      { category: '', amount: 3, comment: 'x' },
      { category: 'c', amount: 3, comment: '' },
    ]);
  });

  it('is a no-op when every category is unique', () => {
    const rows = [
      { category: 'a', amount: 1, comment: 'x' },
      { category: 'b', amount: 2, comment: 'y' },
    ];
    expect(collapseSlices(rows)).toEqual(rows);
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
