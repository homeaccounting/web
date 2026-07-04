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
import { nowDateTimeInput } from '@/lib/dates';
import { IncomeExpenseForm, type IncomeExpenseFormApi } from './IncomeExpenseForm';
import { useCreateIncome } from './useCreateIncome';
import { toIncomeRequest } from './schema';
import { TRANSACTION_KIND_LABELS } from './labels';

export interface CreateIncomeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedAccountId?: UUID;
}

export function CreateIncomeDialog({
  open,
  onOpenChange,
  selectedAccountId,
}: CreateIncomeDialogProps) {
  const { data: accounts } = useAccounts();
  const { data: config } = useConfiguration();
  const create = useCreateIncome();

  // Backend dictionary ids — see server-infra/src/Domain/Configuration/Defaults.hs
  // (incomeCategoryDictId / expenseCategoryDictId) and ConfigurationService.hs
  // (labelsDictId). Income/expense have separate category dictionaries that the
  // backend enforces per transaction type.
  const categories = config?.dictionaries['income-category']?.entries ?? [];
  const reimbursementCategories = config?.dictionaries['expense-category']?.entries ?? [];
  const labels = config?.dictionaries.labels?.entries ?? [];

  const defaultAccount = accounts?.find((a) => a.id === selectedAccountId) ?? accounts?.[0];
  const defaultCategory = config?.defaults.incomeCategory ?? '';

  const defaults = useMemo(
    () => ({
      accountId: defaultAccount?.id ?? '',
      currency: defaultAccount?.currency ?? '',
      incomes: [{ category: defaultCategory, amount: NaN }],
      expenses: [],
      description: '',
      date: nowDateTimeInput(),
      labels: [] as UUID[],
    }),
    [defaultAccount?.id, defaultAccount?.currency, defaultCategory],
  );

  const apiRef = useRef<IncomeExpenseFormApi | null>(null);
  const handleReady = useCallback((api: IncomeExpenseFormApi) => {
    apiRef.current = api;
  }, []);

  const handleSubmit = async (values: Parameters<typeof toIncomeRequest>[0]) => {
    try {
      await create.mutateAsync(toIncomeRequest(values));
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
          <DialogTitle>{TRANSACTION_KIND_LABELS.income.title}</DialogTitle>
          <DialogDescription>
            Record an income transaction to one of your accounts.
          </DialogDescription>
        </DialogHeader>
        {showBanner && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{bannerMessage}</AlertDescription>
          </Alert>
        )}
        {accounts && accounts.length > 0 && (
          <IncomeExpenseForm
            kind="income"
            mode="create"
            accounts={accounts}
            categories={categories}
            reimbursementCategories={reimbursementCategories}
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
            Create an account first to record income.
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
