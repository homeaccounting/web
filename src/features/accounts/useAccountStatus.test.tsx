import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { AuthContext } from '@/auth/AuthContext';
import { useCloseAccount, useReopenAccount } from './useAccountStatus';

const apiBase = 'http://localhost:8080';

function makeWrapper(client = new QueryClient()) {
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

describe('useCloseAccount', () => {
  it('POSTs close and invalidates accounts on settle', async () => {
    let hit: string | undefined;
    server.use(
      http.post(`${apiBase}/api/accounts/:id/close`, ({ params }) => {
        hit = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useCloseAccount(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({ id: 'a1' });
    expect(hit).toBe('a1');
    expect(spy).toHaveBeenCalledWith({ queryKey: ['accounts'] });
  });
});

describe('useReopenAccount', () => {
  it('POSTs reopen and invalidates accounts on settle', async () => {
    let hit: string | undefined;
    server.use(
      http.post(`${apiBase}/api/accounts/:id/reopen`, ({ params }) => {
        hit = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');
    const { result } = renderHook(() => useReopenAccount(), { wrapper: makeWrapper(client) });
    await result.current.mutateAsync({ id: 'a2' });
    expect(hit).toBe('a2');
    expect(spy).toHaveBeenCalledWith({ queryKey: ['accounts'] });
  });
});
