import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import { configurationFixture } from '@/test/fixtures';
import { useUpdateDefaults } from './useUpdateDefaults';

describe('useUpdateDefaults', () => {
  it('PUTs /configuration/defaults and returns the configuration', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    let method = '';
    let body: unknown = null;
    server.use(
      http.put('http://localhost:8080/api/users/me/configuration/defaults', async ({ request }) => {
        method = request.method;
        body = await request.json();
        return HttpResponse.json(
          {
            ...configurationFixture,
            defaults: { ...configurationFixture.defaults, incomeCategory: 'cat-income' },
          },
          { status: 200 },
        );
      }),
    );
    const client = makeQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateDefaults(), { wrapper });
    result.current.mutate({ incomeCategory: 'cat-income' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(method).toBe('PUT');
    expect(body).toEqual({ incomeCategory: 'cat-income' });
    expect(result.current.data?.defaults.incomeCategory).toBe('cat-income');
  });
});
