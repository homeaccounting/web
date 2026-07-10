import { describe, it, expect } from 'vitest';
import { shareAccountSchema } from './shareAccountSchema';

const valid = { userId: '550e8400-e29b-41d4-a716-446655440000', role: 'editor' as const };

describe('shareAccountSchema', () => {
  it('accepts a valid uuid + editor/viewer role', () => {
    expect(shareAccountSchema.safeParse(valid).success).toBe(true);
    expect(shareAccountSchema.safeParse({ ...valid, role: 'viewer' }).success).toBe(true);
  });
  it('rejects a non-uuid userId', () => {
    expect(shareAccountSchema.safeParse({ ...valid, userId: 'not-a-uuid' }).success).toBe(false);
  });
  it('rejects owner (not grantable via UI)', () => {
    expect(shareAccountSchema.safeParse({ ...valid, role: 'owner' }).success).toBe(false);
  });
  it('rejects empty userId', () => {
    expect(shareAccountSchema.safeParse({ ...valid, userId: '' }).success).toBe(false);
  });
});
