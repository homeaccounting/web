import { describe, it, expect } from 'vitest';
import {
  PERIOD_PRESETS,
  presetRange,
  toQueryRange,
  parsePeriodParams,
  periodParamsToSearch,
  type PeriodPreset,
} from './period';

const JUN_15 = new Date('2026-06-15T10:00:00'); // local

describe('presetRange', () => {
  it('this-month spans the calendar month containing today', () => {
    expect(presetRange('this-month', JUN_15)).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  });
  it('last-month spans the previous calendar month', () => {
    expect(presetRange('last-month', JUN_15)).toEqual({ from: '2026-05-01', to: '2026-05-31' });
  });
  it('this-year spans Jan 1..Dec 31 of the current year', () => {
    expect(presetRange('this-year', JUN_15)).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });
  it('all-time has empty (open) bounds', () => {
    expect(presetRange('all-time', JUN_15)).toEqual({ from: '', to: '' });
  });
  it('last-month crosses the year boundary', () => {
    expect(presetRange('last-month', new Date('2026-01-10T10:00:00'))).toEqual({
      from: '2025-12-01',
      to: '2025-12-31',
    });
  });
  it('resolves last-year to the whole prior calendar year', () => {
    expect(presetRange('last-year', JUN_15)).toEqual({ from: '2025-01-01', to: '2025-12-31' });
  });
});

describe('toQueryRange', () => {
  it('maps day strings to inclusive UTC timestamps', () => {
    expect(toQueryRange({ from: '2026-06-01', to: '2026-06-30' })).toEqual({
      from: '2026-06-01T00:00:00.000Z',
      to: '2026-06-30T23:59:59.999Z',
    });
  });
  it('omits empty bounds', () => {
    expect(toQueryRange({ from: '', to: '' })).toEqual({});
  });
  it('exposes presets in display order with this-month first', () => {
    expect(PERIOD_PRESETS[0]).toBe<PeriodPreset>('this-month');
  });
});

describe('parsePeriodParams / periodParamsToSearch', () => {
  const P = ['this-month', 'last-month', 'this-year', 'last-year'] as const;
  const parse = (s: string, fallback?: Parameters<typeof parsePeriodParams>[2]['fallback']) =>
    parsePeriodParams(new URLSearchParams(s), JUN_15, {
      presets: P,
      defaultPreset: 'last-month',
      fallback,
    });

  it('URL preset wins', () => {
    expect(parse('?period=this-year')).toEqual({
      periodValue: 'this-year',
      dayRange: { from: '2026-01-01', to: '2026-12-31' },
    });
  });
  it('URL custom with valid dates', () => {
    expect(parse('?period=custom&from=2026-03-02&to=2026-03-20')).toEqual({
      periodValue: 'custom',
      dayRange: { from: '2026-03-02', to: '2026-03-20' },
    });
  });
  it('URL custom without valid dates keeps custom, uses default range', () => {
    expect(parse('?period=custom')).toEqual({
      periodValue: 'custom',
      dayRange: { from: '2026-05-01', to: '2026-05-31' },
    }); // last-month
  });
  it('URL silent → default preset when no fallback', () => {
    expect(parse('')).toEqual({
      periodValue: 'last-month',
      dayRange: { from: '2026-05-01', to: '2026-05-31' },
    });
  });
  it('URL silent → fallback preset when present', () => {
    expect(parse('', { period: 'this-month' })).toEqual({
      periodValue: 'this-month',
      dayRange: { from: '2026-06-01', to: '2026-06-30' },
    });
  });
  it('URL silent → fallback custom range when present', () => {
    expect(parse('', { period: 'custom', from: '2026-02-01', to: '2026-02-10' })).toEqual({
      periodValue: 'custom',
      dayRange: { from: '2026-02-01', to: '2026-02-10' },
    });
  });
  it('unknown URL period falls through to default (no fallback)', () => {
    expect(parse('?period=weekly')).toEqual({
      periodValue: 'last-month',
      dayRange: { from: '2026-05-01', to: '2026-05-31' },
    });
  });
  it('serialises preset without from/to; custom with from/to', () => {
    expect(periodParamsToSearch('this-year', { from: '2026-01-01', to: '2026-12-31' })).toEqual({
      period: 'this-year',
    });
    expect(periodParamsToSearch('custom', { from: '2026-03-02', to: '2026-03-20' })).toEqual({
      period: 'custom',
      from: '2026-03-02',
      to: '2026-03-20',
    });
  });
  it('URL silent → default when fallback is custom but dates are invalid', () => {
    expect(parse('', { period: 'custom', from: 'bad', to: '2026-02-10' })).toEqual({
      periodValue: 'last-month',
      dayRange: { from: '2026-05-01', to: '2026-05-31' },
    });
  });
  it('URL silent → default when fallback preset is not in the presets list', () => {
    expect(parse('', { period: 'all-time' })).toEqual({
      // all-time is not in P (this-month/last-month/this-year/last-year)
      periodValue: 'last-month',
      dayRange: { from: '2026-05-01', to: '2026-05-31' },
    });
  });
});
