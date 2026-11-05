import { describe, it, expect } from 'vitest';
import type { AccountResponse } from '@/api/types';
import { compareAccounts, sortAccounts } from './accountLabel';

function acc(
  id: string,
  name: string,
  opts: {
    bankName?: unknown;
    currency?: string;
    kind?: string;
    sub?: Record<string, unknown>;
  } = {},
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

describe('sortAccounts / compareAccounts (by raw qualifier)', () => {
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
    const cash = acc('cash', 'Savings', { kind: 'cash' });
    // cash has no raw qualifier → empty string sorts first.
    expect(ids(sortAccounts([bank, cash]))).toEqual(['cash', 'bank']);
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
