import { buildRelationIndex } from './relationIndex';
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
  contactId: null,
  bankProviderCategory: null,
  relations: [],
  ...over,
});

it('sums two refund edges pointing at the same expense', () => {
  const original = tx({ id: 'O', transactionType: 'expense' });
  const refund1 = tx({
    id: 'R1',
    allocations: {
      incomes: [{ categoryId: 'c', amount: { amount: 20, currency: 'EUR' } }],
      expenses: [],
    },
    relations: [{ relatedTransactionId: 'O', relationKind: 'refund' }],
  });
  const refund2 = tx({
    id: 'R2',
    allocations: {
      incomes: [{ categoryId: 'c', amount: { amount: 15, currency: 'EUR' } }],
      expenses: [],
    },
    relations: [{ relatedTransactionId: 'O', relationKind: 'refund' }],
  });
  const idx = buildRelationIndex([original, refund1, refund2], 'refund');
  expect(idx.get('O')).toEqual({ count: 2, total: 35 });
});

it('indexes only associated edges and ignores refund edges', () => {
  const assoc = tx({
    id: 'A',
    allocations: {
      incomes: [{ categoryId: 'c', amount: { amount: 40, currency: 'EUR' } }],
      expenses: [],
    },
    relations: [{ relatedTransactionId: 'O', relationKind: 'associated' }],
  });
  const refund = tx({
    id: 'R',
    allocations: {
      incomes: [{ categoryId: 'c', amount: { amount: 99, currency: 'EUR' } }],
      expenses: [],
    },
    relations: [{ relatedTransactionId: 'O', relationKind: 'refund' }],
  });
  const idx = buildRelationIndex([assoc, refund], 'associated');
  expect(idx.get('O')).toEqual({ count: 1, total: 40 });
});

it('buildRefundIndex wrapper matches buildRelationIndex(..., "refund")', () => {
  const txns = [
    tx({ id: 'O', transactionType: 'expense' }),
    tx({
      id: 'R',
      allocations: {
        incomes: [],
        expenses: [{ categoryId: 'c', amount: { amount: 30, currency: 'EUR' } }],
      },
      relations: [{ relatedTransactionId: 'O', relationKind: 'refund' }],
    }),
  ];
  expect(buildRefundIndex(txns)).toEqual(buildRelationIndex(txns, 'refund'));
});
