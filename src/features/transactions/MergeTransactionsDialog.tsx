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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/api/client';
import { cn } from '@/lib/utils';
import type { TransactionResponse, UUID } from '@/api/types';
import { formatDate, formatMoney } from '@/lib/format';
import { useMergeTransactions } from './useMergeTransactions';
import {
  categorisedTotal,
  checkMergeEligibility,
  combinedTotal,
  mergeCurrency,
  MERGE_INELIGIBILITY_MESSAGE,
} from './mergeEligibility';

export interface MergeTransactionsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The rows the user selected in the list. The survivor is chosen here (default:
  // most recent); the rest are folded into it and cancelled.
  selected: TransactionResponse[];
  // Called after a successful merge (e.g. to clear the selection).
  onMerged?: () => void;
}

// The id of the most recent row (max date); ties fall back to the first such row
// in `rows` order, keeping the default deterministic.
function mostRecentId(rows: TransactionResponse[]): UUID | undefined {
  let best: TransactionResponse | undefined;
  for (const r of rows) {
    if (!best || r.date > best.date) best = r;
  }
  return best?.id;
}

export function MergeTransactionsDialog({
  open,
  onOpenChange,
  selected,
  onMerged,
}: MergeTransactionsDialogProps) {
  const [survivorId, setSurvivorId] = useState<UUID | undefined>(() => mostRecentId(selected));
  const [fieldError, setFieldError] = useState<string | null>(null);

  // Keep the survivor valid if the selection changes underneath the dialog
  // (defensive — the pane opens the dialog with a frozen selection, but a stale
  // survivorId would otherwise break the request).
  const effectiveSurvivorId =
    survivorId && selected.some((s) => s.id === survivorId) ? survivorId : mostRecentId(selected);

  const survivor = selected.find((s) => s.id === effectiveSurvivorId) ?? selected[0];
  const merge = useMergeTransactions(effectiveSurvivorId ?? '');

  const eligibility = useMemo(() => checkMergeEligibility(selected), [selected]);
  const total = useMemo(() => combinedTotal(selected), [selected]);
  const currency = survivor ? mergeCurrency(survivor) : '';
  const sources = useMemo(
    () => selected.filter((s) => s.id !== effectiveSurvivorId),
    [selected, effectiveSurvivorId],
  );

  const conflict = !eligibility.eligible ? eligibility : null;
  const canMerge = eligibility.eligible && sources.length > 0 && !merge.isPending;

  const reset = () => setFieldError(null);

  const handleSubmit = async () => {
    if (!canMerge) return;
    setFieldError(null);
    try {
      await merge.mutateAsync({ sourceTransactionIds: sources.map((s) => s.id) });
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
          <DialogTitle>Merge {selected.length} transactions</DialogTitle>
          <DialogDescription>
            Pick the one to keep. It holds its date &amp; description and absorbs the others&rsquo;
            allocations; the rest are cancelled.
          </DialogDescription>
        </DialogHeader>

        {conflict && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{MERGE_INELIGIBILITY_MESSAGE[conflict.reason]}</AlertDescription>
          </Alert>
        )}

        {fieldError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{fieldError}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <fieldset className="space-y-2">
            <legend className="mb-1 text-sm font-medium">Keep</legend>
            {selected.map((c) => {
              const isSurvivor = c.id === effectiveSurvivorId;
              return (
                <label
                  key={c.id}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-md border p-2.5 text-sm',
                    isSurvivor ? 'border-primary bg-primary/5' : 'border-border',
                  )}
                >
                  <input
                    type="radio"
                    name="merge-survivor"
                    aria-label={`Keep ${c.description || 'transaction'}`}
                    checked={isSurvivor}
                    onChange={() => setSurvivorId(c.id)}
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">
                      {c.description || '(no description)'}
                    </span>
                    <span className="text-xs text-muted-foreground">{formatDate(c.date)}</span>
                  </span>
                  {isSurvivor ? (
                    <Badge variant="default" className="ml-auto">
                      Survivor
                    </Badge>
                  ) : (
                    <span className="ml-auto tabular-nums text-muted-foreground">
                      {formatMoney(categorisedTotal(c), mergeCurrency(c))}
                    </span>
                  )}
                </label>
              );
            })}
          </fieldset>

          <div className="text-sm text-muted-foreground">
            <p>
              Merged total:{' '}
              <span data-testid="merge-total" className="font-medium text-foreground">
                {formatMoney(total, currency)}
              </span>
            </p>
            {sources.length > 0 && (
              <p>
                {sources.length} {sources.length === 1 ? 'transaction' : 'transactions'} will be
                cancelled.
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
