import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { server } from '@/test/server';
import { http, HttpResponse } from 'msw';
import { AuthContext } from '@/auth/AuthContext';
import { useMergeTransactions } from './useMergeTransactions';

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

const merged = {
  id: 'tx-target',
  sourceAccountId: 'acc-1',
  targetAccountId: 'external-1',
  sourceAmount: 30,
  sourceCurrency: 'EUR',
  targetAmount: 30,
  targetCurrency: 'EUR',
  exchangeRate: null,
  description: 'Groceries',
  status: 'Completed',
  failureReason: null,
  transactionType: 'expense',
  allocations: { incomes: [], expenses: [] },
  date: '2026-06-01T00:00:00.000Z',
  labels: [],
  amendmentCount: 1,
  relations: [] as unknown[],
  contactId: null,
  mcc: null,
};

describe('useMergeTransactions', () => {
  it('POSTs the source ids to /api/transactions/:id/merge', async () => {
    let captured: unknown;
    server.use(
      http.post(`${apiBase}/api/transactions/tx-target/merge`, async ({ request }) => {
        captured = await request.json();
        return HttpResponse.json(merged);
      }),
    );

    const { result } = renderHook(() => useMergeTransactions('tx-target'), {
      wrapper: makeWrapper(),
    });
    await result.current.mutateAsync({ sourceTransactionIds: ['s1', 's2'] });

    expect(captured).toEqual({ sourceTransactionIds: ['s1', 's2'] });
  });

  it('invalidates transactions, accounts, and relations for target + sources on success', async () => {
    server.use(
      http.post(`${apiBase}/api/transactions/tx-target/merge`, () => HttpResponse.json(merged)),
    );

    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useMergeTransactions('tx-target'), {
      wrapper: makeWrapper(client),
    });
    await result.current.mutateAsync({ sourceTransactionIds: ['s1', 's2'] });

    expect(spy).toHaveBeenCalledWith({ queryKey: ['transactions'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['accounts'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['transaction-relations', 'tx-target'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['transaction-relations', 's1'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['transaction-relations', 's2'] });
  });
});
