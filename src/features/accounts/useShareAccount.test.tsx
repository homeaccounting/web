import { describe, it, expect, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { server } from '@/test/server';
import { http, HttpResponse } from 'msw';
import { AuthContext } from '@/auth/AuthContext';
import { useAccountAccess } from './useAccountAccess';
import { useShareAccount } from './useShareAccount';
import { useRevokeAccess } from './useRevokeAccess';

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

describe('useAccountAccess', () => {
  it('resolves to the access list for the account', async () => {
    server.use(
      http.get(`${apiBase}/api/accounts/acc-1/access`, () =>
        HttpResponse.json({
          access: [{ userId: 'u2', role: 'editor', email: 'u2@example.com' }],
        }),
      ),
    );

    const { result } = renderHook(() => useAccountAccess('acc-1'), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { userId: 'u2', role: 'editor', email: 'u2@example.com' },
    ]);
  });
});

describe('useShareAccount', () => {
  it('POSTs to /api/accounts/:id/share with the share request body', async () => {
    let captured: unknown;
    server.use(
      http.post(`${apiBase}/api/accounts/acc-1/share`, async ({ request }) => {
        captured = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { result } = renderHook(() => useShareAccount('acc-1'), {
      wrapper: makeWrapper(),
    });
    await result.current.mutateAsync({ userId: 'u2', role: 'editor' });

    expect(captured).toEqual({ userId: 'u2', role: 'editor' });
  });

  it('invalidates account-access + accounts queries on success', async () => {
    server.use(
      http.post(
        `${apiBase}/api/accounts/acc-1/share`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );

    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useShareAccount('acc-1'), {
      wrapper: makeWrapper(client),
    });
    await result.current.mutateAsync({ userId: 'u2', role: 'editor' });

    expect(spy).toHaveBeenCalledWith({ queryKey: ['account-access', 'acc-1'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['accounts'] });
  });
});

describe('useRevokeAccess', () => {
  it('DELETEs /api/accounts/:id/access/:userId', async () => {
    let hit = false;
    server.use(
      http.delete(`${apiBase}/api/accounts/acc-1/access/u2`, () => {
        hit = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { result } = renderHook(() => useRevokeAccess('acc-1'), {
      wrapper: makeWrapper(),
    });
    await result.current.mutateAsync('u2');

    expect(hit).toBe(true);
  });

  it('invalidates account-access + accounts queries on success', async () => {
    server.use(
      http.delete(
        `${apiBase}/api/accounts/acc-1/access/u2`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );

    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    const { result } = renderHook(() => useRevokeAccess('acc-1'), {
      wrapper: makeWrapper(client),
    });
    await result.current.mutateAsync('u2');

    expect(spy).toHaveBeenCalledWith({ queryKey: ['account-access', 'acc-1'] });
    expect(spy).toHaveBeenCalledWith({ queryKey: ['accounts'] });
  });
});
