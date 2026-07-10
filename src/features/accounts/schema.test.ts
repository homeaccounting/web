import { describe, expect, it } from 'vitest';
import {
  createAccountFormSchema,
  editAccountFormSchema,
  fromAccountResponse,
  toCreateAccountRequest,
} from './schema';
import type { AccountResponse } from '@/api/types';

describe('createAccountFormSchema', () => {
  const base = {
    name: 'Checking',
    currency: 'USD',
    initialBalance: 0,
    subtype: { type: 'cash' },
  } as const;

  it('rejects empty name', () => {
    const r = createAccountFormSchema.safeParse({ ...base, name: '' });
    expect(r.success).toBe(false);
  });

  it('accepts a valid cash account', () => {
    const r = createAccountFormSchema.safeParse(base);
    expect(r.success).toBe(true);
  });

  it('rejects negative balance with no overdraft limit', () => {
    const r = createAccountFormSchema.safeParse({ ...base, initialBalance: -100 });
    expect(r.success).toBe(false);
    if (!r.success) {
      const overdraftIssue = r.error.issues.find((i) => i.path[0] === 'overdraftLimit');
      expect(overdraftIssue).toBeDefined();
    }
  });

  it('rejects negative balance when |balance| > limit', () => {
    const r = createAccountFormSchema.safeParse({
      ...base,
      initialBalance: -100,
      overdraftLimit: 50,
    });
    expect(r.success).toBe(false);
  });

  it('accepts negative balance when |balance| <= limit', () => {
    const r = createAccountFormSchema.safeParse({
      ...base,
      initialBalance: -50,
      overdraftLimit: 100,
    });
    expect(r.success).toBe(true);
  });

  it('accepts zero balance with no limit', () => {
    expect(createAccountFormSchema.safeParse({ ...base, initialBalance: 0 }).success).toBe(true);
  });

  it('rejects an unknown currency', () => {
    expect(createAccountFormSchema.safeParse({ ...base, currency: 'JPY' }).success).toBe(false);
  });

  it('rejects malformed loan dueDate', () => {
    const r = createAccountFormSchema.safeParse({
      ...base,
      subtype: { type: 'loan', dueDate: '2026/05/06' },
    });
    expect(r.success).toBe(false);
  });
});

describe('toCreateAccountRequest', () => {
  it('strips empty optionals from cash subtype', () => {
    const dto = toCreateAccountRequest({
      name: 'Wallet',
      currency: 'USD',
      initialBalance: 0,
      subtype: { type: 'cash' },
    });
    expect(dto.subtype).toEqual({ type: 'cash' });
    expect(dto).not.toHaveProperty('overdraftLimit');
  });

  it('shapes a bankAccount subtype with all fields', () => {
    const dto = toCreateAccountRequest({
      name: 'BoA',
      currency: 'USD',
      initialBalance: 100,
      overdraftLimit: 200,
      subtype: { type: 'bankAccount', bankName: 'BoA', accountNumber: '123', cardNetwork: 'visa' },
    });
    expect(dto).toEqual({
      name: 'BoA',
      currency: 'USD',
      initialBalance: 100,
      overdraftLimit: 200,
      subtype: { type: 'bankAccount', bankName: 'BoA', accountNumber: '123', cardNetwork: 'visa' },
    });
  });

  it('shapes a loan subtype', () => {
    const dto = toCreateAccountRequest({
      name: 'Mortgage',
      currency: 'USD',
      initialBalance: -100000,
      overdraftLimit: 100000,
      subtype: { type: 'loan', lender: 'Bank', interestRate: 5, dueDate: '2030-01-01' },
    });
    expect(dto.subtype).toEqual({
      type: 'loan',
      lender: 'Bank',
      interestRate: 5,
      dueDate: '2030-01-01',
    });
  });
});

describe('editAccountFormSchema', () => {
  it('requires name', () => {
    const result = editAccountFormSchema.safeParse({
      name: '',
      currency: 'USD',
      overdraftLimit: undefined,
      subtype: { type: 'cash' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects name longer than 120 chars', () => {
    const result = editAccountFormSchema.safeParse({
      name: 'x'.repeat(121),
      currency: 'USD',
      overdraftLimit: undefined,
      subtype: { type: 'cash' },
    });
    expect(result.success).toBe(false);
  });

  it('does not require initialBalance (no such field in edit schema)', () => {
    const result = editAccountFormSchema.safeParse({
      name: 'Savings',
      currency: 'USD',
      overdraftLimit: undefined,
      subtype: { type: 'cash' },
    });
    expect(result.success).toBe(true);
  });

  it('does not apply the negative-balance refinement', () => {
    const result = editAccountFormSchema.safeParse({
      name: 'Savings',
      currency: 'USD',
      overdraftLimit: undefined,
      subtype: { type: 'cash' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts non-enum currency strings', () => {
    const result = editAccountFormSchema.safeParse({
      name: 'Savings',
      currency: 'JPY',
      overdraftLimit: undefined,
      subtype: { type: 'cash' },
    });
    expect(result.success).toBe(true);
  });
});

describe('fromAccountResponse', () => {
  const fixture: AccountResponse = {
    id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    name: 'Savings',
    balance: 0,
    currency: 'USD',
    overdraftLimit: null,
    subtype: { type: 'cash', storageLocation: 'wallet' },
    status: 'Opened',
    role: 'owner',
    version: 1,
  };

  it('maps fields from AccountResponse to EditAccountFormValues', () => {
    const v = fromAccountResponse(fixture);
    expect(v.name).toBe('Savings');
    expect(v.currency).toBe('USD');
    expect(v.overdraftLimit).toBeUndefined();
    expect(v.subtype).toEqual({ type: 'cash', storageLocation: 'wallet' });
  });

  it('defaults missing subtype to { type: "cash" }', () => {
    const v = fromAccountResponse({ ...fixture, subtype: null });
    expect(v.subtype).toEqual({ type: 'cash' });
  });

  it('preserves a non-enum currency string', () => {
    const v = fromAccountResponse({ ...fixture, currency: 'JPY' });
    expect(v.currency).toBe('JPY');
  });

  it('drops freeform card-network variants to undefined', () => {
    const v = fromAccountResponse({
      ...fixture,
      subtype: { type: 'bankAccount', cardNetwork: 'OtherCardNetwork: foo' },
    });
    expect((v.subtype as { cardNetwork?: string }).cardNetwork).toBeUndefined();
  });
});
