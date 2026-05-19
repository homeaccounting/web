import { useEffect, useState } from 'react';
import { useForm, FormProvider, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { DialogFooter } from '@/components/ui/dialog';
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
import { ACCOUNT_SUBTYPE_KINDS, SUPPORTED_CURRENCIES } from '@/api/types';
import {
  createAccountFormSchema,
  editAccountFormSchema,
  type CreateAccountFormValues,
  type EditAccountFormValues,
} from './schema';
import { SubtypeFields } from './SubtypeFields';
import { ACCOUNT_SUBTYPE_LABELS } from './labels';

// Visual indicator on labels of required form fields. Hidden from screen
// readers — `aria-required` on the input is the canonical signal there.
function RequiredMarker() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-destructive">
      *
    </span>
  );
}

type Values = CreateAccountFormValues | EditAccountFormValues;

export interface AccountFormApi {
  setFieldError: (field: string, message: string) => void;
  revealAdvanced: () => void;
}

export interface AccountFormProps {
  mode: 'create' | 'edit';
  defaultValues: CreateAccountFormValues | EditAccountFormValues;
  isSubmitting: boolean;
  onSubmit: (values: CreateAccountFormValues | EditAccountFormValues) => void | Promise<void>;
  onCancel: () => void;
  // Exposes imperative hooks for the parent dialog so it can apply server-side
  // field errors and reveal the "More options" section programmatically.
  onReady?: (api: AccountFormApi) => void;
}

export function AccountForm({
  mode,
  defaultValues,
  isSubmitting,
  onSubmit,
  onCancel,
  onReady,
}: AccountFormProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const schema = mode === 'create' ? createAccountFormSchema : editAccountFormSchema;
  const form = useForm<Values>({
    // The create schema uses `.superRefine` (returns ZodEffects) which makes
    // the resolver's inferred Input/Output generics drift; cast back to the
    // form values shape we explicitly hold in formState.
    resolver: zodResolver(schema) as Resolver<Values>,
    defaultValues,
  });

  // Expose imperative API to parent dialog. Re-runs when `form` identity
  // changes (it shouldn't normally), but a stable `onReady` from the parent
  // makes this a no-op on rerender.
  useEffect(() => {
    onReady?.({
      setFieldError: (field, message) =>
        // Field paths in our schemas (`name`, `overdraftLimit`, `subtype.*`)
        // are all valid keys of Values; the cast keeps RHF's strict typing
        // happy without forcing callers to import FieldPath.
        form.setError(field as 'name', { type: 'server', message }),
      revealAdvanced: () => setShowAdvanced(true),
    });
  }, [form, onReady]);

  // Auto-expand the "More options" section when the schema flagged overdraftLimit.
  const overdraftError = form.formState.errors.overdraftLimit;
  useEffect(() => {
    if (overdraftError && !showAdvanced) {
      setShowAdvanced(true);
    }
  }, [overdraftError, showAdvanced]);

  const submit = form.handleSubmit(async (values) => {
    await onSubmit(values);
  });

  return (
    <FormProvider {...form}>
      <form
        onSubmit={(e) => {
          void submit(e);
        }}
        className="space-y-4"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Name
                <RequiredMarker />
              </FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {mode === 'create' && (
          <FormField
            control={form.control}
            // initialBalance only exists on CreateAccountFormValues; the cast
            // is safe because this branch only renders in 'create' mode.
            name={'initialBalance' as 'name'}
            render={({ field }) => (
              <FormItem>
                <FormLabel>
                  Initial balance
                  <RequiredMarker />
                </FormLabel>
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
        )}

        <FormField
          control={form.control}
          name="currency"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Currency
                <RequiredMarker />
              </FormLabel>
              <FormControl>
                {mode === 'create' ? (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger aria-label="Currency">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {c}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    aria-label="Currency"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ''}
                    disabled
                    title="Cannot be changed after creation"
                  />
                )}
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="text-sm text-muted-foreground underline"
        >
          {showAdvanced ? 'Hide' : 'More options'}
        </button>
        {showAdvanced && (
          <FormField
            control={form.control}
            name="overdraftLimit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Overdraft limit</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="any"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? undefined : e.target.valueAsNumber)
                    }
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="subtype.type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                Account type
                <RequiredMarker />
              </FormLabel>
              <FormControl>
                <Select
                  onValueChange={(value) =>
                    // Reset the entire subtype object so stale per-subtype fields
                    // (e.g. bankName left over from a previous selection) are dropped —
                    // important for the discriminated union to validate.
                    form.resetField('subtype', { defaultValue: { type: value as 'cash' } })
                  }
                  value={field.value}
                >
                  <SelectTrigger aria-label="Account type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNT_SUBTYPE_KINDS.map((kind) => (
                      <SelectItem key={kind} value={kind}>
                        {ACCOUNT_SUBTYPE_LABELS[kind]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <SubtypeFields />

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? 'Saving…' : 'OK'}
          </Button>
        </DialogFooter>
      </form>
    </FormProvider>
  );
}
