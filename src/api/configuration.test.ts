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

  it('PUTs country', async () => {
    await configurationApi(mkClient()).setCountry({ country: 'UA' });
    expect(fetch).toHaveBeenCalledWith(
      'http://test/api/users/me/configuration/country',
      expect.objectContaining({ method: 'PUT', body: '{"country":"UA"}' }),
    );
  });

  it('PUTs language', async () => {
    await configurationApi(mkClient()).setLanguage({ language: 'uk' });
    expect(fetch).toHaveBeenCalledWith(
      'http://test/api/users/me/configuration/language',
      expect.objectContaining({ method: 'PUT', body: '{"language":"uk"}' }),
    );
  });

  it('GETs localization options', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ languages: ['en', 'uk'], countries: ['US', 'UA'] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const result = await configurationApi(mkClient()).getLocalizationOptions();
    expect(fetch).toHaveBeenCalledWith(
      'http://test/api/users/me/configuration/localization-options',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result.languages).toEqual(['en', 'uk']);
    expect(result.countries).toEqual(['US', 'UA']);
  });

  it('GETs a single dictionary', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ roots: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    await configurationApi(mkClient()).listDictionary('label');
    expect(fetch).toHaveBeenCalledWith(
      'http://test/api/users/me/configuration/dictionaries/label',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('POSTs an entry with role and parent', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: 'e-1', name: 'trip' }), {
          status: 201,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    await configurationApi(mkClient()).addEntry('expense', {
      name: 'Dining',
      type: 'item',
      parentId: 'food',
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://test/api/users/me/configuration/dictionaries/expense/entries',
      expect.objectContaining({
        method: 'POST',
        body: '{"name":"Dining","type":"item","parentId":"food"}',
      }),
    );
  });

  it('PATCHes a move to a new parent', async () => {
    await configurationApi(mkClient()).moveEntry('expense', 'dining', {
      parentId: 'food',
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://test/api/users/me/configuration/dictionaries/expense/entries/dining/parent',
      expect.objectContaining({ method: 'PATCH', body: '{"parentId":"food"}' }),
    );
  });

  it('PUTs a rename', async () => {
    await configurationApi(mkClient()).renameEntry('label', 'e-1', { name: 'travel' });
    expect(fetch).toHaveBeenCalledWith(
      'http://test/api/users/me/configuration/dictionaries/label/entries/e-1',
      expect.objectContaining({ method: 'PUT', body: '{"name":"travel"}' }),
    );
  });

  it('DELETEs an entry', async () => {
    await configurationApi(mkClient()).removeEntry('label', 'e-1');
    expect(fetch).toHaveBeenCalledWith(
      'http://test/api/users/me/configuration/dictionaries/label/entries/e-1',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
