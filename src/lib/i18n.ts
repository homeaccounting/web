import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resources, DEFAULT_LANGUAGE, DEFAULT_NAMESPACE, NAMESPACES } from '@/locales';
import { detectBrowserLanguage } from './browserLanguage';

// Global singleton. Both catalogs are statically imported (two languages — no
// lazy loading, so no loading flash). English is the fallback for any missing
// key or unbundled locale. The INITIAL language is derived from the browser so
// pre-auth / pre-config screens (login, register, onboarding) render in the
// user's language before the server-persisted signal loads; once a signed-in
// user's config arrives, LanguageSync applies the authoritative `language`.
void i18n.use(initReactI18next).init({
  resources,
  lng: detectBrowserLanguage(),
  // English is always the ultimate fallback for missing keys.
  fallbackLng: DEFAULT_LANGUAGE,
  defaultNS: DEFAULT_NAMESPACE,
  ns: NAMESPACES,
  returnEmptyString: false,
  interpolation: { escapeValue: false }, // React already escapes
  saveMissing: import.meta.env.DEV,
  missingKeyHandler: import.meta.env.DEV
    ? (_lng, ns, key) => console.warn(`[i18n] missing key: ${ns}:${key}`)
    : undefined,
});

export default i18n;
