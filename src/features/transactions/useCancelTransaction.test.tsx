import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { server } from '@/test/server';
import { http, HttpResponse } from 'msw';
import { AuthContext } from '@/auth/AuthContext';
import { useCancelTransaction } from './useCancelTransaction';

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

describe('useCancelTransaction', () => {
  it('issues DELETE /api/transactions/:id', async () => {
    let deletedId: string | undefined;
    server.use(
      http.delete(`${apiBase}/api/transactions/:id`, ({ params }) => {
        deletedId = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { result } = renderHook(() => useCancelTransaction(), { wrapper: makeWrapper() });
    await result.current.mutateAsync({ id: 'tx-1', accountIds: ['a1'] });

    expect(deletedId).toBe('tx-1');
  });

  it('invalidates accounts and the broad transactions prefix on settle', async () => {
    server.use(
      http.delete(`${apiBase}/api/transactions/:id`, () => new HttpResponse(null, { status: 204 })),
    );

    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useCancelTransaction(), {
      wrapper: makeWrapper(client),
    });
    await result.current.mutateAsync({ id: 'tx-1', accountIds: ['a1', 'a2'] });

    expect(spy).toHaveBeenCalledWith({ queryKey: ['accounts'] });
    // Single broad invalidation (not per-account) so it prefix-matches both
    // the per-account key and the all-accounts/subset key
    // (['transactions','all',from,to]) used by the all-accounts view.
    expect(spy).toHaveBeenCalledWith({ queryKey: ['transactions'] });
  });
});
