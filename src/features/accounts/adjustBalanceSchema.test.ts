import { describe, it, expect } from 'vitest';
import { adjustBalanceFormSchema, toAdjustBalanceRequest } from './adjustBalanceSchema';

const today = new Date().toISOString().slice(0, 10);
const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

describe('adjustBalanceFormSchema', () => {
  it('accepts a valid payload (today)', () => {
    expect(
      adjustBalanceFormSchema.safeParse({
        targetBalance: 100,
        reason: 'Bank reconcile',
        date: today,
      }).success,
    ).toBe(true);
  });

  it('accepts a past date', () => {
    expect(
      adjustBalanceFormSchema.safeParse({ targetBalance: 0, reason: 'foo', date: yesterday })
        .success,
    ).toBe(true);
  });

  it('rejects an empty reason', () => {
    expect(
      adjustBalanceFormSchema.safeParse({ targetBalance: 100, reason: '', date: today }).success,
    ).toBe(false);
  });

  it('rejects reason longer than 255 chars', () => {
    expect(
      adjustBalanceFormSchema.safeParse({
        targetBalance: 100,
        reason: 'x'.repeat(256),
        date: today,
      }).success,
    ).toBe(false);
  });

  it('rejects a future date', () => {
    expect(
      adjustBalanceFormSchema.safeParse({ targetBalance: 100, reason: 'foo', date: tomorrow })
        .success,
    ).toBe(false);
  });

  it('rejects a malformed date', () => {
    expect(
      adjustBalanceFormSchema.safeParse({ targetBalance: 100, reason: 'foo', date: 'not-a-date' })
        .success,
    ).toBe(false);
  });

  it('accepts targetBalance = 0 and negative values', () => {
    expect(
      adjustBalanceFormSchema.safeParse({ targetBalance: 0, reason: 'foo', date: today }).success,
    ).toBe(true);
    expect(
      adjustBalanceFormSchema.safeParse({ targetBalance: -50, reason: 'foo', date: today }).success,
    ).toBe(true);
  });
});

describe('toAdjustBalanceRequest', () => {
  it('converts the date input to <YYYY-MM-DD>T00:00:00.000Z', () => {
    expect(
      toAdjustBalanceRequest({ targetBalance: 100, reason: 'foo', date: '2025-12-01' }, 'USD'),
    ).toEqual({
      targetBalance: 100,
      currency: 'USD',
      date: '2025-12-01T00:00:00.000Z',
      reason: 'foo',
    });
  });
});
