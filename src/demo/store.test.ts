import { describe, it, expect, beforeEach } from 'vitest';
import { DemoStore } from './store';

let store: DemoStore;
beforeEach(() => {
  store = new DemoStore('populated');
});

describe('DemoStore', () => {
  it('lists the seeded accounts', () => {
    expect(store.listAccounts().accounts.length).toBeGreaterThanOrEqual(3);
  });

  it('createAccount persists and appears in listAccounts', () => {
    const before = store.listAccounts().totalCount;
    const created = store.createAccount({
      name: 'Vacation',
      initialBalance: 100,
      currency: 'EUR',
      subtype: { type: 'cash' },
    });
    expect(created.name).toBe('Vacation');
    const after = store.listAccounts();
    expect(after.totalCount).toBe(before + 1);
    expect(after.accounts.some((a) => a.id === created.id)).toBe(true);
  });

  it('addExpense persists and appears at the top of listTransactions', () => {
    const acct = store.listAccounts().accounts[0]!;
    const before = store.listTransactions(new URL('http://x/?limit=50&offset=0')).totalCount;
    store.addExpense({
      accountId: acct.id,
      description: 'Coffee',
      date: '2026-06-15T09:00:00.000Z',
      allocations: { expenses: [{ category: 'food', amount: 4.5 }], incomes: [] },
    });
    const list = store.listTransactions(new URL('http://x/?limit=50&offset=0'));
    expect(list.totalCount).toBe(before + 1);
    expect(list.transactions[0]!.description).toBe('Coffee');
  });

  it('fresh variant starts empty', () => {
    const fresh = new DemoStore('fresh');
    expect(fresh.listAccounts().totalCount).toBe(0);
    expect(fresh.listTransactions(new URL('http://x/?limit=50&offset=0')).totalCount).toBe(0);
  });

  it('getConfiguration reflects granular onboarding writes', () => {
    const fresh = new DemoStore('fresh');
    fresh.setCountry('UA');
    fresh.setLanguage('uk');
    const cfg = fresh.getConfiguration();
    expect(cfg.country).toBe('UA');
    expect(cfg.language).toBe('uk');
  });

  it('reports come straight from the seed (not recomputed from mutations)', () => {
    const before = store.getNetWorth();
    store.addExpense({
      accountId: store.listAccounts().accounts[0]!.id,
      description: 'X',
      date: '2026-06-15T09:00:00.000Z',
      allocations: { expenses: [{ category: 'food', amount: 9999 }], incomes: [] },
    });
    expect(store.getNetWorth()).toEqual(before); // static, deliberately
  });
});
