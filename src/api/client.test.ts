import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { ApiClient, ApiError } from './client';

const baseUrl = 'http://localhost:8080';

describe('ApiClient', () => {
  let onUnauthorized: ReturnType<typeof vi.fn>;
  let client: ApiClient;

  beforeEach(() => {
    onUnauthorized = vi.fn();
    client = new ApiClient({ baseUrl, getToken: () => null, onUnauthorized });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('attaches Authorization header when a token is present', async () => {
    let received: string | null = null;
    server.use(
      http.get(`${baseUrl}/api/users/me`, ({ request }) => {
        received = request.headers.get('authorization');
        return HttpResponse.json({});
      }),
    );
    client = new ApiClient({ baseUrl, getToken: () => 'jwt-abc', onUnauthorized });
    await client.get('/api/users/me');
    expect(received).toBe('Bearer jwt-abc');
  });

  it('omits Authorization header when no token', async () => {
    let received: string | null = 'present';
    server.use(
      http.get(`${baseUrl}/api/health`, ({ request }) => {
        received = request.headers.get('authorization');
        return HttpResponse.json({});
      }),
    );
    await client.get('/api/health');
    expect(received).toBeNull();
  });

  it('parses JSON body for 2xx responses', async () => {
    server.use(http.get(`${baseUrl}/api/x`, () => HttpResponse.json({ value: 42 })));
    const out = await client.get<{ value: number }>('/api/x');
    expect(out).toEqual({ value: 42 });
  });

  it('throws ApiError with parsed message on 4xx', async () => {
    server.use(
      http.post(`${baseUrl}/api/auth/login`, () =>
        HttpResponse.json({ message: 'bad creds' }, { status: 401 }),
      ),
    );
    await expect(client.post('/api/auth/login', {})).rejects.toBeInstanceOf(ApiError);
  });

  it('invokes onUnauthorized exactly once on 401', async () => {
    server.use(http.get(`${baseUrl}/api/users/me`, () => new HttpResponse(null, { status: 401 })));
    await client.get('/api/users/me').catch(() => {});
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it('returns undefined on 200 with empty body (Servant Post NoContent)', async () => {
    server.use(http.post(`${baseUrl}/api/auth/link-oauth`, () => new HttpResponse(null)));
    await expect(client.post<void>('/api/auth/link-oauth', {})).resolves.toBeUndefined();
  });

  it('parses fieldErrors out of a 400 response body', async () => {
    server.use(
      http.post(`${baseUrl}/api/accounts`, () =>
        HttpResponse.json(
          { message: 'Validation failed', fieldErrors: { name: 'Name is required' } },
          { status: 400 },
        ),
      ),
    );
    try {
      await client.post('/api/accounts', {});
      expect.unreachable('expected ApiError to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(400);
      expect(apiErr.fieldErrors).toEqual({ name: 'Name is required' });
    }
  });

  it('parses code out of an ErrorResponse-style 400 body', async () => {
    server.use(
      http.post(`${baseUrl}/api/accounts`, () =>
        HttpResponse.json({ message: 'Banking error', code: 'BANKING_ERROR' }, { status: 400 }),
      ),
    );
    try {
      await client.post('/api/accounts', {});
      expect.unreachable('expected ApiError to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.code).toBe('BANKING_ERROR');
      expect(apiErr.message).toBe('Banking error');
    }
  });

  it('falls back to "HTTP <status>" message when the body is not JSON', async () => {
    server.use(http.get(`${baseUrl}/api/boom`, () => new HttpResponse(null, { status: 500 })));
    try {
      await client.get('/api/boom');
      expect.unreachable('expected ApiError to be thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError);
      const apiErr = err as ApiError;
      expect(apiErr.status).toBe(500);
      expect(apiErr.message).toBe('HTTP 500');
    }
  });
});

describe('ApiClient.patch', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Response(JSON.stringify({ ok: true, method: init?.method, body: init?.body }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends a PATCH with JSON body', async () => {
    const client = new ApiClient({
      baseUrl: 'http://test',
      getToken: () => null,
      onUnauthorized: () => undefined,
    });
    const res = await client.patch<{ ok: boolean; method: string; body: string }>('/x', { a: 1 });
    expect(res.ok).toBe(true);
    expect(res.method).toBe('PATCH');
    expect(res.body).toBe('{"a":1}');
  });
});

describe('ApiClient.postBinary', () => {
  it('POSTs the Blob as-is with an octet-stream Content-Type and the auth header', async () => {
    let receivedContentType: string | null = null;
    let receivedAuth: string | null = null;
    let receivedBody: string | null = null;
    server.use(
      http.post(`${baseUrl}/api/banking/connections/conn-1/import/file`, async ({ request }) => {
        receivedContentType = request.headers.get('content-type');
        receivedAuth = request.headers.get('authorization');
        receivedBody = await request.text();
        return HttpResponse.json({ accounts: [], unresolved: [] });
      }),
    );
    const client = new ApiClient({ baseUrl, getToken: () => 'jwt-abc', onUnauthorized: vi.fn() });
    const file = new Blob(['statement bytes'], { type: 'text/csv' });
    const result = await client.postBinary('/api/banking/connections/conn-1/import/file', file);

    expect(receivedContentType).toBe('application/octet-stream');
    expect(receivedAuth).toBe('Bearer jwt-abc');
    expect(receivedBody).toBe('statement bytes');
    expect(result).toEqual({ accounts: [], unresolved: [] });
  });

  it('accepts a custom contentType override', async () => {
    let receivedContentType: string | null = null;
    server.use(
      http.post(`${baseUrl}/api/x`, ({ request }) => {
        receivedContentType = request.headers.get('content-type');
        return HttpResponse.json({});
      }),
    );
    const client = new ApiClient({ baseUrl, getToken: () => null, onUnauthorized: vi.fn() });
    await client.postBinary('/api/x', new Blob(['x']), 'text/csv');
    expect(receivedContentType).toBe('text/csv');
  });
});
