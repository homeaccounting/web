import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import type { ResyncResponse } from '@/api/types';
import { useResync } from './useResync';

describe('useResync', () => {
  it('POSTs {from,to} to /banking/connections/:id/resync and parses the response', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    const response: ResyncResponse = {
      accounts: [
        {
          externalAccountId: 'ext-acc-1',
          localAccountId: 'acc-1',
          importedCount: 3,
          skippedCount: 1,
          failureCount: 0,
        },
      ],
    };
    let method = '';
    let body: unknown = null;
    server.use(
      http.post(
        'http://localhost:8080/api/banking/connections/conn-1/resync',
        async ({ request }) => {
          method = request.method;
          body = await request.json();
          return HttpResponse.json(response, { status: 200 });
        },
      ),
    );
    const client = makeQueryClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    );
    const { result } = renderHook(() => useResync('conn-1'), { wrapper });
    result.current.mutate({ from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z' });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(method).toBe('POST');
    expect(body).toEqual({ from: '2026-01-01T00:00:00Z', to: '2026-02-01T00:00:00Z' });
    expect(result.current.data).toEqual(response);
  });
});
