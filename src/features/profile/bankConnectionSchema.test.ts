import { describe, expect, it } from 'vitest';
import type { BankProviderDTO } from '@/api/types';
import {
  bankConnectionFormSchema,
  bankProviderContactRowSchema,
  makeBankConnectionFormSchema,
  parseBankProviderCategoryKey,
  bankProviderCategoryRowSchema,
  renderBankProviderCategoryKey,
} from '@/features/profile/bankConnectionSchema';

const pullProvider: BankProviderDTO = {
  id: 'monobank',
  displayName: 'Monobank',
  supportsPull: true,
  supportsFile: false,
  countries: ['UA'],
  inUserCountry: true,
};
const fileOnlyProvider: BankProviderDTO = {
  id: 'privatbank',
  displayName: 'PrivatBank',
  supportsPull: false,
  supportsFile: true,
  countries: ['UA'],
  inUserCountry: true,
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

describe('provider-category key helpers', () => {
  it('renders the tagged key form for each kind', () => {
    expect(renderBankProviderCategoryKey({ kind: 'mcc', value: '0742' })).toBe('mcc:0742');
    expect(renderBankProviderCategoryKey({ kind: 'label', value: 'eating_out' })).toBe(
      'label:eating_out',
    );
  });

  it('parses the tagged key form for each kind', () => {
    expect(parseBankProviderCategoryKey('mcc:0742')).toEqual({ kind: 'mcc', value: '0742' });
    expect(parseBankProviderCategoryKey('label:eating_out')).toEqual({
      kind: 'label',
      value: 'eating_out',
    });
  });

  it('renders + parses the counterparty kind (tracker#55)', () => {
    expect(renderBankProviderCategoryKey({ kind: 'counterparty', value: '12345678' })).toBe(
      'counterparty:12345678',
    );
    expect(parseBankProviderCategoryKey('counterparty:12345678')).toEqual({
      kind: 'counterparty',
      value: '12345678',
    });
  });

  it('splits on the first colon only, so counterparty IBAN tokens round-trip', () => {
    const key = renderBankProviderCategoryKey({ kind: 'counterparty', value: 'UA:12:34' });
    expect(key).toBe('counterparty:UA:12:34');
    expect(parseBankProviderCategoryKey(key)).toEqual({ kind: 'counterparty', value: 'UA:12:34' });
  });

  it('splits on the first colon only, so labels containing colons round-trip', () => {
    const key = renderBankProviderCategoryKey({ kind: 'label', value: 'a:b:c' });
    expect(key).toBe('label:a:b:c');
    expect(parseBankProviderCategoryKey(key)).toEqual({ kind: 'label', value: 'a:b:c' });
  });

  it('returns null for an unknown prefix or a key without a colon', () => {
    expect(parseBankProviderCategoryKey('bogus:x')).toBeNull();
    expect(parseBankProviderCategoryKey('5411')).toBeNull();
  });
});

describe('bankProviderCategoryRowSchema', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';

  it('mcc row: rejects a non-4-digit value', () => {
    expect(
      bankProviderCategoryRowSchema.safeParse({ kind: 'mcc', value: '12', categoryId: validUuid })
        .success,
    ).toBe(false);
    expect(
      bankProviderCategoryRowSchema.safeParse({ kind: 'mcc', value: 'abcd', categoryId: validUuid })
        .success,
    ).toBe(false);
  });

  it('mcc row: accepts a 4-digit value', () => {
    expect(
      bankProviderCategoryRowSchema.safeParse({ kind: 'mcc', value: '5411', categoryId: validUuid })
        .success,
    ).toBe(true);
  });

  it('label row: rejects a blank value', () => {
    expect(
      bankProviderCategoryRowSchema.safeParse({
        kind: 'label',
        value: '   ',
        categoryId: validUuid,
      }).success,
    ).toBe(false);
  });

  it('label row: accepts a non-blank value and trims it', () => {
    const result = bankProviderCategoryRowSchema.safeParse({
      kind: 'label',
      value: '  eating_out  ',
      categoryId: validUuid,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.value).toBe('eating_out');
  });

  it('rejects a non-uuid categoryId (either kind)', () => {
    expect(
      bankProviderCategoryRowSchema.safeParse({ kind: 'mcc', value: '5411', categoryId: 'x' })
        .success,
    ).toBe(false);
  });

  it('counterparty row: accepts a non-blank token and trims it (tracker#55)', () => {
    const result = bankProviderCategoryRowSchema.safeParse({
      kind: 'counterparty',
      value: '  12345678  ',
      categoryId: validUuid,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.value).toBe('12345678');
  });

  it('counterparty row: rejects a blank token', () => {
    expect(
      bankProviderCategoryRowSchema.safeParse({
        kind: 'counterparty',
        value: '   ',
        categoryId: validUuid,
      }).success,
    ).toBe(false);
  });
});

describe('bankProviderContactRowSchema', () => {
  const validUuid = '123e4567-e89b-12d3-a456-426614174000';

  it('accepts a token + uuid contact, trimming the token', () => {
    const result = bankProviderContactRowSchema.safeParse({
      token: '  MagazinREMONTI ',
      contactId: validUuid,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.token).toBe('MagazinREMONTI');
  });

  it('rejects a blank/whitespace token', () => {
    expect(
      bankProviderContactRowSchema.safeParse({ token: '   ', contactId: validUuid }).success,
    ).toBe(false);
  });

  it('rejects a missing/invalid contactId', () => {
    expect(bankProviderContactRowSchema.safeParse({ token: 'X', contactId: '' }).success).toBe(
      false,
    );
  });
});
