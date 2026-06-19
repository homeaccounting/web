import { describe, it, expect } from 'vitest';
import { mapIncomeExpenseFieldError, mapTransferFieldError } from './amendmentFieldErrors';

describe('mapIncomeExpenseFieldError', () => {
  it('maps currency/rate backend fields to the amount field', () => {
    for (const f of ['sourceCurrency', 'targetCurrency', 'exchangeRate']) {
      expect(mapIncomeExpenseFieldError(f, 'expense')).toBe('amount');
    }
  });
  it('surfaces total and allocation-bucket errors on the banner (null = no inline field)', () => {
    // The total and the allocation buckets no longer map to a single form field
    // (amount lives on each row, there is no top-level category), so these
    // return null and the dialog falls back to its error banner.
    expect(mapIncomeExpenseFieldError('sourceAmount', 'expense')).toBeNull();
    expect(mapIncomeExpenseFieldError('targetAmount', 'expense')).toBeNull();
    expect(mapIncomeExpenseFieldError('newAllocations', 'income')).toBeNull();
    expect(mapIncomeExpenseFieldError('allocations', 'income')).toBeNull();
  });
  it('maps dates/labels/description through', () => {
    expect(mapIncomeExpenseFieldError('at', 'income')).toBe('date');
    expect(mapIncomeExpenseFieldError('labels', 'income')).toBe('labels');
    expect(mapIncomeExpenseFieldError('description', 'income')).toBe('description');
  });
  it('maps the account leg per kind', () => {
    expect(mapIncomeExpenseFieldError('sourceAccountId', 'expense')).toBe('accountId');
    expect(mapIncomeExpenseFieldError('sourceAccountId', 'income')).toBeNull();
    expect(mapIncomeExpenseFieldError('targetAccountId', 'income')).toBe('accountId');
    expect(mapIncomeExpenseFieldError('targetAccountId', 'expense')).toBeNull();
  });
});

describe('mapTransferFieldError', () => {
  it('maps transfer leg and rate fields', () => {
    expect(mapTransferFieldError('sourceAccountId')).toBe('sourceAccountId');
    expect(mapTransferFieldError('targetAccountId')).toBe('targetAccountId');
    expect(mapTransferFieldError('exchangeRate')).toBe('exchangeRate');
    expect(mapTransferFieldError('sourceAmount')).toBe('amount');
    expect(mapTransferFieldError('nope')).toBeNull();
  });
});
