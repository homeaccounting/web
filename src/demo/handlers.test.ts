import { describe, it, expect } from 'vitest';
import { server } from '@/test/server';
import type { AccountResponse, ConfigurationResponse, TransactionResponse } from '@/api/types';
import { DemoStore } from './store';
import { makeDemoHandlers } from './handlers';
import { AS_OF } from './seed';

const store = new DemoStore('populated');
const base = 'http://localhost:8080';
const DAY_MS = 24 * 60 * 60 * 1000;

// Register demo handlers on the shared MSW server (server.use prepends, so
// these win over src/test/handlers.ts for the paths they both define). The
// global src/test/setup.ts owns listen()/close() and resets handlers after
// each test, so this file must not spin up its own server.
describe('demo handlers', () => {
  it('POST expense then GET transactions reflects the new row', async () => {
    server.use(...makeDemoHandlers(store));
    const accountsBody = (await (await fetch(`${base}/api/accounts`)).json()) as {
      accounts: AccountResponse[];
    };
    const acct = accountsBody.accounts[0]!;
    await fetch(`${base}/api/transactions/expense`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        accountId: acct.id,
        description: 'Museum',
        date: '2026-06-15T10:00:00.000Z',
        allocations: { expenses: [{ category: 'food', amount: 12 }], incomes: [] },
      }),
    });
    const list = (await (await fetch(`${base}/api/transactions?limit=50&offset=0`)).json()) as {
      transactions: TransactionResponse[];
    };
    expect(list.transactions[0]!.description).toBe('Museum');
  });

  it('serves configuration at /api/users/me/configuration', async () => {
    server.use(...makeDemoHandlers(store));
    const cfg = (await (
      await fetch(`${base}/api/users/me/configuration`)
    ).json()) as ConfigurationResponse;
    expect(cfg.bankingFeatureEnabled).toBe(true);
  });

  it('granular onboarding write is reflected on the next config GET', async () => {
    const fresh = new DemoStore('fresh');
    server.use(...makeDemoHandlers(fresh));
    await fetch(`${base}/api/users/me/configuration/country`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ country: 'UA' }),
    });
    const cfg = (await (
      await fetch(`${base}/api/users/me/configuration`)
    ).json()) as ConfigurationResponse;
    expect(cfg.country).toBe('UA');
  });

  it('POST import/file synthesizes deterministic transactions dated within 30 days of AS_OF', async () => {
    server.use(...makeDemoHandlers(store));
    const form = new FormData();
    form.append(
      'files',
      new File(['date,amount\n2026-06-01,-12.00'], 'jan.csv', {
        type: 'text/csv',
      }),
    );
    await fetch(`${base}/api/banking/connections/conn-1/import/file?format=csv`, {
      method: 'POST',
      body: form,
    });
    const list = (await (await fetch(`${base}/api/transactions?limit=50&offset=0`)).json()) as {
      transactions: TransactionResponse[];
    };
    const imported = list.transactions.filter((t) => t.description.startsWith('Imported: '));
    expect(imported.length).toBeGreaterThanOrEqual(2);
    const asOfMs = Date.parse(AS_OF);
    for (const t of imported) {
      const ts = Date.parse(t.date);
      expect(ts).toBeLessThanOrEqual(asOfMs);
      expect(ts).toBeGreaterThanOrEqual(asOfMs - 30 * DAY_MS);
    }
  });

  it('POST import (pull-sync) synthesizes a transaction with a sane amount', async () => {
    server.use(...makeDemoHandlers(store));
    await fetch(`${base}/api/banking/connections/conn-1/import`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ from: '2026-05-08T00:00:00.000Z', to: '2026-06-07T00:00:00.000Z' }),
    });
    const list = (await (await fetch(`${base}/api/transactions?limit=50&offset=0`)).json()) as {
      transactions: TransactionResponse[];
    };
    const synced = list.transactions.find((t) => t.description === 'Imported: Salary');
    expect(synced).toBeDefined();
    expect(Math.abs(synced!.sourceAmount)).toBeLessThan(100000);
  });
});
