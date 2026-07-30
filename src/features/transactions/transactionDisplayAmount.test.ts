import { describe, expect, it } from 'vitest';
import type { TransactionResponse } from '@/api/types';
import { transactionAccountCell, transactionDisplayAmount } from './transactionDisplayAmount';

const tx = (over: Partial<TransactionResponse>): TransactionResponse =>
  ({
    id: 't',
    transactionType: 'expense',
    status: 'Completed',
    sourceAccountId: 'a1',
    targetAccountId: 'ext',
    sourceAmount: 4.5,
    targetAmount: 4.5,
    sourceCurrency: 'USD',
    targetCurrency: 'USD',
    ...over,
  }) as TransactionResponse;

describe('transactionDisplayAmount — multi/all scope (viewedAccountId null)', () => {
  it('income → +target, green', () => {
    const t = tx({ transactionType: 'income', targetAccountId: 'a1', targetAmount: 2000 });
    expect(transactionDisplayAmount(t, null)).toEqual({
      amount: 2000,
      currency: 'USD',
      colorClass: 'text-positive',
    });
  });
  it('expense → −source, red', () => {
    expect(transactionDisplayAmount(tx({ sourceAmount: 4.5 }), null)).toEqual({
      amount: -4.5,
      currency: 'USD',
      colorClass: 'text-negative',
    });
  });
  it('transfer → +source magnitude, neutral', () => {
    const t = tx({
      transactionType: 'transfer',
      sourceAccountId: 'a1',
      targetAccountId: 'a2',
      sourceAmount: 500,
    });
    expect(transactionDisplayAmount(t, null)).toEqual({
      amount: 500,
      currency: 'USD',
      colorClass: '',
    });
  });
  it('adjustment → +source magnitude, neutral', () => {
    const t = tx({
      transactionType: 'adjustment',
      sourceAccountId: 'ext',
      targetAccountId: 'a1',
      sourceAmount: 100,
    });
    expect(transactionDisplayAmount(t, null)).toEqual({
      amount: 100,
      currency: 'USD',
      colorClass: '',
    });
  });
});

describe('transactionDisplayAmount — single scope preserves leg logic', () => {
  it('shows the target leg when viewing the target account', () => {
    const t = tx({
      transactionType: 'transfer',
      sourceAccountId: 'a1',
      targetAccountId: 'a2',
      targetAmount: 500,
      targetCurrency: 'EUR',
    });
    expect(transactionDisplayAmount(t, 'a2')).toEqual({
      amount: 500,
      currency: 'EUR',
      colorClass: '',
    });
  });
  it('shows the negated source leg when viewing the source account', () => {
    const t = tx({
      transactionType: 'transfer',
      sourceAccountId: 'a1',
      targetAccountId: 'a2',
      sourceAmount: 500,
    });
    expect(transactionDisplayAmount(t, 'a1')).toEqual({
      amount: -500,
      currency: 'USD',
      colorClass: '',
    });
  });
});

describe('transactionAccountCell', () => {
  it('income → target only', () => {
    expect(
      transactionAccountCell(tx({ transactionType: 'income', targetAccountId: 'a2' })),
    ).toEqual({ fromId: 'a2' });
  });
  it('expense → source only', () => {
    expect(transactionAccountCell(tx({ sourceAccountId: 'a1' }))).toEqual({ fromId: 'a1' });
  });
  it('transfer → source → target', () => {
    expect(
      transactionAccountCell(
        tx({ transactionType: 'transfer', sourceAccountId: 'a1', targetAccountId: 'a2' }),
      ),
    ).toEqual({ fromId: 'a1', toId: 'a2' });
  });
});
