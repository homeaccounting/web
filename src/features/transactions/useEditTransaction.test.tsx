import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { server } from '@/test/server';
import { http, HttpResponse } from 'msw';
import { AuthContext } from '@/auth/AuthContext';
import { useEditTransaction } from './useEditTransaction';
import type { TransactionResponse } from '@/api/types';

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

const txResponse = (overrides: Partial<TransactionResponse> = {}): TransactionResponse => ({
  id: 'tx-1',
  sourceAccountId: 'ext',
  targetAccountId: 'a1',
  sourceAmount: 10,
  sourceCurrency: 'USD',
  targetAmount: 10,
  targetCurrency: 'USD',
  exchangeRate: null,
  description: 'd',
  status: 'Completed',
  failureReason: null,
  transferType: 'Income',
  category: 'cat-1',
  date: '2026-03-04T00:00:00.000Z',
  labels: [],
  ...overrides,
});

describe('useEditTransaction', () => {
  it('runs amendment → allocations → description → date → labels in order and invokes the per-step callback', async () => {
    const calls: string[] = [];
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, () => {
        calls.push('amendment');
        return HttpResponse.json(txResponse());
      }),
      http.patch(`${apiBase}/api/transactions/:id/allocations`, () => {
        calls.push('allocations');
        return HttpResponse.json(txResponse());
      }),
      http.put(`${apiBase}/api/transactions/:id/description`, () => {
        calls.push('description');
        return HttpResponse.json(txResponse({ description: 'new' }));
      }),
      http.put(`${apiBase}/api/transactions/:id/date`, () => {
        calls.push('date');
        return HttpResponse.json(txResponse());
      }),
      http.put(`${apiBase}/api/transactions/:id/labels`, () => {
        calls.push('labels');
        return HttpResponse.json(txResponse({ labels: ['l1'] }));
      }),
    );

    const client = new QueryClient();
    client.setQueryData(['transactions', 'a1'], [txResponse()] as TransactionResponse[]);

    const onSubCallApplied = vi.fn();
    const { result } = renderHook(() => useEditTransaction(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({
      id: 'tx-1',
      accountIds: ['a1'],
      diff: {
        amendment: {
          sourceAccountId: 'ext',
          targetAccountId: 'a1',
          sourceAmount: 25,
          sourceCurrency: 'USD',
          targetAmount: 25,
          targetCurrency: 'USD',
        },
        allocations: [{ categoryId: 'cat-1', amount: { amount: 25, currency: 'USD' } }],
        description: 'new',
        date: '2026-04-05T00:00:00.000Z',
        labels: ['l1'],
      },
      onSubCallApplied,
    });

    expect(calls).toEqual(['amendment', 'allocations', 'description', 'date', 'labels']);
    expect(onSubCallApplied).toHaveBeenCalledTimes(5);
  });

  it('stops on the first failure and surfaces the ApiError', async () => {
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, () =>
        HttpResponse.json(
          { status: 422, message: 'nope', fieldErrors: { sourceAmount: 'too small' } },
          { status: 422 },
        ),
      ),
    );

    const client = new QueryClient();
    client.setQueryData(['transactions', 'a1'], [txResponse()] as TransactionResponse[]);

    const { result } = renderHook(() => useEditTransaction(), { wrapper: makeWrapper(client) });
    await expect(
      result.current.mutateAsync({
        id: 'tx-1',
        accountIds: ['a1'],
        diff: {
          amendment: {
            sourceAccountId: 'ext',
            targetAccountId: 'a1',
            sourceAmount: 1,
            sourceCurrency: 'USD',
            targetAmount: 1,
            targetCurrency: 'USD',
          },
          description: 'never sent',
        },
        onSubCallApplied: vi.fn(),
      }),
    ).rejects.toMatchObject({ status: 422 });
  });

  it('patches the cached row after each successful sub-call', async () => {
    server.use(
      http.put(`${apiBase}/api/transactions/:id/description`, () =>
        HttpResponse.json(txResponse({ description: 'patched' })),
      ),
    );

    const client = new QueryClient();
    client.setQueryData(['transactions', 'a1'], [txResponse()] as TransactionResponse[]);

    const { result } = renderHook(() => useEditTransaction(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({
      id: 'tx-1',
      accountIds: ['a1'],
      diff: { description: 'patched' },
      onSubCallApplied: vi.fn(),
    });

    await waitFor(() => {
      const list = client.getQueryData<TransactionResponse[]>(['transactions', 'a1']);
      expect(list?.[0]?.description).toBe('patched');
    });
  });
});
