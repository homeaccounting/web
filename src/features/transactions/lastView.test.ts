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
    writeLastView({ accountId: 'acc1', period: 'last-month', filters });
    expect(readLastView()).toEqual({ accountId: 'acc1', period: 'last-month', filters });
  });
  it('null when missing / corrupt / shape mismatch / bad period', () => {
    expect(readLastView()).toBeNull();
    localStorage.setItem(TX_LAST_VIEW_KEY, '{oops');
    expect(readLastView()).toBeNull();
    localStorage.setItem(TX_LAST_VIEW_KEY, JSON.stringify({ accountId: 'a' }));
    expect(readLastView()).toBeNull();
    localStorage.setItem(
      TX_LAST_VIEW_KEY,
      JSON.stringify({ accountId: 'a', period: 'weekly', filters }),
    );
    expect(readLastView()).toBeNull();
  });
  it('null when filters are malformed but account/period are valid', () => {
    localStorage.setItem(
      TX_LAST_VIEW_KEY,
      JSON.stringify({
        accountId: 'a',
        period: 'last-month',
        filters: { ...filters, labelIds: [1, 2] },
      }),
    );
    expect(readLastView()).toBeNull();
    localStorage.setItem(
      TX_LAST_VIEW_KEY,
      JSON.stringify({
        accountId: 'a',
        period: 'last-month',
        filters: { description: '', labelIds: [], category: '', contactId: '' },
      }),
    );
    expect(readLastView()).toBeNull();
    localStorage.setItem(
      TX_LAST_VIEW_KEY,
      JSON.stringify({ accountId: 'a', period: 'last-month', filters: 'nope' }),
    );
    expect(readLastView()).toBeNull();
  });
  it('round-trips a custom period with from/to and drops non-string from/to', () => {
    writeLastView({
      accountId: 'acc1',
      period: 'custom',
      from: '2026-03-01',
      to: '2026-03-31',
      filters,
    });
    expect(readLastView()).toEqual({
      accountId: 'acc1',
      period: 'custom',
      from: '2026-03-01',
      to: '2026-03-31',
      filters,
    });
    localStorage.setItem(
      TX_LAST_VIEW_KEY,
      JSON.stringify({ accountId: 'acc1', period: 'custom', from: 5, to: null, filters }),
    );
    expect(readLastView()).toEqual({ accountId: 'acc1', period: 'custom', filters });
  });
});
