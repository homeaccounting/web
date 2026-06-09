import { describe, expect, it } from 'vitest';
import { bankConnectionFormSchema, mccRowSchema } from '@/features/profile/bankConnectionSchema';

describe('bankConnectionFormSchema', () => {
  it('rejects an empty name', () => {
    const result = bankConnectionFormSchema.safeParse({
      name: '',
      provider: 'monobank',
      enabled: true,
    });
    expect(result.success).toBe(false);
  });

  it('accepts a valid connection form (token optional)', () => {
    const result = bankConnectionFormSchema.safeParse({
      name: 'My Monobank',
      provider: 'monobank',
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
