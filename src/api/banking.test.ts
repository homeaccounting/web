import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiClient } from './client';
import { bankingApi } from './banking';
import type { ExternalAccountDTO, ImportResponse } from './types';

const mkClient = () =>
  new ApiClient({
    baseUrl: 'http://test',
    getToken: () => 'jwt',
    onUnauthorized: () => undefined,
  });

describe('bankingApi', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs an import and returns the ImportResponse', async () => {
    const response: ImportResponse = {
      accounts: [
        {
          externalAccountId: 'ext-1',
          localAccountId: 'acc-1',
          importedCount: 3,
          skipped: ['already imported'],
          failureCount: 0,
        },
      ],
      unresolved: [],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = await bankingApi(mkClient()).importConnection('conn-1', {
      from: '2026-05-08T00:00:00Z',
      to: '2026-06-07T00:00:00Z',
    });

    expect(fetch).toHaveBeenCalledWith(
      'http://test/api/banking/connections/conn-1/import',
      expect.objectContaining({
        method: 'POST',
        body: '{"from":"2026-05-08T00:00:00Z","to":"2026-06-07T00:00:00Z"}',
      }),
    );
    expect(result).toEqual(response);
  });

  it('POSTs a statement file and returns the ImportResponse', async () => {
    const response: ImportResponse = {
      accounts: [
        {
          externalAccountId: 'ext-1',
          localAccountId: 'acc-1',
          importedCount: 3,
          skipped: ['already imported'],
          failureCount: 0,
        },
      ],
      unresolved: [],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(response), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const file = new Blob(['raw bytes'], { type: 'application/octet-stream' });
    const result = await bankingApi(mkClient()).importStatement('conn-1', 'csv', file);

    expect(fetch).toHaveBeenCalledWith(
      'http://test/api/banking/connections/conn-1/import/file?format=csv',
      expect.objectContaining({ method: 'POST', body: file }),
    );
    expect(result).toEqual(response);
  });

  it('GETs external accounts and returns ExternalAccountDTO[]', async () => {
    const accounts: ExternalAccountDTO[] = [
      {
        externalId: 'ext-1',
        iban: 'UA000000000000000000000000001',
        maskedPan: '537541******1234',
        currency: 'UAH',
        balance: 12345,
      },
      {
        externalId: 'ext-2',
        iban: 'UA000000000000000000000000002',
        maskedPan: null,
        currency: 'USD',
        balance: 0,
      },
    ];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(accounts), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );

    const result = await bankingApi(mkClient()).listExternalAccounts('conn-1');

    expect(fetch).toHaveBeenCalledWith(
      'http://test/api/banking/connections/conn-1/external-accounts',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual(accounts);
  });
});
