import { describe, it, expect } from 'vitest';
import type { AccountResponse, AccountRole } from '@/api/types';
import { buildAccountGroups, OTHER_GROUP, SHARED_GROUP } from './accountGroups';

function acc(
  id: string,
  role: AccountRole,
  subtype: string | null,
  status: AccountResponse['status'] = 'Opened',
  subtypeExtra?: Record<string, unknown>,
): AccountResponse {
  return {
    id,
    name: id,
    balance: 0,
    currency: 'USD',
    overdraftLimit: null,
    subtype: subtype ? { type: subtype, ...subtypeExtra } : null,
    status,
    role,
    version: 1,
  };
}

// Convenience: an owned bank account carrying an optional bankName.
function bank(id: string, bankName?: string): AccountResponse {
  return acc(id, 'owner', 'bankAccount', 'Opened', bankName ? { bankName } : undefined);
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

describe('buildAccountGroups — bank-name sub-grouping', () => {
  const bankGroup = (groups: ReturnType<typeof buildAccountGroups>) =>
    groups.find((g) => g.key === 'bankAccount');

  it('keeps the Bank account section a flat leaf at or below the threshold (5)', () => {
    const groups = buildAccountGroups([
      bank('a', 'Alpha'),
      bank('b', 'Beta'),
      bank('c', 'Alpha'),
      bank('d', 'Beta'),
      bank('e', 'Alpha'),
    ]);
    const bg = bankGroup(groups);
    expect(bg?.subgroups).toBeUndefined();
    expect(bg?.accounts.map((a) => a.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('sub-groups by bankName above the threshold, sorted alphabetically, accounts in backend order', () => {
    const groups = buildAccountGroups([
      bank('z1', 'Zebra'),
      bank('a1', 'Alpha'),
      bank('z2', 'Zebra'),
      bank('a2', 'Alpha'),
      bank('a3', 'Alpha'),
      bank('z3', 'Zebra'),
    ]);
    const bg = bankGroup(groups);
    // Parent group has no direct accounts; it delegates to subgroups.
    expect(bg?.accounts).toEqual([]);
    expect(bg?.subgroups?.map((s) => s.key)).toEqual(['bankAccount:Alpha', 'bankAccount:Zebra']);
    expect(bg?.subgroups?.map((s) => s.label)).toEqual(['Alpha', 'Zebra']);
    const alpha = bg?.subgroups?.find((s) => s.label === 'Alpha');
    // preserves backend order within the sub-group
    expect(alpha?.accounts.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('collects bank accounts with no bankName into a trailing "Other" sub-group', () => {
    const groups = buildAccountGroups([
      bank('a1', 'Alpha'),
      bank('n1'),
      bank('a2', 'Alpha'),
      bank('a3', 'Alpha'),
      bank('n2'),
      bank('a4', 'Alpha'),
    ]);
    const bg = bankGroup(groups);
    expect(bg?.subgroups?.map((s) => s.label)).toEqual(['Alpha', 'Other']);
    const other = bg?.subgroups?.at(-1);
    expect(other?.label).toBe('Other');
    expect(other?.accounts.map((a) => a.id)).toEqual(['n1', 'n2']);
  });

  it('treats a blank or non-string bankName as no bankName (defensive read)', () => {
    const groups = buildAccountGroups([
      bank('a1', 'Alpha'),
      bank('a2', 'Alpha'),
      bank('a3', 'Alpha'),
      bank('a4', 'Alpha'),
      acc('blank', 'owner', 'bankAccount', 'Opened', { bankName: '  ' }),
      acc('num', 'owner', 'bankAccount', 'Opened', { bankName: 123 }),
    ]);
    const bg = bankGroup(groups);
    const other = bg?.subgroups?.find((s) => s.label === 'Other');
    expect(other?.accounts.map((a) => a.id)).toEqual(['blank', 'num']);
  });

  it('stays flat above the threshold when only one distinct bank bucket exists', () => {
    const groups = buildAccountGroups([
      bank('a', 'Alpha'),
      bank('b', 'Alpha'),
      bank('c', 'Alpha'),
      bank('d', 'Alpha'),
      bank('e', 'Alpha'),
      bank('f', 'Alpha'),
    ]);
    const bg = bankGroup(groups);
    expect(bg?.subgroups).toBeUndefined();
    expect(bg?.accounts).toHaveLength(6);
  });

  it('never sub-groups the synthetic Other group (unknown subtypes), even with many accounts', () => {
    const groups = buildAccountGroups(
      Array.from({ length: 8 }, (_, i) => acc(`u${i}`, 'owner', 'mysteryKind')),
    );
    const other = groups.find((g) => g.key === OTHER_GROUP.key);
    expect(other?.subgroups).toBeUndefined();
    expect(other?.accounts).toHaveLength(8);
  });

  it('does not treat shared bank accounts as owned when sub-grouping', () => {
    // 6 owned + shared ones; shared stay in the Shared-with-me group untouched.
    const groups = buildAccountGroups([
      bank('a1', 'Alpha'),
      bank('a2', 'Alpha'),
      bank('a3', 'Alpha'),
      bank('z1', 'Zebra'),
      bank('z2', 'Zebra'),
      bank('z3', 'Zebra'),
      acc('shared', 'editor', 'bankAccount', 'Opened', { bankName: 'Alpha' }),
    ]);
    const bg = bankGroup(groups);
    expect(bg?.subgroups?.flatMap((s) => s.accounts.map((a) => a.id))).not.toContain('shared');
    const shared = groups.find((g) => g.key === SHARED_GROUP.key);
    expect(shared?.accounts.map((a) => a.id)).toEqual(['shared']);
  });
});

describe('buildAccountGroups — sub-grouping of other account kinds', () => {
  const groupFor = (groups: ReturnType<typeof buildAccountGroups>, key: string) =>
    groups.find((g) => g.key === key);

  const many = (kind: string, field: string, values: string[]) =>
    buildAccountGroups(
      values.map((v, i) => acc(`${kind}${i}`, 'owner', kind, 'Opened', { [field]: v })),
    );

  it('sub-groups e-wallets by provider above the threshold', () => {
    const groups = many('eWallet', 'provider', [
      'Revolut',
      'PayPal',
      'Revolut',
      'PayPal',
      'PayPal',
      'Revolut',
    ]);
    const g = groupFor(groups, 'eWallet');
    expect(g?.subgroups?.map((s) => s.key)).toEqual(['eWallet:PayPal', 'eWallet:Revolut']);
    expect(g?.subgroups?.map((s) => s.label)).toEqual(['PayPal', 'Revolut']);
  });

  it('sub-groups loans by lender and cash by storage location', () => {
    const loans = many('loan', 'lender', ['B', 'A', 'B', 'A', 'B', 'A']);
    expect(groupFor(loans, 'loan')?.subgroups?.map((s) => s.label)).toEqual(['A', 'B']);

    const cash = many('cash', 'storageLocation', [
      'Wallet',
      'Safe',
      'Wallet',
      'Safe',
      'Wallet',
      'Safe',
    ]);
    expect(groupFor(cash, 'cash')?.subgroups?.map((s) => s.label)).toEqual(['Safe', 'Wallet']);
  });

  it('sub-groups assets by asset type using human labels, sorted by label', () => {
    const groups = many('asset', 'assetType', [
      'property',
      'stocks',
      'property',
      'vehicle',
      'property',
      'stocks',
    ]);
    const g = groupFor(groups, 'asset');
    // Labels come from ASSET_TYPE_LABELS; keys keep the raw enum value.
    expect(g?.subgroups?.map((s) => s.label)).toEqual(['Property', 'Stocks', 'Vehicle']);
    expect(g?.subgroups?.map((s) => s.key)).toEqual([
      'asset:property',
      'asset:stocks',
      'asset:vehicle',
    ]);
  });

  it('collects assets with no asset type into the trailing Other sub-group', () => {
    const groups = buildAccountGroups([
      acc('a1', 'owner', 'asset', 'Opened', { assetType: 'property' }),
      acc('a2', 'owner', 'asset', 'Opened', { assetType: 'property' }),
      acc('a3', 'owner', 'asset', 'Opened', { assetType: 'property' }),
      acc('a4', 'owner', 'asset', 'Opened', { assetType: 'property' }),
      acc('a5', 'owner', 'asset', 'Opened', { assetType: 'property' }),
      acc('n1', 'owner', 'asset'),
    ]);
    const g = groupFor(groups, 'asset');
    expect(g?.subgroups?.map((s) => s.label)).toEqual(['Property', 'Other']);
    expect(g?.subgroups?.at(-1)?.accounts.map((a) => a.id)).toEqual(['n1']);
  });
});
