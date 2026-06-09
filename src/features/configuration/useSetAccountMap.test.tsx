import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import { useSetAccountMap } from './useSetAccountMap';

describe('useSetAccountMap', () => {
  it('PUTs /configuration/banking/connections/:id/accounts with the map', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    let method = '';
    let body: unknown = null;
    server.use(
      http.put(
        'http://localhost:8080/api/users/me/configuration/banking/connections/conn-1/accounts',
        async ({ request }) => {
          method = request.method;
          body = await request.json();
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
    const { result } = renderHook(() => useSetAccountMap(), { wrapper });
    result.current.mutate({ id: 'conn-1', body: { accountMap: { 'ext-acc-1': 'acc-1' } } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(method).toBe('PUT');
    expect(body).toEqual({ accountMap: { 'ext-acc-1': 'acc-1' } });
  });
});
