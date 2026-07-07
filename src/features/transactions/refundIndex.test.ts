import { buildRefundIndex } from './refundIndex';
import type { TransactionResponse } from '@/api/types';

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
  transactionType: 'income',
  allocations: { incomes: [], expenses: [] },
  date: '2026-07-06T00:00:00Z',
  labels: [],
  amendmentCount: 0,
  relations: [],
  ...over,
});

it('sums refund edges per original', () => {
  const original = tx({ id: 'O', transactionType: 'expense' });
  const refund = tx({
    id: 'R',
    transactionType: 'income',
    allocations: {
      incomes: [],
      expenses: [{ categoryId: 'c', amount: { amount: 30, currency: 'EUR' } }],
    },
    relations: [{ relatedTransactionId: 'O', relationKind: 'refund' }],
  });
  const idx = buildRefundIndex([original, refund]);
  expect(idx.get('O')).toEqual({ count: 1, total: 30 });
});

it('ignores non-refund relations', () => {
  const idx = buildRefundIndex([
    tx({ id: 'R', relations: [{ relatedTransactionId: 'O', relationKind: 'associated' }] }),
  ]);
  expect(idx.get('O')).toBeUndefined();
});

it('returns an empty map for a transaction with no relations', () => {
  const idx = buildRefundIndex([tx({ id: 'T', relations: [] })]);
  expect(idx.size).toBe(0);
});

it('attributes full tx total to each original when one refund points at two originals', () => {
  const refund = tx({
    id: 'R',
    allocations: {
      incomes: [{ categoryId: 'c', amount: { amount: 10, currency: 'EUR' } }],
      expenses: [],
    },
    relations: [
      { relatedTransactionId: 'O1', relationKind: 'refund' },
      { relatedTransactionId: 'O2', relationKind: 'refund' },
    ],
  });
  const idx = buildRefundIndex([refund]);
  expect(idx.get('O1')).toEqual({ count: 1, total: 10 });
  expect(idx.get('O2')).toEqual({ count: 1, total: 10 });
});

it('accumulates two refunds pointing at the same original', () => {
  const original = tx({ id: 'O', transactionType: 'expense' });
  const refund1 = tx({
    id: 'R1',
    transactionType: 'income',
    allocations: {
      incomes: [{ categoryId: 'c', amount: { amount: 20, currency: 'EUR' } }],
      expenses: [],
    },
    relations: [{ relatedTransactionId: 'O', relationKind: 'refund' }],
  });
  const refund2 = tx({
    id: 'R2',
    transactionType: 'income',
    allocations: {
      incomes: [{ categoryId: 'c', amount: { amount: 15, currency: 'EUR' } }],
      expenses: [],
    },
    relations: [{ relatedTransactionId: 'O', relationKind: 'refund' }],
  });
  const idx = buildRefundIndex([original, refund1, refund2]);
  expect(idx.get('O')).toEqual({ count: 2, total: 35 });
});
