import { useCallback, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
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
import type { AccountResponse, TransactionResponse, UUID } from '@/api/types';
import { useAccounts } from '@/features/accounts/useAccounts';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { IncomeExpenseForm, type IncomeExpenseFormApi } from './IncomeExpenseForm';
import { TransferForm, type TransferFormApi } from './TransferForm';
import {
  toIncomeExpenseFormValues,
  toTransferFormValues,
  type IncomeExpenseFormValues,
  type TransferFormValues,
} from './schema';
import { diffIncomeExpense, diffTransfer } from './diffTransaction';
import { useEditTransaction } from './useEditTransaction';
import { TRANSACTION_KIND_LABELS, type TransactionKind } from './labels';
import { isAdjustment, isIncome, isTransfer, transactionKind } from './transactionType';
import { mapIncomeExpenseFieldError, mapTransferFieldError } from './amendmentFieldErrors';

export interface EditTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tx: TransactionResponse;
}

export function EditTransactionDialog({ open, onOpenChange, tx }: EditTransactionDialogProps) {
  const queryClient = useQueryClient();
  const edit = useEditTransaction();
  const { data: accounts } = useAccounts();
  const { data: config } = useConfiguration();
  const [editEpoch, setEditEpoch] = useState(0);
  const onSubCallApplied = useCallback(() => setEditEpoch((n) => n + 1), []);

  const transfer = isTransfer(tx.transactionType);
  // Adjustments are booked External -> regular account (or vice versa) in the
  // base currency on the External leg; they have no category and the backend
  // cannot amend them (Commands.hs "Adjustment is out of scope"). They must
  // not open the income/expense edit form.
  const adjustment = isAdjustment(tx.transactionType);
  const income = isIncome(tx.transactionType);
  const kind: TransactionKind = transactionKind(tx.transactionType);

  const accountIds = useMemo<UUID[]>(
    () =>
      transfer || adjustment
        ? [tx.sourceAccountId, tx.targetAccountId]
        : [income ? tx.targetAccountId : tx.sourceAccountId],
    [transfer, adjustment, income, tx.sourceAccountId, tx.targetAccountId],
  );

  const currentTx = useMemo<TransactionResponse>(() => {
    for (const acc of accountIds) {
      const list = queryClient.getQueryData<TransactionResponse[]>(['transactions', acc]);
      const cached = list?.find((t) => t.id === tx.id);
      if (cached) return cached;
    }
    return tx;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryClient, tx, editEpoch]);

  const title = adjustment ? 'Balance adjustment' : TRANSACTION_KIND_LABELS[kind].editTitle;
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  let body: React.ReactNode;
  if (currentTx.status !== 'Completed') {
    body = <ReadOnlyNotice status={currentTx.status} onClose={close} />;
  } else if (adjustment) {
    body = <AdjustmentNotice onClose={close} />;
  } else if (!accounts) {
    // Wait for accounts to load: react-hook-form seeds defaultValues once and
    // does not re-init when they change, so mounting the form against an empty
    // account list would leave the picker empty for the dialog's lifetime.
    body = <BodyLoader />;
  } else if (transfer) {
    body = (
      <EditTransferBody
        tx={currentTx}
        edit={edit}
        accountIds={accountIds}
        accounts={accounts}
        config={config}
        onSubCallApplied={onSubCallApplied}
        onClose={close}
      />
    );
  } else {
    body = (
      <EditIncomeExpenseBody
        tx={currentTx}
        edit={edit}
        kind={kind as 'income' | 'expense'}
        accountIds={accountIds}
        accounts={accounts}
        config={config}
        onSubCallApplied={onSubCallApplied}
        onClose={close}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Update transaction details.</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

function ReadOnlyNotice({ status, onClose }: { status: string; onClose: () => void }) {
  return (
    <div className="space-y-3">
      <Alert role="alert">
        <AlertDescription>This transaction is {status} and cannot be edited.</AlertDescription>
      </Alert>
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={onClose}>
          OK
        </Button>
      </div>
    </div>
  );
}

function AdjustmentNotice({ onClose }: { onClose: () => void }) {
  return (
    <div className="space-y-3">
      <Alert role="alert">
        <AlertDescription>
          This is a balance adjustment and cannot be edited. Use “Adjust balance” to record a new
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

type Configuration = ReturnType<typeof useConfiguration>['data'];

function EditIncomeExpenseBody({
  tx,
  edit,
  kind,
  accountIds,
  accounts,
  config,
  onSubCallApplied,
  onClose,
}: {
  tx: TransactionResponse;
  edit: ReturnType<typeof useEditTransaction>;
  kind: 'income' | 'expense';
  accountIds: UUID[];
  accounts: AccountResponse[];
  config: Configuration;
  onSubCallApplied: () => void;
  onClose: () => void;
}) {
  const seedCurrency = kind === 'income' ? tx.targetCurrency : tx.sourceCurrency;
  const filteredAccounts = useMemo(
    () => accounts.filter((a) => a.currency === seedCurrency),
    [accounts, seedCurrency],
  );

  const categoryDictId = kind === 'income' ? 'income-category' : 'expense-category';
  const categories = config?.dictionaries[categoryDictId]?.entries ?? [];
  const labels = config?.dictionaries.labels?.entries ?? [];

  const defaultValues = useMemo(() => toIncomeExpenseFormValues(tx, accounts), [tx, accounts]);
  const baselineRef = useRef(defaultValues);
  baselineRef.current = defaultValues;

  const apiRef = useRef<IncomeExpenseFormApi | null>(null);
  const handleReady = useCallback((api: IncomeExpenseFormApi) => {
    apiRef.current = api;
  }, []);

  const handleSubmit = async (values: IncomeExpenseFormValues) => {
    try {
      const diff = diffIncomeExpense(baselineRef.current, values, tx);
      await edit.mutateAsync({ id: tx.id, accountIds, diff, onSubCallApplied });
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          const target = mapIncomeExpenseFieldError(field, kind);
          if (target) apiRef.current?.setFieldError(target, message);
        }
      }
    }
  };

  const showBanner = edit.isError && !(edit.error instanceof ApiError && edit.error.fieldErrors);
  const bannerMessage =
    edit.error instanceof ApiError ? edit.error.message : 'Something went wrong. Please try again.';

  return (
    <>
      {showBanner && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{bannerMessage}</AlertDescription>
        </Alert>
      )}
      <IncomeExpenseForm
        kind={kind}
        mode="edit"
        accounts={filteredAccounts}
        categories={categories}
        labels={labels}
        defaultValues={defaultValues}
        isSubmitting={edit.isPending}
        onSubmit={handleSubmit}
        onCancel={onClose}
        onReady={handleReady}
      />
    </>
  );
}

function EditTransferBody({
  tx,
  edit,
  accountIds,
  accounts,
  config,
  onSubCallApplied,
  onClose,
}: {
  tx: TransactionResponse;
  edit: ReturnType<typeof useEditTransaction>;
  accountIds: UUID[];
  accounts: AccountResponse[];
  config: Configuration;
  onSubCallApplied: () => void;
  onClose: () => void;
}) {
  const labels = config?.dictionaries.labels?.entries ?? [];

  const defaultValues = useMemo(() => toTransferFormValues(tx, accounts), [tx, accounts]);
  const baselineRef = useRef(defaultValues);
  baselineRef.current = defaultValues;

  const apiRef = useRef<TransferFormApi | null>(null);
  const handleReady = useCallback((api: TransferFormApi) => {
    apiRef.current = api;
  }, []);

  const handleSubmit = async (values: TransferFormValues) => {
    try {
      const diff = diffTransfer(baselineRef.current, values, tx);
      await edit.mutateAsync({ id: tx.id, accountIds, diff, onSubCallApplied });
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          const target = mapTransferFieldError(field);
          if (target) apiRef.current?.setFieldError(target, message);
        }
      }
    }
  };

  const showBanner = edit.isError && !(edit.error instanceof ApiError && edit.error.fieldErrors);
  const bannerMessage =
    edit.error instanceof ApiError ? edit.error.message : 'Something went wrong. Please try again.';

  return (
    <>
      {showBanner && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{bannerMessage}</AlertDescription>
        </Alert>
      )}
      <TransferForm
        mode="edit"
        accounts={accounts}
        labels={labels}
        defaultValues={defaultValues}
        isSubmitting={edit.isPending}
        onSubmit={handleSubmit}
        onCancel={onClose}
        onReady={handleReady}
      />
    </>
  );
}
