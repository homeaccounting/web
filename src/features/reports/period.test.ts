import { describe, it, expect } from 'vitest';
import { PERIOD_PRESETS, presetRange, toQueryRange, type PeriodPreset } from './period';

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
