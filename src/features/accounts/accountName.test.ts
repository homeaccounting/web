import { describe, it, expect } from 'vitest';
import type { AccountResponse } from '@/api/types';
import {
  accountMatches,
  accountNameParts,
  fullAccountName,
  rawQualifier,
  shortAccountName,
} from './accountName';

function acc(
  name: string,
  subtype: Record<string, unknown> | null,
  currency = 'UAH',
): AccountResponse {
  return {
    id: name,
    name,
    balance: 0,
    currency,
    overdraftLimit: null,
    subtype: subtype as AccountResponse['subtype'],
    status: 'Opened',
    role: 'owner',
    version: 1,
  };
}

describe('accountNameParts', () => {
  it.each([
    ['cash', 'storageLocation', 'Home safe', 'Cash'],
    ['bankAccount', 'bankName', 'PrivatBank', 'Bank account'],
    ['eWallet', 'provider', 'PayPal', 'E-wallet'],
    ['loan', 'lender', 'Monobank', 'Loan'],
  ])('reads the %s qualifier from %s', (type, field, value, kind) => {
    expect(accountNameParts(acc('Main', { type, [field]: value }))).toEqual({
      kind,
      qualifier: value,
      name: 'Main',
      currency: 'UAH',
    });
  });

  it('shows an asset qualifier through its localized asset-type label', () => {
    const parts = accountNameParts(acc('Flat', { type: 'asset', assetType: 'property' }));
    expect(parts.kind).toBe('Asset');
    expect(parts.qualifier).toBe('Property');
  });

  it.each([[''], ['   '], [42], [undefined]])('treats qualifier %p as missing', (value) => {
    expect(
      accountNameParts(acc('Card', { type: 'bankAccount', bankName: value })).qualifier,
    ).toBeNull();
  });

  it('labels an unknown or absent subtype as Other with no qualifier', () => {
    expect(accountNameParts(acc('X', { type: 'crypto', bankName: 'B' }))).toMatchObject({
      kind: 'Other',
      qualifier: null,
    });
    expect(accountNameParts(acc('Y', null))).toMatchObject({ kind: 'Other', qualifier: null });
  });
});

describe('rawQualifier', () => {
  it('returns the unformatted value, including the raw asset type', () => {
    expect(rawQualifier(acc('Flat', { type: 'asset', assetType: 'property' }))).toBe('property');
    expect(rawQualifier(acc('Card', { type: 'bankAccount', bankName: 'Mono' }))).toBe('Mono');
    expect(rawQualifier(acc('Y', null))).toBeNull();
  });
});

describe('fullAccountName', () => {
  it('joins kind, qualifier and name as a path with the currency suffix', () => {
    expect(fullAccountName(acc('Card', { type: 'bankAccount', bankName: 'PrivatBank' }))).toBe(
      'Bank account › PrivatBank › Card · UAH',
    );
  });

  it('omits a missing qualifier segment', () => {
    expect(fullAccountName(acc('Pocket', { type: 'cash' }, 'USD'))).toBe('Cash › Pocket · USD');
  });
});

describe('shortAccountName', () => {
  const card = acc('Card', { type: 'bankAccount', bankName: 'PrivatBank' });

  it('shows name, qualifier and currency when the context shows nothing', () => {
    expect(shortAccountName(card)).toBe('Card · PrivatBank · UAH');
  });

  it('drops the qualifier when a sub-header shows it', () => {
    expect(shortAccountName(card, { qualifier: true })).toBe('Card · UAH');
  });

  it('drops the currency when a formatted balance shows it', () => {
    expect(shortAccountName(card, { currency: true })).toBe('Card · PrivatBank');
  });

  it('is the bare name when the context shows both', () => {
    expect(shortAccountName(card, { qualifier: true, currency: true })).toBe('Card');
  });

  it('skips a missing qualifier', () => {
    expect(shortAccountName(acc('Pocket', { type: 'cash' }, 'USD'))).toBe('Pocket · USD');
  });
});

describe('accountMatches', () => {
  const card = acc('Card', { type: 'bankAccount', bankName: 'PrivatBank' }, 'USD');

  it.each(['card', 'PRIVAT', 'usd', 'bank', 'privat usd', '  card  ', ''])(
    'matches %p',
    (query) => {
      expect(accountMatches(card, query)).toBe(true);
    },
  );

  it.each(['mono', 'privat eur'])('does not match %p', (query) => {
    expect(accountMatches(card, query)).toBe(false);
  });

  it('ignores accents on both sides', () => {
    expect(accountMatches(acc('Café', { type: 'cash' }), 'cafe')).toBe(true);
    expect(accountMatches(acc('Cafe', { type: 'cash' }), 'café')).toBe(true);
  });
});
