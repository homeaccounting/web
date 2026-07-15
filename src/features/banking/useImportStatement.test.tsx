import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import type { ImportResponse } from '@/api/types';
import { useImportStatement } from './useImportStatement';

describe('useImportStatement', () => {
  it('POSTs the file to /banking/connections/:id/import/file?format=... and parses the response', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    const response: ImportResponse = {
      accounts: [
        {
          externalAccountId: 'ext-acc-1',
          localAccountId: 'acc-1',
          importedCount: 4,
          skipped: [],
          failureCount: 0,
        },
      ],
      unresolved: [],
    };
    let method = '';
    let url = '';
    server.use(
      http.post(
        'http://localhost:8080/api/banking/connections/conn-1/import/file',
        ({ request }) => {
          method = request.method;
          url = request.url;
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
    const { result } = renderHook(() => useImportStatement(), { wrapper });
    const file = new Blob(['raw bytes'], { type: 'text/csv' });
    result.current.mutate({ connId: 'conn-1', format: 'csv', file });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(method).toBe('POST');
    expect(url).toBe('http://localhost:8080/api/banking/connections/conn-1/import/file?format=csv');
    expect(result.current.data).toEqual(response);
  });
});
