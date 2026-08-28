// Store-backed MSW handlers for the demo world (VITE_DEMO=1, issue #62). Thin
// adapters: parse the request, call the matching DemoStore method, return
// what the store gives back. Mirrors the exact paths/methods of the static
// src/test/handlers.ts (that file stays stateless — this one is stateful, so
// writes made through one endpoint are visible on the next read).
import { http, HttpResponse, type RequestHandler } from 'msw';
import type {
  AccountResponse,
  AddConnectionRequest,
  BankConnectionDTO,
  ChangeCountryRequest,
  ChangeCurrencyRequest,
  ChangeLanguageRequest,
  CreateAccountRequest,
  PromptResponse,
  TransactionResponse,
} from '@/api/types';
import {
  authResponseFixture,
  externalAccountsFromFileFixture,
  localizationOptionsFixture,
} from '@/test/fixtures';
import type {
  DemoAddExpenseRequest,
  DemoAddIncomeRequest,
  DemoAddTransferRequest,
  DemoStore,
} from './store';

const apiBase = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080';

// Both banking import endpoints (file upload and pull-sync) fake the same
// small, realistic result: one expense and one income against the first
// seeded account, so ids/dates/currency come from the store's own monotonic
// counters and AS_OF fallback rather than ad-hoc literals.
function synthesizeImportedTransactions(store: DemoStore, targetAccountId: string): void {
  store.addExpense({
    accountId: targetAccountId,
    description: 'Imported: Grocery store',
    allocations: { expenses: [{ category: 'groceries', amount: 250 }], incomes: [] },
  });
  store.addIncome({
    accountId: targetAccountId,
    description: 'Imported: Salary',
    allocations: { expenses: [], incomes: [{ category: 'salary', amount: 1500 }] },
  });
}

export function makeDemoHandlers(store: DemoStore): RequestHandler[] {
  return [
    // --- auth ---
    http.post(`${apiBase}/api/auth/register`, () => HttpResponse.json(authResponseFixture)),
    http.post(`${apiBase}/api/auth/login`, () => HttpResponse.json(authResponseFixture)),
    http.post(`${apiBase}/api/auth/refresh`, () => HttpResponse.json(authResponseFixture)),

    // --- profile ---
    http.get(`${apiBase}/api/users/me`, () => HttpResponse.json(store.getProfile())),

    // --- accounts ---
    http.get(`${apiBase}/api/accounts`, () => HttpResponse.json(store.listAccounts())),
    http.post(`${apiBase}/api/accounts`, async ({ request }) => {
      const body = (await request.json()) as CreateAccountRequest;
      const account: AccountResponse = store.createAccount({
        name: body.name,
        initialBalance: body.initialBalance,
        currency: body.currency,
        subtype: (body.subtype as AccountResponse['subtype']) ?? null,
      });
      return HttpResponse.json(account, { status: 201 });
    }),

    // --- transactions ---
    http.get(`${apiBase}/api/transactions`, ({ request }) =>
      HttpResponse.json(store.listTransactions(new URL(request.url))),
    ),
    http.post(`${apiBase}/api/transactions/expense`, async ({ request }) => {
      const body = (await request.json()) as DemoAddExpenseRequest;
      return HttpResponse.json(store.addExpense(body));
    }),
    http.post(`${apiBase}/api/transactions/income`, async ({ request }) => {
      const body = (await request.json()) as DemoAddIncomeRequest;
      return HttpResponse.json(store.addIncome(body));
    }),
    http.post(`${apiBase}/api/transactions/transfer`, async ({ request }) => {
      const body = (await request.json()) as DemoAddTransferRequest;
      return HttpResponse.json(store.addTransfer(body));
    }),

    // --- prompt (freeform capture) ---
    // Minimal parse: treat the whole prompt text as the expense description
    // and pull the last number in it out as the amount (e.g. 'lunch 12.00' ->
    // 12) — good enough for demo flows exercising the prompt UI without a
    // real NLU backend.
    http.post(`${apiBase}/api/prompt`, async ({ request }) => {
      const body = (await request.json()) as { text: string; account: string };
      const amounts = body.text.match(/\d+(\.\d+)?/g);
      const amount = amounts ? Number(amounts[amounts.length - 1]) : 0;
      const tx: TransactionResponse = store.addExpense({
        accountId: body.account,
        description: body.text,
        allocations: { expenses: [{ category: 'misc', amount }], incomes: [] },
      });
      const result: PromptResponse = { kind: 'transactions', succeeded: [tx], failed: [] };
      return HttpResponse.json(result);
    }),

    // --- configuration ---
    http.get(`${apiBase}/api/users/me/configuration`, () =>
      HttpResponse.json(store.getConfiguration()),
    ),
    // Country/language option lists that populate the onboarding + profile selects.
    http.get(`${apiBase}/api/users/me/configuration/localization-options`, () =>
      HttpResponse.json(localizationOptionsFixture),
    ),
    http.put(`${apiBase}/api/users/me/configuration/country`, async ({ request }) => {
      const body = (await request.json()) as ChangeCountryRequest;
      store.setCountry(body.country);
      return new HttpResponse(null, { status: 204 });
    }),
    http.put(`${apiBase}/api/users/me/configuration/language`, async ({ request }) => {
      const body = (await request.json()) as ChangeLanguageRequest;
      store.setLanguage(body.language);
      return new HttpResponse(null, { status: 204 });
    }),
    http.put(`${apiBase}/api/users/me/configuration/base-currency`, async ({ request }) => {
      const body = (await request.json()) as ChangeCurrencyRequest;
      store.setBaseCurrency(body.currency);
      return new HttpResponse(null, { status: 204 });
    }),
    // No store setter for default currency (not exercised by any demo flow) —
    // ack the write without persisting it, mirroring src/test/handlers.ts.
    http.put(
      `${apiBase}/api/users/me/configuration/default-currency`,
      () => new HttpResponse(null, { status: 204 }),
    ),

    // --- banking (gated behind config.bankingFeatureEnabled, true in the populated seed) ---
    http.get(`${apiBase}/api/users/me/configuration/banking/providers`, () =>
      HttpResponse.json(store.listProviders()),
    ),
    http.post(`${apiBase}/api/users/me/configuration/banking/connections`, async ({ request }) => {
      const body = (await request.json()) as AddConnectionRequest;
      const connection: BankConnectionDTO = {
        id: 'demo-conn-new',
        provider: body.provider,
        name: body.name,
        enabled: body.enabled,
        tokenSet: true,
        tokenHint: body.token ? body.token.slice(-4) : '0000',
        accountMap: {},
      };
      return HttpResponse.json(connection, { status: 201 });
    }),
    http.get(`${apiBase}/api/banking/connections/:id/external-accounts`, () =>
      HttpResponse.json(store.listExternalAccounts()),
    ),
    http.post(`${apiBase}/api/banking/connections/:id/external-accounts/from-file`, () =>
      HttpResponse.json(externalAccountsFromFileFixture),
    ),
    http.post(`${apiBase}/api/banking/connections/:id/import/file`, () => {
      const targetAccountId = store.listAccounts().accounts[0]?.id ?? 'a1';
      synthesizeImportedTransactions(store, targetAccountId);
      return HttpResponse.json({
        accounts: store.listExternalAccounts().map((ext) => ({
          externalAccountId: ext.externalId,
          localAccountId: targetAccountId,
          importedCount: 1,
          skipped: [],
          failureCount: 0,
        })),
        unresolved: [],
      });
    }),
    // Pull-sync import ("Sync Now"), distinct from the file-based import above:
    // no multipart body, just a date-window pull against the provider. Mirrors
    // the trivial envelope src/test/handlers.ts returns for this endpoint, but
    // synthesizes a couple of transactions (via the store, so ids/dates/currency
    // stay deterministic) so the sync has a visible effect.
    http.post(`${apiBase}/api/banking/connections/:id/import`, () => {
      const targetAccountId = store.listAccounts().accounts[0]?.id ?? 'a1';
      synthesizeImportedTransactions(store, targetAccountId);
      return HttpResponse.json({ accounts: [], unresolved: [] });
    }),

    // --- reports (static seed projections, never recomputed from mutations) ---
    http.get(`${apiBase}/api/reports/spending-by-category`, () =>
      HttpResponse.json(store.getSpendingByCategory()),
    ),
    http.get(`${apiBase}/api/reports/income-vs-expense`, () =>
      HttpResponse.json(store.getIncomeVsExpense()),
    ),
    http.get(`${apiBase}/api/reports/net-worth`, () => HttpResponse.json(store.getNetWorth())),
  ];
}
