// Display-name maps for the backend's supported country/language sets
// (Domain.Localization presets US/EU/UA, tracker#47). Uses static maps rather
// than Intl.DisplayNames because happy-dom test-env support is uncertain.
const COUNTRY_NAMES: Record<string, string> = {
  US: 'United States',
  UA: 'Ukraine',
  AT: 'Austria',
  BE: 'Belgium',
  HR: 'Croatia',
  CY: 'Cyprus',
  EE: 'Estonia',
  FI: 'Finland',
  FR: 'France',
  DE: 'Germany',
  GR: 'Greece',
  IE: 'Ireland',
  IT: 'Italy',
  LV: 'Latvia',
  LT: 'Lithuania',
  LU: 'Luxembourg',
  MT: 'Malta',
  NL: 'Netherlands',
  PT: 'Portugal',
  SK: 'Slovakia',
  SI: 'Slovenia',
  ES: 'Spain',
};

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  uk: 'Ukrainian',
};

export const countryName = (code: string): string => COUNTRY_NAMES[code] ?? code;

export const languageName = (code: string): string => LANGUAGE_NAMES[code] ?? code;
