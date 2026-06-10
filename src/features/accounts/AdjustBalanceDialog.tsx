import { useMemo } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
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
import { ApiError } from '@/api/client';
import type { AccountResponse } from '@/api/types';
import {
  adjustBalanceFormSchema,
  toAdjustBalanceRequest,
  type AdjustBalanceFormValues,
} from './adjustBalanceSchema';
import { formatAccountBalance } from './format';
import { useAdjustBalance } from './useAdjustBalance';

export interface AdjustBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: AccountResponse;
}

export function AdjustBalanceDialog({ open, onOpenChange, account }: AdjustBalanceDialogProps) {
  const adjust = useAdjustBalance(account.id);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const form = useForm<AdjustBalanceFormValues>({
    resolver: zodResolver(adjustBalanceFormSchema),
    defaultValues: {
      targetBalance: account.balance,
      description: '',
      date: today,
    },
  });

  const showBanner =
    adjust.isError && !(adjust.error instanceof ApiError && adjust.error.fieldErrors);
  const bannerMessage =
    adjust.error instanceof ApiError
      ? adjust.error.message
      : 'Something went wrong. Please try again.';

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await adjust.mutateAsync(toAdjustBalanceRequest(values, account.currency));
      onOpenChange(false);
      form.reset();
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          form.setError(field as keyof AdjustBalanceFormValues, {
            type: 'server',
            message,
          });
        }
      }
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adjust balance</DialogTitle>
          <DialogDescription>
            Record a balance adjustment as a synthetic transaction.
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
            <div className="text-sm text-muted-foreground">
              Current balance: {formatAccountBalance(account)}
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
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={adjust.isPending}>
                {adjust.isPending ? 'Saving…' : 'OK'}
              </Button>
            </div>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}
