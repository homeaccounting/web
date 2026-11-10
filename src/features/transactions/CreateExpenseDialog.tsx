import { useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
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
import { defaultRecordAccount } from '@/features/accounts/transactableAccounts';
import { recentAccountIds, recordRecentAccount } from '@/features/accounts/recentAccounts';
import { flattenDictionary } from '@/api/dictionary';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { useCreateDictionaryItem } from '@/features/configuration/useCreateDictionaryEntry';
import { defaultTransactionDate, writeStickyDay } from '@/lib/stickyDate';
import { IncomeExpenseForm, type IncomeExpenseFormApi } from './IncomeExpenseForm';
import { useCreateExpense } from './useCreateExpense';
import { toExpenseRequest, type IncomeExpenseFormValues } from './schema';
import { transactionKindLabel } from './labels';
import { emptySlice } from './allocations';

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
  const { t } = useTranslation('transactions');
  const { data: accounts } = useAccounts();
  const { data: config } = useConfiguration();
  const create = useCreateExpense();
  const createEntry = useCreateDictionaryItem();

  // Backend uses a separate `expense-category` dictionary for expense
  // transactions — see server-infra/src/Domain/Configuration/Defaults.hs.
  const categories = flattenDictionary(config?.dictionaries['expense']);
  const labels = flattenDictionary(config?.dictionaries.label);
  const contacts = flattenDictionary(config?.dictionaries.contact);

  const profileDefault = config?.defaults.account;
  const defaultAccount = defaultRecordAccount(accounts ?? [], [selectedAccountId, profileDefault]);
  const recent = recentAccountIds('expense', profileDefault);
  const defaultCategory = config?.defaults.expenseCategory ?? '';

  // Computed fresh on every render (deliberately not memoized) so the date
  // re-seeds each time the dialog opens: the inner form remounts on open (the
  // dialog has no forceMount) and reads these defaults, giving the sticky
  // last-used day + the current time. See stickyDate.ts.
  const defaults: IncomeExpenseFormValues = {
    accountId: defaultAccount?.id ?? '',
    currency: defaultAccount?.currency ?? '',
    incomes: [],
    expenses: [emptySlice(defaultCategory)],
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
      recordRecentAccount('expense', values.accountId);
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
    create.error instanceof ApiError ? create.error.message : t('form.genericError');

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle>{transactionKindLabel('expense', 'title')}</DialogTitle>
          <DialogDescription>{t('form.expenseDescription')}</DialogDescription>
        </DialogHeader>
        {showBanner && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{bannerMessage}</AlertDescription>
          </Alert>
        )}
        {accounts && defaultAccount && (
          <IncomeExpenseForm
            kind="expense"
            mode="create"
            enforceBalance
            accounts={accounts}
            recentAccountIds={recent}
            categories={categories}
            labels={labels}
            contacts={contacts}
            defaultValues={defaults}
            isSubmitting={create.isPending}
            onCreateContact={(name) => createEntry('contact', name)}
            onCreateLabel={(name) => createEntry('label', name)}
            onSubmit={handleSubmit}
            onCancel={() => onOpenChange(false)}
            onReady={handleReady}
          />
        )}
        {!defaultAccount && (
          <div className="p-2 text-sm text-muted-foreground">{t('form.noAccountsExpense')}</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
