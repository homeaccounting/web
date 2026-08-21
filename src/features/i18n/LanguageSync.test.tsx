import { afterEach, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import i18n from '@/lib/i18n';
import { markLanguageChosen } from '@/lib/languageChoice';
import { LanguageSync } from './LanguageSync';

vi.mock('@/features/configuration/useConfiguration', () => ({
  useConfiguration: vi.fn(),
}));
import { useConfiguration } from '@/features/configuration/useConfiguration';

afterEach(async () => {
  await i18n.changeLanguage('en');
});

it('switches i18next to a non-default config language (established)', async () => {
  vi.mocked(useConfiguration).mockReturnValue({ data: { language: 'uk' } } as never);
  render(<LanguageSync />);
  await waitFor(() => expect(i18n.language).toBe('uk'));
});

it('stays on en when no config (signed out)', async () => {
  vi.mocked(useConfiguration).mockReturnValue({ data: undefined } as never);
  render(<LanguageSync />);
  await waitFor(() => expect(i18n.language).toBe('en'));
});

it('does NOT apply the default language for an unestablished fresh user', async () => {
  // A fresh user (no country, not explicitly chosen) whose stored language is
  // the untouched default must not clobber the browser-detected boot language.
  await i18n.changeLanguage('uk');
  vi.mocked(useConfiguration).mockReturnValue({
    data: { language: 'en', country: null },
  } as never);
  render(<LanguageSync />);
  await new Promise((r) => setTimeout(r, 50));
  expect(i18n.language).toBe('uk');
});

it('applies the default language once a country is set (established)', async () => {
  await i18n.changeLanguage('uk');
  vi.mocked(useConfiguration).mockReturnValue({
    data: { language: 'en', country: 'US' },
  } as never);
  render(<LanguageSync />);
  await waitFor(() => expect(i18n.language).toBe('en'));
});

it('applies the default language once the user has explicitly chosen it', async () => {
  await i18n.changeLanguage('uk');
  markLanguageChosen();
  vi.mocked(useConfiguration).mockReturnValue({
    data: { language: 'en', country: null },
  } as never);
  render(<LanguageSync />);
  await waitFor(() => expect(i18n.language).toBe('en'));
});
