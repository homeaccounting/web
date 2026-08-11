import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { server } from '@/test/server';
import { http, HttpResponse } from 'msw';
import { AuthContext } from '@/auth/AuthContext';
import { useEditTransaction } from './useEditTransaction';
import type { TransactionResponse } from '@/api/types';

const apiBase = 'http://localhost:8080';

// Real windowed keys, matching useWindowedTransactions / useAllAccountsWindowedTransactions —
// NOT the phantom 2-element ['transactions', accountId] key that no live query ever reads.
const from = '2026-01-01';
const to = '2026-12-31';
const windowedKey = (accountId: string) => ['transactions', accountId, from, to];
const allAccountsKey = () => ['transactions', 'all', from, to];

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
  transactionType: 'income',
  allocations: {
    incomes: [{ categoryId: 'cat-1', amount: { amount: 10, currency: 'USD' } }],
    expenses: [],
  },
  date: '2026-03-04T00:00:00.000Z',
  labels: [],
  amendmentCount: 0,
  contactId: null,
  bankProviderCategory: null,
  bankProviderContact: null,
  relations: [],
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
    client.setQueryData(windowedKey('a1'), [txResponse()] as TransactionResponse[]);

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
        allocations: {
          incomes: [],
          expenses: [{ categoryId: 'cat-1', amount: { amount: 25, currency: 'USD' } }],
        },
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
    client.setQueryData(windowedKey('a1'), [txResponse()] as TransactionResponse[]);

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

  it('sends setContact with a new contactId when the diff carries one', async () => {
    let received: unknown;
    server.use(
      http.put(`${apiBase}/api/transactions/:id/contact`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json(txResponse({ contactId: 'c2' }));
      }),
    );

    const client = new QueryClient();
    client.setQueryData(windowedKey('a1'), [txResponse()] as TransactionResponse[]);

    const { result } = renderHook(() => useEditTransaction(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({
      id: 'tx-1',
      accountIds: ['a1'],
      diff: { contactId: 'c2' },
      onSubCallApplied: vi.fn(),
    });

    expect(received).toEqual({ contactId: 'c2' });
  });

  it('sends setContact with contactId: null to clear the contact', async () => {
    let received: unknown;
    server.use(
      http.put(`${apiBase}/api/transactions/:id/contact`, async ({ request }) => {
        received = await request.json();
        return HttpResponse.json(txResponse({ contactId: null }));
      }),
    );

    const client = new QueryClient();
    client.setQueryData(windowedKey('a1'), [txResponse()] as TransactionResponse[]);

    const { result } = renderHook(() => useEditTransaction(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({
      id: 'tx-1',
      accountIds: ['a1'],
      diff: { contactId: null },
      onSubCallApplied: vi.fn(),
    });

    expect(received).toEqual({ contactId: null });
  });

  it('does not call setContact when the diff omits contactId', async () => {
    let contactCalled = false;
    server.use(
      http.put(`${apiBase}/api/transactions/:id/description`, () =>
        HttpResponse.json(txResponse({ description: 'patched' })),
      ),
      http.put(`${apiBase}/api/transactions/:id/contact`, () => {
        contactCalled = true;
        return HttpResponse.json(txResponse());
      }),
    );

    const client = new QueryClient();
    client.setQueryData(windowedKey('a1'), [txResponse()] as TransactionResponse[]);

    const { result } = renderHook(() => useEditTransaction(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({
      id: 'tx-1',
      accountIds: ['a1'],
      diff: { description: 'patched' },
      onSubCallApplied: vi.fn(),
    });

    expect(contactCalled).toBe(false);
  });

  it('optimistically patches every live windowed query holding the row — per-account AND all-accounts — before onSettled refetches', async () => {
    server.use(
      http.put(`${apiBase}/api/transactions/:id/description`, () =>
        HttpResponse.json(txResponse({ description: 'patched' })),
      ),
    );

    const client = new QueryClient();
    // Seed BOTH real shapes a live query can hold: the per-account windowed
    // list and the cross-account 'all' windowed list. Neither is the phantom
    // ['transactions', accountId] key — no query is ever registered under it.
    client.setQueryData(windowedKey('a1'), [txResponse()] as TransactionResponse[]);
    client.setQueryData(allAccountsKey(), [txResponse()] as TransactionResponse[]);

    const { result } = renderHook(() => useEditTransaction(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({
      id: 'tx-1',
      accountIds: ['a1'],
      diff: { description: 'patched' },
      onSubCallApplied: vi.fn(),
    });

    // Asserted synchronously, right after mutateAsync resolves: this is the
    // in-flight optimistic write landing directly in the cache, not a value
    // produced by the onSettled invalidation (there is no mounted useQuery
    // observer here for invalidateQueries to refetch against).
    const perAccountList = client.getQueryData<TransactionResponse[]>(windowedKey('a1'));
    expect(perAccountList?.[0]?.description).toBe('patched');
    const allAccountsList = client.getQueryData<TransactionResponse[]>(allAccountsKey());
    expect(allAccountsList?.[0]?.description).toBe('patched');
  });
});
