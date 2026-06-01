import { http, HttpResponse } from 'msw';
import {
  accountFixture,
  authResponseFixture,
  configurationFixture,
  profileFixture,
  telegramLinkCodeFixture,
  transactionFixture,
} from './fixtures';

const apiBase = 'http://localhost:8080';

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
      transferType: 'Adjustment',
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
      transferType: 'Income',
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
      transferType: 'Expense',
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
      transferType: 'Transfer',
      category: null,
      date: '2026-06-01T00:00:00.000Z',
      labels: [],
    });
  }),
  http.get(`${apiBase}/api/transactions`, () =>
    HttpResponse.json({ transactions: [transactionFixture], totalCount: 1 }),
  ),
  http.get(`${apiBase}/api/users/me/configuration`, () => HttpResponse.json(configurationFixture)),
];
