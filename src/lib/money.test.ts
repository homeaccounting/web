import { describe, expect, it } from 'vitest';
import { roundMoney } from './money';

describe('roundMoney', () => {
  it('rounds to two decimals', () => {
    expect(roundMoney(2.345)).toBe(2.35);
    expect(roundMoney(2.344)).toBe(2.34);
  });
  it('clears binary float noise', () => {
    expect(roundMoney(0.1 + 0.2)).toBe(0.3);
    expect(roundMoney(26.66 + 26.67 + 26.67)).toBe(80);
  });
  it('preserves whole numbers and negatives', () => {
    expect(roundMoney(80)).toBe(80);
    expect(roundMoney(-10.001)).toBe(-10);
  });
});
