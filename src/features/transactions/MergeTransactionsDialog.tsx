import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/api/client';
import type { TransactionResponse, UUID } from '@/api/types';
import { formatDate, formatMoney } from '@/lib/format';
import { useMergeTransactions } from './useMergeTransactions';
import {
  categorisedTotal,
  checkMergeEligibility,
  combinedTotal,
  mergeCurrency,
  type MergeIneligibility,
} from './mergeEligibility';

export interface MergeTransactionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The survivor (target): the right-clicked row that absorbs the chosen sources.
  acting: TransactionResponse;
  // Pool to pick sources from (the account's loaded window). Filtered down to the
  // rows compatible with `acting`.
  candidates: TransactionResponse[];
  // Called after a successful merge (e.g. to close the menu / clear state).
  onMerged?: () => void;
}

const INELIGIBILITY_MESSAGE: Record<MergeIneligibility, string> = {
  'too-few': 'Select at least one transaction to merge in.',
  'not-completed': 'Only completed transactions can be merged.',
  'unsupported-kind': 'Only income or expense transactions can be merged.',
  'mixed-kinds': 'All transactions must be the same kind — all income or all expense.',
  'different-accounts': 'All transactions must be on the same account.',
  'different-currencies': 'All transactions must use the same currency.',
  'conflicting-contacts':
    'The selection has two different contacts. They must share one contact, or leave it unset.',
};

export function MergeTransactionsDialog({
  open,
  onOpenChange,
  acting,
  candidates,
  onMerged,
}: MergeTransactionsDialogProps) {
  // Rows that can fold into `acting`: same account/kind/currency, Completed, and
  // not conflicting on contact — evaluated pairwise against the survivor.
  const compatible = useMemo(
    () =>
      candidates.filter((c) => c.id !== acting.id && checkMergeEligibility([acting, c]).eligible),
    [candidates, acting],
  );

  const [selectedIds, setSelectedIds] = useState<Set<UUID>>(new Set());
  const [fieldError, setFieldError] = useState<string | null>(null);

  const merge = useMergeTransactions(acting.id);

  // Preserve the candidate-list order (not click order) so the request is stable.
  const selectedSources = useMemo(
    () => compatible.filter((c) => selectedIds.has(c.id)),
    [compatible, selectedIds],
  );
  const fullSet = useMemo(() => [acting, ...selectedSources], [acting, selectedSources]);
  const eligibility = useMemo(() => checkMergeEligibility(fullSet), [fullSet]);
  const total = useMemo(() => combinedTotal(fullSet), [fullSet]);
  const currency = mergeCurrency(acting);

  // Only surface a reason once the user has selected something — an empty
  // selection is "too-few", which is the default, not an error to shout about.
  const conflict = selectedSources.length > 0 && !eligibility.eligible ? eligibility : null;

  const toggle = (id: UUID) =>
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const reset = () => {
    setSelectedIds(new Set());
    setFieldError(null);
  };

  const canMerge = selectedSources.length > 0 && eligibility.eligible && !merge.isPending;

  const handleSubmit = async () => {
    if (!canMerge) return;
    setFieldError(null);
    try {
      await merge.mutateAsync({ sourceTransactionIds: selectedSources.map((c) => c.id) });
      reset();
      onMerged?.();
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError) {
        const first = e.fieldErrors ? Object.values(e.fieldErrors)[0] : undefined;
        setFieldError(first ?? e.message);
      } else {
        setFieldError('Something went wrong. Please try again.');
      }
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge transactions</DialogTitle>
          <DialogDescription>
            Fold other transactions into “{acting.description || '(no description)'}”. The chosen
            ones are cancelled; this one keeps its date and description and absorbs their
            allocations.
          </DialogDescription>
        </DialogHeader>

        {conflict && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{INELIGIBILITY_MESSAGE[conflict.reason]}</AlertDescription>
          </Alert>
        )}

        {fieldError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{fieldError}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Merge in</legend>
            {compatible.length === 0 ? (
              <p className="text-sm text-muted-foreground">No compatible transactions to merge.</p>
            ) : (
              compatible.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    aria-label={`Include ${c.description || 'transaction'}`}
                    checked={selectedIds.has(c.id)}
                    onChange={() => toggle(c.id)}
                  />
                  <span>
                    {c.description || '(no description)'} · {formatDate(c.date)} ·{' '}
                    {formatMoney(categorisedTotal(c), mergeCurrency(c))}
                  </span>
                </label>
              ))
            )}
          </fieldset>

          <div className="text-sm text-muted-foreground">
            <p>
              Merged total:{' '}
              <span data-testid="merge-total" className="font-medium text-foreground">
                {formatMoney(total, currency)}
              </span>
            </p>
            {selectedSources.length > 0 && (
              <p>
                {selectedSources.length}{' '}
                {selectedSources.length === 1 ? 'transaction' : 'transactions'} will be cancelled.
              </p>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canMerge}>
            Merge
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
