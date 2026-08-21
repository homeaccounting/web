import { afterEach, describe, expect, it } from 'vitest';
import { hasChosenLanguage, markLanguageChosen } from './languageChoice';

afterEach(() => localStorage.clear());

describe('languageChoice', () => {
  it('is not chosen by default', () => {
    expect(hasChosenLanguage()).toBe(false);
  });

  it('reports chosen after marking', () => {
    markLanguageChosen();
    expect(hasChosenLanguage()).toBe(true);
  });
});
