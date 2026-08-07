import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { server } from '@/test/server';
import { http, HttpResponse } from 'msw';
import { AuthContext } from '@/auth/AuthContext';
import type { TransactionResponse } from '@/api/types';
import { useRefundSummary } from './useRefundSummary';

const apiBase = 'http://localhost:8080';

function makeWrapper(client = new QueryClient({ defaultOptions: { queries: { retry: false } } })) {
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

// Original expense O: Groceries 60 + Fuel 40 (total 100).
const original: TransactionResponse = {
  id: 'O',
  sourceAccountId: 'a1',
  targetAccountId: 'ext',
  sourceAmount: -100,
  sourceCurrency: 'USD',
  targetAmount: -100,
  targetCurrency: 'USD',
  exchangeRate: null,
  description: 'Shopping',
  status: 'Completed',
  failureReason: null,
  transactionType: 'expense',
  allocations: {
    incomes: [],
    expenses: [
      { categoryId: 'Groceries', amount: { amount: 60, currency: 'USD' } },
      { categoryId: 'Fuel', amount: { amount: 40, currency: 'USD' } },
    ],
  },
  date: '2026-06-01T00:00:00Z',
  labels: [],
  amendmentCount: 0,
  contactId: null,
  bankProviderCategory: null,
  bankProviderContact: null,
  relations: [],
};

// A prior refund R1 against O with a Groceries 30 contra slice.
const refundR1 = (id = 'R1'): TransactionResponse => ({
  id,
  sourceAccountId: 'ext',
  targetAccountId: 'a1',
  sourceAmount: 30,
  sourceCurrency: 'USD',
  targetAmount: 30,
  targetCurrency: 'USD',
  exchangeRate: null,
  description: 'Refund',
  status: 'Completed',
  failureReason: null,
  transactionType: 'income',
  allocations: {
    incomes: [],
    expenses: [{ categoryId: 'Groceries', amount: { amount: 30, currency: 'USD' } }],
  },
  date: '2026-06-02T00:00:00Z',
  labels: [],
  amendmentCount: 0,
  contactId: null,
  bankProviderCategory: null,
  bankProviderContact: null,
  relations: [{ relatedTransactionId: 'O', relationKind: 'refund' }],
});

describe('useRefundSummary', () => {
  it('subtracts prior refunds per category', async () => {
    server.use(
      http.get(`${apiBase}/api/transactions/O/relations`, () =>
        HttpResponse.json({
          outbound: [],
          inbound: [{ relatedTransactionId: 'R1', relationKind: 'refund' }],
        }),
      ),
      http.get(`${apiBase}/api/transactions/R1`, () => HttpResponse.json(refundR1())),
    );

    const { result } = renderHook(() => useRefundSummary(original, true), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isError).toBe(false);
    expect(result.current.remainingByCategory).toEqual({ Groceries: 30, Fuel: 40 });
    expect(result.current.remainingTotal).toBe(70);
    expect(result.current.refundedTotal).toBe(30);
    expect(result.current.refundedByCategory).toEqual({ Groceries: 30 });
  });

  it('remaining equals original when there are no prior refunds', async () => {
    server.use(
      http.get(`${apiBase}/api/transactions/O/relations`, () =>
        HttpResponse.json({ outbound: [], inbound: [] }),
      ),
    );

    const { result } = renderHook(() => useRefundSummary(original, true), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));

    expect(result.current.isError).toBe(false);
    expect(result.current.refundedTotal).toBe(0);
    expect(result.current.remainingByCategory).toEqual({ Groceries: 60, Fuel: 40 });
    expect(result.current.remainingTotal).toBe(100);
  });

  it('reports isError when a prior-refund fetch fails', async () => {
    server.use(
      http.get(`${apiBase}/api/transactions/O/relations`, () =>
        HttpResponse.json({
          outbound: [],
          inbound: [{ relatedTransactionId: 'R1', relationKind: 'refund' }],
        }),
      ),
      http.get(`${apiBase}/api/transactions/R1`, () => new HttpResponse(null, { status: 500 })),
    );

    const { result } = renderHook(() => useRefundSummary(original, true), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.isLoading).toBe(false);
  });
});
