import { describe, it, expect } from 'vitest';
import { diffAccount } from './diffAccount';
import type { EditAccountFormValues } from './schema';

const base: EditAccountFormValues = {
  name: 'Savings',
  currency: 'USD',
  overdraftLimit: undefined,
  subtype: { type: 'cash', storageLocation: 'wallet' },
};

describe('diffAccount', () => {
  it('returns empty diff when nothing changed', () => {
    expect(diffAccount(base, { ...base })).toEqual({});
  });

  it('emits name when name changes', () => {
    expect(diffAccount(base, { ...base, name: 'Checking' })).toEqual({
      name: 'Checking',
    });
  });

  it('emits overdraftLimit: null when overdraft is cleared', () => {
    const initial = { ...base, overdraftLimit: 100 };
    const next = { ...base, overdraftLimit: undefined };
    expect(diffAccount(initial, next)).toEqual({ overdraftLimit: null });
  });

  it('emits overdraftLimit: number when overdraft is set', () => {
    const next = { ...base, overdraftLimit: 100 };
    expect(diffAccount(base, next)).toEqual({ overdraftLimit: 100 });
  });

  it('emits full subtype when an optional field changes (same type)', () => {
    const next: EditAccountFormValues = {
      ...base,
      subtype: { type: 'cash', storageLocation: 'safe' },
    };
    expect(diffAccount(base, next)).toEqual({
      subtype: { type: 'cash', storageLocation: 'safe' },
    });
  });

  it('emits full subtype when type changes (no carryover)', () => {
    const next: EditAccountFormValues = {
      ...base,
      subtype: { type: 'loan', lender: 'Bob' },
    };
    const result = diffAccount(base, next);
    expect(result.subtype).toEqual({ type: 'loan', lender: 'Bob' });
    expect((result.subtype as unknown as Record<string, unknown>).storageLocation).toBeUndefined();
  });

  it('treats undefined and empty-string string fields as equal', () => {
    const initial: EditAccountFormValues = {
      ...base,
      subtype: { type: 'cash', storageLocation: undefined },
    };
    const next: EditAccountFormValues = {
      ...base,
      subtype: { type: 'cash', storageLocation: '' },
    };
    expect(diffAccount(initial, next)).toEqual({});
  });

  it('throws when currency mismatches', () => {
    expect(() => diffAccount(base, { ...base, currency: 'EUR' })).toThrow();
  });
});
