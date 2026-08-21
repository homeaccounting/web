import { describe, expect, it } from 'vitest';
import { resources } from './index';

// Flatten nested keys to dotted paths for a precise set comparison.
function keyPaths(obj: Record<string, unknown>, prefix = ''): string[] {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === 'object'
      ? keyPaths(v as Record<string, unknown>, `${prefix}${k}.`)
      : [`${prefix}${k}`],
  );
}

describe('catalog completeness', () => {
  const namespaces = Object.keys(resources.en) as (keyof typeof resources.en)[];

  it.each(namespaces)('uk namespace "%s" has the same keys as en', (ns) => {
    const en = new Set(keyPaths(resources.en[ns]));
    const uk = new Set(keyPaths((resources.uk as Record<string, unknown>)[ns] as Record<string, unknown>));
    const missingInUk = [...en].filter((k) => !uk.has(k));
    const extraInUk = [...uk].filter((k) => !en.has(k));
    expect({ missingInUk, extraInUk }).toEqual({ missingInUk: [], extraInUk: [] });
  });

  it('uk defines every namespace en does', () => {
    expect(Object.keys(resources.uk).sort()).toEqual(Object.keys(resources.en).sort());
  });
});
