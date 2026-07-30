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

  it('POSTs multiple statement files as one multipart request and returns the ImportResponse', async () => {
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
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(response), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file1 = new File(['row1,row2'], 'jan.csv', { type: 'text/csv' });
    const file2 = new File(['row3,row4'], 'feb.csv', { type: 'text/csv' });
    const result = await bankingApi(mkClient()).importStatement('conn-1', 'csv', [file1, file2]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://test/api/banking/connections/conn-1/import/file?format=csv');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const files = (init.body as FormData).getAll('files');
    expect(files).toHaveLength(2);
    expect((files[0] as File).name).toBe('jan.csv');
    expect((files[1] as File).name).toBe('feb.csv');
    // The browser must set the multipart boundary itself; we must NOT force a JSON content-type.
    const sentHeaders = new Headers(init.headers);
    expect(sentHeaders.get('Content-Type')).toBeNull();
    expect(result).toEqual(response);
  });

  it('POSTs files to the from-file discovery endpoint and returns ExternalAccountDTO[]', async () => {
    const accounts: ExternalAccountDTO[] = [
      {
        externalId: 'ext-1',
        iban: 'UA000000000000000000000000001',
        maskedPan: '537541******1234',
        currency: 'UAH',
        balance: 12345,
      },
    ];
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(accounts), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const file = new File(['row1,row2'], 'statement.csv', { type: 'text/csv' });
    const result = await bankingApi(mkClient()).listExternalAccountsFromFile('conn-1', 'csv', [
      file,
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'http://test/api/banking/connections/conn-1/external-accounts/from-file?format=csv',
    );
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    const files = (init.body as FormData).getAll('files');
    expect(files).toHaveLength(1);
    expect((files[0] as File).name).toBe('statement.csv');
    expect(result).toEqual(accounts);
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
