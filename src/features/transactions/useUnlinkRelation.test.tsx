import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { server } from '@/test/server';
import { http, HttpResponse } from 'msw';
import { AuthContext } from '@/auth/AuthContext';
import { useUnlinkRelation } from './useUnlinkRelation';

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
  id: 'tx-a',
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

describe('useUnlinkRelation', () => {
  it('DELETEs /api/transactions/:id/relations with the pair + kind as query params', async () => {
    let captured: URLSearchParams | undefined;
    server.use(
      http.delete(`${apiBase}/api/transactions/tx-a/relations`, ({ request }) => {
        captured = new URL(request.url).searchParams;
        return HttpResponse.json({ ...transactionResponse, relations: [] });
      }),
    );

    const { result } = renderHook(() => useUnlinkRelation('tx-a'), {
      wrapper: makeWrapper(),
    });
    await result.current.mutateAsync({
      relatedTransactionId: 'tx-b',
      relationKind: 'associated',
    });

    expect(captured?.get('relatedTransactionId')).toBe('tx-b');
    expect(captured?.get('relationKind')).toBe('associated');
  });

  it('treats a RELATION_NOT_FOUND (404) as success', async () => {
    server.use(
      http.delete(`${apiBase}/api/transactions/tx-a/relations`, () =>
        HttpResponse.json({ code: 'RELATION_NOT_FOUND', message: 'not found' }, { status: 404 }),
      ),
    );

    const { result } = renderHook(() => useUnlinkRelation('tx-a'), {
      wrapper: makeWrapper(),
    });

    await expect(
      result.current.mutateAsync({ relatedTransactionId: 'tx-b', relationKind: 'associated' }),
    ).resolves.toBeUndefined();
  });

  it('invalidates transactions + relations queries on success', async () => {
    server.use(
      http.delete(`${apiBase}/api/transactions/tx-a/relations`, () =>
        HttpResponse.json(transactionResponse),
      ),
    );

    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useUnlinkRelation('tx-a'), {
      wrapper: makeWrapper(client),
    });
    await result.current.mutateAsync({
      relatedTransactionId: 'tx-b',
      relationKind: 'associated',
    });

    expect(spy).toHaveBeenCalledWith({ queryKey: ['transactions'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['transaction-relations', 'tx-a'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['transaction-relations', 'tx-b'] });
  });
});
