import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectBrowserLanguage } from './browserLanguage';

function stubLanguages(languages: string[] | undefined) {
  vi.stubGlobal('navigator', { languages, language: languages?.[0] });
}

afterEach(() => vi.unstubAllGlobals());

describe('detectBrowserLanguage', () => {
  it('picks the first supported browser language by primary subtag', () => {
    stubLanguages(['uk-UA', 'en-US']);
    expect(detectBrowserLanguage()).toBe('uk');
  });

  it('maps en-US to en', () => {
    stubLanguages(['en-US']);
    expect(detectBrowserLanguage()).toBe('en');
  });

  it('skips unsupported languages and uses the first supported one', () => {
    stubLanguages(['fr-FR', 'de', 'uk']);
    expect(detectBrowserLanguage()).toBe('uk');
  });

  it('falls back to en when no browser language is supported', () => {
    stubLanguages(['fr', 'de']);
    expect(detectBrowserLanguage()).toBe('en');
  });

  it('is case-insensitive', () => {
    stubLanguages(['UK']);
    expect(detectBrowserLanguage()).toBe('uk');
  });

  it('falls back to en when the browser exposes no languages', () => {
    stubLanguages([]);
    expect(detectBrowserLanguage()).toBe('en');
  });
});
