import { describe, expect, it } from 'vitest';
import { buildInfoPayload } from './info-endpoint';

describe('buildInfoPayload', () => {
  it('returns valid JSON with the supplied version and commit', () => {
    const json = buildInfoPayload({ version: '0.1.0', commit: 'abc123f' });
    expect(JSON.parse(json)).toEqual({ version: '0.1.0', commit: 'abc123f' });
  });

  it('emits exactly two keys (no extras like status or environment)', () => {
    const json = buildInfoPayload({ version: '9.9.9', commit: 'deadbee' });
    expect(Object.keys(JSON.parse(json) as Record<string, unknown>).sort()).toEqual([
      'commit',
      'version',
    ]);
  });
});
