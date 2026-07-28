import { describe, it, expect, beforeEach } from 'vitest';
import { readReportsLastView, writeReportsLastView, REPORTS_LAST_VIEW_KEY } from './lastView';

describe('reports lastView', () => {
  beforeEach(() => localStorage.clear());
  it('round-trips', () => {
    writeReportsLastView({
      tab: 'net-worth',
      period: 'custom',
      from: '2026-01-01',
      to: '2026-01-31',
    });
    expect(readReportsLastView()).toEqual({
      tab: 'net-worth',
      period: 'custom',
      from: '2026-01-01',
      to: '2026-01-31',
    });
  });
  it('returns null when missing', () => expect(readReportsLastView()).toBeNull());
  it('returns null on corrupt json', () => {
    localStorage.setItem(REPORTS_LAST_VIEW_KEY, '{oops');
    expect(readReportsLastView()).toBeNull();
  });
  it('returns null on shape mismatch', () => {
    localStorage.setItem(REPORTS_LAST_VIEW_KEY, JSON.stringify({ tab: 'x' }));
    expect(readReportsLastView()).toBeNull();
  });
});
