import { describe, expect, it } from 'vitest';
import { formatMoney, formatDate } from './format';

describe('formatMoney', () => {
  it('formats USD with two fraction digits', () => {
    expect(formatMoney(12.5, 'USD')).toBe('$12.50');
  });
  it('formats negative amounts with sign', () => {
    expect(formatMoney(-3.5, 'USD')).toBe('-$3.50');
  });
  it('handles zero', () => {
    expect(formatMoney(0, 'USD')).toBe('$0.00');
  });
  it('handles non-USD (EUR)', () => {
    expect(formatMoney(5, 'EUR')).toMatch(/€/);
  });
});

describe('formatDate', () => {
  it('renders ISO 8601 timestamps as YYYY-MM-DD', () => {
    expect(formatDate('2026-04-27T15:30:00Z')).toBe('2026-04-27');
  });
});
