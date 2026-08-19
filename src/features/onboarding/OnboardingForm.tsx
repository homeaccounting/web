import { type ReactNode } from 'react';
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
  const config = useConfiguration();
  const options = useLocalizationOptions();
  const setCountry = useSetCountry();
  const setLanguage = useSetLanguage();
  const setDefaultCurrency = useSetDefaultCurrency();
  const setBaseCurrency = useSetBaseCurrency();

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
          <AlertDescription>Couldn&rsquo;t load configuration.</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => void config.refetch()}>
          Retry
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
        label="Country"
        help="Sets regional defaults such as currency and language."
      >
        <Select
          disabled={busy}
          value={c.country ?? ''}
          onValueChange={(code) => setCountry.mutate({ country: code })}
        >
          <SelectTrigger id="country" aria-label="Country">
            <SelectValue placeholder="Select your country" />
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
        label="Default currency"
        help="Used when creating new accounts and transactions."
      >
        <Select
          disabled={busy}
          value={c.defaultCurrency}
          onValueChange={(v) =>
            setDefaultCurrency.mutate(
              { currency: v },
              { onSuccess: () => toast.success('Updated.') },
            )
          }
        >
          <SelectTrigger id="defaultCurrency" aria-label="Default currency">
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
        label="Language"
        help="The language used across the app and in notifications."
      >
        <Select
          disabled={busy}
          value={c.language}
          onValueChange={(code) => setLanguage.mutate({ language: code })}
        >
          <SelectTrigger id="language" aria-label="Language">
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
        label="Base currency"
        help="Anchors your reporting across all accounts."
      >
        <Select
          disabled={!c.baseCurrencyEditable || busy}
          value={c.baseCurrency}
          onValueChange={(v) =>
            setBaseCurrency.mutate({ currency: v }, { onSuccess: () => toast.success('Updated.') })
          }
        >
          <SelectTrigger id="baseCurrency" aria-label="Base currency">
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
