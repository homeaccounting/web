import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, FormProvider, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { MoneyInput } from '@/components/MoneyInput';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import type { AccountResponse, DictionaryEntryResponse, UUID } from '@/api/types';
import { transferFormSchema, makeTransferFormSchema, type TransferFormValues } from './schema';
import { LabelMultiSelect } from './LabelMultiSelect';
import type { CreateEntry } from './useInlineCreate';
import { DatePicker } from '@/components/DatePicker';
import { RequiredMarker } from '@/components/RequiredMarker';
import { transactionKindLabel } from './labels';
import { AccountPicker } from '@/features/accounts/AccountPicker';
import { transactableAccounts } from '@/features/accounts/transactableAccounts';
import { convertAmount, deriveExchangeRate } from '@/lib/money';
import { useFormat } from '@/lib/useFormat';
import { AllocationSectionRows } from './AllocationsEditor';
import { dropEmptySlices } from './allocations';
import { feeTotal, transferCredit, transferDebit, type FeeMode } from './transferFees';

export interface TransferFormApi {
  setFieldError: (field: string, message: string) => void;
}

export interface TransferFormProps {
  mode: 'create' | 'edit';
  accounts: AccountResponse[];
  labels: DictionaryEntryResponse[];
  /** Expense-category dictionary offered for the transfer's fees. */
  feeCategories: DictionaryEntryResponse[];
  /** Create a new label from a typed name and resolve its id (or null on failure). */
  onCreateLabel?: CreateEntry;
  defaultValues: TransferFormValues;
  isSubmitting: boolean;
  /** When set, validate the debit against the source account balance (create only). */
  enforceBalance?: boolean;
  onSubmit: (values: TransferFormValues) => void | Promise<void>;
  onCancel: () => void;
  onReady?: (api: TransferFormApi) => void;
  // Leading "Recent" accounts in each picker (create dialog).
  recentSourceIds?: readonly UUID[];
  recentTargetIds?: readonly UUID[];
}

export function TransferForm({
  mode,
  accounts,
  labels,
  feeCategories,
  onCreateLabel,
  defaultValues,
  isSubmitting,
  enforceBalance = false,
  onSubmit,
  onCancel,
  onReady,
  recentSourceIds,
  recentTargetIds,
}: TransferFormProps) {
  const { t } = useTranslation('transactions');
  const { formatMoney } = useFormat();
  const resolver = useMemo<Resolver<TransferFormValues>>(() => {
    const base = zodResolver(
      enforceBalance ? makeTransferFormSchema(accounts) : transferFormSchema,
    ) as Resolver<TransferFormValues>;
    // A blank fee row (seeded by the toggle or "+") is a UI affordance, not a fee.
    return (values, context, options) =>
      base({ ...values, expenses: dropEmptySlices(values.expenses) }, context, options);
  }, [enforceBalance, accounts]);

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
  // Keep the initial accounts so an edited transfer on a since-closed or
  // view-only account still shows them.
  const sourceOptions = useMemo(
    () => transactableAccounts(accounts, [defaultValues.sourceAccountId]),
    [accounts, defaultValues.sourceAccountId],
  );
  const targetOptions = useMemo(
    () =>
      transactableAccounts(accounts, [defaultValues.targetAccountId]).filter(
        (a) => a.id !== sourceAccountId,
      ),
    [accounts, defaultValues.targetAccountId, sourceAccountId],
  );

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
    await onSubmit({ ...values, expenses: dropEmptySlices(values.expenses) });
  });

  const [showFees, setShowFees] = useState(defaultValues.expenses.length > 0);
  const feeModeName = useId();
  const amount = form.watch('amount');
  const fees = form.watch('expenses');
  const feeMode = form.watch('feeMode');
  const feeInput = { amount, expenses: fees, feeMode };
  const fee = feeTotal(fees);
  const debit = transferDebit(feeInput);
  // What the rate converts: the debit less the fees.
  const credit = transferCredit(feeInput);

  const toggleFees = (on: boolean) => {
    setShowFees(on);
    form.setValue('expenses', on ? [{ category: '', amount: NaN, comment: '' }] : [], {
      shouldDirty: true,
    });
  };

  const showExchangeRate = !!source && !!target && source.currency !== target.currency;

  // UI-only: the wire format carries just amount + rate, so the target amount
  // is a second way to enter the rate. Whichever of the two the user typed last
  // stays fixed and the other is recomputed, including when the amount changes.
  const [targetAmount, setTargetAmount] = useState<number | string | undefined>(() =>
    convertAmount(credit, defaultValues.exchangeRate),
  );
  const targetDrivesRate = useRef(false);
  const targetAmountId = useId();

  const setDerivedRate = (rate: number | undefined) =>
    form.setValue('exchangeRate', rate, { shouldDirty: true });

  // The credited amount moves with the amount, the fees and the fee mode; the
  // fee rows are edited inside the shared rows editor, so react to the derived
  // value rather than to each input.
  const lastCredit = useRef(credit);
  useEffect(() => {
    if (lastCredit.current === credit) return;
    lastCredit.current = credit;
    if (targetDrivesRate.current) {
      form.setValue('exchangeRate', deriveExchangeRate(credit, targetAmount), {
        shouldDirty: true,
      });
    } else {
      setTargetAmount(convertAmount(credit, form.getValues('exchangeRate')));
    }
  }, [credit, targetAmount, form]);

  const handleRateChange = (rate: number | string | undefined) => {
    targetDrivesRate.current = false;
    setTargetAmount(convertAmount(credit, rate));
  };

  const handleTargetAmountChange = (value: number | string) => {
    targetDrivesRate.current = true;
    setTargetAmount(value);
    setDerivedRate(deriveExchangeRate(credit, value));
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
                    <AccountPicker
                      accounts={sourceOptions}
                      recent={recentSourceIds}
                      value={field.value || null}
                      onChange={(id) => {
                        field.onChange(id ?? '');
                        // Otherwise the target would show an account its list no longer offers.
                        if (id && id === form.getValues('targetAccountId')) {
                          form.setValue('targetAccountId', '', { shouldDirty: true });
                        }
                      }}
                      aria-label={t('form.sourceAccount')}
                    />
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
                    <AccountPicker
                      accounts={targetOptions}
                      recent={recentTargetIds}
                      value={field.value || null}
                      onChange={(id) => field.onChange(id ?? '')}
                      aria-label={t('form.targetAccount')}
                    />
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
                      onChange={field.onChange}
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

          <div data-testid="transfer-fees" className="space-y-3">
            <div className="flex items-center gap-2">
              <Switch
                id={`${feeModeName}-toggle`}
                checked={showFees}
                onCheckedChange={toggleFees}
              />
              <Label htmlFor={`${feeModeName}-toggle`}>{t('form.addFee')}</Label>
            </div>
            {showFees && (
              <>
                <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <legend className="float-left mr-2 font-medium">{t('form.feeTakenFrom')}</legend>
                  {(['source', 'target'] as const satisfies readonly FeeMode[]).map((m) => (
                    <label key={m} className="flex cursor-pointer items-center gap-1.5">
                      <input
                        type="radio"
                        name={feeModeName}
                        checked={feeMode === m}
                        onChange={() => form.setValue('feeMode', m, { shouldDirty: true })}
                      />
                      {t(m === 'source' ? 'form.feeFromSource' : 'form.feeFromTarget')}
                    </label>
                  ))}
                </fieldset>
                <AllocationSectionRows
                  section={{
                    name: 'expenses',
                    title: t('form.fees'),
                    addLabel: t('form.addFeeRow'),
                    categories: feeCategories,
                  }}
                  currency={source?.currency ?? ''}
                />
                {source && fee > 0 && Number.isFinite(debit) && (
                  <p
                    data-testid="transfer-fee-summary"
                    className="text-sm tabular-nums text-muted-foreground"
                  >
                    {t('form.feeSummary', {
                      debited: formatMoney(debit, source.currency),
                      received:
                        showExchangeRate && typeof targetAmount === 'number'
                          ? formatMoney(targetAmount, target.currency)
                          : formatMoney(credit, source.currency),
                      fee: formatMoney(fee, source.currency),
                    })}
                  </p>
                )}
              </>
            )}
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
                    onCreate={onCreateLabel}
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
