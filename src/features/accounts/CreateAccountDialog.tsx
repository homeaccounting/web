import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, FormProvider, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { ApiError } from '@/api/client';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import {
  createAccountFormSchema,
  toCreateAccountRequest,
  type CreateAccountFormValues,
} from './schema';
import { useCreateAccount } from './useCreateAccount';
import { SubtypeFields } from './SubtypeFields';

const SUPPORTED = ['UAH', 'USD', 'EUR', 'GBP'] as const;
type SupportedCurrency = (typeof SUPPORTED)[number];

// Visual indicator on labels of required form fields. Hidden from screen
// readers — `aria-required` on the input is the canonical signal there.
function RequiredMarker() {
  return (
    <span aria-hidden="true" className="ml-0.5 text-destructive">
      *
    </span>
  );
}

export interface CreateAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreateAccountDialog({ open, onOpenChange }: CreateAccountDialogProps) {
  const navigate = useNavigate();
  const { data: config } = useConfiguration();
  const defaultCurrency: SupportedCurrency = (SUPPORTED as readonly string[]).includes(
    config?.defaultCurrency ?? '',
  )
    ? (config!.defaultCurrency as SupportedCurrency)
    : 'USD';

  const [showAdvanced, setShowAdvanced] = useState(false);

  const form = useForm<CreateAccountFormValues>({
    // The schema uses `.superRefine` (returns ZodEffects) which makes the
    // resolver's inferred Input/Output generics drift; cast back to the
    // form values shape we explicitly hold in formState.
    resolver: zodResolver(createAccountFormSchema) as Resolver<CreateAccountFormValues>,
    defaultValues: {
      name: '',
      currency: defaultCurrency,
      initialBalance: 0,
      overdraftLimit: undefined,
      subtype: { type: 'cash' },
    },
  });

  const create = useCreateAccount();

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      const account = await create.mutateAsync(toCreateAccountRequest(values));
      onOpenChange(false);
      form.reset();
      navigate(`/accounts/${account.id}`);
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          form.setError(field as keyof CreateAccountFormValues, { type: 'server', message });
        }
        if ('overdraftLimit' in e.fieldErrors) setShowAdvanced(true);
      }
    }
  });

  // Auto-expand the "More options" section when the schema flagged overdraftLimit.
  useEffect(() => {
    if (form.formState.errors.overdraftLimit && !showAdvanced) {
      setShowAdvanced(true);
    }
  }, [form.formState.errors.overdraftLimit, showAdvanced]);

  const showBanner =
    create.isError && !(create.error instanceof ApiError && create.error.fieldErrors);
  const bannerMessage =
    create.error instanceof ApiError
      ? create.error.message
      : 'Something went wrong. Please try again.';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create account</DialogTitle>
          <DialogDescription>
            Add a new account to track balances and transactions.
          </DialogDescription>
        </DialogHeader>

        {showBanner && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{bannerMessage}</AlertDescription>
          </Alert>
        )}

        <FormProvider {...form}>
          <form
            onSubmit={(e) => {
              void onSubmit(e);
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

            <FormField
              control={form.control}
              name="initialBalance"
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
                    <Select onValueChange={field.onChange} value={field.value}>
                      <SelectTrigger aria-label="Currency">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SUPPORTED.map((c) => (
                          <SelectItem key={c} value={c}>
                            {c}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="bankAccount">Bank account</SelectItem>
                        <SelectItem value="eWallet">E-wallet</SelectItem>
                        <SelectItem value="asset">Asset</SelectItem>
                        <SelectItem value="loan">Loan</SelectItem>
                      </SelectContent>
                    </Select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <SubtypeFields />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? 'Saving…' : 'OK'}
              </Button>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
