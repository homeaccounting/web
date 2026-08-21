import { afterEach, describe, expect, it } from 'vitest';
import i18n from './i18n';

describe('i18n runtime', () => {
  // Unconditional reset so a failing assertion mid-test can't leak a non-'en'
  // language into the next test (the shared singleton is module-global).
  afterEach(() => i18n.changeLanguage('en'));

  it('starts in English', () => {
    expect(i18n.language).toBe('en');
    expect(i18n.t('common:save')).toBe('Save');
  });

  it('resolves a uk key after switching', async () => {
    await i18n.changeLanguage('uk');
    expect(i18n.t('common:save')).toBe('Зберегти');
  });

  it('falls back to English for an unknown language', async () => {
    await i18n.changeLanguage('zz');
    expect(i18n.t('common:save')).toBe('Save');
  });
});
