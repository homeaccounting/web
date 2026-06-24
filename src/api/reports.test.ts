import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { ApiClient } from './client';
import { reportsApi } from './reports';

const apiBase = 'http://localhost:8080';
const client = new ApiClient({ baseUrl: apiBase, getToken: () => 't', onUnauthorized: () => {} });
const api = reportsApi(client);

describe('reportsApi', () => {
  it('GETs spending-by-category with from/to query params', async () => {
    let url: URL | undefined;
    server.use(
      http.get(`${apiBase}/api/reports/spending-by-category`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ categories: [], total: { amount: 0, currency: 'USD' } });
      }),
    );
    await api.spendingByCategory({
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-30T23:59:59.999Z',
    });
    expect(url?.searchParams.get('from')).toBe('2026-06-01T00:00:00.000Z');
    expect(url?.searchParams.get('to')).toBe('2026-06-30T23:59:59.999Z');
  });

  it('omits absent bounds (open range)', async () => {
    let url: URL | undefined;
    server.use(
      http.get(`${apiBase}/api/reports/spending-by-category`, ({ request }) => {
        url = new URL(request.url);
        return HttpResponse.json({ categories: [], total: { amount: 0, currency: 'USD' } });
      }),
    );
    await api.spendingByCategory({});
    expect(url?.searchParams.has('from')).toBe(false);
    expect(url?.searchParams.has('to')).toBe(false);
  });

  it('GETs income-vs-expense and net-worth', async () => {
    server.use(
      http.get(`${apiBase}/api/reports/income-vs-expense`, () =>
        HttpResponse.json({
          income: { amount: 100, currency: 'USD' },
          expense: { amount: 40, currency: 'USD' },
          net: { amount: 60, currency: 'USD' },
        }),
      ),
      http.get(`${apiBase}/api/reports/net-worth`, () =>
        HttpResponse.json({ accounts: [], total: { amount: 0, currency: 'USD' } }),
      ),
    );
    await expect(api.incomeVsExpense({})).resolves.toMatchObject({ net: { amount: 60 } });
    await expect(api.netWorth()).resolves.toMatchObject({ total: { amount: 0 } });
  });
});
