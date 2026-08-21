import { describe, expect, it } from 'vitest';
import { localeForCountry } from './locale';

describe('localeForCountry', () => {
  it('maps US to en-US', () => expect(localeForCountry('US')).toBe('en-US'));
  it('maps UA to uk-UA', () => expect(localeForCountry('UA')).toBe('uk-UA'));
  it('maps DE to de-DE', () => expect(localeForCountry('DE')).toBe('de-DE'));
  it('is case-insensitive for the country code', () =>
    expect(localeForCountry('ua')).toBe('uk-UA'));
  it('returns undefined for an unmapped country', () =>
    expect(localeForCountry('ZZ')).toBeUndefined());
  it('returns undefined for null/undefined country', () => {
    expect(localeForCountry(null)).toBeUndefined();
    expect(localeForCountry(undefined)).toBeUndefined();
  });
});
