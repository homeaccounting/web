import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import { useMoveDictionaryEntry } from './useMoveDictionaryEntry';

describe('useMoveDictionaryEntry', () => {
  it('PATCHes the entry parent and forwards the target parentId', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    let body: unknown = null;
    server.use(
      http.patch(
        'http://localhost:8080/api/users/me/configuration/dictionaries/expense/entries/dining/parent',
        async ({ request }) => {
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
    const { result } = renderHook(() => useMoveDictionaryEntry(), { wrapper });
    result.current.mutate({ dictId: 'expense', entryId: 'dining', parentId: 'food' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(body).toEqual({ parentId: 'food' });
  });
});
