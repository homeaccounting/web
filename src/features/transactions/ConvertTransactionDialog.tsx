import { useCallback, useMemo, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { ApiError } from '@/api/client';
import type { AccountResponse, TransactionResponse, UUID } from '@/api/types';
import { useAccounts } from '@/features/accounts/useAccounts';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { useUserProfile } from '@/features/profile/useUserProfile';
import { dateInputToWire } from '@/lib/dates';
import { IncomeExpenseForm, type IncomeExpenseFormApi } from './IncomeExpenseForm';
import { TransferForm, type TransferFormApi } from './TransferForm';
import type { IncomeExpenseFormValues, TransferFormValues } from './schema';
import {
  toConvertIncomeExpenseDefaults,
  toConvertTransferDefaults,
  toIncomeExpenseAmendment,
  toTransferAmendment,
} from './convertTransaction';
import type { TransactionEditDiff } from './diffTransaction';
import { useEditTransaction } from './useEditTransaction';
import { TRANSACTION_KIND_LABELS, type TransactionKind } from './labels';
import { mapIncomeExpenseFieldError, mapTransferFieldError } from './amendmentFieldErrors';

export interface ConvertTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tx: TransactionResponse;
  targetKind: TransactionKind;
}

type Configuration = ReturnType<typeof useConfiguration>['data'];

// account ids whose ['transactions', id] cache must refresh: old legs + new legs.
function affectedAccountIds(tx: TransactionResponse, source: UUID, target: UUID): UUID[] {
  return [...new Set([tx.sourceAccountId, tx.targetAccountId, source, target])];
}

const sameLabels = (a: readonly UUID[], b: readonly UUID[]) =>
  a.length === b.length && a.every((id, i) => id === b[i]);

// Scalar edits (description/date/labels) the user made on top of the conversion,
// diffed against the seeded baseline — same fields Edit sends.
function scalarDiff(
  baseline: { description: string; date?: string; labels: UUID[] },
  next: { description: string; date?: string; labels: UUID[] },
): Pick<TransactionEditDiff, 'description' | 'date' | 'labels'> {
  const diff: Pick<TransactionEditDiff, 'description' | 'date' | 'labels'> = {};
  if (next.description !== baseline.description) diff.description = next.description;
  if (next.date && next.date !== baseline.date) diff.date = dateInputToWire(next.date);
  if (!sameLabels(baseline.labels, next.labels)) diff.labels = [...next.labels];
  return diff;
}

export function ConvertTransactionDialog({
  open,
  onOpenChange,
  tx,
  targetKind,
}: ConvertTransactionDialogProps) {
  const { data: accounts } = useAccounts();
  const { data: config } = useConfiguration();
  const { data: profile } = useUserProfile();

  const title = TRANSACTION_KIND_LABELS[targetKind].convertTitle;
  const close = useCallback(() => onOpenChange(false), [onOpenChange]);

  let body: React.ReactNode;
  if (!accounts || !profile || !config) {
    // react-hook-form seeds defaultValues once, so wait for every input the
    // seed depends on before mounting: accounts (picker), profile (external
    // account id for the income/expense External leg), and config (the
    // target-kind default category). Gating on all three keeps a single, simple
    // loading guard — and prevents seeding an empty category if config is slow.
    body = <BodyLoader />;
  } else if (targetKind === 'transfer') {
    body = <ConvertTransferBody tx={tx} accounts={accounts} config={config} onClose={close} />;
  } else {
    body = (
      <ConvertIncomeExpenseBody
        tx={tx}
        targetKind={targetKind}
        accounts={accounts}
        config={config}
        externalAccountId={profile.externalAccountId}
        onClose={close}
      />
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Change this transaction&apos;s type.</DialogDescription>
        </DialogHeader>
        {body}
      </DialogContent>
    </Dialog>
  );
}

function ConvertIncomeExpenseBody({
  tx,
  targetKind,
  accounts,
  config,
  externalAccountId,
  onClose,
}: {
  tx: TransactionResponse;
  targetKind: 'income' | 'expense';
  accounts: AccountResponse[];
  config: Configuration;
  externalAccountId: UUID;
  onClose: () => void;
}) {
  const edit = useEditTransaction();
  const categoryDictId = targetKind === 'income' ? 'income-category' : 'expense-category';
  const categories = config?.dictionaries[categoryDictId]?.entries ?? [];
  const reimbursementCategories = config?.dictionaries['expense-category']?.entries ?? [];
  const labels = config?.dictionaries.labels?.entries ?? [];
  const defaultCategory =
    (targetKind === 'income'
      ? config?.defaults.incomeCategory
      : config?.defaults.expenseCategory) ?? null;

  const defaultValues = useMemo(
    () => toConvertIncomeExpenseDefaults(tx, targetKind, accounts, defaultCategory),
    [tx, targetKind, accounts, defaultCategory],
  );
  const baselineRef = useRef(defaultValues);
  baselineRef.current = defaultValues;

  const apiRef = useRef<IncomeExpenseFormApi | null>(null);
  const handleReady = useCallback((api: IncomeExpenseFormApi) => {
    apiRef.current = api;
  }, []);

  const handleSubmit = async (values: IncomeExpenseFormValues) => {
    const amendment = toIncomeExpenseAmendment(targetKind, values, externalAccountId);
    const diff: TransactionEditDiff = { amendment, ...scalarDiff(baselineRef.current, values) };
    try {
      await edit.mutateAsync({
        id: tx.id,
        accountIds: affectedAccountIds(tx, amendment.sourceAccountId, amendment.targetAccountId),
        diff,
        // Convert is one-shot; the cache-epoch bump Edit uses to re-read live state is not needed here.
        onSubCallApplied: () => {},
      });
      onClose();
    } catch (e) {
      if (e instanceof ApiError && e.fieldErrors) {
        for (const [field, message] of Object.entries(e.fieldErrors)) {
          const target = mapIncomeExpenseFieldError(field, targetKind);
          if (target) apiRef.current?.setFieldError(target, message);
        }
      }
    }
  };

  return (
    <>
      <ErrorBanner edit={edit} />
      <IncomeExpenseForm
        kind={targetKind}
        mode="create"
        // Pass the full account list unfiltered (unlike EditTransactionDialog,
        // which filters by currency): a conversion may legitimately switch the
        // account/currency, so all accounts must be selectable.
        accounts={accounts}
        categories={categories}
        reimbursementCategories={reimbursementCategories}
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

function ConvertTransferBody({
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
  const edit = useEditTransaction();
  const labels = config?.dictionaries.labels?.entries ?? [];

  // Transfer-source conversion (Transfer→Transfer) is unreachable: the UI's convertTargets filter
  // only lists kinds other than the current one, so a transfer source never reaches this branch.
  const defaultValues = useMemo(() => toConvertTransferDefaults(tx, accounts), [tx, accounts]);
  const baselineRef = useRef(defaultValues);
  baselineRef.current = defaultValues;

  const apiRef = useRef<TransferFormApi | null>(null);
  const handleReady = useCallback((api: TransferFormApi) => {
    apiRef.current = api;
  }, []);

  const handleSubmit = async (values: TransferFormValues) => {
    const source = accounts.find((a) => a.id === values.sourceAccountId);
    const target = accounts.find((a) => a.id === values.targetAccountId);
    if (!source || !target) return; // schema guards make this unreachable
    const amendment = toTransferAmendment(values, source.currency, target.currency);
    const diff: TransactionEditDiff = { amendment, ...scalarDiff(baselineRef.current, values) };
    try {
      await edit.mutateAsync({
        id: tx.id,
        accountIds: affectedAccountIds(tx, amendment.sourceAccountId, amendment.targetAccountId),
        diff,
        // Convert is one-shot; the cache-epoch bump Edit uses to re-read live state is not needed here.
        onSubCallApplied: () => {},
      });
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

  return (
    <>
      <ErrorBanner edit={edit} />
      <TransferForm
        mode="create"
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

function ErrorBanner({ edit }: { edit: ReturnType<typeof useEditTransaction> }) {
  const show = edit.isError && !(edit.error instanceof ApiError && edit.error.fieldErrors);
  if (!show) return null;
  const message =
    edit.error instanceof ApiError ? edit.error.message : 'Something went wrong. Please try again.';
  return (
    <Alert variant="destructive" role="alert">
      <AlertDescription>{message}</AlertDescription>
    </Alert>
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
