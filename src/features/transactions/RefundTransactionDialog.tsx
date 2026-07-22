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
import type { TransactionResponse } from '@/api/types';
import { useAccounts } from '@/features/accounts/useAccounts';
import { flattenDictionary } from '@/api/dictionary';
import { useConfiguration } from '@/features/configuration/useConfiguration';
import { nowDateTimeInput } from '@/lib/dates';
import { formatMoney } from '@/lib/format';
import { IncomeExpenseForm, type IncomeExpenseFormApi } from './IncomeExpenseForm';
import { useRefundSummary, type RefundSummary } from './useRefundSummary';
import { useRefundTransaction } from './useRefundTransaction';
import { toIncomeRequest, refundAllocationCaps, type IncomeExpenseFormValues } from './schema';

export interface RefundTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  original: TransactionResponse;
}

export function RefundTransactionDialog({
  open,
  onOpenChange,
  original,
}: RefundTransactionDialogProps) {
  // The remaining-refundable data drives the seed amounts and the caps, so the
  // form can only render once the whole prior-refund fan-out has resolved.
  const summary = useRefundSummary(original, open);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Refund transaction</DialogTitle>
          <DialogDescription>
            Record a refund as an income transaction linked back to the original expense.
          </DialogDescription>
        </DialogHeader>
        {summary.isError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>
              Couldn&apos;t load prior refunds for this transaction. Please try again.
            </AlertDescription>
          </Alert>
        )}
        {summary.isLoading && (
          <div className="p-2 text-sm text-muted-foreground">Loading refund details…</div>
        )}
        {!summary.isLoading && !summary.isError && (
          <RefundForm original={original} summary={summary} onOpenChange={onOpenChange} />
        )}
      </DialogContent>
    </Dialog>
  );
}

// Inner form, mounted only once the summary resolved, so `defaultValues` are
// computed from real remaining amounts (an income transaction with contra
// expense slices + a `refund` relation to the original).
function RefundForm({
  original,
  summary,
  onOpenChange,
}: {
  original: TransactionResponse;
  summary: RefundSummary;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: accounts } = useAccounts();
  const { data: config } = useConfiguration();
  const refund = useRefundTransaction(original.id);

  // A refund's contra allocations genuinely live in the `expenses` bucket, so the
  // form is built with `kind="expense"`: that renders a SINGLE, expanded section
  // over `expenses` titled "Expense categories" (IncomeExpenseForm.tsx:127) — the
  // one-editor layout a refund needs. `kind` is purely a layout+validation concern
  // here; the SUBMISSION path stays createIncome + a `refund` relation (below), so
  // the transaction is still posted as an income. The row editor's dictionary is
  // therefore the expense-category one. Archived slices (ids absent here) render
  // read-only via CategoryCombobox's fallback.
  const categories = flattenDictionary(config?.dictionaries['expense']);

  const { remainingByCategory, remainingTotal, refundedTotal } = summary;

  // The account the money returns to is the account the original expense debited.
  const originalTotal = original.allocations.expenses.reduce((s, a) => s + a.amount.amount, 0);

  const defaults = useMemo(
    (): IncomeExpenseFormValues => ({
      accountId: original.sourceAccountId,
      currency: original.sourceCurrency,
      incomes: [],
      // Seed one contra row per original expense slice, capped at its remaining;
      // fully-refunded slices (remaining <= 0) are dropped.
      expenses: original.allocations.expenses
        .map((a) => ({
          category: a.categoryId,
          amount: remainingByCategory[a.categoryId] ?? 0,
          comment: '',
        }))
        .filter((row) => row.amount > 0),
      description: `Refund: ${original.description}`,
      date: nowDateTimeInput(),
      labels: [],
      targetMode: true,
      targetTotal: remainingTotal,
    }),
    [original, remainingByCategory, remainingTotal],
  );

  // Memoized so the form resolver doesn't rebuild every render (the resolver
  // memo keys on `extraRefine` identity — an unstable value defeats it).
  const extraRefine = useMemo(
    () => refundAllocationCaps(remainingByCategory, remainingTotal),
    [remainingByCategory, remainingTotal],
  );

  const apiRef = useRef<IncomeExpenseFormApi | null>(null);
  const handleReady = useCallback((api: IncomeExpenseFormApi) => {
    apiRef.current = api;
  }, []);

  const handleSubmit = async (values: IncomeExpenseFormValues) => {
    try {
      const body = {
        ...toIncomeRequest(values),
        relation: { relatedTransactionId: original.id, relationKind: 'refund' as const },
      };
      await refund.mutateAsync(body);
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
    refund.isError && !(refund.error instanceof ApiError && refund.error.fieldErrors);
  const bannerMessage =
    refund.error instanceof ApiError
      ? refund.error.message
      : 'Something went wrong. Please try again.';

  return (
    <>
      {showBanner && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{bannerMessage}</AlertDescription>
        </Alert>
      )}
      {refundedTotal > 0 && (
        <p className="text-sm text-muted-foreground">
          {formatMoney(refundedTotal, original.sourceCurrency)} of{' '}
          {formatMoney(originalTotal, original.sourceCurrency)} already refunded ·{' '}
          {formatMoney(remainingTotal, original.sourceCurrency)} left
        </p>
      )}
      {accounts && accounts.length > 0 && (
        <IncomeExpenseForm
          kind="expense"
          mode="create"
          accounts={accounts}
          categories={categories}
          labels={flattenDictionary(config?.dictionaries.label)}
          defaultValues={defaults}
          isSubmitting={refund.isPending}
          enforceBalance={false}
          extraRefine={extraRefine}
          lockTarget
          onSubmit={handleSubmit}
          onCancel={() => onOpenChange(false)}
          onReady={handleReady}
        />
      )}
    </>
  );
}
