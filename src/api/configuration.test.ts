import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiClient } from './client';
import { configurationApi } from './configuration';

const mkClient = () =>
  new ApiClient({
    baseUrl: 'http://test',
    getToken: () => 'jwt',
    onUnauthorized: () => undefined,
  });

describe('configurationApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });

  it('PUTs base currency', async () => {
    await configurationApi(mkClient()).setBaseCurrency({ currency: 'EUR' });
    expect(fetch).toHaveBeenCalledWith(
      'http://test/api/users/me/configuration/base-currency',
      expect.objectContaining({ method: 'PUT', body: '{"currency":"EUR"}' }),
    );
  });

  it('PUTs default currency', async () => {
    await configurationApi(mkClient()).setDefaultCurrency({ currency: 'EUR' });
    expect(fetch).toHaveBeenCalledWith(
      'http://test/api/users/me/configuration/default-currency',
      expect.objectContaining({ method: 'PUT', body: '{"currency":"EUR"}' }),
    );
  });

  it('GETs a single dictionary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ entries: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    await configurationApi(mkClient()).listDictionary('labels');
    expect(fetch).toHaveBeenCalledWith(
      'http://test/api/users/me/configuration/dictionaries/labels',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('POSTs an entry', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 'e-1', name: 'trip' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    await configurationApi(mkClient()).addEntry('labels', { name: 'trip' });
    expect(fetch).toHaveBeenCalledWith(
      'http://test/api/users/me/configuration/dictionaries/labels/entries',
      expect.objectContaining({ method: 'POST', body: '{"name":"trip"}' }),
    );
  });

  it('PUTs a rename', async () => {
    await configurationApi(mkClient()).renameEntry('labels', 'e-1', { name: 'travel' });
    expect(fetch).toHaveBeenCalledWith(
      'http://test/api/users/me/configuration/dictionaries/labels/entries/e-1',
      expect.objectContaining({ method: 'PUT', body: '{"name":"travel"}' }),
    );
  });

  it('DELETEs an entry', async () => {
    await configurationApi(mkClient()).removeEntry('labels', 'e-1');
    expect(fetch).toHaveBeenCalledWith(
      'http://test/api/users/me/configuration/dictionaries/labels/entries/e-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
