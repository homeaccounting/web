import { useEffect } from 'react';
import i18n from '@/lib/i18n';
import { DEFAULT_LANGUAGE } from '@/locales';
import { hasChosenLanguage } from '@/lib/languageChoice';
import { useConfiguration } from '@/features/configuration/useConfiguration';

// Renders nothing. Syncs the i18next language to the server-persisted signal so
// the UI switches live (the whole tree consumes useTranslation and re-renders).
//
// It applies the server `language` only once it is ESTABLISHED, so a fresh
// user's browser-detected boot language (see `detectBrowserLanguage`) isn't
// clobbered by the untouched server default before onboarding seeds it — which
// would cause a boot→default→seed flash. "Established" means any of:
//   - a country is set (the user engaged with onboarding/settings), or
//   - the stored language is non-default (they must have chosen it — or it was
//     seeded from the browser), or
//   - the user explicitly picked a language this browser (`hasChosenLanguage`),
//     which covers deliberately choosing the default (`en`).
export function LanguageSync() {
  const { data } = useConfiguration();
  const language = data?.language;
  const established =
    data != null &&
    (data.country != null || data.language !== DEFAULT_LANGUAGE || hasChosenLanguage());
  useEffect(() => {
    if (established && language && i18n.language !== language) {
      void i18n.changeLanguage(language);
    }
  }, [language, established]);
  return null;
}
