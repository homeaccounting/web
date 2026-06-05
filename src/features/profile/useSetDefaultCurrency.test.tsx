import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import { useSetDefaultCurrency } from './useSetDefaultCurrency';

describe('useSetDefaultCurrency', () => {
  it('sends PUT and invalidates configuration on success', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    let receivedBody: unknown = null;
    server.use(
      http.put(
        'http://localhost:8080/api/users/me/configuration/default-currency',
        async ({ request }) => {
          receivedBody = await request.json();
          return new HttpResponse(null, { status: 204 });
        },
      ),
    );
    const client = makeQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useSetDefaultCurrency(), { wrapper });
    result.current.mutate({ currency: 'EUR' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(receivedBody).toEqual({ currency: 'EUR' });
  });
});
