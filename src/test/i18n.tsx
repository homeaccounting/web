import { type ReactElement } from 'react';
import { I18nextProvider } from 'react-i18next';
import i18n from '@/lib/i18n';
import { renderWithProviders } from './utils';

// Render under a specific UI language. Defaults to 'en'. Composes with the
// standard providers helper.
export function renderWithLanguage(
  ui: ReactElement,
  language: 'en' | 'uk' = 'en',
  options?: Parameters<typeof renderWithProviders>[1],
) {
  void i18n.changeLanguage(language);
  return renderWithProviders(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>, options);
}
