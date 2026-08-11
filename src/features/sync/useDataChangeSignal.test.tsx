import { describe, expect, it, vi, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { server } from '@/test/server';
import { AuthContext } from '@/auth/AuthContext';
import { useDataChangeSignal } from './useDataChangeSignal';

const apiBase = 'http://localhost:8080';

function makeWrapper(client: QueryClient, session: { userId: string; email: string } | null) {
  const tokenRef = { current: 't' };
  const ctx = {
    tokenRef,
    session: session as never,
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

afterEach(() => {
  vi.useRealTimers();
});

describe('useDataChangeSignal', () => {
  it('seeds the last-seen version on the first poll without invalidating', async () => {
    server.use(http.get(`${apiBase}/api/sync/version`, () => HttpResponse.json({ version: 3 })));
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    renderHook(() => useDataChangeSignal(), {
      wrapper: makeWrapper(client, { userId: 'u', email: 'a@b' }),
    });

    await waitFor(() => expect(client.getQueryData(['sync', 'version'])).toBe(3));
    expect(spy).not.toHaveBeenCalled();
  });

  it('invalidates the tracked scopes (not configuration) when a later poll returns a different value', async () => {
    let version = 3;
    server.use(http.get(`${apiBase}/api/sync/version`, () => HttpResponse.json({ version })));
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderHook(() => useDataChangeSignal(), {
        wrapper: makeWrapper(client, { userId: 'u', email: 'a@b' }),
      });

      await waitFor(() => expect(client.getQueryData(['sync', 'version'])).toBe(3));
      expect(spy).not.toHaveBeenCalled();

      version = 4;
      vi.advanceTimersByTime(10_000);

      await waitFor(() => expect(client.getQueryData(['sync', 'version'])).toBe(4));

      const invalidatedKeys = spy.mock.calls.map((call) => call[0]?.queryKey);
      expect(invalidatedKeys).toEqual(
        expect.arrayContaining([
          ['accounts'],
          ['transactions'],
          ['reports'],
          ['transaction-relations'],
          ['account-access'],
        ]),
      );
      expect(invalidatedKeys).not.toEqual(expect.arrayContaining([['configuration']]));
      expect(invalidatedKeys).toHaveLength(5);
    } finally {
      vi.useRealTimers();
    }
  });

  it('also invalidates when a later poll returns a LOWER value (regression case)', async () => {
    let version = 10;
    server.use(http.get(`${apiBase}/api/sync/version`, () => HttpResponse.json({ version })));
    const client = new QueryClient();
    const spy = vi.spyOn(client, 'invalidateQueries');

    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      renderHook(() => useDataChangeSignal(), {
        wrapper: makeWrapper(client, { userId: 'u', email: 'a@b' }),
      });

      await waitFor(() => expect(client.getQueryData(['sync', 'version'])).toBe(10));
      expect(spy).not.toHaveBeenCalled();

      version = 2;
      vi.advanceTimersByTime(10_000);

      await waitFor(() => expect(client.getQueryData(['sync', 'version'])).toBe(2));
      expect(spy).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not poll when there is no session', async () => {
    let hit = false;
    server.use(
      http.get(`${apiBase}/api/sync/version`, () => {
        hit = true;
        return HttpResponse.json({ version: 1 });
      }),
    );
    const client = new QueryClient();

    const { result } = renderHook(() => useDataChangeSignal(), {
      wrapper: makeWrapper(client, null),
    });

    // Give any accidental fetch a chance to fire.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(hit).toBe(false);
    expect(result.current.isFetching).toBe(false);
  });
});
