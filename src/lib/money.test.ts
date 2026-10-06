import { describe, expect, it } from 'vitest';
import { convertAmount, deriveExchangeRate, roundMoney } from './money';

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

describe('convertAmount', () => {
  it('applies the rate and rounds to cents', () => {
    expect(convertAmount(100, 0.9237)).toBe(92.37);
    expect(convertAmount(3, 0.333333333333)).toBe(1);
  });
  it('is undefined until both inputs are positive numbers', () => {
    expect(convertAmount(100, undefined)).toBeUndefined();
    expect(convertAmount(0, 1.5)).toBeUndefined();
    expect(convertAmount('', 1.5)).toBeUndefined();
  });
});

describe('deriveExchangeRate', () => {
  it('divides target by source without float noise', () => {
    expect(deriveExchangeRate(100, 92.37)).toBe(0.9237);
  });
  it('keeps enough precision to reproduce the target amount', () => {
    const rate = deriveExchangeRate(3, 1)!;
    expect(rate).toBe(0.333333333333);
    expect(convertAmount(3, rate)).toBe(1);
  });
  it('is undefined until both inputs are positive numbers', () => {
    expect(deriveExchangeRate(0, 10)).toBeUndefined();
    expect(deriveExchangeRate(10, undefined)).toBeUndefined();
    expect(deriveExchangeRate(10, '-')).toBeUndefined();
  });
});
