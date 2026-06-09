import { http, HttpResponse } from 'msw';
import type {
  AddBankConnectionRequest,
  BankConnectionDTO,
  BankingConfigurationDTO,
  UpdateBankingRequest,
} from '@/api/types';
import {
  accountFixture,
  authResponseFixture,
  configurationFixture,
  externalAccountsFixture,
  profileFixture,
  telegramLinkCodeFixture,
  transactionFixture,
} from './fixtures';

const apiBase = 'http://localhost:8080';

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
        version: 1,
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
    }),
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
    });
  }),
  http.get(`${apiBase}/api/transactions`, () =>
    HttpResponse.json({ transactions: [transactionFixture], totalCount: 1 }),
  ),
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
  http.get(`${apiBase}/api/users/me/configuration`, () => HttpResponse.json(configurationFixture)),
  http.put(
    `${apiBase}/api/users/me/configuration/base-currency`,
    () => new HttpResponse(null, { status: 204 }),
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
  http.post(`${apiBase}/api/users/me/configuration/banking/connections`, async ({ request }) => {
    const body = (await request.json()) as AddBankConnectionRequest;
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
  http.put(`${apiBase}/api/users/me/configuration/banking`, async ({ request }) => {
    const body = (await request.json()) as UpdateBankingRequest;
    const banking: BankingConfigurationDTO = {
      defaultIncomeCategory: body.defaultIncomeCategory ?? null,
      defaultExpenseCategory: body.defaultExpenseCategory ?? null,
      mccExpenseCategoryMap: body.mccExpenseCategoryMap ?? {},
      connections: [],
    };
    return HttpResponse.json(banking);
  }),
  http.get(`${apiBase}/api/banking/connections/:id/external-accounts`, () =>
    HttpResponse.json(externalAccountsFixture),
  ),
  http.post(`${apiBase}/api/banking/connections/:id/resync`, () =>
    HttpResponse.json({ accounts: [] }),
  ),
  http.post(
    `${apiBase}/api/users/me/change-password`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.delete(
    `${apiBase}/api/users/me/oauth/:provider`,
    () => new HttpResponse(null, { status: 204 }),
  ),
  http.delete(`${apiBase}/api/users/me/telegram`, () => new HttpResponse(null, { status: 204 })),
];
