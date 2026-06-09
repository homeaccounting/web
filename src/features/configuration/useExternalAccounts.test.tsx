import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import { externalAccountsFixture } from '@/test/fixtures';
import { useExternalAccounts } from './useExternalAccounts';

describe('useExternalAccounts', () => {
  it('does not fetch until refetch() and then returns external accounts', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    let fetched = false;
    server.use(
      http.get('http://localhost:8080/api/banking/connections/conn-1/external-accounts', () => {
        fetched = true;
        return HttpResponse.json(externalAccountsFixture, { status: 200 });
      }),
    );
    const client = makeQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useExternalAccounts('conn-1'), { wrapper });

    // Lazy: nothing fetched on mount.
    expect(result.current.fetchStatus).toBe('idle');
    expect(result.current.isFetching).toBe(false);
    expect(fetched).toBe(false);

    void result.current.refetch();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fetched).toBe(true);
    expect(result.current.data).toEqual(externalAccountsFixture);
  });
});
