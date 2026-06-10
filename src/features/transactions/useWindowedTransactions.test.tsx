import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { server } from '@/test/server';
import { AuthContext } from '@/auth/AuthContext';
import { transactionFixture, foodCategoryId } from '@/test/fixtures';
import { useWindowedTransactions } from './useWindowedTransactions';

const apiBase = 'http://localhost:8080';

// Mirrors the AuthContext mock used in useEditTransaction.test.tsx — provide a
// tokenRef + session directly rather than mutating localStorage.
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

describe('useWindowedTransactions', () => {
  it('accumulates all pages of the window (totalCount > limit)', async () => {
    const many = Array.from({ length: 250 }, (_, i) => ({
      ...transactionFixture,
      id: `t${String(i).padStart(3, '0')}`,
    }));
    server.use(
      http.get(`${apiBase}/api/transactions`, ({ request }) => {
        const url = new URL(request.url);
        const limit = Number(url.searchParams.get('limit'));
        const offset = Number(url.searchParams.get('offset'));
        return HttpResponse.json({
          transactions: many.slice(offset, offset + limit),
          totalCount: many.length,
          limit,
          offset,
        });
      }),
    );

    const { result } = renderHook(() => useWindowedTransactions('a1', '2026-05-10', '2026-06-10'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toHaveLength(250));
  });

  it('sends the correct inclusive UTC dateFrom/dateTo query params', async () => {
    let captured: { dateFrom: string | null; dateTo: string | null; accountId: string | null } = {
      dateFrom: null,
      dateTo: null,
      accountId: null,
    };
    server.use(
      http.get(`${apiBase}/api/transactions`, ({ request }) => {
        const params = new URL(request.url).searchParams;
        captured = {
          dateFrom: params.get('dateFrom'),
          dateTo: params.get('dateTo'),
          accountId: params.get('accountId'),
        };
        return HttpResponse.json({
          transactions: [],
          totalCount: 0,
          limit: 200,
          offset: 0,
        });
      }),
    );

    const { result } = renderHook(() => useWindowedTransactions('a1', '2026-05-10', '2026-06-10'), {
      wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(captured.dateFrom).toBe('2026-05-10T00:00:00.000Z');
    expect(captured.dateTo).toBe('2026-06-10T23:59:59.999Z');
    expect(captured.accountId).toBe('a1');
  });

  it('terminates via totalCount guard when a full page equals totalCount', async () => {
    // Build exactly 200 rows — a "full page" — but totalCount is also 200.
    // The short-page guard (length < 200) does NOT fire; the loop must stop
    // because acc.length >= totalCount.
    const fullPage = Array.from({ length: 200 }, (_, i) => ({
      ...transactionFixture,
      id: `t${String(i).padStart(3, '0')}`,
      category: foodCategoryId,
    }));
    let callCount = 0;
    server.use(
      http.get(`${apiBase}/api/transactions`, () => {
        callCount += 1;
        return HttpResponse.json({
          transactions: fullPage,
          totalCount: 200,
          limit: 200,
          offset: 0,
        });
      }),
    );

    const client = new QueryClient();
    const { result } = renderHook(() => useWindowedTransactions('a1', '2026-05-10', '2026-06-10'), {
      wrapper: makeWrapper(client),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(200);
    expect(callCount).toBe(1);
  });
});
