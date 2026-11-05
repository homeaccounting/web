import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  RECENT_ACCOUNTS_KEY,
  readRecentAccounts,
  recentAccountIds,
  recordRecentAccount,
} from './recentAccounts';

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('recentAccounts', () => {
  it('keeps the three most recent accounts per kind, newest first', () => {
    for (const id of ['a', 'b', 'c', 'a', 'd']) recordRecentAccount('expense', id);
    recordRecentAccount('income', 'z');
    expect(readRecentAccounts('expense')).toEqual(['d', 'a', 'c']);
    expect(readRecentAccounts('income')).toEqual(['z']);
    expect(readRecentAccounts('transferSource')).toEqual([]);
  });

  it('puts the profile default first without repeating it', () => {
    recordRecentAccount('expense', 'a');
    recordRecentAccount('expense', 'def');
    expect(recentAccountIds('expense', 'def')).toEqual(['def', 'a']);
    expect(recentAccountIds('expense', null)).toEqual(['def', 'a']);
    expect(recentAccountIds('income', 'def')).toEqual(['def']);
  });

  it('reads a corrupt store as empty', () => {
    localStorage.setItem(RECENT_ACCOUNTS_KEY, '{not json');
    expect(readRecentAccounts('expense')).toEqual([]);
    localStorage.setItem(RECENT_ACCOUNTS_KEY, JSON.stringify({ expense: 'a', income: [1, 'b'] }));
    expect(readRecentAccounts('expense')).toEqual([]);
    expect(readRecentAccounts('income')).toEqual(['b']);
  });

  it('degrades to no recent accounts when storage is blocked', () => {
    const blocked = () => {
      throw new Error('blocked');
    };
    vi.stubGlobal('localStorage', { getItem: blocked, setItem: blocked });
    expect(() => recordRecentAccount('expense', 'a')).not.toThrow();
    expect(recentAccountIds('expense')).toEqual([]);
  });
});
