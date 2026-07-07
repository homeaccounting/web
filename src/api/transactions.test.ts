import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiClient } from './client';
import { transactionsApi } from './transactions';

const mkClient = () =>
  new ApiClient({
    baseUrl: 'http://test',
    getToken: () => null,
    onUnauthorized: () => undefined,
  });

const txJson = (overrides: Record<string, unknown> = {}) => ({
  id: 'tx-1',
  sourceAccountId: 's',
  targetAccountId: 't',
  sourceAmount: 0,
  sourceCurrency: 'USD',
  targetAmount: 0,
  targetCurrency: 'USD',
  exchangeRate: null,
  description: '',
  status: 'Completed',
  failureReason: null,
  transactionType: 'income',
  category: null,
  date: '2026-01-01T00:00:00.000Z',
  labels: [],
  amendmentCount: 0,
  relations: [],
  ...overrides,
});

describe('transactionsApi edit endpoints', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function stubFetch() {
    const spy = vi.fn(
      () =>
        new Response(JSON.stringify(txJson()), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', spy);
    return spy;
  }

  it('get() GETs a single transaction by id', async () => {
    const spy = stubFetch();
    await transactionsApi(mkClient()).get('abc');
    expect(spy).toHaveBeenCalledWith(
      'http://test/api/transactions/abc',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('relations() GETs the relations endpoint', async () => {
    const spy = vi.fn(
      () =>
        new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    vi.stubGlobal('fetch', spy);
    await transactionsApi(mkClient()).relations('abc');
    expect(spy).toHaveBeenCalledWith(
      'http://test/api/transactions/abc/relations',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('PUTs description', async () => {
    const spy = stubFetch();
    await transactionsApi(mkClient()).setDescription('tx-1', { description: 'new' });
    expect(spy).toHaveBeenCalledWith(
      'http://test/api/transactions/tx-1/description',
      expect.objectContaining({ method: 'PUT', body: '{"description":"new"}' }),
    );
  });

  it('PUTs date', async () => {
    const spy = stubFetch();
    await transactionsApi(mkClient()).setDate('tx-1', { at: '2026-02-02T00:00:00.000Z' });
    expect(spy).toHaveBeenCalledWith(
      'http://test/api/transactions/tx-1/date',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('PUTs labels', async () => {
    const spy = stubFetch();
    await transactionsApi(mkClient()).setLabels('tx-1', { labels: [] });
    expect(spy).toHaveBeenCalledWith(
      'http://test/api/transactions/tx-1/labels',
      expect.objectContaining({ method: 'PUT', body: '{"labels":[]}' }),
    );
  });

  it('PATCHes allocations', async () => {
    const spy = stubFetch();
    await transactionsApi(mkClient()).setAllocations('tx-1', {
      newAllocations: { incomes: [], expenses: [] },
    });
    expect(spy).toHaveBeenCalledWith(
      'http://test/api/transactions/tx-1/allocations',
      expect.objectContaining({ method: 'PATCH' }),
    );
  });

  it('PUTs amendment', async () => {
    const spy = stubFetch();
    await transactionsApi(mkClient()).amend('tx-1', {
      sourceAccountId: 's',
      targetAccountId: 't',
      sourceAmount: 10,
      sourceCurrency: 'USD',
      targetAmount: 10,
      targetCurrency: 'USD',
    });
    expect(spy).toHaveBeenCalledWith(
      'http://test/api/transactions/tx-1/amendment',
      expect.objectContaining({ method: 'PUT' }),
    );
  });

  it('cancel issues DELETE /api/transactions/:id', async () => {
    const spy = vi.fn(() => new Response(null, { status: 204 }));
    vi.stubGlobal('fetch', spy);
    await transactionsApi(mkClient()).cancel('tx-1');
    expect(spy).toHaveBeenCalledWith(
      'http://test/api/transactions/tx-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
