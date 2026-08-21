// Formatting locale is derived from the user's COUNTRY (language drives text
// only). A null/unknown country returns undefined → the international default
// (ISO dates + neutral number grouping), never a country's convention.
// Map covers the p13n foundation's supported country set (US, UA, euro-area);
// extend by one line as new countries are supported.
const LOCALE_BY_COUNTRY: Record<string, string> = {
  US: 'en-US',
  UA: 'uk-UA',
  AT: 'de-AT',
  BE: 'nl-BE',
  HR: 'hr-HR',
  CY: 'el-CY',
  EE: 'et-EE',
  FI: 'fi-FI',
  FR: 'fr-FR',
  DE: 'de-DE',
  GR: 'el-GR',
  IE: 'en-IE',
  IT: 'it-IT',
  LV: 'lv-LV',
  LT: 'lt-LT',
  LU: 'fr-LU',
  MT: 'mt-MT',
  NL: 'nl-NL',
  PT: 'pt-PT',
  SK: 'sk-SK',
  SI: 'sl-SI',
  ES: 'es-ES',
};

export function localeForCountry(country: string | null | undefined): string | undefined {
  if (!country) return undefined;
  return LOCALE_BY_COUNTRY[country.toUpperCase()];
}
