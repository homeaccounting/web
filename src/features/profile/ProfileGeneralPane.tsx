import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { useSetDefaultCurrency } from './useSetDefaultCurrency';
import { useSetBaseCurrency } from './useSetBaseCurrency';
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

export function ProfileGeneralPane() {
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
      <Alert variant="destructive" role="alert">
        <AlertDescription>Failed to load configuration.</AlertDescription>
      </Alert>
    );
  }

  const c = config.data;
  return (
    <div className="space-y-6">
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
            onSubmit={(values) => setDefault.mutate(values)}
            isPending={setDefault.isPending}
            error={setDefault.error}
            isSuccess={setDefault.isSuccess}
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
            isSuccess={setBase.isSuccess}
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
                  setBase.mutate({ currency: confirmingBase });
                }
                setConfirmingBase(null);
              }}
            >
              Change base currency
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
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
  isSuccess: boolean;
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
  isSuccess,
}: CurrencyRowProps) {
  const form = useForm<CurrencyFormValues>({
    resolver: zodResolver(currencySchema),
    defaultValues: { currency: current as SupportedCurrency },
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
      {isSuccess && (
        <p data-testid={`${id}-status`} className="text-sm text-green-600">
          Updated.
        </p>
      )}
    </form>
  );
}
