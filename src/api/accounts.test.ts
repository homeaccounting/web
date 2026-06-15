import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { ApiClient } from './client';
import { accountsApi } from './accounts';

const apiBase = 'http://localhost:8080';
const client = new ApiClient({ baseUrl: apiBase, getToken: () => 't', onUnauthorized: () => {} });
const api = accountsApi(client);

describe('accountsApi close/reopen', () => {
  it('POSTs to /api/accounts/:id/close', async () => {
    let hit: string | undefined;
    server.use(
      http.post(`${apiBase}/api/accounts/:id/close`, ({ params }) => {
        hit = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(api.close('a1')).resolves.toBeUndefined();
    expect(hit).toBe('a1');
  });

  it('POSTs to /api/accounts/:id/reopen', async () => {
    let hit: string | undefined;
    server.use(
      http.post(`${apiBase}/api/accounts/:id/reopen`, ({ params }) => {
        hit = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(api.reopen('a2')).resolves.toBeUndefined();
    expect(hit).toBe('a2');
  });
});
