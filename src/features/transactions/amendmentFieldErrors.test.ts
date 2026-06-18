import { describe, it, expect } from 'vitest';
import { mapIncomeExpenseFieldError, mapTransferFieldError } from './amendmentFieldErrors';

describe('mapIncomeExpenseFieldError', () => {
  it('maps amount-bearing backend fields to the amount field', () => {
    for (const f of [
      'sourceAmount',
      'targetAmount',
      'sourceCurrency',
      'targetCurrency',
      'exchangeRate',
    ]) {
      expect(mapIncomeExpenseFieldError(f, 'expense')).toBe('amount');
    }
  });
  it('maps allocations to category and dates/labels/description through', () => {
    expect(mapIncomeExpenseFieldError('newAllocations', 'income')).toBe('category');
    expect(mapIncomeExpenseFieldError('allocations', 'income')).toBe('category');
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
