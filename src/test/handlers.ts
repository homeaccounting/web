import { http, HttpResponse } from 'msw';
import type {
  AddConnectionRequest,
  BankConnectionDTO,
  BankingConfigurationDTO,
  BankProviderDTO,
  UpdateBankingRequest,
  UpdateDefaultsRequest,
} from '@/api/types';
import {
  accountFixture,
  authResponseFixture,
  configurationFixture,
  externalAccountsFixture,
  externalAccountsFromFileFixture,
  incomeVsExpenseFixture,
  localizationOptionsFixture,
  netWorthFixture,
  profileFixture,
  spendingByCategoryFixture,
  telegramLinkCodeFixture,
  transactionFixture,
} from './fixtures';

const apiBase = 'http://localhost:8080';

// Default windowed list; tests override via server.use(...) when they need
// more rows or specific dates.
const listTransactions = (url: URL) => {
  const all = [transactionFixture];
  const limit = Number(url.searchParams.get('limit') ?? '50');
  const offset = Number(url.searchParams.get('offset') ?? '0');
  const page = all.slice(offset, offset + limit);
  return HttpResponse.json({
    transactions: page,
    totalCount: all.length,
    limit,
    offset,
  });
};

const editedTransactionFixture = (overrides: Record<string, unknown> = {}) => ({
  id: 'tx-edit',
  sourceAccountId: 'ext',
  targetAccountId: 'a1',
  sourceAmount: 0,
  sourceCurrency: 'USD',
  targetAmount: 0,
  targetCurrency: 'USD',
  exchangeRate: null,
  description: 'edited',
  status: 'Completed',
  failureReason: null,
  transactionType: 'income',
  category: 'cat-1',
  date: '2026-03-04T00:00:00.000Z',
  labels: [],
  amendmentCount: 0,
  ...overrides,
});

export const handlers = [
  http.post(`${apiBase}/api/auth/register`, () => HttpResponse.json(authResponseFixture)),
  http.post(`${apiBase}/api/auth/login`, () => HttpResponse.json(authResponseFixture)),
  http.post(`${apiBase}/api/auth/refresh`, () => HttpResponse.json(authResponseFixture)),
  http.get(`${apiBase}/api/auth/oauth/:provider`, () =>
    HttpResponse.json({ redirectUrl: 'https://google.example/oauth?x=1', state: 'state-abc' }),
  ),
  http.get(`${apiBase}/api/auth/oauth/:provider/callback`, () =>
    HttpResponse.json(authResponseFixture),
  ),
  http.post(`${apiBase}/api/auth/link-oauth`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${apiBase}/api/auth/telegram/link-code`, () =>
    HttpResponse.json(telegramLinkCodeFixture),
  ),
  http.get(`${apiBase}/api/users/me`, () => HttpResponse.json(profileFixture)),
  http.get(`${apiBase}/api/accounts`, () =>
    HttpResponse.json({ accounts: [accountFixture], totalCount: 1 }),
  ),
  http.post(`${apiBase}/api/accounts`, async ({ request }) => {
    const body = (await request.json()) as { name: string; currency: string };
    return HttpResponse.json(
      {
        id: 'new-account-id',
        name: body.name,
        balance: 0,
        currency: body.currency,
        overdraftLimit: null,
        subtype: { type: 'cash' },
        status: 'Opened',
        version: 1,
        role: 'owner',
      },
      { status: 201 },
    );
  }),
  http.put(`${apiBase}/api/accounts/:id/name`, () => new HttpResponse(null, { status: 200 })),
  http.put(
    `${apiBase}/api/accounts/:id/overdraft-limit`,
    () => new HttpResponse(null, { status: 200 }),
  ),
  http.put(`${apiBase}/api/accounts/:id/type`, () => new HttpResponse(null, { status: 200 })),
  http.post(`${apiBase}/api/accounts/:id/close`, () => new HttpResponse(null, { status: 204 })),
  http.post(`${apiBase}/api/accounts/:id/reopen`, () => new HttpResponse(null, { status: 204 })),
  http.put(`${apiBase}/api/accounts/:id/balance`, () =>
    HttpResponse.json({
      id: 'tx-0',
      sourceAccountId: 'a1',
      targetAccountId: 'a1',
      sourceAmount: 0,
      sourceCurrency: 'USD',
      targetAmount: 0,
      targetCurrency: 'USD',
      exchangeRate: null,
      description: 'Adjustment',
      status: 'Completed',
      failureReason: null,
      transactionType: 'adjustment',
      category: null,
      date: '2025-01-01T00:00:00.000Z',
      labels: [],
      amendmentCount: 0,
    }),
  ),
  http.get(`${apiBase}/api/accounts/:id/access`, () =>
    HttpResponse.json({
      access: [{ userId: 'u', role: 'owner', email: 'e', telegramUsername: null }],
    }),
  ),
  http.post(`${apiBase}/api/accounts/:id/share`, () => new HttpResponse(null, { status: 204 })),
  http.delete(
    `${apiBase}/api/accounts/:id/access/:userId`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.post(`${apiBase}/api/transactions/income`, async ({ request }) => {
    const body = (await request.json()) as {
      accountId: string;
      amount: number;
      currency: string;
      description: string;
    };
    return HttpResponse.json({
      id: 'tx-new-income',
      sourceAccountId: 'external-1',
      targetAccountId: body.accountId,
      sourceAmount: body.amount,
      sourceCurrency: body.currency,
      targetAmount: body.amount,
      targetCurrency: body.currency,
      exchangeRate: null,
      description: body.description,
      status: 'Completed',
      failureReason: null,
      transactionType: 'income',
      category: null,
      date: '2026-06-01T00:00:00.000Z',
      labels: [],
      amendmentCount: 0,
    });
  }),
  http.post(`${apiBase}/api/transactions/expense`, async ({ request }) => {
    const body = (await request.json()) as {
      accountId: string;
      amount: number;
      currency: string;
      description: string;
    };
    return HttpResponse.json({
      id: 'tx-new-expense',
      sourceAccountId: body.accountId,
      targetAccountId: 'external-1',
      sourceAmount: -body.amount,
      sourceCurrency: body.currency,
      targetAmount: -body.amount,
      targetCurrency: body.currency,
      exchangeRate: null,
      description: body.description,
      status: 'Completed',
      failureReason: null,
      transactionType: 'expense',
      category: null,
      date: '2026-06-01T00:00:00.000Z',
      labels: [],
      amendmentCount: 0,
    });
  }),
  http.post(`${apiBase}/api/transactions/transfer`, async ({ request }) => {
    const body = (await request.json()) as {
      sourceAccountId: string;
      targetAccountId: string;
      amount: number;
      currency: string;
      description: string;
    };
    return HttpResponse.json({
      id: 'tx-new-transfer',
      sourceAccountId: body.sourceAccountId,
      targetAccountId: body.targetAccountId,
      sourceAmount: -body.amount,
      sourceCurrency: body.currency,
      targetAmount: body.amount,
      targetCurrency: body.currency,
      exchangeRate: null,
      description: body.description,
      status: 'Completed',
      failureReason: null,
      transactionType: 'transfer',
      category: null,
      date: '2026-06-01T00:00:00.000Z',
      labels: [],
      amendmentCount: 0,
    });
  }),
  http.get(`${apiBase}/api/transactions`, ({ request }) => listTransactions(new URL(request.url))),
  // Relations + single-transaction fetch. Default to the base fixture / empty
  // relations; tests override per-id via server.use(...).
  http.get(`${apiBase}/api/transactions/:id/relations`, () =>
    HttpResponse.json({ outbound: [], inbound: [] }),
  ),
  // Link a relation (happy path). Returns the fixture as the updated row so
  // suites rendering rows don't error on this request. Tests override per-id.
  http.post(`${apiBase}/api/transactions/:id/relations`, () =>
    HttpResponse.json(transactionFixture),
  ),
  // Unlink a relation (happy path). Returns the fixture as the updated row so
  // suites rendering rows don't error on this request. Tests override per-id.
  http.delete(`${apiBase}/api/transactions/:id/relations`, () =>
    HttpResponse.json(transactionFixture),
  ),
  http.get(`${apiBase}/api/transactions/:id`, () => HttpResponse.json(transactionFixture)),
  http.put(`${apiBase}/api/transactions/:id/description`, async ({ request }) => {
    const body = (await request.json()) as { description: string };
    return HttpResponse.json(editedTransactionFixture({ description: body.description }));
  }),
  http.put(`${apiBase}/api/transactions/:id/date`, async ({ request }) => {
    const body = (await request.json()) as { at: string };
    return HttpResponse.json(editedTransactionFixture({ date: body.at }));
  }),
  http.put(`${apiBase}/api/transactions/:id/labels`, async ({ request }) => {
    const body = (await request.json()) as { labels: string[] };
    return HttpResponse.json(editedTransactionFixture({ labels: body.labels }));
  }),
  http.put(`${apiBase}/api/transactions/:id/contact`, async ({ request }) => {
    const body = (await request.json()) as { contactId: string | null };
    return HttpResponse.json(editedTransactionFixture({ contactId: body.contactId }));
  }),
  http.patch(`${apiBase}/api/transactions/:id/allocations`, () =>
    HttpResponse.json(editedTransactionFixture()),
  ),
  http.put(`${apiBase}/api/transactions/:id/amendment`, async ({ request }) => {
    const body = (await request.json()) as {
      sourceAmount: number;
      targetAmount: number;
      sourceCurrency: string;
      targetCurrency: string;
    };
    return HttpResponse.json(
      editedTransactionFixture({
        sourceAmount: body.sourceAmount,
        targetAmount: body.targetAmount,
        sourceCurrency: body.sourceCurrency,
        targetCurrency: body.targetCurrency,
      }),
    );
  }),
  http.delete(`${apiBase}/api/transactions/:id`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${apiBase}/api/users/me/configuration`, () => HttpResponse.json(configurationFixture)),
  http.put(
    `${apiBase}/api/users/me/configuration/base-currency`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.put(
    `${apiBase}/api/users/me/configuration/country`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.put(
    `${apiBase}/api/users/me/configuration/language`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.get(`${apiBase}/api/users/me/configuration/localization-options`, () =>
    HttpResponse.json(localizationOptionsFixture),
  ),
  http.put(
    `${apiBase}/api/users/me/configuration/default-currency`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.post(
    `${apiBase}/api/users/me/configuration/dictionaries/:dictId/entries`,
    async ({ request }) => {
      const body = (await request.json()) as { name: string };
      return HttpResponse.json({ id: 'entry-new', name: body.name }, { status: 201 });
    },
  ),
  http.put(
    `${apiBase}/api/users/me/configuration/dictionaries/:dictId/entries/:entryId`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.delete(
    `${apiBase}/api/users/me/configuration/dictionaries/:dictId/entries/:entryId`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.patch(
    `${apiBase}/api/users/me/configuration/dictionaries/:dictId/entries/:entryId/parent`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.post(`${apiBase}/api/users/me/configuration/banking/connections`, async ({ request }) => {
    const body = (await request.json()) as AddConnectionRequest;
    const connection: BankConnectionDTO = {
      id: 'conn-new',
      provider: body.provider,
      name: body.name,
      enabled: body.enabled,
      tokenSet: true,
      tokenHint: body.token ? body.token.slice(-4) : '0000',
      accountMap: {},
    };
    return HttpResponse.json(connection, { status: 201 });
  }),
  http.put(
    `${apiBase}/api/users/me/configuration/banking/connections/:id`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.put(
    `${apiBase}/api/users/me/configuration/banking/connections/:id/token`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.delete(
    `${apiBase}/api/users/me/configuration/banking/connections/:id`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.put(
    `${apiBase}/api/users/me/configuration/banking/connections/:id/accounts`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.get(`${apiBase}/api/users/me/configuration/banking/providers`, () =>
    HttpResponse.json([
      {
        id: 'monobank',
        displayName: 'Monobank',
        supportsPull: true,
        supportsFile: false,
        countries: ['UA'],
        inUserCountry: true,
      },
      {
        id: 'privatbank',
        displayName: 'PrivatBank',
        supportsPull: false,
        supportsFile: true,
        countries: ['UA'],
        inUserCountry: true,
      },
    ] satisfies BankProviderDTO[]),
  ),
  http.put(`${apiBase}/api/users/me/configuration/banking`, async ({ request }) => {
    const body = (await request.json()) as UpdateBankingRequest;
    const banking: BankingConfigurationDTO = {
      expenseCategoryMap: body.expenseCategoryMap ?? {},
      incomeCategoryMap: body.incomeCategoryMap ?? {},
      contactMap: body.contactMap ?? {},
      connections: [],
    };
    return HttpResponse.json(banking);
  }),
  http.put(`${apiBase}/api/users/me/configuration/defaults`, async ({ request }) => {
    const body = (await request.json()) as UpdateDefaultsRequest;
    return HttpResponse.json({
      ...configurationFixture,
      defaults: {
        ...configurationFixture.defaults,
        ...(body.incomeCategory !== undefined ? { incomeCategory: body.incomeCategory } : {}),
        ...(body.expenseCategory !== undefined ? { expenseCategory: body.expenseCategory } : {}),
        ...(body.account !== undefined ? { account: body.account } : {}),
        ...(body.subtypeAccounts !== undefined ? { subtypeAccounts: body.subtypeAccounts } : {}),
      },
    });
  }),
  http.get(`${apiBase}/api/banking/connections/:id/external-accounts`, () =>
    HttpResponse.json(externalAccountsFixture),
  ),
  // Statement-based account discovery (file providers). The client sends a
  // multipart body (one or more `files` parts) with a `format` query param.
  // Validate the request shape the real backend requires, then return the
  // discovered accounts. Tests may override to assert the exact call.
  http.post(
    `${apiBase}/api/banking/connections/:id/external-accounts/from-file`,
    async ({ request }) => {
      const format = new URL(request.url).searchParams.get('format');
      const form = await request.formData();
      const files = form.getAll('files');
      if (!format || files.length === 0) {
        return HttpResponse.json(
          {
            code: 'INVALID_REQUEST',
            message: 'from-file discovery requires a `format` and at least one file part',
          },
          { status: 400 },
        );
      }
      return HttpResponse.json(externalAccountsFromFileFixture);
    },
  ),
  http.post(`${apiBase}/api/banking/connections/:id/import`, () =>
    HttpResponse.json({ accounts: [], unresolved: [] }),
  ),
  // Statement file upload — a multipart body carrying one or more `files` parts
  // and a `format` query param. Validate that shape, then reflect the uploaded
  // file count in the summary so multi-file imports are visibly distinct.
  http.post(`${apiBase}/api/banking/connections/:id/import/file`, async ({ request }) => {
    const format = new URL(request.url).searchParams.get('format');
    const form = await request.formData();
    const files = form.getAll('files');
    if (!format || files.length === 0) {
      return HttpResponse.json(
        {
          code: 'INVALID_REQUEST',
          message: 'file import requires a `format` and at least one file part',
        },
        { status: 400 },
      );
    }
    return HttpResponse.json({
      accounts: [
        {
          externalAccountId: 'ext-acc-1',
          localAccountId: accountFixture.id,
          // One imported transaction per uploaded statement file.
          importedCount: files.length,
          skipped: [],
          failureCount: 0,
        },
      ],
      unresolved: [],
    });
  }),
  http.post(
    `${apiBase}/api/users/me/change-password`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.delete(
    `${apiBase}/api/users/me/oauth/:provider`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.delete(`${apiBase}/api/users/me/telegram`, () => new HttpResponse(null, { status: 204 })),
  http.get(`${apiBase}/api/reports/spending-by-category`, () =>
    HttpResponse.json(spendingByCategoryFixture),
  ),
  http.get(`${apiBase}/api/reports/income-vs-expense`, () =>
    HttpResponse.json(incomeVsExpenseFixture),
  ),
  http.get(`${apiBase}/api/reports/net-worth`, () => HttpResponse.json(netWorthFixture)),
  http.post(`${apiBase}/api/prompt`, () =>
    HttpResponse.json({ kind: 'transactions', succeeded: [transactionFixture], failed: [] }),
  ),
  // Polled by useDataChangeSignal (tracker#45); a fixed value is enough for
  // suites that don't specifically exercise the polling/invalidation behavior.
  http.get(`${apiBase}/api/sync/version`, () => HttpResponse.json({ version: 1 })),
];
