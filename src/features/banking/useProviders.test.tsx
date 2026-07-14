import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import type { BankProviderDTO } from '@/api/types';
import { useProviders } from './useProviders';

const apiBase = 'http://localhost:8080';

function makeWrapper() {
  const client = makeQueryClient();
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
  };
}

describe('useProviders', () => {
  it('fetches the list of bank providers', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    const providers: BankProviderDTO[] = [
      { id: 'monobank', displayName: 'Monobank', supportsPull: true, supportsFile: false },
      { id: 'privatbank', displayName: 'PrivatBank', supportsPull: false, supportsFile: true },
    ];
    server.use(
      http.get(`${apiBase}/api/users/me/configuration/banking/providers`, () =>
        HttpResponse.json(providers),
      ),
    );

    const { result } = renderHook(() => useProviders(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual(providers);
  });

  it('fails soft when the request errors, leaving data undefined', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    server.use(
      http.get(
        `${apiBase}/api/users/me/configuration/banking/providers`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );

    const { result } = renderHook(() => useProviders(), { wrapper: makeWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.data).toBeUndefined();
  });
});
