import { useEffect } from 'react';
import { useForm, FormProvider, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import type { AccountResponse, DictionaryEntryResponse } from '@/api/types';
import { incomeExpenseFormSchema, type IncomeExpenseFormValues } from './schema';
import { LabelMultiSelect } from './LabelMultiSelect';
import { CategoryCombobox } from './CategoryCombobox';
import { TRANSACTION_KIND_LABELS, type TransactionKind } from './labels';

export interface IncomeExpenseFormApi {
  setFieldError: (field: string, message: string) => void;
}

export interface IncomeExpenseFormProps {
  kind: Extract<TransactionKind, 'income' | 'expense'>;
  mode: 'create' | 'edit';
  accounts: AccountResponse[];
  categories: DictionaryEntryResponse[];
  labels: DictionaryEntryResponse[];
  defaultValues: IncomeExpenseFormValues;
  isSubmitting: boolean;
  onSubmit: (values: IncomeExpenseFormValues) => void | Promise<void>;
  onCancel: () => void;
  onReady?: (api: IncomeExpenseFormApi) => void;
}

export function IncomeExpenseForm({
  kind,
  mode,
  accounts,
  categories,
  labels,
  defaultValues,
  isSubmitting,
  onSubmit,
  onCancel,
  onReady,
}: IncomeExpenseFormProps) {
  const form = useForm<IncomeExpenseFormValues>({
    resolver: zodResolver(incomeExpenseFormSchema) as Resolver<IncomeExpenseFormValues>,
    defaultValues,
  });

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
    await onSubmit(values);
  });

  return (
    <FormProvider {...form}>
      <form
        aria-label={`${TRANSACTION_KIND_LABELS[kind].title} form`}
        onSubmit={(e) => {
          void submit(e);
        }}
        className="space-y-4"
      >
        <FormField
          control={form.control}
          name="accountId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Account</FormLabel>
              <FormControl>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  {...field}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-end gap-2">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem className="flex-1">
                <FormLabel>Amount</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="any"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={
                      field.value === undefined ||
                      field.value === null ||
                      (typeof field.value === 'number' && Number.isNaN(field.value))
                        ? ''
                        : field.value
                    }
                    onChange={(e) => {
                      const raw = e.target.value;
                      if (raw === '' || raw === '-') {
                        field.onChange(raw);
                        return;
                      }
                      const n = e.target.valueAsNumber;
                      field.onChange(Number.isNaN(n) ? raw : n);
                    }}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <div
            data-testid="currency-badge"
            className="inline-flex h-10 items-center rounded-md border bg-muted px-3 text-sm tabular-nums text-muted-foreground"
            aria-label="Currency"
          >
            {form.watch('currency') || '—'}
          </div>
        </div>

        <FormField
          control={form.control}
          name="category"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Category</FormLabel>
              <FormControl>
                <CategoryCombobox
                  options={categories}
                  value={field.value}
                  onChange={field.onChange}
                  name={field.name}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

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
          name="date"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Date</FormLabel>
              <FormControl>
                <Input
                  type="date"
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  name={field.name}
                  ref={field.ref}
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">Defaults to today on the server.</p>
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

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : TRANSACTION_KIND_LABELS[kind].submit}
          </Button>
        </DialogFooter>
        <input type="hidden" value={mode} readOnly aria-hidden />
      </form>
    </FormProvider>
  );
}
