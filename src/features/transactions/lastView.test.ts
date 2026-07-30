import { describe, it, expect, beforeEach } from 'vitest';
import { readLastView, writeLastView, TX_LAST_VIEW_KEY } from './lastView';

const filters = {
  description: 'x',
  labelIds: ['a'],
  category: 'Food',
  contactId: '',
  showCancelledFailed: false,
};

describe('transactions lastView', () => {
  beforeEach(() => localStorage.clear());
  it('round-trips', () => {
    writeLastView({ accounts: ['acc1'], period: 'last-month', filters });
    expect(readLastView()).toEqual({ accounts: ['acc1'], period: 'last-month', filters });
  });
  it('null when missing / corrupt / shape mismatch / bad period', () => {
    expect(readLastView()).toBeNull();
    localStorage.setItem(TX_LAST_VIEW_KEY, '{oops');
    expect(readLastView()).toBeNull();
    localStorage.setItem(TX_LAST_VIEW_KEY, JSON.stringify({ accounts: ['a'] }));
    expect(readLastView()).toBeNull();
    localStorage.setItem(
      TX_LAST_VIEW_KEY,
      JSON.stringify({ accounts: ['a'], period: 'weekly', filters }),
    );
    expect(readLastView()).toBeNull();
  });
  it('null when filters are malformed but account/period are valid', () => {
    localStorage.setItem(
      TX_LAST_VIEW_KEY,
      JSON.stringify({
        accounts: ['a'],
        period: 'last-month',
        filters: { ...filters, labelIds: [1, 2] },
      }),
    );
    expect(readLastView()).toBeNull();
    localStorage.setItem(
      TX_LAST_VIEW_KEY,
      JSON.stringify({
        accounts: ['a'],
        period: 'last-month',
        filters: { description: '', labelIds: [], category: '', contactId: '' },
      }),
    );
    expect(readLastView()).toBeNull();
    localStorage.setItem(
      TX_LAST_VIEW_KEY,
      JSON.stringify({ accounts: ['a'], period: 'last-month', filters: 'nope' }),
    );
    expect(readLastView()).toBeNull();
  });
  it('round-trips a custom period with from/to and drops non-string from/to', () => {
    writeLastView({
      accounts: ['acc1'],
      period: 'custom',
      from: '2026-03-01',
      to: '2026-03-31',
      filters,
    });
    expect(readLastView()).toEqual({
      accounts: ['acc1'],
      period: 'custom',
      from: '2026-03-01',
      to: '2026-03-31',
      filters,
    });
    localStorage.setItem(
      TX_LAST_VIEW_KEY,
      JSON.stringify({ accounts: ['acc1'], period: 'custom', from: 5, to: null, filters }),
    );
    expect(readLastView()).toEqual({ accounts: ['acc1'], period: 'custom', filters });
  });
});

const EMPTY_FILTERS = {
  description: '',
  labelIds: [],
  category: '',
  contactId: '',
  showCancelledFailed: false,
};

describe('lastView scope migration', () => {
  beforeEach(() => localStorage.clear());

  it('reads a stored all-accounts scope', () => {
    writeLastView({ accounts: 'all', period: 'this-month', filters: EMPTY_FILTERS });
    expect(readLastView()?.accounts).toBe('all');
  });

  it('reads a stored subset scope', () => {
    writeLastView({ accounts: ['a1', 'a2'], period: 'this-month', filters: EMPTY_FILTERS });
    expect(readLastView()?.accounts).toEqual(['a1', 'a2']);
  });

  it('migrates the legacy { accountId } shape to a one-element subset', () => {
    localStorage.setItem(
      TX_LAST_VIEW_KEY,
      JSON.stringify({ accountId: 'a9', period: 'this-month', filters: EMPTY_FILTERS }),
    );
    expect(readLastView()?.accounts).toEqual(['a9']);
  });

  it('returns null when the stored accounts is an empty array', () => {
    localStorage.setItem(
      TX_LAST_VIEW_KEY,
      JSON.stringify({ accounts: [], period: 'this-month', filters: EMPTY_FILTERS }),
    );
    expect(readLastView()).toBeNull();
  });

  it('returns null when neither accounts nor accountId is present', () => {
    localStorage.setItem(
      TX_LAST_VIEW_KEY,
      JSON.stringify({ period: 'this-month', filters: EMPTY_FILTERS }),
    );
    expect(readLastView()).toBeNull();
  });
});
