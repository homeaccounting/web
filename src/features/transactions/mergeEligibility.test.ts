import type { TransactionResponse } from '@/api/types';
import {
  checkMergeEligibility,
  combinedAllocations,
  combinedTotal,
  mergeAccountId,
  mergeCurrency,
  resolveMergeContact,
} from './mergeEligibility';

const tx = (over: Partial<TransactionResponse>): TransactionResponse => ({
  id: 'x',
  sourceAccountId: 'a',
  targetAccountId: 'b',
  sourceAmount: 0,
  sourceCurrency: 'EUR',
  targetAmount: 0,
  targetCurrency: 'EUR',
  exchangeRate: null,
  description: '',
  status: 'Completed',
  failureReason: null,
  transactionType: 'expense',
  allocations: { incomes: [], expenses: [] },
  date: '2026-07-06T00:00:00Z',
  labels: [],
  amendmentCount: 0,
  contactId: null,
  mcc: null,
  relations: [],
  ...over,
});

const expense = (over: Partial<TransactionResponse> = {}): TransactionResponse =>
  tx({
    transactionType: 'expense',
    sourceAccountId: 'acc',
    sourceCurrency: 'EUR',
    allocations: {
      incomes: [],
      expenses: [{ categoryId: 'c', amount: { amount: 10, currency: 'EUR' } }],
    },
    ...over,
  });

const income = (over: Partial<TransactionResponse> = {}): TransactionResponse =>
  tx({
    transactionType: 'income',
    targetAccountId: 'acc',
    targetCurrency: 'EUR',
    allocations: {
      incomes: [{ categoryId: 'c', amount: { amount: 10, currency: 'EUR' } }],
      expenses: [],
    },
    ...over,
  });

describe('mergeAccountId / mergeCurrency', () => {
  it('uses the target leg for income and source leg for expense', () => {
    expect(mergeAccountId(income({ targetAccountId: 'T' }))).toBe('T');
    expect(mergeAccountId(expense({ sourceAccountId: 'S' }))).toBe('S');
    expect(mergeCurrency(income({ targetCurrency: 'USD' }))).toBe('USD');
    expect(mergeCurrency(expense({ sourceCurrency: 'GBP' }))).toBe('GBP');
  });
});

describe('checkMergeEligibility', () => {
  it('rejects fewer than two transactions', () => {
    expect(checkMergeEligibility([expense()])).toEqual({ eligible: false, reason: 'too-few' });
  });

  it('accepts two compatible expenses on the same account/currency', () => {
    expect(checkMergeEligibility([expense(), expense()])).toEqual({ eligible: true });
  });

  it('accepts three compatible incomes', () => {
    expect(checkMergeEligibility([income(), income(), income()])).toEqual({ eligible: true });
  });

  it('rejects when any transaction is not Completed', () => {
    expect(checkMergeEligibility([expense(), expense({ status: 'Cancelled' })])).toEqual({
      eligible: false,
      reason: 'not-completed',
    });
  });

  it('rejects transfers and adjustments (unsupported kinds)', () => {
    expect(
      checkMergeEligibility([
        tx({ transactionType: 'transfer' }),
        tx({ transactionType: 'transfer' }),
      ]),
    ).toEqual({ eligible: false, reason: 'unsupported-kind' });
  });

  it('rejects mixing income with expense', () => {
    expect(checkMergeEligibility([expense(), income()])).toEqual({
      eligible: false,
      reason: 'mixed-kinds',
    });
  });

  it('rejects different accounts', () => {
    expect(
      checkMergeEligibility([
        expense({ sourceAccountId: 'a1' }),
        expense({ sourceAccountId: 'a2' }),
      ]),
    ).toEqual({ eligible: false, reason: 'different-accounts' });
  });

  it('rejects different currencies', () => {
    expect(
      checkMergeEligibility([
        expense({ sourceCurrency: 'EUR' }),
        expense({ sourceCurrency: 'USD' }),
      ]),
    ).toEqual({ eligible: false, reason: 'different-currencies' });
  });

  it('allows same-or-none contacts', () => {
    expect(
      checkMergeEligibility([expense({ contactId: 'k' }), expense({ contactId: null })]),
    ).toEqual({
      eligible: true,
    });
    expect(
      checkMergeEligibility([expense({ contactId: 'k' }), expense({ contactId: 'k' })]),
    ).toEqual({
      eligible: true,
    });
  });

  it('rejects two different contacts', () => {
    expect(
      checkMergeEligibility([expense({ contactId: 'k1' }), expense({ contactId: 'k2' })]),
    ).toEqual({ eligible: false, reason: 'conflicting-contacts' });
  });
});

describe('resolveMergeContact', () => {
  it('returns the single distinct contact when present on any transaction', () => {
    expect(resolveMergeContact([expense({ contactId: null }), expense({ contactId: 'k' })])).toBe(
      'k',
    );
  });

  it('returns null when no transaction has a contact', () => {
    expect(
      resolveMergeContact([expense({ contactId: null }), expense({ contactId: null })]),
    ).toBeNull();
  });
});

describe('combinedTotal / combinedAllocations', () => {
  it('sums categorised totals across all transactions', () => {
    const a = expense({
      allocations: {
        incomes: [],
        expenses: [{ categoryId: 'c', amount: { amount: 12.5, currency: 'EUR' } }],
      },
    });
    const b = expense({
      allocations: {
        incomes: [],
        expenses: [{ categoryId: 'd', amount: { amount: 7.25, currency: 'EUR' } }],
      },
    });
    expect(combinedTotal([a, b])).toBe(19.75);
  });

  it('concatenates allocation buckets across all transactions', () => {
    const a = expense({
      allocations: {
        incomes: [],
        expenses: [{ categoryId: 'c', amount: { amount: 1, currency: 'EUR' } }],
      },
    });
    const b = expense({
      allocations: {
        incomes: [],
        expenses: [{ categoryId: 'd', amount: { amount: 2, currency: 'EUR' } }],
      },
    });
    expect(combinedAllocations([a, b])).toEqual({
      incomes: [],
      expenses: [
        { categoryId: 'c', amount: { amount: 1, currency: 'EUR' } },
        { categoryId: 'd', amount: { amount: 2, currency: 'EUR' } },
      ],
    });
  });
});
