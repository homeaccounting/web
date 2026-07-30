import { describe, expect, it } from 'vitest';
import type { BankProviderDTO } from '@/api/types';
import {
  bankConnectionFormSchema,
  makeBankConnectionFormSchema,
  mccRowSchema,
} from '@/features/profile/bankConnectionSchema';

const pullProvider: BankProviderDTO = {
  id: 'monobank',
  displayName: 'Monobank',
  supportsPull: true,
  supportsFile: false,
};
const fileOnlyProvider: BankProviderDTO = {
  id: 'privatbank',
  displayName: 'PrivatBank',
  supportsPull: false,
  supportsFile: true,
};
const providers = [pullProvider, fileOnlyProvider];

describe('bankConnectionFormSchema', () => {
  it('rejects an empty name', () => {
    const result = bankConnectionFormSchema.safeParse({
      name: '',
      provider: 'monobank',
      enabled: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects an empty provider', () => {
    const result = bankConnectionFormSchema.safeParse({
      name: 'My bank',
      provider: '',
      enabled: true,
    });
    expect(result.success).toBe(false);
  });

  it('accepts any provider id (data-driven, not a hardcoded literal)', () => {
    const result = bankConnectionFormSchema.safeParse({
      name: 'My PrivatBank',
      provider: 'privatbank',
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a token when provided', () => {
    const result = bankConnectionFormSchema.safeParse({
      name: 'My Monobank',
      provider: 'monobank',
      token: 'secret-token',
      enabled: false,
    });
    expect(result.success).toBe(true);
  });
});

describe('makeBankConnectionFormSchema', () => {
  it('create + pull provider: requires a non-blank token', () => {
    const schema = makeBankConnectionFormSchema(providers, false);
    const result = schema.safeParse({
      name: 'My Monobank',
      provider: 'monobank',
      token: '  ',
      enabled: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'token')).toBe(true);
    }
  });

  it('create + pull provider: passes with a token', () => {
    const schema = makeBankConnectionFormSchema(providers, false);
    const result = schema.safeParse({
      name: 'My Monobank',
      provider: 'monobank',
      token: 'secret-token',
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it('create + file-only provider: neither token nor an account is required (created unmapped)', () => {
    const schema = makeBankConnectionFormSchema(providers, false);
    const result = schema.safeParse({
      name: 'My PrivatBank',
      provider: 'privatbank',
      enabled: true,
    });
    expect(result.success).toBe(true);
  });

  it('create + no provider selected: reports only the provider error, not a spurious token error', () => {
    const schema = makeBankConnectionFormSchema(providers, false);
    const result = schema.safeParse({
      name: 'My bank',
      provider: '',
      enabled: true,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === 'provider')).toBe(true);
      expect(result.error.issues.some((i) => i.path[0] === 'token')).toBe(false);
    }
  });

  it('edit mode never requires a token', () => {
    const schema = makeBankConnectionFormSchema(providers, true);
    const result = schema.safeParse({
      name: 'My Monobank',
      provider: 'monobank',
      enabled: true,
    });
    expect(result.success).toBe(true);
  });
});

describe('mccRowSchema', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';

  it('rejects a non-4-digit mcc', () => {
    expect(mccRowSchema.safeParse({ mcc: '12', categoryId: validUuid }).success).toBe(false);
    expect(mccRowSchema.safeParse({ mcc: 'abcd', categoryId: validUuid }).success).toBe(false);
  });

  it('accepts a 4-digit mcc', () => {
    expect(mccRowSchema.safeParse({ mcc: '5411', categoryId: validUuid }).success).toBe(true);
  });

  it('rejects a non-uuid categoryId', () => {
    expect(mccRowSchema.safeParse({ mcc: '5411', categoryId: 'x' }).success).toBe(false);
  });

  it('accepts a valid uuid categoryId', () => {
    expect(mccRowSchema.safeParse({ mcc: '5411', categoryId: validUuid }).success).toBe(true);
  });
});
