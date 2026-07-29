import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { ApiClient } from './client';
import { promptApi } from './prompt';

const apiBase = 'http://localhost:8080';
const client = new ApiClient({ baseUrl: apiBase, getToken: () => 't', onUnauthorized: () => {} });
const api = promptApi(client);

describe('promptApi', () => {
  it('POSTs text + account to /api/prompt and returns the kind-tagged envelope', async () => {
    let body: unknown;
    server.use(
      http.post(`${apiBase}/api/prompt`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ kind: 'transactions', succeeded: [], failed: [] });
      }),
    );
    const res = await api.submit({ text: 'coffee 4.50', account: 'a1' });
    expect(body).toEqual({ text: 'coffee 4.50', account: 'a1' });
    expect(res.kind).toBe('transactions');
    expect(res.succeeded).toEqual([]);
    expect(res.failed).toEqual([]);
  });
});
