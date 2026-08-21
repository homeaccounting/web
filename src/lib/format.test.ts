import { describe, expect, it } from 'vitest';
import { formatMoney, formatDate, formatDateTime } from './format';

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

  it('international default (no locale) is unchanged behavior', () => {
    expect(formatMoney(1234.5, 'USD')).toContain('1,234.50');
  });

  it('formats money for a given country locale', () => {
    expect(formatMoney(1234.5, 'USD', 'en-US')).toContain('1,234.50');
    expect(formatMoney(1234.5, 'USD', 'uk-UA')).toMatch(/1\s?234,50/);
  });
});

describe('formatDate', () => {
  it('renders ISO 8601 timestamps as YYYY-MM-DD', () => {
    expect(formatDate('2026-04-27T15:30:00Z')).toBe('2026-04-27');
  });

  it('international default (no locale) is unchanged behavior', () => {
    expect(formatDate('2026-04-27T00:00:00Z')).toBe('2026-04-27');
  });

  it('formats dates for a given country locale', () => {
    expect(formatDate('2026-03-09T00:00:00Z', 'en-US')).toBe('3/9/2026');
    expect(formatDate('2026-03-09T00:00:00Z', 'uk-UA')).toBe('09.03.2026');
  });

  it('date-only display shows the same UTC day regardless of locale (no day rollover)', () => {
    const iso = '2026-03-09T23:59:00Z';
    expect(formatDate(iso)).toBe('2026-03-09'); // international default
    expect(formatDate(iso, 'en-US')).toBe('3/9/2026'); // still the 9th
    expect(formatDate(iso, 'uk-UA')).toBe('09.03.2026'); // still the 9th
  });
});

describe('formatDateTime', () => {
  it('formats date-time in 24-hour form, locale-ordered', () => {
    expect(formatDateTime('2026-03-09T15:30:00Z', 'en-US')).toMatch(/03\/09\/2026.*15:30/);
    expect(formatDateTime('2026-03-09T15:30:00Z', 'uk-UA')).toMatch(/09\.03\.2026.*15:30/);
  });
});
