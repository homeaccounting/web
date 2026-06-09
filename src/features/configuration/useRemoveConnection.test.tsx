import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import { useRemoveConnection } from './useRemoveConnection';

describe('useRemoveConnection', () => {
  it('DELETEs /configuration/banking/connections/:id', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    let method = '';
    server.use(
      http.delete(
        'http://localhost:8080/api/users/me/configuration/banking/connections/conn-1',
        ({ request }) => {
          method = request.method;
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
    const { result } = renderHook(() => useRemoveConnection(), { wrapper });
    result.current.mutate('conn-1');
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(method).toBe('DELETE');
  });
});
