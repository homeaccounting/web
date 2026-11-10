import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, FormProvider, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import type { AccountResponse, DictionaryEntryResponse, UUID } from '@/api/types';
import { makeIncomeExpenseFormSchema, type IncomeExpenseFormValues } from './schema';
import { LabelMultiSelect } from './LabelMultiSelect';
import { ContactCombobox } from './ContactCombobox';
import type { CreateEntry } from './useInlineCreate';
import { AllocationsEditor, type AllocationSection } from './AllocationsEditor';
import { ignoreEmptySlices, withoutEmptySlices } from './allocations';
import { DatePicker } from '@/components/DatePicker';
import { RequiredMarker } from '@/components/RequiredMarker';
import { transactionKindLabel, type TransactionKind } from './labels';
import { AccountPicker } from '@/features/accounts/AccountPicker';
import { transactableAccounts } from '@/features/accounts/transactableAccounts';

const SLICE_FIELDS = ['incomes', 'expenses'] as const;

export interface IncomeExpenseFormApi {
  setFieldError: (field: string, message: string) => void;
}

export interface IncomeExpenseFormProps {
  kind: Extract<TransactionKind, 'income' | 'expense'>;
  mode: 'create' | 'edit';
  accounts: AccountResponse[];
  /** The kind's primary dictionary ('income' for income, 'expense' for expense). */
  categories: DictionaryEntryResponse[];
  /** Expense-category dictionary, used only by the income form's reimbursement section. */
  reimbursementCategories?: DictionaryEntryResponse[];
  labels: DictionaryEntryResponse[];
  /** Assignable contact options for the optional contact picker. */
  contacts: DictionaryEntryResponse[];
  /**
   * Create a new contact from a typed name and resolve its id (or null on
   * failure). The create mutation itself lives in the caller (a dialog) so this
   * presentational form never calls a hook in a render callback.
   */
  onCreateContact?: CreateEntry;
  /** Create a new label from a typed name; same contract as onCreateContact. */
  onCreateLabel?: CreateEntry;
  defaultValues: IncomeExpenseFormValues;
  isSubmitting: boolean;
  /** When set, validate the debit against the source account balance (create only). */
  enforceBalance?: boolean;
  /**
   * Extra zod `superRefine` chained onto the form schema — lets a caller inject
   * additional cross-field validation (e.g. the refund dialog's per-slice/total
   * caps) without baking it into the shared schema.
   */
  extraRefine?: (values: IncomeExpenseFormValues, ctx: z.RefinementCtx) => void;
  /** Forwarded to AllocationsEditor: fix the target (hide toggle, read-only). */
  lockTarget?: boolean;
  onSubmit: (values: IncomeExpenseFormValues) => void | Promise<void>;
  onCancel: () => void;
  // Leading "Recent" accounts in the account picker (create dialogs).
  recentAccountIds?: readonly UUID[];
  onReady?: (api: IncomeExpenseFormApi) => void;
}

export function IncomeExpenseForm({
  kind,
  mode,
  accounts,
  categories,
  reimbursementCategories = [],
  labels,
  contacts,
  onCreateContact,
  onCreateLabel,
  defaultValues,
  isSubmitting,
  enforceBalance = false,
  extraRefine,
  lockTarget,
  onSubmit,
  onCancel,
  onReady,
  recentAccountIds,
}: IncomeExpenseFormProps) {
  const { t } = useTranslation('transactions');
  const resolver = useMemo<Resolver<IncomeExpenseFormValues>>(() => {
    const schema = makeIncomeExpenseFormSchema(enforceBalance ? accounts : null, kind, {
      // A locked target is a ceiling (partial allowed), not an exact target
      // (tracker#33). Unlocked (create/edit) keeps the equality gate.
      targetCeiling: Boolean(lockTarget),
    });
    return ignoreEmptySlices(
      zodResolver(
        extraRefine ? schema.superRefine(extraRefine) : schema,
      ) as Resolver<IncomeExpenseFormValues>,
      SLICE_FIELDS,
    );
  }, [enforceBalance, accounts, kind, extraRefine, lockTarget]);

  const form = useForm<IncomeExpenseFormValues>({
    resolver,
    defaultValues,
  });

  const isEdit = mode === 'edit';
  const isDirty = form.formState.isDirty;

  const accountId = form.watch('accountId');
  useEffect(() => {
    const a = accounts.find((x) => x.id === accountId);
    if (a) form.setValue('currency', a.currency, { shouldDirty: false });
  }, [accountId, accounts, form]);

  // Keep the initial account so an edited transaction on a since-closed or
  // view-only account still shows it.
  const accountOptions = useMemo(
    () => transactableAccounts(accounts, [defaultValues.accountId]),
    [accounts, defaultValues.accountId],
  );

  useEffect(() => {
    onReady?.({
      setFieldError: (field, message) =>
        form.setError(field as keyof IncomeExpenseFormValues, { type: 'server', message }),
    });
  }, [form, onReady]);

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(withoutEmptySlices(values, SLICE_FIELDS));
  });

  const sections: AllocationSection[] =
    kind === 'income'
      ? [
          {
            name: 'incomes',
            title: t('form.incomeCategoriesTitle'),
            addLabel: t('form.addIncomeCategory'),
            categories,
          },
          {
            name: 'expenses',
            title: t('form.reimbursementsTitle'),
            addLabel: t('form.addReimbursement'),
            categories: reimbursementCategories,
            collapsible: true,
          },
        ]
      : [
          {
            name: 'expenses',
            title: t('form.expenseCategoriesTitle'),
            addLabel: t('form.addCategory'),
            categories,
          },
        ];

  return (
    <FormProvider {...form}>
      <form
        aria-label={t('form.formAria', { title: transactionKindLabel(kind, 'title') })}
        onSubmit={(e) => {
          void submit(e);
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <DialogBody>
          {/* Currency is not a standalone field: it shows inline in each amount
              row (via MoneyInput) and in the account's short name. */}
          <FormField
            control={form.control}
            name="accountId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  {t('form.account')}
                  <RequiredMarker />
                </FormLabel>
                <FormControl>
                  <AccountPicker
                    accounts={accountOptions}
                    recent={recentAccountIds}
                    value={field.value || null}
                    onChange={(id) => field.onChange(id ?? '')}
                    aria-label={t('form.account')}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <AllocationsEditor
            sections={sections}
            currency={form.watch('currency') || ''}
            lockTarget={lockTarget}
          />

          <div
            data-testid="form-grid-date-contact"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
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

            <FormField
              control={form.control}
              name="contactId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('form.contact')}</FormLabel>
                  <FormControl>
                    <ContactCombobox
                      options={contacts}
                      value={field.value ?? null}
                      onChange={field.onChange}
                      onCreate={onCreateContact}
                      createHint={form.watch('description')}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

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
                ? transactionKindLabel(kind, 'editSubmit')
                : transactionKindLabel(kind, 'submit')}
          </Button>
        </DialogFooter>
      </form>
    </FormProvider>
  );
}
