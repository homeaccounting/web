import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { server } from '@/test/server';
import { AuthContext } from '@/auth/AuthContext';
import { transactionFixture } from '@/test/fixtures';
import { useScopedTransactions } from './useScopedTransactions';

const apiBase = 'http://localhost:8080';

// Mirrors the AuthContext mock used in useWindowedTransactions.test.tsx — provide
// a tokenRef + session directly rather than mutating localStorage.
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
const wrapper = makeWrapper();

describe('useScopedTransactions', () => {
  it('subset filters the all-accounts result to rows touching the selected ids', async () => {
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            {
              ...transactionFixture,
              id: 't1',
              transactionType: 'expense',
              status: 'Completed',
              sourceAccountId: 'a1',
              targetAccountId: 'ext',
            },
            {
              ...transactionFixture,
              id: 't2',
              transactionType: 'income',
              status: 'Completed',
              sourceAccountId: 'ext',
              targetAccountId: 'a2',
            },
            {
              ...transactionFixture,
              id: 't3',
              transactionType: 'expense',
              status: 'Completed',
              sourceAccountId: 'a3',
              targetAccountId: 'ext',
            },
          ],
          totalCount: 3,
          limit: 200,
          offset: 0,
        }),
      ),
    );
    const { result } = renderHook(
      () =>
        useScopedTransactions({ kind: 'accounts', ids: ['a1', 'a2'] }, '2026-05-01', '2026-05-31'),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((t) => t.id)).toEqual(['t1', 't2']);
  });

  it('single scope fetches only the per-account query (all-accounts fetch disabled)', async () => {
    // Both hooks are always mounted (React hook rule), but in single-account
    // scope the all-accounts query must be DISABLED — so the only request that
    // fires carries accountId=a1 and no unconstrained (missing accountId) fetch
    // happens.
    const capturedAccountIds: (string | null)[] = [];
    server.use(
      http.get(`${apiBase}/api/transactions`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        capturedAccountIds.push(params.get('accountId'));
        return HttpResponse.json({
          transactions: [
            { ...transactionFixture, id: 't1', sourceAccountId: 'a1', targetAccountId: 'ext' },
          ],
          totalCount: 1,
          limit: 200,
          offset: 0,
        });
      }),
    );
    const { result } = renderHook(
      () => useScopedTransactions({ kind: 'accounts', ids: ['a1'] }, '2026-05-01', '2026-05-31'),
      { wrapper: makeWrapper(new QueryClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Exactly the per-account request; no all-accounts (null accountId) fetch.
    expect(capturedAccountIds).toEqual(['a1']);
    expect(result.current.data?.map((t) => t.id)).toEqual(['t1']);
  });

  it('all scope fetches the all-accounts query and returns every row', async () => {
    let captured: { accountId: string | null } = { accountId: null };
    server.use(
      http.get(`${apiBase}/api/transactions`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        captured = { accountId: params.get('accountId') };
        return HttpResponse.json({
          transactions: [
            { ...transactionFixture, id: 't1', sourceAccountId: 'a1', targetAccountId: 'ext' },
            { ...transactionFixture, id: 't2', sourceAccountId: 'a9', targetAccountId: 'ext' },
          ],
          totalCount: 2,
          limit: 200,
          offset: 0,
        });
      }),
    );
    const { result } = renderHook(
      () => useScopedTransactions({ kind: 'all' }, '2026-05-01', '2026-05-31'),
      { wrapper: makeWrapper(new QueryClient()) },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(captured.accountId).toBeNull();
    expect(result.current.data?.map((t) => t.id)).toEqual(['t1', 't2']);
  });
});
