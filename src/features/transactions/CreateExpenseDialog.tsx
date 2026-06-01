import { useCallback, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ApiError } from '@/api/client';
import type { UUID } from '@/api/types';
import { useAccounts } from '@/features/accounts/useAccounts';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { IncomeExpenseForm, type IncomeExpenseFormApi } from './IncomeExpenseForm';
import { useCreateExpense } from './useCreateExpense';
import { toExpenseRequest } from './schema';
import { TRANSACTION_KIND_LABELS } from './labels';

export interface CreateExpenseDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAccountId?: UUID;
}

export function CreateExpenseDialog({
  open,
  onOpenChange,
  selectedAccountId,
}: CreateExpenseDialogProps) {
  const { data: accounts } = useAccounts();
  const { data: config } = useConfiguration();
  const create = useCreateExpense();

  // Backend uses a separate `expense-category` dictionary for expense
  // transactions — see server-infra/src/Domain/Configuration/Defaults.hs.
  const categories = config?.dictionaries['expense-category']?.entries ?? [];
  const labels = config?.dictionaries.labels?.entries ?? [];

  const defaultAccount = accounts?.find((a) => a.id === selectedAccountId) ?? accounts?.[0];

  const defaults = useMemo(
    () => ({
      accountId: defaultAccount?.id ?? '',
      amount: 0,
      currency: defaultAccount?.currency ?? '',
      category: '',
      description: '',
      date: '',
      labels: [] as UUID[],
    }),
    [defaultAccount?.id, defaultAccount?.currency],
  );

  const apiRef = useRef<IncomeExpenseFormApi | null>(null);
  const handleReady = useCallback((api: IncomeExpenseFormApi) => {
    apiRef.current = api;
  }, []);

  const handleSubmit = async (values: Parameters<typeof toExpenseRequest>[0]) => {
    try {
      await create.mutateAsync(toExpenseRequest(values));
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          apiRef.current?.setFieldError(field, message);
        }
      }
    }
  };

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
          <DialogTitle>{TRANSACTION_KIND_LABELS.expense.title}</DialogTitle>
          <DialogDescription>
            Record an expense transaction from one of your accounts.
          </DialogDescription>
        </DialogHeader>
        {showBanner && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{bannerMessage}</AlertDescription>
          </Alert>
        )}
        {accounts && accounts.length > 0 && (
          <IncomeExpenseForm
            kind="expense"
            mode="create"
            accounts={accounts}
            categories={categories}
            labels={labels}
            defaultValues={defaults}
            isSubmitting={create.isPending}
            onSubmit={handleSubmit}
            onCancel={() => onOpenChange(false)}
            onReady={handleReady}
          />
        )}
        {(!accounts || accounts.length === 0) && (
          <div className="p-2 text-sm text-muted-foreground">
            Create an account first to record an expense.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
