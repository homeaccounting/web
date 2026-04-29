import { http, HttpResponse } from 'msw';
import {
  accountFixture,
  authResponseFixture,
  profileFixture,
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
  http.get(`${apiBase}/api/users/me`, () => HttpResponse.json(profileFixture)),
  http.get(`${apiBase}/api/accounts`, () =>
    HttpResponse.json({ accounts: [accountFixture], totalCount: 1 }),
  ),
  http.get(`${apiBase}/api/transactions`, () =>
    HttpResponse.json({ transactions: [transactionFixture], totalCount: 1 }),
  ),
];
