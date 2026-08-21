import { SUPPORTED_LANGUAGES, DEFAULT_LANGUAGE } from '@/locales';

// Best-effort UI language derived from the browser's preferred languages,
// constrained to the app's supported set. Used as the INITIAL i18next language
// for pre-auth / pre-config screens (login, register, onboarding) before the
// server-persisted `language` signal is known. Any unsupported or missing
// browser locale falls back to the default (English).
export function detectBrowserLanguage(): string {
  const prefs =
    typeof navigator === 'undefined'
      ? []
      : navigator.languages && navigator.languages.length > 0
        ? navigator.languages
        : [navigator.language];
  const supported = SUPPORTED_LANGUAGES as readonly string[];
  for (const pref of prefs) {
    if (!pref) continue;
    const [primary] = pref.toLowerCase().split('-');
    if (primary && supported.includes(primary)) return primary;
  }
  return DEFAULT_LANGUAGE;
}
