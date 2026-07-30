import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { AuthContext } from '@/auth/AuthContext';
import { usePrompt } from './usePrompt';

const apiBase = 'http://localhost:8080';

function makeWrapper(client: QueryClient) {
  const ctx = {
    tokenRef: { current: 't' },
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

describe('usePrompt', () => {
  it('invalidates transactions + accounts when something succeeded', async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    server.use(
      http.post(`${apiBase}/api/prompt`, () =>
        HttpResponse.json({ kind: 'transactions', succeeded: [{ id: 'tx' }], failed: [] }),
      ),
    );
    const { result } = renderHook(() => usePrompt(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({ text: 'coffee 4.50', account: 'a1' });
    await waitFor(() => {
      // Broad prefix so the all-accounts/subset view (['transactions','all',from,to])
      // also refreshes, not just the per-account key.
      expect(spy).toHaveBeenCalledWith({ queryKey: ['transactions'] });
      expect(spy).toHaveBeenCalledWith({ queryKey: ['accounts'] });
    });
  });

  it('does not invalidate when nothing succeeded (total failure)', async () => {
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    server.use(
      http.post(`${apiBase}/api/prompt`, () =>
        HttpResponse.json({
          kind: 'transactions',
          succeeded: [],
          failed: [{ index: 0, reason: 'nope' }],
        }),
      ),
    );
    const { result } = renderHook(() => usePrompt(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({ text: 'nonsense', account: 'a1' });
    expect(spy).not.toHaveBeenCalled();
  });
});
