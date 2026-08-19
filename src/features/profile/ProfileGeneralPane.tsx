import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { useLocalizationOptions } from '@/features/configuration/useLocalizationOptions';
import { countryName, languageName } from '@/features/configuration/localizationLabels';
import { useSetDefaultCurrency } from './useSetDefaultCurrency';
import { useSetBaseCurrency } from './useSetBaseCurrency';
import { useSetLanguage } from './useSetLanguage';
import { useSetCountry } from './useSetCountry';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '@/api/types';
import { currencySchema, type CurrencyFormValues } from './currencySchema';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiError } from '@/api/client';
import { toast } from '@/lib/toast';
import { UserIdCard } from './UserIdCard';

export function ProfileGeneralPane() {
  // The sharing-ID card depends only on the sync auth session, so it renders
  // regardless of configuration state (loading/error). The currency settings,
  // which do depend on configuration, handle their own loading/error below.
  return (
    <div className="space-y-6">
      <UserIdCard />
      <CurrenciesSection />
      <LocalizationSection />
    </div>
  );
}

function LocalizationSection() {
  const config = useConfiguration();
  const options = useLocalizationOptions();
  const setCountry = useSetCountry();
  const setLanguage = useSetLanguage();

  // The configuration is the source of truth for the current selections; until
  // it resolves there is nothing to show. Mirror CurrenciesSection's guard.
  if (config.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-64" />
      </div>
    );
  }
  if (config.isError || !config.data) {
    return null;
  }

  const c = config.data;
  const countries = options.data?.countries ?? [];
  const languages = options.data?.languages ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Region &amp; language</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <label id="country-label" htmlFor="country" className="w-40 text-sm font-medium">
              Country
            </label>
            <Select
              value={c.country ?? ''}
              onValueChange={(code) => setCountry.mutate({ country: code })}
            >
              <SelectTrigger id="country" className="w-56" aria-label="Country">
                <SelectValue placeholder="Not set" />
              </SelectTrigger>
              <SelectContent>
                {countries.map((code) => (
                  <SelectItem key={code} value={code}>
                    {countryName(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-sm text-muted-foreground">
            Sets regional defaults such as currency and language.
          </p>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <label id="language-label" htmlFor="language" className="w-40 text-sm font-medium">
              Language
            </label>
            <Select
              value={c.language}
              onValueChange={(code) => setLanguage.mutate({ language: code })}
            >
              <SelectTrigger id="language" className="w-56" aria-label="Language">
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
          </div>
          <p className="text-sm text-muted-foreground">
            The language used across the app and in notifications.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function CurrenciesSection() {
  const config = useConfiguration();
  const setDefault = useSetDefaultCurrency();
  const setBase = useSetBaseCurrency();
  const [confirmingBase, setConfirmingBase] = useState<SupportedCurrency | null>(null);

  if (config.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-10 w-64" />
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
  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Currencies</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <CurrencyRow
            id="defaultCurrency"
            label="Default currency"
            description="Used when creating new accounts and transactions."
            current={c.defaultCurrency}
            onSubmit={(values) =>
              setDefault.mutate(values, { onSuccess: () => toast.success('Updated.') })
            }
            isPending={setDefault.isPending}
            error={setDefault.error}
          />
          <CurrencyRow
            id="baseCurrency"
            label="Base currency"
            description={
              c.baseCurrencyEditable
                ? 'Re-bases the External account that anchors your reporting.'
                : 'Base currency is locked because your books already contain transactions.'
            }
            current={c.baseCurrency}
            disabled={!c.baseCurrencyEditable}
            onSubmit={(values) => setConfirmingBase(values.currency)}
            isPending={setBase.isPending}
            error={setBase.error}
          />
        </CardContent>
      </Card>
      <AlertDialog
        open={confirmingBase !== null}
        onOpenChange={(open) => !open && setConfirmingBase(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Change base currency</AlertDialogTitle>
            <AlertDialogDescription>
              Change base currency from {c.baseCurrency} to {confirmingBase}? This re-bases the
              External account that anchors your reporting. This cannot be undone from the UI.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (confirmingBase) {
                  setBase.mutate(
                    { currency: confirmingBase },
                    { onSuccess: () => toast.success('Updated.') },
                  );
                }
                setConfirmingBase(null);
              }}
            >
              Change base currency
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

interface CurrencyRowProps {
  id: string;
  label: string;
  description: string;
  current: string;
  disabled?: boolean;
  onSubmit: (values: CurrencyFormValues) => void;
  isPending: boolean;
  error: Error | null;
}

function CurrencyRow({
  id,
  label,
  description,
  current,
  disabled,
  onSubmit,
  isPending,
  error,
}: CurrencyRowProps) {
  // `values` (not `defaultValues`) so the row re-syncs when `current` changes
  // underneath it — e.g. a country-preset cascade updates the default currency
  // via a different control. `defaultValues` only applies once at mount, which
  // left the select showing the stale currency until a reload.
  const form = useForm<CurrencyFormValues>({
    resolver: zodResolver(currencySchema),
    values: { currency: current as SupportedCurrency },
  });
  const selected = form.watch('currency');
  const dirty = selected !== current;
  const message =
    error instanceof ApiError ? (error.fieldErrors?.currency ?? error.message) : error?.message;

  return (
    <form
      className="space-y-2"
      onSubmit={(e) => void form.handleSubmit(onSubmit)(e)}
      aria-labelledby={`${id}-label`}
    >
      <div className="flex items-center gap-3">
        <label id={`${id}-label`} htmlFor={id} className="w-40 text-sm font-medium">
          {label}
        </label>
        <Select
          disabled={disabled}
          value={selected}
          onValueChange={(v) => form.setValue('currency', v as SupportedCurrency)}
        >
          <SelectTrigger id={id} className="w-32" aria-label={label}>
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
        {!disabled && (
          <Button type="submit" disabled={!dirty || isPending}>
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">{description}</p>
      {message && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      )}
    </form>
  );
}
