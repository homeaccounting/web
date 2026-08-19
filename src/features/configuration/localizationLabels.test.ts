import { describe, expect, it } from 'vitest';

import { countryName, languageName } from './localizationLabels';

describe('countryName', () => {
  it('maps known country codes to display names', () => {
    expect(countryName('UA')).toBe('Ukraine');
    expect(countryName('US')).toBe('United States');
  });

  it('falls back to the raw code for unknown countries', () => {
    expect(countryName('ZZ')).toBe('ZZ');
  });
});

describe('languageName', () => {
  it('maps known language codes to display names', () => {
    expect(languageName('en')).toBe('English');
    expect(languageName('uk')).toBe('Ukrainian');
  });

  it('falls back to the raw code for unknown languages', () => {
    expect(languageName('xx')).toBe('xx');
  });
});
