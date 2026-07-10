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

describe('accountsApi sharing', () => {
  it('GETs the access list', async () => {
    server.use(
      http.get(`${apiBase}/api/accounts/:id/access`, () =>
        HttpResponse.json({
          access: [{ userId: 'u1', role: 'owner', email: 'o@x.com', telegramUsername: null }],
        }),
      ),
    );
    await expect(api.listAccess('a1')).resolves.toEqual([
      { userId: 'u1', role: 'owner', email: 'o@x.com', telegramUsername: null },
    ]);
  });

  it('POSTs a share request', async () => {
    let body: unknown;
    server.use(
      http.post(`${apiBase}/api/accounts/:id/share`, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(api.share('a1', { userId: 'u2', role: 'editor' })).resolves.toBeUndefined();
    expect(body).toEqual({ userId: 'u2', role: 'editor' });
  });

  it('DELETEs an access entry', async () => {
    let hit: { id?: string; userId?: string } = {};
    server.use(
      http.delete(`${apiBase}/api/accounts/:id/access/:userId`, ({ params }) => {
        hit = { id: params.id as string, userId: params.userId as string };
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await expect(api.revokeAccess('a1', 'u2')).resolves.toBeUndefined();
    expect(hit).toEqual({ id: 'a1', userId: 'u2' });
  });
});
