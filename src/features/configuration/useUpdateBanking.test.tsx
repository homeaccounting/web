import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import { bankingEnabledConfigurationFixture } from '@/test/fixtures';
import { useUpdateBanking } from './useUpdateBanking';

describe('useUpdateBanking', () => {
  it('PUTs /configuration/banking and returns the banking config', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    let method = '';
    let body: unknown = null;
    server.use(
      http.put('http://localhost:8080/api/users/me/configuration/banking', async ({ request }) => {
        method = request.method;
        body = await request.json();
        return HttpResponse.json(bankingEnabledConfigurationFixture.banking, { status: 200 });
      }),
    );
    const client = makeQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useUpdateBanking(), { wrapper });
    result.current.mutate({ mccExpenseCategoryMap: { '5411': 'cat-1' } });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(method).toBe('PUT');
    expect(body).toEqual({ mccExpenseCategoryMap: { '5411': 'cat-1' } });
    expect(result.current.data).toEqual(bankingEnabledConfigurationFixture.banking);
  });
});
