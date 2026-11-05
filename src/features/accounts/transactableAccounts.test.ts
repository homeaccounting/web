import { describe, it, expect } from 'vitest';
import type { AccountResponse, AccountRole, AccountStatus } from '@/api/types';
import { canRecordOn, defaultRecordAccount, transactableAccounts } from './transactableAccounts';

function acc(
  id: string,
  status: AccountStatus = 'Opened',
  role: AccountRole = 'owner',
): AccountResponse {
  return {
    id,
    name: id,
    balance: 0,
    currency: 'UAH',
    overdraftLimit: null,
    subtype: { type: 'cash' },
    status,
    role,
    version: 1,
  };
}

const owned = acc('owned');
const edited = acc('edited', 'Opened', 'editor');
const viewed = acc('viewed', 'Opened', 'viewer');
const closed = acc('closed', 'Closed');
const all = [owned, edited, viewed, closed];

describe('canRecordOn', () => {
  it('allows open accounts the user owns or edits', () => {
    expect(canRecordOn(owned)).toBe(true);
    expect(canRecordOn(edited)).toBe(true);
  });

  it('rejects view-only and closed accounts', () => {
    expect(canRecordOn(viewed)).toBe(false);
    expect(canRecordOn(closed)).toBe(false);
  });
});

describe('transactableAccounts', () => {
  it('keeps only eligible accounts, in order', () => {
    expect(transactableAccounts(all).map((a) => a.id)).toEqual(['owned', 'edited']);
  });

  it('keeps an ineligible account that is already selected', () => {
    expect(transactableAccounts(all, ['closed']).map((a) => a.id)).toEqual([
      'owned',
      'edited',
      'closed',
    ]);
  });

  it('ignores empty keep ids', () => {
    expect(transactableAccounts(all, ['']).map((a) => a.id)).toEqual(['owned', 'edited']);
  });
});

describe('defaultRecordAccount', () => {
  it('prefers the given account when it is eligible', () => {
    expect(defaultRecordAccount(all, 'edited')?.id).toBe('edited');
  });

  it('falls back to the first eligible account when the preferred one is not', () => {
    expect(defaultRecordAccount(all, 'viewed')?.id).toBe('owned');
    expect(defaultRecordAccount(all)?.id).toBe('owned');
  });

  it('skips the excluded account', () => {
    expect(defaultRecordAccount(all, undefined, 'owned')?.id).toBe('edited');
  });

  it('returns undefined when nothing is eligible', () => {
    expect(defaultRecordAccount([viewed, closed])).toBeUndefined();
  });
});
