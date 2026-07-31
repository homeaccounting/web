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
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { DatePicker } from '@/components/DatePicker';
import { MoneyInput } from '@/components/MoneyInput';
import { RequiredMarker } from '@/components/RequiredMarker';
import { defaultTransactionDate, writeStickyDay } from '@/lib/stickyDate';
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
      // Seed from the shared sticky last-used day (parity with the
      // income/expense/transfer dialogs); falls back to now. See stickyDate.ts.
      date: defaultTransactionDate(new Date()),
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
      writeStickyDay(values.date, new Date());
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

          <div className="text-sm text-muted-foreground">
            Current balance: <span className="tabular-nums">{formatAccountBalance(selected)}</span>{' '}
            ({selected.currency})
          </div>

          {/* Target balance + Date share one row, mirroring TransferForm's
              "Amount | Date" layout so the primary value and date sit in
              consistent places across the transaction dialogs. */}
          <div
            data-testid="form-grid-target-date"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2"
          >
            <FormField
              control={form.control}
              name="targetBalance"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Target balance
                    <RequiredMarker />
                  </FormLabel>
                  <FormControl>
                    <MoneyInput
                      currency={selected.currency}
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
                    Date
                    <RequiredMarker />
                  </FormLabel>
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
