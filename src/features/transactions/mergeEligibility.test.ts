import type { TransactionResponse } from '@/api/types';
import {
  checkMergeEligibility,
  combinedAllocations,
  combinedTotal,
  mergeAccountId,
  mergeCurrency,
  resolveMergeContact,
  transferPairOf,
  MERGE_TRANSFER_WINDOW_MS,
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
  bankProviderCategory: null,
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
    expect(checkMergeEligibility([expense(), expense()])).toEqual({
      eligible: true,
      mode: 'same-kind',
    });
  });

  it('accepts three compatible incomes', () => {
    expect(checkMergeEligibility([income(), income(), income()])).toEqual({
      eligible: true,
      mode: 'same-kind',
    });
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

  it('rejects a three-row mix of income and expense (not a one-to-one transfer)', () => {
    expect(checkMergeEligibility([income(), income(), expense()])).toEqual({
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
      mode: 'same-kind',
    });
    expect(
      checkMergeEligibility([expense({ contactId: 'k' }), expense({ contactId: 'k' })]),
    ).toEqual({
      eligible: true,
      mode: 'same-kind',
    });
  });

  it('rejects two different contacts', () => {
    expect(
      checkMergeEligibility([expense({ contactId: 'k1' }), expense({ contactId: 'k2' })]),
    ).toEqual({ eligible: false, reason: 'conflicting-contacts' });
  });
});

// A matching income+expense pair on two different accounts: same amount +
// currency, same instant. Mirrors the backend transfer-merge guards.
const transferIncome = (over: Partial<TransactionResponse> = {}): TransactionResponse =>
  income({
    targetAccountId: 'accIn',
    targetAmount: 100,
    targetCurrency: 'EUR',
    date: '2026-07-06T00:00:00Z',
    ...over,
  });
const transferExpense = (over: Partial<TransactionResponse> = {}): TransactionResponse =>
  expense({
    sourceAccountId: 'accEx',
    sourceAmount: 100,
    sourceCurrency: 'EUR',
    date: '2026-07-06T00:00:00Z',
    ...over,
  });

describe('checkMergeEligibility — transfer pair (income + expense)', () => {
  it('accepts a matching income+expense pair on different accounts', () => {
    expect(checkMergeEligibility([transferIncome(), transferExpense()])).toEqual({
      eligible: true,
      mode: 'transfer',
    });
  });

  it('is order-independent (expense listed first)', () => {
    expect(checkMergeEligibility([transferExpense(), transferIncome()])).toEqual({
      eligible: true,
      mode: 'transfer',
    });
  });

  it('rejects a pair that resolves to the same account', () => {
    expect(
      checkMergeEligibility([
        transferIncome({ targetAccountId: 'same' }),
        transferExpense({ sourceAccountId: 'same' }),
      ]),
    ).toEqual({ eligible: false, reason: 'transfer-same-account' });
  });

  it('rejects legs with unequal amounts', () => {
    expect(
      checkMergeEligibility([
        transferIncome({ targetAmount: 100 }),
        transferExpense({ sourceAmount: 90 }),
      ]),
    ).toEqual({ eligible: false, reason: 'transfer-legs-mismatch' });
  });

  it('rejects legs with unequal currencies', () => {
    expect(
      checkMergeEligibility([
        transferIncome({ targetCurrency: 'EUR' }),
        transferExpense({ sourceCurrency: 'USD' }),
      ]),
    ).toEqual({ eligible: false, reason: 'transfer-legs-mismatch' });
  });

  it('rejects legs more than the window apart', () => {
    expect(
      checkMergeEligibility([
        transferIncome({ date: '2026-07-06T00:00:00Z' }),
        transferExpense({ date: '2026-07-07T00:00:01Z' }), // 24h + 1s
      ]),
    ).toEqual({ eligible: false, reason: 'transfer-legs-mismatch' });
  });

  it('accepts legs exactly at the window boundary (inclusive)', () => {
    expect(
      checkMergeEligibility([
        transferIncome({ date: '2026-07-06T00:00:00Z' }),
        transferExpense({ date: '2026-07-07T00:00:00Z' }), // exactly 24h
      ]),
    ).toEqual({ eligible: true, mode: 'transfer' });
  });

  it('rejects when a leg is not Completed', () => {
    expect(
      checkMergeEligibility([transferIncome(), transferExpense({ status: 'Cancelled' })]),
    ).toEqual({ eligible: false, reason: 'not-completed' });
  });
});

describe('transferPairOf', () => {
  it('resolves the income and expense regardless of order', () => {
    const inc = transferIncome();
    const exp = transferExpense();
    expect(transferPairOf([inc, exp])).toEqual({ income: inc, expense: exp });
    expect(transferPairOf([exp, inc])).toEqual({ income: inc, expense: exp });
  });

  it('returns null for non-pairs', () => {
    expect(transferPairOf([transferIncome()])).toBeNull();
    expect(transferPairOf([transferIncome(), transferIncome()])).toBeNull();
    expect(transferPairOf([transferIncome(), transferExpense(), transferExpense()])).toBeNull();
  });
});

describe('MERGE_TRANSFER_WINDOW_MS', () => {
  it('mirrors the backend 24h merge window', () => {
    expect(MERGE_TRANSFER_WINDOW_MS).toBe(24 * 60 * 60 * 1000);
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
