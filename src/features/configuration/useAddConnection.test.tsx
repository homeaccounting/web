import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import { bankConnectionFixture } from '@/test/fixtures';
import { useAddConnection } from './useAddConnection';

describe('useAddConnection', () => {
  it('POSTs /configuration/banking/connections and returns the connection', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    let method = '';
    let body: unknown = null;
    server.use(
      http.post(
        'http://localhost:8080/api/users/me/configuration/banking/connections',
        async ({ request }) => {
          method = request.method;
          body = await request.json();
          return HttpResponse.json(bankConnectionFixture, { status: 201 });
        },
      ),
    );
    const client = makeQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useAddConnection(), { wrapper });
    result.current.mutate({ provider: 'monobank', name: 'Monobank', token: 'tok', enabled: true });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(method).toBe('POST');
    expect(body).toEqual({ provider: 'monobank', name: 'Monobank', token: 'tok', enabled: true });
    expect(result.current.data).toEqual(bankConnectionFixture);
  });
});
