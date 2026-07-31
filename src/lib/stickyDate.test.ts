import { describe, it, expect } from 'vitest';
import { nowDateTimeInput } from '@/lib/dates';
import {
  STICKY_DATE_KEY,
  readStickyDay,
  writeStickyDay,
  defaultTransactionDate,
} from './stickyDate';

// A fixed "now" so composed times are deterministic. 2026-07-28, 14:05 local.
const NOW = new Date(2026, 6, 28, 14, 5, 0);
const TODAY = '2026-07-28';

function seed(day: string, recordedOn: string) {
  sessionStorage.setItem(STICKY_DATE_KEY, JSON.stringify({ day, recordedOn }));
}

describe('readStickyDay', () => {
  it('returns null when nothing is stored', () => {
    expect(readStickyDay(NOW)).toBeNull();
  });

  it('returns a past day that was recorded today (the reconciliation use case)', () => {
    seed('2026-07-03', TODAY);
    expect(readStickyDay(NOW)).toBe('2026-07-03');
  });

  it('returns today when today was recorded today', () => {
    seed(TODAY, TODAY);
    expect(readStickyDay(NOW)).toBe(TODAY);
  });

  it('returns a future day that was recorded today', () => {
    seed('2026-12-31', TODAY);
    expect(readStickyDay(NOW)).toBe('2026-12-31');
  });

  it('ignores a value recorded on an earlier calendar day (tab left open across midnight)', () => {
    seed('2026-07-03', '2026-07-27');
    expect(readStickyDay(NOW)).toBeNull();
  });

  it('returns null on a malformed stored value', () => {
    sessionStorage.setItem(STICKY_DATE_KEY, 'not json');
    expect(readStickyDay(NOW)).toBeNull();
  });
});

describe('writeStickyDay', () => {
  it('stores the day part of a datetime value plus today as recordedOn', () => {
    writeStickyDay('2026-07-03T09:30', NOW);
    expect(JSON.parse(sessionStorage.getItem(STICKY_DATE_KEY)!)).toEqual({
      day: '2026-07-03',
      recordedOn: TODAY,
    });
  });

  it('accepts a bare day value', () => {
    writeStickyDay('2026-07-03', NOW);
    const stored = JSON.parse(sessionStorage.getItem(STICKY_DATE_KEY)!) as { day: string };
    expect(stored.day).toBe('2026-07-03');
  });
});

describe('defaultTransactionDate', () => {
  it('equals nowDateTimeInput() when nothing is stored', () => {
    // Use the real clock for both so they line up to the minute.
    const now = new Date();
    expect(defaultTransactionDate(now)).toBe(nowDateTimeInput());
  });

  it('composes a stored sticky day with the current time', () => {
    seed('2026-07-03', TODAY);
    expect(defaultTransactionDate(NOW)).toBe('2026-07-03T14:05');
  });

  it('falls back to today when the stored value is stale', () => {
    seed('2026-07-03', '2026-07-27');
    expect(defaultTransactionDate(NOW)).toBe('2026-07-28T14:05');
  });
});
