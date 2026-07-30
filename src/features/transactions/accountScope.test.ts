import { describe, expect, it } from 'vitest';
import type { AccountResponse, TransactionResponse } from '@/api/types';
import {
  accountsOf,
  isSingleAccount,
  parseAccountScope,
  scopeSpansMultiple,
  scopeToParam,
  transactionInScope,
  withAccountScope,
} from './accountScope';

const acct = (id: string): AccountResponse => ({ id }) as AccountResponse;
const accounts = [acct('a1'), acct('a2'), acct('a3')];
const params = (s: string) => new URLSearchParams(s);

const tx = (over: Partial<TransactionResponse>): TransactionResponse =>
  ({
    id: 't',
    transactionType: 'expense',
    status: 'Completed',
    sourceAccountId: 'a1',
    targetAccountId: 'external',
    ...over,
  }) as TransactionResponse;

describe('parseAccountScope', () => {
  it('treats a missing param as all accounts', () => {
    expect(parseAccountScope(params(''), accounts)).toEqual({ kind: 'all' });
  });
  it('parses a single id', () => {
    expect(parseAccountScope(params('accounts=a1'), accounts)).toEqual({
      kind: 'accounts',
      ids: ['a1'],
    });
  });
  it('parses and dedupes a subset', () => {
    expect(parseAccountScope(params('accounts=a1,a2,a1'), accounts)).toEqual({
      kind: 'accounts',
      ids: ['a1', 'a2'],
    });
  });
  it('drops ids not in the user accounts', () => {
    expect(parseAccountScope(params('accounts=a1,ghost'), accounts)).toEqual({
      kind: 'accounts',
      ids: ['a1'],
    });
  });
  it('falls back to all when a subset filters down to empty', () => {
    expect(parseAccountScope(params('accounts=ghost'), accounts)).toEqual({ kind: 'all' });
  });
  it('keeps raw ids unfiltered while accounts are still loading (undefined)', () => {
    expect(parseAccountScope(params('accounts=a1,ghost'), undefined)).toEqual({
      kind: 'accounts',
      ids: ['a1', 'ghost'],
    });
  });
});

describe('scopeToParam / withAccountScope', () => {
  it('serialises all as null and a subset as a csv', () => {
    expect(scopeToParam({ kind: 'all' })).toBeNull();
    expect(scopeToParam({ kind: 'accounts', ids: ['a1', 'a2'] })).toBe('a1,a2');
  });
  it('overrides (not merges) the accounts param and preserves others', () => {
    const next = withAccountScope(params('accounts=a3&period=this-year'), {
      kind: 'accounts',
      ids: ['a1'],
    });
    expect(next.get('accounts')).toBe('a1');
    expect(next.get('period')).toBe('this-year');
  });
  it('deletes the param for all', () => {
    const next = withAccountScope(params('accounts=a3&period=this-year'), { kind: 'all' });
    expect(next.get('accounts')).toBeNull();
    expect(next.get('period')).toBe('this-year');
  });
});

describe('isSingleAccount / scopeSpansMultiple', () => {
  it('returns the sole id only for a one-element subset', () => {
    expect(isSingleAccount({ kind: 'accounts', ids: ['a1'] })).toBe('a1');
    expect(isSingleAccount({ kind: 'accounts', ids: ['a1', 'a2'] })).toBeNull();
    expect(isSingleAccount({ kind: 'all' })).toBeNull();
  });
  it('spans multiple for all or a 2+ subset', () => {
    expect(scopeSpansMultiple({ kind: 'all' })).toBe(true);
    expect(scopeSpansMultiple({ kind: 'accounts', ids: ['a1', 'a2'] })).toBe(true);
    expect(scopeSpansMultiple({ kind: 'accounts', ids: ['a1'] })).toBe(false);
  });
});

describe('accountsOf / transactionInScope', () => {
  it('income touches the target, expense the source, transfer both', () => {
    expect(accountsOf(tx({ transactionType: 'income', targetAccountId: 'a2' }))).toEqual(['a2']);
    expect(accountsOf(tx({ transactionType: 'expense', sourceAccountId: 'a1' }))).toEqual(['a1']);
    expect(
      accountsOf(tx({ transactionType: 'transfer', sourceAccountId: 'a1', targetAccountId: 'a2' })),
    ).toEqual(['a1', 'a2']);
  });
  it('is always true for all scope; intersects ids otherwise', () => {
    const t = tx({ transactionType: 'transfer', sourceAccountId: 'a1', targetAccountId: 'a2' });
    expect(transactionInScope(t, { kind: 'all' })).toBe(true);
    expect(transactionInScope(t, { kind: 'accounts', ids: ['a2'] })).toBe(true);
    expect(transactionInScope(t, { kind: 'accounts', ids: ['a3'] })).toBe(false);
  });
});
