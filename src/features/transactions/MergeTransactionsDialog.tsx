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
import { useAccounts } from '@/features/accounts/useAccounts';
import { accountLabel } from '@/features/accounts/accountLabel';
import { useMergeTransactions } from './useMergeTransactions';
import {
  categorisedTotal,
  checkMergeEligibility,
  combinedTotal,
  mergeAccountId,
  mergeCurrency,
  mergeLegAmount,
  transferPairOf,
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

  const eligibility = useMemo(() => checkMergeEligibility(selected), [selected]);
  // A one-income + one-expense selection is a transfer-merge: the income is
  // always the survivor and the expense the (single) cancelled source, so the
  // dialog swaps its survivor picker for a fixed "these become one transfer"
  // summary. Recognised by shape so an ineligible pair (same account / legs
  // don't match) still uses the transfer layout under its conflict alert.
  const transferPair = useMemo(() => transferPairOf(selected), [selected]);

  // Keep the survivor valid if the selection changes underneath the dialog
  // (defensive — the pane opens the dialog with a frozen selection, but a stale
  // survivorId would otherwise break the request). Forced to the income in a
  // transfer-merge.
  const effectiveSurvivorId = transferPair
    ? transferPair.income.id
    : survivorId && selected.some((s) => s.id === survivorId)
      ? survivorId
      : mostRecentId(selected);

  const survivor = selected.find((s) => s.id === effectiveSurvivorId) ?? selected[0];
  const merge = useMergeTransactions(effectiveSurvivorId ?? '');

  const total = useMemo(() => combinedTotal(selected), [selected]);
  const currency = survivor ? mergeCurrency(survivor) : '';
  const sources = useMemo(
    () =>
      transferPair ? [transferPair.expense] : selected.filter((s) => s.id !== effectiveSurvivorId),
    [selected, transferPair, effectiveSurvivorId],
  );

  // Account labels for the transfer summary (From = expense's account, To =
  // income's). Resolved from the accounts list; falls back to a dash while it
  // loads or if an account is missing.
  const { data: accounts } = useAccounts();
  const accountsById = useMemo(
    () => new Map((accounts ?? []).map((a) => [a.id, a] as const)),
    [accounts],
  );
  const labelFor = (id: UUID): string => {
    const account = accountsById.get(id);
    return account ? accountLabel(account, accounts ?? []) : '—';
  };

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
          {transferPair ? (
            <>
              <DialogTitle>Merge into transfer</DialogTitle>
              <DialogDescription>
                These two are one transfer between your accounts. The income is kept and becomes the
                transfer (holding its date &amp; description); the expense is cancelled and linked.
              </DialogDescription>
            </>
          ) : (
            <>
              <DialogTitle>Merge {selected.length} transactions</DialogTitle>
              <DialogDescription>
                Pick the one to keep. It holds its date &amp; description and absorbs the
                others&rsquo; allocations; the rest are cancelled.
              </DialogDescription>
            </>
          )}
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

        {transferPair ? (
          <div data-testid="transfer-summary" className="space-y-3 text-sm">
            <div className="space-y-2 rounded-md border p-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">From</span>
                <span className="min-w-0 truncate font-medium">
                  {labelFor(mergeAccountId(transferPair.expense))}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">To</span>
                <span className="min-w-0 truncate font-medium">
                  {labelFor(mergeAccountId(transferPair.income))}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-medium tabular-nums">
                  {formatMoney(
                    mergeLegAmount(transferPair.income),
                    mergeCurrency(transferPair.income),
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Date</span>
                <span className="font-medium">{formatDate(transferPair.income.date)}</span>
              </div>
            </div>
            <p className="text-muted-foreground">
              The expense is cancelled and linked to the resulting transfer.
            </p>
          </div>
        ) : (
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
        )}

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canMerge}>
            {transferPair ? 'Make transfer' : 'Merge'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
