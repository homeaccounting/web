import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import { useUnlinkTelegram } from './useUnlinkTelegram';

describe('useUnlinkTelegram', () => {
  it('DELETEs /telegram', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    let called = false;
    server.use(
      http.delete('http://localhost:8080/api/users/me/telegram', () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const client = makeQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useUnlinkTelegram(), { wrapper });
    result.current.mutate();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(called).toBe(true);
  });
});
