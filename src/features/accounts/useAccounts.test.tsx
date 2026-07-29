import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import type { AccountResponse } from '@/api/types';
import { useAccounts } from './useAccounts';

function acc(id: string, name: string, bankName: string, currency = 'UAH'): AccountResponse {
  return {
    id,
    name,
    balance: 0,
    currency,
    overdraftLimit: null,
    subtype: { type: 'bankAccount', bankName },
    status: 'Opened',
    role: 'owner',
    version: 1,
  };
}

describe('useAccounts', () => {
  it('returns accounts sorted by display label, regardless of backend order', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    // Backend order is intentionally scrambled.
    const backend = [
      acc('c', 'Zebra', 'Monobank'),
      acc('a', 'Card', 'PrivatBank'),
      acc('b', 'Card', 'Monobank'),
    ];
    server.use(
      http.get('http://localhost:8080/api/accounts', () =>
        HttpResponse.json({ accounts: backend, totalCount: backend.length }),
      ),
    );
    const client = makeQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useAccounts(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Card·Monobank, Card·PrivatBank, Zebra·Monobank
    expect(result.current.data?.map((a) => a.id)).toEqual(['b', 'a', 'c']);
  });
});
