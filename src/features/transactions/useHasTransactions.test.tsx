import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import { transactionFixture } from '@/test/fixtures';
import { useHasTransactions } from './useHasTransactions';

function renderProbe() {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  const client = makeQueryClient();
  return renderHook(() => useHasTransactions(), {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    ),
  });
}

describe('useHasTransactions', () => {
  it('is false when the account has no transactions', async () => {
    server.use(
      http.get('http://localhost:8080/api/transactions', () =>
        HttpResponse.json({ transactions: [], totalCount: 0, limit: 1, offset: 0 }),
      ),
    );
    const { result } = renderProbe();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(false);
  });

  it('is true when at least one transaction exists', async () => {
    server.use(
      http.get('http://localhost:8080/api/transactions', () =>
        HttpResponse.json({
          transactions: [transactionFixture],
          totalCount: 1,
          limit: 1,
          offset: 0,
        }),
      ),
    );
    const { result } = renderProbe();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
  });
});
