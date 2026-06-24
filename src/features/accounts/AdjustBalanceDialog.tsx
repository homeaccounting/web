import { useEffect, useMemo } from 'react';
import { useForm, FormProvider, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from '@/components/ui/form';
import { DatePicker } from '@/components/DatePicker';
import { nowDateTimeInput } from '@/lib/dates';
import { ApiError } from '@/api/client';
import type { AccountResponse, UUID } from '@/api/types';
import {
  adjustBalanceFormSchema,
  toAdjustBalanceRequest,
  type AdjustBalanceFormValues,
} from './adjustBalanceSchema';
import { formatAccountBalance } from './format';
import { useAccounts } from './useAccounts';
import { useAdjustBalance } from './useAdjustBalance';

export interface AdjustBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAccountId?: UUID;
}

export function AdjustBalanceDialog({
  open,
  onOpenChange,
  selectedAccountId,
}: AdjustBalanceDialogProps) {
  const { data: accounts } = useAccounts();
  const hasAccounts = !!accounts && accounts.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust balance</DialogTitle>
          <DialogDescription>
            Record a balance adjustment as a synthetic transaction.
          </DialogDescription>
        </DialogHeader>
        {hasAccounts ? (
          <AdjustBalanceForm
            accounts={accounts}
            selectedAccountId={selectedAccountId}
            onClose={() => onOpenChange(false)}
          />
        ) : (
          <div className="p-2 text-sm text-muted-foreground">
            Create an account first to adjust a balance.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface AdjustBalanceFormProps {
  accounts: AccountResponse[];
  selectedAccountId?: UUID;
  onClose: () => void;
}

function AdjustBalanceForm({ accounts, selectedAccountId, onClose }: AdjustBalanceFormProps) {
  const defaultAccount = accounts.find((a) => a.id === selectedAccountId) ?? accounts[0]!;
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const form = useForm<AdjustBalanceFormValues & { accountId: UUID }>({
    // The form type is a superset of the schema (it adds an `accountId` field
    // the schema doesn't validate), so the resolver needs a wider `as unknown as`
    // double-cast. (IncomeExpenseForm.tsx uses a single `as` cast because its
    // schema infers exactly the same type as the form.)
    resolver: zodResolver(adjustBalanceFormSchema) as unknown as Resolver<
      AdjustBalanceFormValues & { accountId: UUID }
    >,
    defaultValues: {
      accountId: defaultAccount.id,
      targetBalance: defaultAccount.balance,
      description: '',
      date: nowDateTimeInput(),
    },
  });

  const watchedAccountId = form.watch('accountId');
  const selected = accounts.find((a) => a.id === watchedAccountId) ?? defaultAccount;
  const adjust = useAdjustBalance(selected.id);

  // Re-prefill the target balance to the newly-selected account's current
  // balance whenever the account changes (mirrors IncomeExpenseForm's currency
  // sync). Keyed on selected.id so it fires once per account switch.
  useEffect(() => {
    form.setValue('targetBalance', selected.balance, { shouldDirty: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.id]);

  const showBanner =
    adjust.isError && !(adjust.error instanceof ApiError && adjust.error.fieldErrors);
  const bannerMessage =
    adjust.error instanceof ApiError
      ? adjust.error.message
      : 'Something went wrong. Please try again.';

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await adjust.mutateAsync(toAdjustBalanceRequest(values, selected.currency));
      onClose();
      form.reset();
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          form.setError(field as keyof AdjustBalanceFormValues, { type: 'server', message });
        }
      }
    }
  });

  return (
    <>
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

          <div className="text-sm text-muted-foreground">
            Current balance: {formatAccountBalance(selected)} ({selected.currency})
          </div>

          <FormField
            control={form.control}
            name="targetBalance"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Target balance</FormLabel>
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
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (optional)</FormLabel>
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
                  <DatePicker
                    withTime
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                    name={field.name}
                    maxDate={today}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={adjust.isPending}>
              {adjust.isPending ? 'Saving…' : 'OK'}
            </Button>
          </div>
        </form>
      </FormProvider>
    </>
  );
}
