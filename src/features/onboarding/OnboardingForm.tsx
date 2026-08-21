import { type ReactNode, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { detectBrowserLanguage } from '@/lib/browserLanguage';
import { hasChosenLanguage, markLanguageChosen } from '@/lib/languageChoice';
import { DEFAULT_LANGUAGE } from '@/locales';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { useLocalizationOptions } from '@/features/configuration/useLocalizationOptions';
import { countryName, languageName } from '@/features/configuration/localizationLabels';
import { useSetCountry } from '@/features/profile/useSetCountry';
import { useSetLanguage } from '@/features/profile/useSetLanguage';
import { useSetDefaultCurrency } from '@/features/profile/useSetDefaultCurrency';
import { useSetBaseCurrency } from '@/features/profile/useSetBaseCurrency';
import { SUPPORTED_CURRENCIES } from '@/api/types';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/lib/toast';

// First-run setup controls (tracker#58). Country is the primary control: it
// fires the existing preset cascade (useSetCountry refetches config+providers
// and toasts what it adjusted), which shifts the currency/language selects below
// via the shared ['configuration'] cache. Each control writes immediately on
// change, so even a user who then hits "Skip" keeps the applied preset. Unlike
// the Settings surface, base currency has NO confirmation dialog — there is
// nothing to re-base on a brand-new, transaction-less account.
export function OnboardingForm() {
  const { t } = useTranslation('onboarding');
  const config = useConfiguration();
  const options = useLocalizationOptions();
  const setCountry = useSetCountry();
  const setLanguage = useSetLanguage();
  const setDefaultCurrency = useSetDefaultCurrency();
  const setBaseCurrency = useSetBaseCurrency();

  // First-run: seed the language from the browser once, for a user who hasn't
  // chosen anything yet (country still unset). Persisting it makes the pick
  // authoritative (LanguageSync keeps it, the selector reflects it) — a soft
  // default the user can still change below. No-op when the browser language
  // already matches or isn't supported.
  const seededLanguage = useRef(false);
  useEffect(() => {
    if (seededLanguage.current) return;
    const data = config.data;
    // Only for a brand-new user who hasn't engaged: no country, no explicit
    // choice, and the language still the untouched default (a non-default value
    // means it was already chosen or previously seeded — don't overwrite it).
    if (!data || data.country != null || hasChosenLanguage()) return;
    if (data.language !== DEFAULT_LANGUAGE) return;
    const browserLanguage = detectBrowserLanguage();
    if (browserLanguage === DEFAULT_LANGUAGE) return;
    seededLanguage.current = true;
    setLanguage.mutate({ language: browserLanguage });
  }, [config.data, setLanguage]);

  if (config.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }
  if (config.isError || !config.data) {
    return (
      <div className="space-y-2">
        <Alert variant="destructive" role="alert">
          <AlertDescription>{t('errors.loadConfiguration')}</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => void config.refetch()}>
          {t('common:retry')}
        </Button>
      </div>
    );
  }

  const c = config.data;
  const countries = options.data?.countries ?? [];
  const languages = options.data?.languages ?? [];

  // The country control triggers an async preset cascade (PUT → server may
  // change language/currency → refetch of ['configuration']). Every control
  // here writes to that same cache, so an edit made mid-cascade would be
  // clobbered by the cascade's refetch (e.g. a language pick overwritten by the
  // preset). Lock all controls while any write or the ensuing refetch is in
  // flight; this serializes edits so a later choice always lands on settled
  // state and sticks.
  const busy =
    config.isFetching ||
    setCountry.isPending ||
    setLanguage.isPending ||
    setDefaultCurrency.isPending ||
    setBaseCurrency.isPending;

  return (
    <div className="space-y-5">
      <Field
        id="country"
        label={t('fields.country.label')}
        help={t('fields.country.help')}
      >
        <Select
          disabled={busy}
          value={c.country ?? ''}
          onValueChange={(code) => setCountry.mutate({ country: code })}
        >
          <SelectTrigger id="country" aria-label={t('fields.country.label')}>
            <SelectValue placeholder={t('fields.country.placeholder')} />
          </SelectTrigger>
          <SelectContent>
            {countries.map((code) => (
              <SelectItem key={code} value={code}>
                {countryName(code)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        id="defaultCurrency"
        label={t('fields.defaultCurrency.label')}
        help={t('fields.defaultCurrency.help')}
      >
        <Select
          disabled={busy}
          value={c.defaultCurrency}
          onValueChange={(v) =>
            setDefaultCurrency.mutate(
              { currency: v },
              { onSuccess: () => toast.success(t('updated')) },
            )
          }
        >
          <SelectTrigger id="defaultCurrency" aria-label={t('fields.defaultCurrency.label')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_CURRENCIES.map((cur) => (
              <SelectItem key={cur} value={cur}>
                {cur}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        id="language"
        label={t('fields.language.label')}
        help={t('fields.language.help')}
      >
        <Select
          disabled={busy}
          value={c.language}
          onValueChange={(code) => {
            markLanguageChosen();
            setLanguage.mutate({ language: code });
          }}
        >
          <SelectTrigger id="language" aria-label={t('fields.language.label')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {languages.map((code) => (
              <SelectItem key={code} value={code}>
                {languageName(code)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      <Field
        id="baseCurrency"
        label={t('fields.baseCurrency.label')}
        help={t('fields.baseCurrency.help')}
      >
        <Select
          disabled={!c.baseCurrencyEditable || busy}
          value={c.baseCurrency}
          onValueChange={(v) =>
            setBaseCurrency.mutate({ currency: v }, { onSuccess: () => toast.success(t('updated')) })
          }
        >
          <SelectTrigger id="baseCurrency" aria-label={t('fields.baseCurrency.label')}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {SUPPORTED_CURRENCIES.map((cur) => (
              <SelectItem key={cur} value={cur}>
                {cur}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
}

function Field({
  id,
  label,
  help,
  children,
}: {
  id: string;
  label: string;
  help: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      <p className="text-sm text-muted-foreground">{help}</p>
    </div>
  );
}
