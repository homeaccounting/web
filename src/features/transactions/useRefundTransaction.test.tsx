import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { server } from '@/test/server';
import { http, HttpResponse } from 'msw';
import { AuthContext } from '@/auth/AuthContext';
import { useRefundTransaction } from './useRefundTransaction';
import type { IncomeRequest } from '@/api/types';

const apiBase = 'http://localhost:8080';

function makeWrapper(client = new QueryClient()) {
  const tokenRef = { current: 't' };
  const ctx = {
    tokenRef,
    session: { userId: 'u', email: 'a@b' } as never,
    signIn: vi.fn(),
    signOut: vi.fn(),
  } as never;
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthContext.Provider value={ctx}>{children}</AuthContext.Provider>
      </QueryClientProvider>
    );
  };
}

const incomeRequestWithRelation: IncomeRequest = {
  accountId: 'acc-1',
  currency: 'USD',
  allocations: { incomes: [{ category: 'cat-1', amount: 50 }], expenses: [] },
  description: 'Refund for tx-original',
  relation: { relatedTransactionId: 'tx-original', relationKind: 'refund' },
};

describe('useRefundTransaction', () => {
  it('posts to POST /api/transactions/income with relation in body', async () => {
    let capturedBody: unknown;
    server.use(
      http.post(`${apiBase}/api/transactions/income`, async ({ request }) => {
        capturedBody = await request.json();
        return HttpResponse.json({
          id: 'tx-refund',
          sourceAccountId: 'external-1',
          targetAccountId: 'acc-1',
          sourceAmount: 50,
          sourceCurrency: 'USD',
          targetAmount: 50,
          targetCurrency: 'USD',
          exchangeRate: null,
          description: 'Refund for tx-original',
          status: 'Completed',
          failureReason: null,
          transactionType: 'income',
          category: null,
          date: '2026-06-01T00:00:00.000Z',
          labels: [],
          amendmentCount: 0,
          relations: [],
        });
      }),
    );

    const { result } = renderHook(() => useRefundTransaction('tx-original'), {
      wrapper: makeWrapper(),
    });
    await result.current.mutateAsync(incomeRequestWithRelation);

    expect(capturedBody).toMatchObject({
      relation: { relatedTransactionId: 'tx-original', relationKind: 'refund' },
    });
  });

  it('invalidates transactions, accounts, and transaction-relations queries on success', async () => {
    server.use(
      http.post(`${apiBase}/api/transactions/income`, () => {
        return HttpResponse.json({
          id: 'tx-refund',
          sourceAccountId: 'external-1',
          targetAccountId: 'acc-1',
          sourceAmount: 50,
          sourceCurrency: 'USD',
          targetAmount: 50,
          targetCurrency: 'USD',
          exchangeRate: null,
          description: 'Refund for tx-original',
          status: 'Completed',
          failureReason: null,
          transactionType: 'income',
          category: null,
          date: '2026-06-01T00:00:00.000Z',
          labels: [],
          amendmentCount: 0,
          relations: [],
        });
      }),
    );

    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useRefundTransaction('tx-original'), {
      wrapper: makeWrapper(client),
    });
    await result.current.mutateAsync(incomeRequestWithRelation);

    expect(spy).toHaveBeenCalledWith({ queryKey: ['transactions', 'acc-1'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['accounts'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['transaction-relations', 'tx-original'] });
  });
});
