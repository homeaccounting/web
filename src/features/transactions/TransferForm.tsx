import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, FormProvider, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MoneyInput } from '@/components/MoneyInput';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import type { AccountResponse, DictionaryEntryResponse } from '@/api/types';
import { transferFormSchema, makeTransferFormSchema, type TransferFormValues } from './schema';
import { LabelMultiSelect } from './LabelMultiSelect';
import { DatePicker } from '@/components/DatePicker';
import { RequiredMarker } from '@/components/RequiredMarker';
import { transactionKindLabel } from './labels';
import { accountLabelParts } from '@/features/accounts/accountLabel';
import { convertAmount, deriveExchangeRate } from '@/lib/money';

export interface TransferFormApi {
  setFieldError: (field: string, message: string) => void;
}

export interface TransferFormProps {
  mode: 'create' | 'edit';
  accounts: AccountResponse[];
  labels: DictionaryEntryResponse[];
  defaultValues: TransferFormValues;
  isSubmitting: boolean;
  /** When set, validate the debit against the source account balance (create only). */
  enforceBalance?: boolean;
  onSubmit: (values: TransferFormValues) => void | Promise<void>;
  onCancel: () => void;
  onReady?: (api: TransferFormApi) => void;
}

export function TransferForm({
  mode,
  accounts,
  labels,
  defaultValues,
  isSubmitting,
  enforceBalance = false,
  onSubmit,
  onCancel,
  onReady,
}: TransferFormProps) {
  const { t } = useTranslation('transactions');
  const resolver = useMemo<Resolver<TransferFormValues>>(
    () =>
      zodResolver(
        enforceBalance ? makeTransferFormSchema(accounts) : transferFormSchema,
      ) as Resolver<TransferFormValues>,
    [enforceBalance, accounts],
  );

  const form = useForm<TransferFormValues>({
    resolver,
    defaultValues,
  });

  const isEdit = mode === 'edit';
  const isDirty = form.formState.isDirty;

  const sourceAccountId = form.watch('sourceAccountId');
  const targetAccountId = form.watch('targetAccountId');
  const source = accounts.find((a) => a.id === sourceAccountId);
  const target = accounts.find((a) => a.id === targetAccountId);

  useEffect(() => {
    if (source) form.setValue('currency', source.currency, { shouldDirty: false });
  }, [source, form]);

  useEffect(() => {
    onReady?.({
      setFieldError: (field, message) =>
        form.setError(field as keyof TransferFormValues, { type: 'server', message }),
    });
  }, [form, onReady]);

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  const showExchangeRate = !!source && !!target && source.currency !== target.currency;

  // UI-only: the wire format carries just amount + rate, so the target amount
  // is a second way to enter the rate. Whichever of the two the user typed last
  // stays fixed and the other is recomputed, including when the amount changes.
  const [targetAmount, setTargetAmount] = useState<number | string | undefined>(() =>
    convertAmount(defaultValues.amount, defaultValues.exchangeRate),
  );
  const targetDrivesRate = useRef(false);
  const targetAmountId = useId();

  const setDerivedRate = (rate: number | undefined) =>
    form.setValue('exchangeRate', rate, { shouldDirty: true });

  const handleAmountChange = (amount: number | string) => {
    if (targetDrivesRate.current) setDerivedRate(deriveExchangeRate(amount, targetAmount));
    else setTargetAmount(convertAmount(amount, form.getValues('exchangeRate')));
  };

  const handleRateChange = (rate: number | string | undefined) => {
    targetDrivesRate.current = false;
    setTargetAmount(convertAmount(form.getValues('amount'), rate));
  };

  const handleTargetAmountChange = (value: number | string) => {
    targetDrivesRate.current = true;
    setTargetAmount(value);
    setDerivedRate(deriveExchangeRate(form.getValues('amount'), value));
  };

  return (
    <FormProvider {...form}>
      <form
        aria-label={t('form.formAria', { title: transactionKindLabel('transfer', 'title') })}
        onSubmit={(e) => {
          void submit(e);
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <DialogBody>
          <div
            data-testid="form-grid-source-target"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <FormField
              control={form.control}
              name="sourceAccountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('form.sourceAccount')}
                    <RequiredMarker />
                  </FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label={t('form.sourceAccount')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => {
                          // Currency is already shown in parentheses, so the
                          // qualifier carries only the bank name.
                          const { qualifier } = accountLabelParts(a, accounts, {
                            currencyTiebreaker: false,
                          });
                          return (
                            <SelectItem key={a.id} value={a.id}>
                              {qualifier ? `${a.name} · ${qualifier}` : a.name} ({a.currency})
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="targetAccountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('form.targetAccount')}
                    <RequiredMarker />
                  </FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label={t('form.targetAccount')}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => {
                          // Currency is already shown in parentheses, so the
                          // qualifier carries only the bank name.
                          const { qualifier } = accountLabelParts(a, accounts, {
                            currencyTiebreaker: false,
                          });
                          return (
                            <SelectItem key={a.id} value={a.id}>
                              {qualifier ? `${a.name} · ${qualifier}` : a.name} ({a.currency})
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div
            data-testid="form-grid-amount-date"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <FormField
              control={form.control}
              name="amount"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('form.amount')}
                    <RequiredMarker />
                  </FormLabel>
                  <FormControl>
                    <MoneyInput
                      currency={source?.currency ?? ''}
                      value={field.value}
                      onChange={(v) => {
                        field.onChange(v);
                        handleAmountChange(v);
                      }}
                      name={field.name}
                      onBlur={field.onBlur}
                      inputRef={field.ref}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('form.date')} <RequiredMarker />
                  </FormLabel>
                  <FormControl>
                    <DatePicker
                      withTime
                      value={field.value ?? ''}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      name={field.name}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          {showExchangeRate && (
            <div
              data-testid="form-grid-rate-target"
              className="grid grid-cols-1 gap-4 sm:grid-cols-2"
            >
              <FormField
                control={form.control}
                name="exchangeRate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('form.exchangeRate')}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="any"
                        name={field.name}
                        ref={field.ref}
                        onBlur={field.onBlur}
                        value={field.value ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (raw === '') {
                            field.onChange(undefined);
                            handleRateChange(undefined);
                            return;
                          }
                          const n = e.target.valueAsNumber;
                          const next = Number.isNaN(n) ? raw : n;
                          field.onChange(next);
                          handleRateChange(next);
                        }}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">{t('form.exchangeRateHint')}</p>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="space-y-2">
                <Label htmlFor={targetAmountId}>{t('form.targetAmount')}</Label>
                <MoneyInput
                  id={targetAmountId}
                  aria-label={t('form.targetAmount')}
                  currency={target.currency}
                  value={targetAmount}
                  onChange={handleTargetAmountChange}
                />
                <p className="text-xs text-muted-foreground">{t('form.targetAmountHint')}</p>
              </div>
            </div>
          )}

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('form.description')}</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="labels"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('form.labels')}</FormLabel>
                <FormControl>
                  <LabelMultiSelect
                    options={labels}
                    value={field.value ?? []}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('common:cancel')}
          </Button>
          <Button type="submit" disabled={isSubmitting || (isEdit && !isDirty)}>
            {isSubmitting
              ? t('form.saving')
              : isEdit
                ? transactionKindLabel('transfer', 'editSubmit')
                : transactionKindLabel('transfer', 'submit')}
          </Button>
        </DialogFooter>
      </form>
    </FormProvider>
  );
}
