import { describe, expect, it } from 'vitest';
import { labelChipClasses, LABEL_CHIP_PALETTE } from './labelColors';

describe('labelChipClasses', () => {
  it('is deterministic for the same id', () => {
    expect(labelChipClasses('abc')).toBe(labelChipClasses('abc'));
  });

  it('always returns a class string from the palette', () => {
    for (const id of ['a', 'trip-123', '', '00000000-0000-0000-0000-0000000000aa']) {
      expect(LABEL_CHIP_PALETTE).toContain(labelChipClasses(id));
    }
  });

  it('spreads different ids across more than one palette entry', () => {
    const seen = new Set(Array.from({ length: 50 }, (_, i) => labelChipClasses(`label-${i}`)));
    expect(seen.size).toBeGreaterThan(1);
  });
});
