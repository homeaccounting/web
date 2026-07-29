import { describe, it, expect } from 'vitest';
import type { AccountResponse } from '@/api/types';
import { accountLabelParts, accountLabel, compareAccounts, sortAccounts } from './accountLabel';

function acc(
  id: string,
  name: string,
  opts: { bankName?: unknown; currency?: string; kind?: string; sub?: Record<string, unknown> } = {},
): AccountResponse {
  const kind = opts.kind ?? 'bankAccount';
  const subtype = {
    type: kind,
    ...opts.sub,
    ...('bankName' in opts ? { bankName: opts.bankName } : {}),
  };
  return {
    id,
    name,
    balance: 0,
    currency: opts.currency ?? 'UAH',
    overdraftLimit: null,
    subtype,
    status: 'Opened',
    role: 'owner',
    version: 1,
  };
}

describe('accountLabelParts', () => {
  it('always shows the bank name as the qualifier for a bank account', () => {
    const a = acc('1', 'card', { bankName: 'Monobank' });
    expect(accountLabelParts(a, [a])).toEqual({ name: 'card', qualifier: 'Monobank' });
  });

  it('leaves a non-bank account unqualified when its name is unique', () => {
    const a = acc('1', 'wallet', { kind: 'cash' });
    expect(accountLabelParts(a, [a])).toEqual({ name: 'wallet', qualifier: null });
  });

  it('disambiguates same-named accounts from different banks by bank name only', () => {
    const a = acc('1', 'visa', { bankName: 'Monobank' });
    const b = acc('2', 'visa', { bankName: 'PrivatBank' });
    expect(accountLabelParts(a, [a, b]).qualifier).toBe('Monobank');
    expect(accountLabelParts(b, [a, b]).qualifier).toBe('PrivatBank');
  });

  it('adds the currency as a tiebreaker when name and bank both collide', () => {
    const a = acc('1', 'visa', { bankName: 'Monobank', currency: 'UAH' });
    const b = acc('2', 'visa', { bankName: 'Monobank', currency: 'USD' });
    expect(accountLabelParts(a, [a, b]).qualifier).toBe('Monobank · UAH');
    expect(accountLabelParts(b, [a, b]).qualifier).toBe('Monobank · USD');
  });

  it('uses currency alone to disambiguate colliding accounts that have no bank name', () => {
    const a = acc('1', 'wallet', { kind: 'cash', currency: 'UAH' });
    const b = acc('2', 'wallet', { kind: 'cash', currency: 'USD' });
    expect(accountLabelParts(a, [a, b]).qualifier).toBe('UAH');
    expect(accountLabelParts(b, [a, b]).qualifier).toBe('USD');
  });

  it('treats a blank or non-string bankName as no bank name', () => {
    const blank = acc('1', 'brokerage', { bankName: '   ' });
    const numeric = acc('2', 'other', { bankName: 123 });
    expect(accountLabelParts(blank, [blank]).qualifier).toBeNull();
    expect(accountLabelParts(numeric, [numeric]).qualifier).toBeNull();
  });

  it('detects name collisions case-insensitively and trimmed', () => {
    const a = acc('1', 'Visa', { bankName: 'Monobank', currency: 'UAH' });
    const b = acc('2', ' visa ', { bankName: 'Monobank', currency: 'USD' });
    expect(accountLabelParts(a, [a, b]).qualifier).toBe('Monobank · UAH');
  });

  it('omits the currency tiebreaker when currencyTiebreaker is false (currency shown elsewhere)', () => {
    // Same name + same bank: normally currency is appended, but a caller that
    // already renders the currency (e.g. a transaction form) opts out.
    const a = acc('1', 'visa', { bankName: 'Monobank', currency: 'UAH' });
    const b = acc('2', 'visa', { bankName: 'Monobank', currency: 'USD' });
    expect(accountLabelParts(a, [a, b], { currencyTiebreaker: false }).qualifier).toBe('Monobank');
  });

  it('still returns the bank name (and null when none) with currencyTiebreaker off', () => {
    const bank = acc('1', 'card', { bankName: 'Monobank' });
    const cash = acc('2', 'wallet', { kind: 'cash' });
    expect(accountLabelParts(bank, [bank], { currencyTiebreaker: false }).qualifier).toBe('Monobank');
    expect(accountLabelParts(cash, [cash], { currencyTiebreaker: false }).qualifier).toBeNull();
  });
});

describe('accountLabelParts — other account kinds', () => {
  it('always shows the provider for an e-wallet', () => {
    const a = acc('1', 'main', { kind: 'eWallet', sub: { provider: 'PayPal' } });
    expect(accountLabelParts(a, [a]).qualifier).toBe('PayPal');
  });

  it('shows the lender for a loan and the storage location for cash', () => {
    const loan = acc('1', 'mortgage', { kind: 'loan', sub: { lender: 'PrivatBank' } });
    const cash = acc('2', 'UAH cash', { kind: 'cash', sub: { storageLocation: 'Wallet' } });
    expect(accountLabelParts(loan, [loan]).qualifier).toBe('PrivatBank');
    expect(accountLabelParts(cash, [cash]).qualifier).toBe('Wallet');
  });

  it('does not qualify an asset by its type (categorization, not identification)', () => {
    const a = acc('1', 'Downtown flat', { kind: 'asset', sub: { assetType: 'property' } });
    expect(accountLabelParts(a, [a]).qualifier).toBeNull();
  });

  it('disambiguates a colliding asset name by currency only, never by asset type', () => {
    const a = acc('1', 'Downtown', { kind: 'asset', currency: 'UAH', sub: { assetType: 'property' } });
    const b = acc('2', 'Downtown', { kind: 'asset', currency: 'USD', sub: { assetType: 'property' } });
    expect(accountLabelParts(a, [a, b]).qualifier).toBe('UAH');
    expect(accountLabelParts(b, [a, b]).qualifier).toBe('USD');
  });
});

describe('accountLabel (string form for single-line pickers)', () => {
  it('joins name and qualifier with a separator', () => {
    const a = acc('1', 'card', { bankName: 'Monobank' });
    expect(accountLabel(a, [a])).toBe('card · Monobank');
  });

  it('returns the bare name when there is no qualifier', () => {
    const a = acc('1', 'wallet', { kind: 'cash' });
    expect(accountLabel(a, [a])).toBe('wallet');
  });
});

describe('sortAccounts / compareAccounts (by display label)', () => {
  const ids = (list: readonly AccountResponse[]) => list.map((a) => a.id);

  it('orders primarily by name, case-insensitively', () => {
    const b = acc('b', 'Zebra', { kind: 'cash' });
    const a = acc('a', 'apple', { kind: 'cash' });
    const c = acc('c', 'Mango', { kind: 'cash' });
    expect(ids(sortAccounts([b, a, c]))).toEqual(['a', 'c', 'b']);
  });

  it('breaks a name tie by the identifying qualifier (bank name)', () => {
    const p = acc('p', 'Card', { bankName: 'PrivatBank' });
    const m = acc('m', 'Card', { bankName: 'Monobank' });
    expect(ids(sortAccounts([p, m]))).toEqual(['m', 'p']);
  });

  it('breaks a name+qualifier tie by currency', () => {
    const usd = acc('usd', 'Card', { bankName: 'Monobank', currency: 'USD' });
    const uah = acc('uah', 'Card', { bankName: 'Monobank', currency: 'UAH' });
    expect(ids(sortAccounts([usd, uah]))).toEqual(['uah', 'usd']);
  });

  it('falls back to id for a total tie so order never wobbles', () => {
    const a2 = acc('a2', 'Card', { bankName: 'Monobank', currency: 'UAH' });
    const a1 = acc('a1', 'Card', { bankName: 'Monobank', currency: 'UAH' });
    expect(ids(sortAccounts([a2, a1]))).toEqual(['a1', 'a2']);
  });

  it('sorts an unqualified account (no qualifier) before a same-named qualified one', () => {
    const bank = acc('bank', 'Savings', { bankName: 'Monobank' });
    const asset = acc('asset', 'Savings', { kind: 'asset', sub: { assetType: 'property' } });
    // asset has no qualifier → empty string sorts first.
    expect(ids(sortAccounts([bank, asset]))).toEqual(['asset', 'bank']);
  });

  it('does not mutate the input array', () => {
    const b = acc('b', 'Zebra', { kind: 'cash' });
    const a = acc('a', 'apple', { kind: 'cash' });
    const input = [b, a];
    sortAccounts(input);
    expect(ids(input)).toEqual(['b', 'a']);
  });

  it('compareAccounts returns 0 for equal ordering keys', () => {
    const a = acc('x', 'Card', { bankName: 'Monobank', currency: 'UAH' });
    expect(compareAccounts(a, a)).toBe(0);
  });
});
