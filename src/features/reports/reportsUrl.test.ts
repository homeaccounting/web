import { describe, it, expect } from 'vitest';
import { parseReportsParams, reportsParamsToSearch } from './reportsUrl';

const JUN_15 = new Date('2026-06-15T10:00:00'); // local
const THIS_MONTH = { from: '2026-06-01', to: '2026-06-30' };

const parse = (search: string) => parseReportsParams(new URLSearchParams(search), JUN_15);

describe('parseReportsParams', () => {
  it('defaults to the cash-flow tab and this-month period when empty', () => {
    expect(parse('')).toEqual({
      tab: 'cash-flow',
      periodValue: 'this-month',
      dayRange: THIS_MONTH,
    });
  });

  it('reads a known tab and preset period', () => {
    expect(parse('?tab=net-worth&period=last-month')).toEqual({
      tab: 'net-worth',
      periodValue: 'last-month',
      dayRange: { from: '2026-05-01', to: '2026-05-31' },
    });
  });

  it('reads a custom period with valid from/to', () => {
    expect(parse('?period=custom&from=2026-03-02&to=2026-03-20')).toEqual({
      tab: 'cash-flow',
      periodValue: 'custom',
      dayRange: { from: '2026-03-02', to: '2026-03-20' },
    });
  });

  it('falls back to the this-month range when custom lacks valid dates', () => {
    expect(parse('?period=custom')).toEqual({
      tab: 'cash-flow',
      periodValue: 'custom',
      dayRange: THIS_MONTH,
    });
  });

  it('falls back to defaults for unknown tab and period', () => {
    expect(parse('?tab=bogus&period=weekly')).toEqual({
      tab: 'cash-flow',
      periodValue: 'this-month',
      dayRange: THIS_MONTH,
    });
  });

  it('restores tab and period from lastView when URL is silent', () => {
    expect(
      parseReportsParams(new URLSearchParams(''), JUN_15, {
        tab: 'net-worth',
        period: 'last-month',
      }),
    ).toEqual({
      tab: 'net-worth',
      periodValue: 'last-month',
      dayRange: { from: '2026-05-01', to: '2026-05-31' },
    });
  });

  it('URL wins over lastView', () => {
    expect(
      parseReportsParams(new URLSearchParams('?tab=cash-flow&period=this-year'), JUN_15, {
        tab: 'net-worth',
        period: 'last-month',
      }),
    ).toEqual({
      tab: 'cash-flow',
      periodValue: 'this-year',
      dayRange: { from: '2026-01-01', to: '2026-12-31' },
    });
  });
});

describe('reportsParamsToSearch', () => {
  it('serialises tab and a preset period without from/to', () => {
    expect(
      reportsParamsToSearch({
        tab: 'net-worth',
        periodValue: 'last-month',
        dayRange: { from: '2026-05-01', to: '2026-05-31' },
      }),
    ).toEqual({ tab: 'net-worth', period: 'last-month' });
  });

  it('includes from/to only for the custom period', () => {
    expect(
      reportsParamsToSearch({
        tab: 'cash-flow',
        periodValue: 'custom',
        dayRange: { from: '2026-03-02', to: '2026-03-20' },
      }),
    ).toEqual({ tab: 'cash-flow', period: 'custom', from: '2026-03-02', to: '2026-03-20' });
  });

  it('round-trips through parseReportsParams for a preset', () => {
    const state = { tab: 'net-worth', periodValue: 'this-year', dayRange: THIS_MONTH } as const;
    const search = new URLSearchParams(reportsParamsToSearch(state));
    const parsed = parseReportsParams(search, JUN_15);
    expect(parsed.tab).toBe('net-worth');
    expect(parsed.periodValue).toBe('this-year');
    expect(parsed.dayRange).toEqual({ from: '2026-01-01', to: '2026-12-31' });
  });

  it('round-trips a custom range', () => {
    const state = {
      tab: 'cash-flow',
      periodValue: 'custom',
      dayRange: { from: '2026-03-02', to: '2026-03-20' },
    } as const;
    const search = new URLSearchParams(reportsParamsToSearch(state));
    expect(parseReportsParams(search, JUN_15)).toEqual(state);
  });
});
