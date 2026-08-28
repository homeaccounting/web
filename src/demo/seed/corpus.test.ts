import { describe, it, expect } from 'vitest';
import { AS_OF, populatedSeed, freshSeed } from './corpus';

describe('demo corpus', () => {
  it('as-of date is the pinned launch value', () => {
    expect(AS_OF).toBe('2026-06-15T12:00:00.000Z');
  });

  it('populated seed has multiple accounts across currencies and subtypes', () => {
    const currencies = new Set(populatedSeed.accounts.map((a) => a.currency));
    const subtypes = new Set(populatedSeed.accounts.map((a) => a.subtype?.type));
    expect(populatedSeed.accounts.length).toBeGreaterThanOrEqual(3);
    expect(currencies.size).toBeGreaterThanOrEqual(2);
    expect(subtypes.size).toBeGreaterThanOrEqual(2);
  });

  it('every transaction falls within the 30 days before AS_OF', () => {
    const asOf = Date.parse(AS_OF);
    const windowStart = asOf - 31 * 24 * 3600 * 1000;
    for (const t of populatedSeed.transactions) {
      const ts = Date.parse(t.date);
      expect(ts).toBeGreaterThanOrEqual(windowStart);
      expect(ts).toBeLessThanOrEqual(asOf);
    }
  });

  it('every transaction references accounts that exist in the seed', () => {
    const ids = new Set(populatedSeed.accounts.map((a) => a.id));
    for (const t of populatedSeed.transactions) {
      if (t.sourceAccountId) expect(ids.has(t.sourceAccountId)).toBe(true);
      if (t.targetAccountId) expect(ids.has(t.targetAccountId)).toBe(true);
    }
  });

  it('fresh seed is empty and not yet onboarded', () => {
    expect(freshSeed.accounts).toHaveLength(0);
    expect(freshSeed.transactions).toHaveLength(0);
    expect(freshSeed.configuration.country).toBeNull();
  });

  it('contains no real-looking PII (emails are @example.com)', () => {
    expect(populatedSeed.profile.email).toMatch(/@example\.com$/);
  });
});
