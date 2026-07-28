import { useCallback, useRef } from 'react';
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
import { flattenDictionary } from '@/api/dictionary';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { useCreateDictionaryEntry } from '@/features/configuration/useCreateDictionaryEntry';
import { defaultTransactionDate, writeStickyDay } from './stickyDate';
import { IncomeExpenseForm, type IncomeExpenseFormApi } from './IncomeExpenseForm';
import { useCreateExpense } from './useCreateExpense';
import { toExpenseRequest, type IncomeExpenseFormValues } from './schema';
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
  const createContact = useCreateDictionaryEntry();

  // Backend uses a separate `expense-category` dictionary for expense
  // transactions — see server-infra/src/Domain/Configuration/Defaults.hs.
  const categories = flattenDictionary(config?.dictionaries['expense']);
  const labels = flattenDictionary(config?.dictionaries.label);
  const contacts = flattenDictionary(config?.dictionaries.contact);

  const defaultAccount = accounts?.find((a) => a.id === selectedAccountId) ?? accounts?.[0];
  const defaultCategory = config?.defaults.expenseCategory ?? '';

  // Computed fresh on every render (deliberately not memoized) so the date
  // re-seeds each time the dialog opens: the inner form remounts on open (the
  // dialog has no forceMount) and reads these defaults, giving the sticky
  // last-used day + the current time. See stickyDate.ts.
  const defaults: IncomeExpenseFormValues = {
    accountId: defaultAccount?.id ?? '',
    currency: defaultAccount?.currency ?? '',
    incomes: [],
    expenses: [{ category: defaultCategory, amount: NaN, comment: '' }],
    description: '',
    date: defaultTransactionDate(new Date()),
    labels: [],
    contactId: null,
    targetMode: false,
    targetTotal: '',
  };

  const apiRef = useRef<IncomeExpenseFormApi | null>(null);
  const handleReady = useCallback((api: IncomeExpenseFormApi) => {
    apiRef.current = api;
  }, []);

  const handleSubmit = async (values: Parameters<typeof toExpenseRequest>[0]) => {
    try {
      await create.mutateAsync(toExpenseRequest(values));
      writeStickyDay(values.date, new Date());
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
      <DialogContent size="lg">
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
            enforceBalance
            accounts={accounts}
            categories={categories}
            labels={labels}
            contacts={contacts}
            defaultValues={defaults}
            isSubmitting={create.isPending}
            onCreateContact={(name) =>
              createContact
                .mutateAsync({ dictId: 'contact', name, dict: config?.dictionaries.contact })
                .then((r) => r.id)
            }
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
