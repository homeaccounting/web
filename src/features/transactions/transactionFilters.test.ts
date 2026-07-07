import { describe, expect, it } from 'vitest';
import type { TransactionResponse } from '@/api/types';
import {
  applyTransactionFilters,
  defaultDateWindow,
  dateInputToUtcEnd,
  dateInputToUtcStart,
  isDateInputValue,
  isValidDateWindow,
  type TransactionFilters,
} from './transactionFilters';

const base: TransactionResponse = {
  id: 't1',
  sourceAccountId: 'a',
  targetAccountId: 'a',
  sourceAmount: 0,
  sourceCurrency: 'USD',
  targetAmount: 0,
  targetCurrency: 'USD',
  exchangeRate: null,
  description: 'Coffee at cafe',
  status: 'Completed',
  failureReason: null,
  transactionType: 'expense',
  allocations: { incomes: [], expenses: [] },
  date: '2026-05-01T00:00:00Z',
  labels: ['lbl-trip'],
  amendmentCount: 0,
  relations: [],
};
// A single expense (or income) slice carrying `categoryId` (or no slice for
// null), so the category filter (which scans allocation slices) can match.
const alloc = (categoryId: string | null): TransactionResponse['allocations'] =>
  categoryId === null
    ? { incomes: [], expenses: [] }
    : { incomes: [], expenses: [{ categoryId, amount: { amount: 1, currency: 'USD' } }] };
const incomeAlloc = (categoryId: string): TransactionResponse['allocations'] => ({
  incomes: [{ categoryId, amount: { amount: 1, currency: 'USD' } }],
  expenses: [],
});
const row = (o: Partial<TransactionResponse>): TransactionResponse => ({ ...base, ...o });
const noFilter: TransactionFilters = {
  description: '',
  labelIds: [],
  category: '',
  showCancelledFailed: true,
};

// The filter matches by NAME. "Other" is seeded into BOTH dictionaries with
// distinct ids — both resolve to the name "Other".
const names = new Map<string, string>([
  ['cat-food', 'Food'],
  ['cat-salary', 'Salary'],
  ['inc-other', 'Other'],
  ['exp-other', 'Other'],
]);

describe('applyTransactionFilters', () => {
  const rows = [
    row({ id: '1', description: 'Coffee', allocations: alloc('cat-food'), labels: ['lbl-trip'] }),
    row({ id: '2', description: 'Salary', allocations: alloc('cat-salary'), labels: [] }),
    row({ id: '3', description: 'Transfer', allocations: alloc(null), labels: ['lbl-fun'] }),
  ];

  it('returns all rows when no filter is set', () => {
    expect(applyTransactionFilters(rows, noFilter, names)).toHaveLength(3);
  });
  it('filters by case-insensitive partial description', () => {
    expect(
      applyTransactionFilters(rows, { ...noFilter, description: 'coff' }, names).map((r) => r.id),
    ).toEqual(['1']);
  });
  it('filters by label (ANY of)', () => {
    expect(
      applyTransactionFilters(rows, { ...noFilter, labelIds: ['lbl-trip', 'lbl-fun'] }, names).map(
        (r) => r.id,
      ),
    ).toEqual(['1', '3']);
  });
  it('filters by category name and excludes null-category rows', () => {
    expect(
      applyTransactionFilters(rows, { ...noFilter, category: 'Food' }, names).map((r) => r.id),
    ).toEqual(['1']);
  });
  it('matches a name shared across dictionaries (income & expense "Other")', () => {
    const otherRows = [
      row({ id: 'inc', allocations: incomeAlloc('inc-other') }),
      row({ id: 'exp', allocations: alloc('exp-other') }),
      row({ id: 'food', allocations: alloc('cat-food') }),
    ];
    expect(
      applyTransactionFilters(otherRows, { ...noFilter, category: 'Other' }, names).map(
        (r) => r.id,
      ),
    ).toEqual(['inc', 'exp']);
  });
  it('composes filters with AND', () => {
    expect(
      applyTransactionFilters(
        rows,
        {
          description: 'o',
          labelIds: ['lbl-trip'],
          category: 'Food',
          showCancelledFailed: true,
        },
        names,
      ).map((r) => r.id),
    ).toEqual(['1']);
  });
});

describe('showCancelledFailed filter', () => {
  const statusRows = [
    row({ id: 'completed', status: 'Completed' }),
    row({ id: 'pending', status: 'Pending' }),
    row({ id: 'failed', status: 'Failed' }),
    row({ id: 'cancelled', status: 'Cancelled' }),
  ];

  it('hides Failed and Cancelled rows when showCancelledFailed is false', () => {
    const result = applyTransactionFilters(
      statusRows,
      { ...noFilter, showCancelledFailed: false },
      names,
    );
    expect(result.map((r) => r.id)).toEqual(['completed', 'pending']);
  });

  it('shows all rows when showCancelledFailed is true', () => {
    const result = applyTransactionFilters(
      statusRows,
      { ...noFilter, showCancelledFailed: true },
      names,
    );
    expect(result.map((r) => r.id)).toEqual(['completed', 'pending', 'failed', 'cancelled']);
  });
});

describe('isDateInputValue', () => {
  it('returns true for a complete YYYY-MM-DD value', () => {
    expect(isDateInputValue('2026-05-10')).toBe(true);
  });
  it('returns false for an empty string', () => {
    expect(isDateInputValue('')).toBe(false);
  });
  it('returns false for a short month/day form', () => {
    expect(isDateInputValue('2026-5-1')).toBe(false);
  });
  it('returns false for a partial YYYY-MM value', () => {
    expect(isDateInputValue('2026-05')).toBe(false);
  });
});

describe('isValidDateWindow', () => {
  it('returns true when from <= to and both are complete dates', () => {
    expect(isValidDateWindow('2026-05-10', '2026-06-10')).toBe(true);
  });
  it('returns false when from > to', () => {
    expect(isValidDateWindow('2026-06-10', '2026-05-10')).toBe(false);
  });
  it('returns false when from is empty', () => {
    expect(isValidDateWindow('', '2026-06-10')).toBe(false);
  });
  it('returns true when from === to', () => {
    expect(isValidDateWindow('2026-05-10', '2026-05-10')).toBe(true);
  });
});

describe('date helpers', () => {
  it('defaultDateWindow returns last-month..today as YYYY-MM-DD', () => {
    const { from, to } = defaultDateWindow(new Date('2026-06-10T12:00:00Z'));
    expect(to).toBe('2026-06-10');
    expect(from).toBe('2026-05-10');
  });
  it('converts date inputs to inclusive UTC bounds', () => {
    expect(dateInputToUtcStart('2026-05-10')).toBe('2026-05-10T00:00:00.000Z');
    expect(dateInputToUtcEnd('2026-06-10')).toBe('2026-06-10T23:59:59.999Z');
  });
});
