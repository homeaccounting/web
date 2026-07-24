import { useEffect, useMemo } from 'react';
import { useForm, FormProvider, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import type { z } from 'zod';
import { DialogBody, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import type { AccountResponse, DictionaryEntryResponse, UUID } from '@/api/types';
import { makeIncomeExpenseFormSchema, type IncomeExpenseFormValues } from './schema';
import { LabelMultiSelect } from './LabelMultiSelect';
import { ContactCombobox } from './ContactCombobox';
import { AllocationsEditor, type AllocationSection } from './AllocationsEditor';
import { dropEmptySlices } from './allocations';
import { DatePicker } from '@/components/DatePicker';
import { RequiredMarker } from '@/components/RequiredMarker';
import { TRANSACTION_KIND_LABELS, type TransactionKind } from './labels';

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
  onCreateContact?: (name: string) => Promise<UUID | null>;
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
  defaultValues,
  isSubmitting,
  enforceBalance = false,
  extraRefine,
  lockTarget,
  onSubmit,
  onCancel,
  onReady,
}: IncomeExpenseFormProps) {
  const resolver = useMemo<Resolver<IncomeExpenseFormValues>>(() => {
    const schema = makeIncomeExpenseFormSchema(enforceBalance ? accounts : null, kind, {
      // A locked target is a ceiling (partial allowed), not an exact target
      // (tracker#33). Unlocked (create/edit) keeps the equality gate.
      targetCeiling: Boolean(lockTarget),
    });
    const base = zodResolver(
      extraRefine ? schema.superRefine(extraRefine) : schema,
    ) as Resolver<IncomeExpenseFormValues>;
    // Fully-empty rows are a UI affordance (the "+ Add" button seeds a blank
    // row); they must not trip per-row validation. Strip them before zod runs
    // so only meaningful slices are validated and surfaced.
    return (values, context, options) => {
      const cleaned: IncomeExpenseFormValues = {
        ...values,
        incomes: dropEmptySlices(values.incomes),
        expenses: dropEmptySlices(values.expenses),
      };
      return base(cleaned, context, options);
    };
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

  useEffect(() => {
    onReady?.({
      setFieldError: (field, message) =>
        form.setError(field as keyof IncomeExpenseFormValues, { type: 'server', message }),
    });
  }, [form, onReady]);

  const submit = form.handleSubmit(async (values) => {
    await onSubmit({
      ...values,
      incomes: dropEmptySlices(values.incomes),
      expenses: dropEmptySlices(values.expenses),
    });
  });

  const sections: AllocationSection[] =
    kind === 'income'
      ? [
          {
            name: 'incomes',
            title: 'Income categories',
            addLabel: '+ Add income category',
            categories,
          },
          {
            name: 'expenses',
            title: 'Reimbursements (reduces an expense)',
            addLabel: '+ Add reimbursement',
            categories: reimbursementCategories,
            collapsible: true,
          },
        ]
      : [{ name: 'expenses', title: 'Expense categories', addLabel: '+ Add category', categories }];

  return (
    <FormProvider {...form}>
      <form
        aria-label={`${TRANSACTION_KIND_LABELS[kind].title} form`}
        onSubmit={(e) => {
          void submit(e);
        }}
        className="flex min-h-0 flex-1 flex-col"
      >
        <DialogBody>
          <div
            data-testid="form-grid-account-currency"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <FormField
              control={form.control}
              name="accountId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Account
                    <RequiredMarker />
                  </FormLabel>
                  <FormControl>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger aria-label="Account">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {accounts.map((a) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.name} ({a.currency})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-2">
              <Label>Currency</Label>
              <div
                data-testid="currency-badge"
                className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm tabular-nums text-muted-foreground"
                aria-label="Currency"
              >
                {form.watch('currency') || '—'}
              </div>
            </div>
          </div>

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
                    Date <RequiredMarker />
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
                  <FormLabel>Contact</FormLabel>
                  <FormControl>
                    <ContactCombobox
                      options={contacts}
                      value={field.value ?? null}
                      onChange={field.onChange}
                      onCreate={async (name) => {
                        const id = await onCreateContact?.(name);
                        if (id) field.onChange(id);
                      }}
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
                <FormLabel>Description</FormLabel>
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
                <FormLabel>Labels</FormLabel>
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
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting || (isEdit && !isDirty)}>
            {isSubmitting
              ? 'Saving…'
              : isEdit
                ? TRANSACTION_KIND_LABELS[kind].editSubmit
                : TRANSACTION_KIND_LABELS[kind].submit}
          </Button>
        </DialogFooter>
      </form>
    </FormProvider>
  );
}
