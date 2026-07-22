import { useCallback, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/api/client';
import type { AccountResponse, TransactionResponse } from '@/api/types';
import { useAccounts } from '@/features/accounts/useAccounts';
import { flattenDictionary } from '@/api/dictionary';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { nowDateTimeInput } from '@/lib/dates';
import { IncomeExpenseForm, type IncomeExpenseFormApi } from './IncomeExpenseForm';
import { TransferForm, type TransferFormApi } from './TransferForm';
import {
  toIncomeExpenseFormValues,
  toTransferFormValues,
  toIncomeRequest,
  toExpenseRequest,
  toTransferRequest,
  type IncomeExpenseFormValues,
  type TransferFormValues,
} from './schema';
import { useCreateIncome } from './useCreateIncome';
import { useCreateExpense } from './useCreateExpense';
import { useCreateTransfer } from './useCreateTransfer';
import { TRANSACTION_KIND_LABELS, type TransactionKind } from './labels';
import { isAdjustment, isTransfer, transactionKind } from './transactionType';

export interface CopyTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tx: TransactionResponse;
}

type Configuration = ReturnType<typeof useConfiguration>['data'];

export function CopyTransactionDialog({ open, onOpenChange, tx }: CopyTransactionDialogProps) {
  const { data: accounts } = useAccounts();
  const { data: config } = useConfiguration();

  const transfer = isTransfer(tx.transactionType);
  // Adjustments have no create flow (see EditTransactionDialog); copy is blocked.
  const adjustment = isAdjustment(tx.transactionType);
  const kind: TransactionKind = transactionKind(tx.transactionType);

  const title = adjustment ? 'Copy transaction' : TRANSACTION_KIND_LABELS[kind].copyTitle;
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  let body: React.ReactNode;
  if (adjustment) {
    body = <AdjustmentNotice onClose={close} />;
  } else if (!accounts) {
    // react-hook-form seeds defaultValues once; wait for accounts so the
    // account picker is populated for the dialog's lifetime.
    body = <BodyLoader />;
  } else if (transfer) {
    body = <CopyTransferBody tx={tx} accounts={accounts} config={config} onClose={close} />;
  } else {
    body = (
      <CopyIncomeExpenseBody
        tx={tx}
        kind={kind as 'income' | 'expense'}
        accounts={accounts}
        config={config}
        onClose={close}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Create a new transaction from an existing one.</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

function CopyIncomeExpenseBody({
  tx,
  kind,
  accounts,
  config,
  onClose,
}: {
  tx: TransactionResponse;
  kind: 'income' | 'expense';
  accounts: AccountResponse[];
  config: Configuration;
  onClose: () => void;
}) {
  // Both hooks are instantiated unconditionally (hooks can't be conditional);
  // only the one matching `kind` is invoked on submit.
  const createIncome = useCreateIncome();
  const createExpense = useCreateExpense();
  const create = kind === 'income' ? createIncome : createExpense;

  const categoryDictId = kind === 'income' ? 'income' : 'expense';
  const categories = flattenDictionary(config?.dictionaries[categoryDictId]);
  const reimbursementCategories = flattenDictionary(config?.dictionaries['expense']);
  const labels = flattenDictionary(config?.dictionaries.label);

  // Seed from the source, then default the date to now: a copy is a new
  // transaction recorded now, not a clone of the original's timestamp. The
  // allocation slice amounts in `tx.allocations` are already positive
  // magnitudes, so they need no sign adjustment.
  const defaultValues = useMemo(() => {
    const seed = toIncomeExpenseFormValues(tx, accounts);
    return { ...seed, date: nowDateTimeInput() };
  }, [tx, accounts]);

  const apiRef = useRef<IncomeExpenseFormApi | null>(null);
  const handleReady = useCallback((api: IncomeExpenseFormApi) => {
    apiRef.current = api;
  }, []);

  const handleSubmit = async (values: IncomeExpenseFormValues) => {
    try {
      if (kind === 'income') {
        await createIncome.mutateAsync(toIncomeRequest(values));
      } else {
        await createExpense.mutateAsync(toExpenseRequest(values));
      }
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        // Create flow uses raw backend field names (unlike EditTransactionDialog,
        // which maps them); follow the create dialogs' pattern here.
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
    <>
      {showBanner && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{bannerMessage}</AlertDescription>
        </Alert>
      )}
      <IncomeExpenseForm
        kind={kind}
        mode="create"
        accounts={accounts}
        categories={categories}
        reimbursementCategories={reimbursementCategories}
        labels={labels}
        defaultValues={defaultValues}
        isSubmitting={create.isPending}
        onSubmit={handleSubmit}
        onCancel={onClose}
        onReady={handleReady}
      />
    </>
  );
}

function CopyTransferBody({
  tx,
  accounts,
  config,
  onClose,
}: {
  tx: TransactionResponse;
  accounts: AccountResponse[];
  config: Configuration;
  onClose: () => void;
}) {
  const create = useCreateTransfer();
  const labels = flattenDictionary(config?.dictionaries.label);

  const defaultValues = useMemo(
    () => ({ ...toTransferFormValues(tx, accounts), date: nowDateTimeInput() }),
    [tx, accounts],
  );

  const apiRef = useRef<TransferFormApi | null>(null);
  const handleReady = useCallback((api: TransferFormApi) => {
    apiRef.current = api;
  }, []);

  const handleSubmit = async (values: TransferFormValues) => {
    const source = accounts.find((a) => a.id === values.sourceAccountId);
    const target = accounts.find((a) => a.id === values.targetAccountId);
    if (!source || !target) return; // schema guards make this unreachable
    try {
      await create.mutateAsync(toTransferRequest(values, source.currency, target.currency));
      onClose();
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
    <>
      {showBanner && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{bannerMessage}</AlertDescription>
        </Alert>
      )}
      <TransferForm
        mode="create"
        accounts={accounts}
        labels={labels}
        defaultValues={defaultValues}
        isSubmitting={create.isPending}
        onSubmit={handleSubmit}
        onCancel={onClose}
        onReady={handleReady}
      />
    </>
  );
}

function AdjustmentNotice({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-3">
      <Alert role="alert">
        <AlertDescription>
          Balance adjustments can&apos;t be copied. Use &quot;Adjust balance&quot; to record a new
          adjustment.
        </AlertDescription>
      </Alert>
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          OK
        </Button>
      </div>
    </div>
  );
}

function BodyLoader() {
  return (
    <div className="space-y-3" aria-busy>
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
      <Skeleton className="h-10 w-full" />
    </div>
  );
}
