import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { server } from '@/test/server';
import { http, HttpResponse } from 'msw';
import { AuthContext } from '@/auth/AuthContext';
import { useLinkRelation } from './useLinkRelation';

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

const transactionResponse = {
  id: 'tx-income',
  sourceAccountId: 'external-1',
  targetAccountId: 'acc-1',
  sourceAmount: 50,
  sourceCurrency: 'USD',
  targetAmount: 50,
  targetCurrency: 'USD',
  exchangeRate: null,
  description: 'Income',
  status: 'Completed',
  failureReason: null,
  transactionType: 'income',
  category: null,
  date: '2026-06-01T00:00:00.000Z',
  labels: [],
  amendmentCount: 0,
  relations: [] as unknown[],
};

describe('useLinkRelation', () => {
  it('POSTs to /api/transactions/:id/relations with the relation body', async () => {
    let captured: unknown;
    server.use(
      http.post(`${apiBase}/api/transactions/tx-income/relations`, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json({
          ...transactionResponse,
          relations: [{ relatedTransactionId: 'tx-exp', relationKind: 'refund' }],
        });
      }),
    );

    const { result } = renderHook(() => useLinkRelation('tx-income'), {
      wrapper: makeWrapper(),
    });
    await result.current.mutateAsync({ relatedTransactionId: 'tx-exp', relationKind: 'refund' });

    expect(captured).toEqual({ relatedTransactionId: 'tx-exp', relationKind: 'refund' });
  });

  it('invalidates transactions + relations queries on success', async () => {
    server.use(
      http.post(`${apiBase}/api/transactions/tx-income/relations`, () =>
        HttpResponse.json(transactionResponse),
      ),
    );

    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useLinkRelation('tx-income'), {
      wrapper: makeWrapper(client),
    });
    await result.current.mutateAsync({ relatedTransactionId: 'tx-exp', relationKind: 'refund' });

    expect(spy).toHaveBeenCalledWith({ queryKey: ['transactions'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['transaction-relations', 'tx-income'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['transaction-relations', 'tx-exp'] });
  });
});
