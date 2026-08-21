import { useMemo } from 'react';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { localeForCountry } from './locale';
import { formatMoney, formatDate, formatDateTime } from './format';

// Locale-bound formatters sourced from the user's COUNTRY signal. undefined
// locale (no/unknown country) → international default (unchanged behavior).
export function useFormat() {
  const { data } = useConfiguration();
  const locale = localeForCountry(data?.country);
  return useMemo(
    () => ({
      formatMoney: (amount: number, currency: string) => formatMoney(amount, currency, locale),
      formatDate: (iso: string) => formatDate(iso, locale),
      formatDateTime: (iso: string) => formatDateTime(iso, locale),
    }),
    [locale],
  );
}
