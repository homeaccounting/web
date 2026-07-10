import { describe, it, expect } from 'vitest';
import type { AccountResponse, AccountRole } from '@/api/types';
import { buildAccountGroups, OTHER_GROUP, SHARED_GROUP } from './accountGroups';

function acc(
  id: string,
  role: AccountRole,
  subtype: string | null,
  status: AccountResponse['status'] = 'Opened',
): AccountResponse {
  return {
    id,
    name: id,
    balance: 0,
    currency: 'USD',
    overdraftLimit: null,
    subtype: subtype ? { type: subtype } : null,
    status,
    role,
    version: 1,
  };
}

describe('buildAccountGroups', () => {
  it('groups owned accounts by subtype in canonical order, omitting empty groups', () => {
    const groups = buildAccountGroups([
      acc('b', 'owner', 'bankAccount'),
      acc('c', 'owner', 'cash'),
    ]);
    // cash precedes bankAccount in ACCOUNT_SUBTYPE_TYPES; eWallet/asset/loan omitted.
    expect(groups.map((g) => g.key)).toEqual(['cash', 'bankAccount']);
  });

  it('collects owned accounts with unknown/absent subtype into the Other group', () => {
    const groups = buildAccountGroups([
      acc('n', 'owner', null),
      acc('u', 'owner', 'somethingUnknown'),
    ]);
    const other = groups.find((g) => g.key === OTHER_GROUP.key);
    expect(other?.accounts.map((a) => a.id)).toEqual(['n', 'u']);
  });

  it('adds a trailing Shared-with-me group for shared accounts, excluding owned', () => {
    const groups = buildAccountGroups([
      acc('mine', 'owner', 'cash'),
      acc('ed', 'editor', 'bankAccount'),
      acc('vw', 'viewer', 'cash'),
    ]);
    // trailing group is the synthetic "Shared with me"
    expect(groups.at(-1)?.key).toBe(SHARED_GROUP.key);
    const shared = groups.find((g) => g.key === SHARED_GROUP.key);
    expect(shared).toBeDefined();
    expect(shared?.label).toBe(SHARED_GROUP.label);
    expect(shared?.accounts.map((a) => a.id)).toEqual(['ed', 'vw']);
    // owned account is in a subtype group, never in "Shared with me"
    expect(shared?.accounts.some((a) => a.id === 'mine')).toBe(false);
  });

  it('omits the Shared-with-me group when there are no shared accounts', () => {
    const groups = buildAccountGroups([acc('mine', 'owner', 'cash')]);
    expect(groups.some((g) => g.key === SHARED_GROUP.key)).toBe(false);
  });

  it('places a shared account with a known subtype under Shared-with-me, not its subtype group', () => {
    const groups = buildAccountGroups([acc('ed', 'editor', 'cash')]);
    expect(groups.map((g) => g.key)).toEqual([SHARED_GROUP.key]);
  });
});
