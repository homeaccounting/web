import { describe, it, expect } from 'vitest';
import type { TransactionResponse, UUID } from '@/api/types';
import {
  allCompleted,
  labelState,
  withLabelAdded,
  withLabelRemoved,
  bulkCategoryEligibility,
  bulkContactEligibility,
} from './bulkLabels';

// NOTE: Allocation.amount is a Money object ({ amount, currency }), NOT a bare
// number (src/api/types.ts:305-319) — a bare number fails `tsc --noEmit`.
const slice = (categoryId: string) => ({
  categoryId: categoryId,
  amount: { amount: 1, currency: 'USD' },
  comment: null,
});
function row(partial: Partial<TransactionResponse>): TransactionResponse {
  return {
    status: 'Completed',
    transactionType: 'expense',
    labels: [],
    allocations: { incomes: [], expenses: [slice('c1')] },
    ...partial,
  } as TransactionResponse;
}

describe('allCompleted', () => {
  it('is true only when every row is Completed and there is at least one', () => {
    expect(allCompleted([row({}), row({})])).toBe(true);
    expect(allCompleted([row({}), row({ status: 'Pending' })])).toBe(false);
    expect(allCompleted([])).toBe(false);
  });
});

describe('labelState', () => {
  const a = row({ labels: ['x'] });
  const b = row({ labels: ['x', 'y'] });
  const c = row({ labels: [] });
  it('returns all / some / none across the selection', () => {
    expect(labelState([a, b], 'x')).toBe('all');
    expect(labelState([a, c], 'x')).toBe('some');
    expect(labelState([a, b], 'z')).toBe('none');
    expect(labelState([], 'x')).toBe('none');
  });
});

describe('withLabelAdded / withLabelRemoved', () => {
  it('adds without duplicating and removes when present', () => {
    expect(withLabelAdded(['x'] as UUID[], 'y')).toEqual(['x', 'y']);
    expect(withLabelAdded(['x'] as UUID[], 'x')).toEqual(['x']);
    expect(withLabelRemoved(['x', 'y'] as UUID[], 'x')).toEqual(['y']);
    expect(withLabelRemoved(['x'] as UUID[], 'z')).toEqual(['x']);
  });
});

describe('bulkCategoryEligibility', () => {
  it('disables (status) when any row is not Completed', () => {
    const r = bulkCategoryEligibility([row({}), row({ status: 'Pending' })]);
    expect(r.enabled).toBe(false);
    expect(r.reason).toMatch(/completed/i);
  });
  it('disables (no category) when a transfer/adjustment is present', () => {
    const r = bulkCategoryEligibility([row({}), row({ transactionType: 'transfer' })]);
    expect(r.enabled).toBe(false);
    expect(r.reason).toMatch(/no category/i);
  });
  it('disables (mixed type) when income and expense are mixed', () => {
    const inc = row({
      transactionType: 'income',
      allocations: { incomes: [slice('c2')], expenses: [] },
    });
    const r = bulkCategoryEligibility([row({}), inc]);
    expect(r.enabled).toBe(false);
    expect(r.reason).toMatch(/one type/i);
  });
  it('disables (split) when a row has more than one allocation slice', () => {
    const split = row({ allocations: { incomes: [], expenses: [slice('c1'), slice('c3')] } });
    const r = bulkCategoryEligibility([row({}), split]);
    expect(r.enabled).toBe(false);
    expect(r.reason).toMatch(/split/i);
  });
  it('disables (refund/contra) for an income whose only slice is a contra-expense', () => {
    // A refund income: transactionType 'income' but the single slice lives in the
    // `expenses` (contra) bucket with `incomes` empty. Assigning an income
    // category to that expense-bucket slice is rejected by the backend.
    const refund = row({
      transactionType: 'income',
      allocations: { incomes: [], expenses: [slice('c1')] },
    });
    const r = bulkCategoryEligibility([refund, refund]);
    expect(r.enabled).toBe(false);
  });
  it('disables (reimbursement) for an income carrying both an income slice and a contra-expense', () => {
    const reimbursement = row({
      transactionType: 'income',
      allocations: { incomes: [slice('c2')], expenses: [slice('c1')] },
    });
    const r = bulkCategoryEligibility([reimbursement, reimbursement]);
    expect(r.enabled).toBe(false);
  });
  it('enables with the type when all rows are same-type single-allocation Completed', () => {
    expect(bulkCategoryEligibility([row({}), row({})])).toEqual({ enabled: true, type: 'expense' });
    // Natural single-slice income (slice in the incomes bucket) is eligible.
    const income = row({
      transactionType: 'income',
      allocations: { incomes: [slice('c2')], expenses: [] },
    });
    expect(bulkCategoryEligibility([income, income])).toEqual({ enabled: true, type: 'income' });
  });
});

describe('bulkContactEligibility', () => {
  const income = row({
    transactionType: 'income',
    allocations: { incomes: [slice('c1')], expenses: [] },
  });
  it('enables for completed income/expense, including a mixed selection', () => {
    expect(bulkContactEligibility([row({})]).enabled).toBe(true); // expense (default)
    expect(bulkContactEligibility([income]).enabled).toBe(true);
    expect(bulkContactEligibility([row({}), income]).enabled).toBe(true); // mixed OK
  });
  it('disables (status) when any row is not Completed', () => {
    const r = bulkContactEligibility([row({}), row({ status: 'Pending' })]);
    expect(r.enabled).toBe(false);
    expect(r.reason).toMatch(/only completed/i);
  });
  it('disables when a non-income/expense row is present', () => {
    const r = bulkContactEligibility([row({}), row({ transactionType: 'transfer' })]);
    expect(r.enabled).toBe(false);
    expect(r.reason).toMatch(/income and expense/i);
  });
  it('disables for an empty selection', () => {
    expect(bulkContactEligibility([]).enabled).toBe(false);
  });
});
