import { describe, it, expect } from 'vitest';
import { scrubPath } from './analytics';

describe('scrubPath', () => {
  it('leaves a plain route untouched', () => {
    expect(scrubPath('/transactions')).toBe('/transactions');
  });

  it('drops the query string (account ids, dates, filters)', () => {
    expect(scrubPath('/transactions?account=abc&from=2026-01-01')).toBe('/transactions');
  });

  it('replaces a UUID segment with :id', () => {
    expect(scrubPath('/accounts/9f3e2a10-1c4b-4e2a-9b7d-2f5a6c8e1d00/edit')).toBe(
      '/accounts/:id/edit',
    );
  });

  it('replaces an all-digits segment with :id', () => {
    expect(scrubPath('/accounts/12345')).toBe('/accounts/:id');
  });

  it('replaces a long hex (dashless) id with :id', () => {
    expect(scrubPath('/x/9f3e2a101c4b4e2a9b7d2f5a6c8e1d00')).toBe('/x/:id');
  });

  it('preserves known enum tabs that are not id-like', () => {
    expect(scrubPath('/profile/defaults')).toBe('/profile/defaults');
  });

  it('scrubs multiple id segments in one path', () => {
    expect(scrubPath('/a/12345/b/67890')).toBe('/a/:id/b/:id');
  });
});
