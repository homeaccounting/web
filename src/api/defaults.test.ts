import { describe, it, expect } from 'vitest';
import { subtypeTypeToKind, subtypeKindToType, isSelectableDefaultAccount } from './defaults';
import { ACCOUNT_SUBTYPE_TYPES, type AccountResponse } from './types';

describe('subtype type <-> kind mapping', () => {
  it('round-trips every subtype type', () => {
    for (const type of ACCOUNT_SUBTYPE_TYPES) {
      expect(subtypeKindToType(subtypeTypeToKind(type))).toBe(type);
    }
  });
  it('maps the cash type to the CashKind key', () => {
    expect(subtypeTypeToKind('cash')).toBe('CashKind');
  });
  it('returns undefined for unknown kind keys', () => {
    expect(subtypeKindToType('CryptoKind')).toBeUndefined();
  });
});

describe('isSelectableDefaultAccount', () => {
  const base: AccountResponse = {
    id: 'a1',
    name: 'A',
    balance: 0,
    currency: 'USD',
    overdraftLimit: null,
    subtype: { type: 'cash' },
    status: 'Opened',
    version: 1,
  };
  it('accepts opened regular accounts', () => {
    expect(isSelectableDefaultAccount(base)).toBe(true);
  });
  it('rejects closed accounts', () => {
    expect(isSelectableDefaultAccount({ ...base, status: 'Closed' })).toBe(false);
  });
  it('rejects external accounts (no subtype)', () => {
    expect(isSelectableDefaultAccount({ ...base, subtype: null })).toBe(false);
  });
});
