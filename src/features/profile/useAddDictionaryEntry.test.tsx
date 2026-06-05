import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import { useAddDictionaryEntry } from './useAddDictionaryEntry';

describe('useAddDictionaryEntry', () => {
  it('POSTs to /dictionaries/:dictId/entries and returns the entry', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    let body: unknown = null;
    server.use(
      http.post(
        'http://localhost:8080/api/users/me/configuration/dictionaries/labels/entries',
        async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ id: 'new-1', name: 'trip' }, { status: 201 });
        },
      ),
    );
    const client = makeQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useAddDictionaryEntry(), { wrapper });
    result.current.mutate({ dictId: 'labels', name: 'trip' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(body).toEqual({ name: 'trip' });
    expect(result.current.data).toEqual({ id: 'new-1', name: 'trip' });
  });
});
