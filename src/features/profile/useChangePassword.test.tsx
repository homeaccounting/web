import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import { useChangePassword } from './useChangePassword';

describe('useChangePassword', () => {
  it('POSTs change-password and invalidates users/me', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    let body: unknown = null;
    server.use(
      http.post('http://localhost:8080/api/users/me/change-password', async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const client = makeQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useChangePassword(), { wrapper });
    result.current.mutate({ currentPassword: 'old', newPassword: 'new-12345' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(body).toEqual({ currentPassword: 'old', newPassword: 'new-12345' });
  });
});
