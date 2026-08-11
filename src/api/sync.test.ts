import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { ApiClient } from './client';
import { syncApi } from './sync';

const apiBase = 'http://localhost:8080';
const client = new ApiClient({ baseUrl: apiBase, getToken: () => 't', onUnauthorized: () => {} });
const api = syncApi(client);

describe('syncApi', () => {
  it('GETs /api/sync/version and resolves to the version number', async () => {
    let hit = false;
    server.use(
      http.get(`${apiBase}/api/sync/version`, () => {
        hit = true;
        return HttpResponse.json({ version: 7 });
      }),
    );

    await expect(api.getSyncVersion()).resolves.toBe(7);
    expect(hit).toBe(true);
  });
});
