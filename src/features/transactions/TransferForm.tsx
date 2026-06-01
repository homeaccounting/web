import { useEffect } from 'react';
import { useForm, FormProvider, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import type { AccountResponse, DictionaryEntryResponse } from '@/api/types';
import { transferFormSchema, type TransferFormValues } from './schema';
import { LabelMultiSelect } from './LabelMultiSelect';
import { TRANSACTION_KIND_LABELS } from './labels';

export interface TransferFormApi {
  setFieldError: (field: string, message: string) => void;
}

export interface TransferFormProps {
  mode: 'create' | 'edit';
  accounts: AccountResponse[];
  labels: DictionaryEntryResponse[];
  defaultValues: TransferFormValues;
  isSubmitting: boolean;
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
  onSubmit,
  onCancel,
  onReady,
}: TransferFormProps) {
  const form = useForm<TransferFormValues>({
    resolver: zodResolver(transferFormSchema) as Resolver<TransferFormValues>,
    defaultValues,
  });

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

  return (
    <FormProvider {...form}>
      <form
        aria-label={`${TRANSACTION_KIND_LABELS.transfer.title} form`}
        onSubmit={(e) => {
          void submit(e);
        }}
        className="space-y-4"
      >
        <FormField
          control={form.control}
          name="sourceAccountId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Source account</FormLabel>
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
        <FormField
          control={form.control}
          name="targetAccountId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Target account</FormLabel>
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
            {source?.currency ?? '—'}
          </div>
        </div>

        {showExchangeRate && (
          <FormField
            control={form.control}
            name="exchangeRate"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Exchange rate</FormLabel>
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
                        return;
                      }
                      const n = e.target.valueAsNumber;
                      field.onChange(Number.isNaN(n) ? raw : n);
                    }}
                  />
                </FormControl>
                <p className="text-xs text-muted-foreground">
                  Optional. Backend uses its default if omitted.
                </p>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

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
            {isSubmitting ? 'Saving…' : TRANSACTION_KIND_LABELS.transfer.submit}
          </Button>
        </DialogFooter>
        {/* mode is consumed only for label/disabling semantics later — referenced
            here so the prop is not flagged as unused in strict mode. */}
        <input type="hidden" value={mode} readOnly aria-hidden />
      </form>
    </FormProvider>
  );
}
