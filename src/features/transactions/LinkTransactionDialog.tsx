import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
import { cn } from '@/lib/utils';
import { ApiError } from '@/api/client';
import { TRANSACTION_TYPE, type RelationKind, type TransactionResponse } from '@/api/types';
import { useFormat } from '@/lib/useFormat';
import { useLinkRelation } from './useLinkRelation';
import { useRefundSummary } from './useRefundSummary';

export interface LinkTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The two rows the user selected in the list. Order is the selection order;
  // it only matters as the tie-break for the association owner.
  pair: [TransactionResponse, TransactionResponse];
  // Called after a successful link (e.g. to clear the selection).
  onLinked?: () => void;
}

// Relation kinds this dialog can create. `merge`/`split` are backend-internal
// and never offered here — only retroactive `refund` and `associated` edges.
type LinkKind = Extract<RelationKind, 'refund' | 'associated'>;

// An income that carries contra (expense-bucket) allocations is a refund-shaped
// row — the only shape that can act as the OWNER of a retroactive `refund` edge.
export function isIncomeWithContra(tx: TransactionResponse): boolean {
  return tx.transactionType === TRANSACTION_TYPE.income && tx.allocations.expenses.length > 0;
}

// The user-facing account a transaction belongs to. Income lands in its
// `targetAccountId` (source is an external account); every other kind is scoped
// by its `sourceAccountId`.
export function accountIdOf(tx: TransactionResponse): string {
  return tx.transactionType === TRANSACTION_TYPE.income ? tx.targetAccountId : tx.sourceAccountId;
}

// If the pair qualifies for a Refund edge, resolve which row is the owner (the
// income-with-contra row) and which is the refunded expense. Requires exactly
// one income-with-contra row and one non-cancelled expense on the SAME account.
export function refundPairing(
  pair: [TransactionResponse, TransactionResponse],
): { owner: TransactionResponse; expense: TransactionResponse } | null {
  const tryOrder = (owner: TransactionResponse, expense: TransactionResponse) => {
    if (!isIncomeWithContra(owner)) return null;
    if (expense.transactionType !== TRANSACTION_TYPE.expense) return null;
    if (expense.status === 'Cancelled') return null;
    if (accountIdOf(owner) !== accountIdOf(expense)) return null;
    return { owner, expense };
  };
  return tryOrder(pair[0], pair[1]) ?? tryOrder(pair[1], pair[0]);
}

// Association owner = the more recent row (edge is stored on the owner). Ties
// fall back to the first selected row, keeping direction deterministic.
function associationOwner(pair: [TransactionResponse, TransactionResponse]) {
  const [a, b] = pair;
  const owner = a.date >= b.date ? a : b;
  const counterpart = owner === a ? b : a;
  return { owner, counterpart };
}

export function LinkTransactionDialog({
  open,
  onOpenChange,
  pair,
  onLinked,
}: LinkTransactionDialogProps) {
  const { t } = useTranslation('transactions');
  const { formatDate, formatMoney } = useFormat();
  const pairing = useMemo(() => refundPairing(pair), [pair]);
  const kinds: LinkKind[] = pairing ? ['refund', 'associated'] : ['associated'];
  const [kind, setKind] = useState<LinkKind>(kinds[0] ?? 'associated');

  // Resolve owner/counterpart for the active kind.
  const assoc = useMemo(() => associationOwner(pair), [pair]);
  const owner = kind === 'refund' && pairing ? pairing.owner : assoc.owner;
  const counterpart = kind === 'refund' && pairing ? pairing.expense : assoc.counterpart;

  // The two rows are already linked (either direction) → nothing to create.
  const alreadyRelated = useMemo(() => {
    const [a, b] = pair;
    return (
      a.relations.some((r) => r.relatedTransactionId === b.id) ||
      b.relations.some((r) => r.relatedTransactionId === a.id)
    );
  }, [pair]);

  const link = useLinkRelation(owner.id);

  // Remaining-refundable guard for the chosen expense (Refund kind only).
  const refundSummary = useRefundSummary(
    pairing?.expense ?? pair[0],
    open && kind === 'refund' && pairing !== null,
  );
  const overRefund =
    kind === 'refund' &&
    pairing !== null &&
    !refundSummary.isLoading &&
    !refundSummary.isError &&
    refundSummary.remainingTotal <= 0;

  const [fieldError, setFieldError] = useState<string | null>(null);

  const canLink = !alreadyRelated && !overRefund && !link.isPending;

  const handleSubmit = async () => {
    if (!canLink) return;
    setFieldError(null);
    try {
      await link.mutateAsync({ relatedTransactionId: counterpart.id, relationKind: kind });
      setFieldError(null);
      onLinked?.();
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError) {
        const first = e.fieldErrors ? Object.values(e.fieldErrors)[0] : undefined;
        setFieldError(first ?? e.message);
      } else {
        setFieldError(t('resolve.genericError'));
      }
    }
  };

  const rowLabel = (tx: TransactionResponse) => (
    <span className="flex min-w-0 flex-col">
      <span className="truncate font-medium">{tx.description || t('resolve.noDescription')}</span>
      <span className="text-xs text-muted-foreground">
        {formatDate(tx.date)} · {formatMoney(tx.sourceAmount, tx.sourceCurrency)}
      </span>
    </span>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setFieldError(null);
        onOpenChange(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('resolve.linkTitle')}</DialogTitle>
          <DialogDescription>{t('resolve.linkDescription')}</DialogDescription>
        </DialogHeader>

        {fieldError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{fieldError}</AlertDescription>
          </Alert>
        )}

        {alreadyRelated && (
          <Alert role="alert">
            <AlertDescription>{t('resolve.alreadyLinked')}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          {kinds.length > 1 && (
            <div
              role="group"
              aria-label={t('resolve.relationKindGroup')}
              className="grid grid-cols-2 gap-2"
            >
              {kinds.map((k) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={kind === k}
                  onClick={() => {
                    setKind(k);
                    setFieldError(null);
                  }}
                  className={cn(
                    'rounded-md border p-2.5 text-left text-sm',
                    kind === k ? 'border-primary bg-primary/5' : 'border-border',
                  )}
                >
                  <span className="font-medium">{t(`resolve.linkKind.${k}`)}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t(`resolve.linkKindHint.${k}`)}
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 rounded-md border p-2.5 text-sm">
            {rowLabel(owner)}
            <span className="text-muted-foreground" aria-hidden>
              ↔
            </span>
            {rowLabel(counterpart)}
          </div>

          {kind === 'refund' && pairing && (
            <div className="text-sm text-muted-foreground">
              {refundSummary.isLoading ? (
                t('resolve.checkingRefundable')
              ) : refundSummary.isError ? (
                t('resolve.refundLoadErrorExpense')
              ) : overRefund ? (
                <span role="alert" className="text-destructive">
                  {t('resolve.fullyRefunded')}
                </span>
              ) : (
                t('resolve.refundLeftSummary', {
                  remaining: formatMoney(
                    refundSummary.remainingTotal,
                    pairing.expense.sourceCurrency,
                  ),
                  original: formatMoney(refundSummary.originalTotal, pairing.expense.sourceCurrency),
                })
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            {t('common:cancel')}
          </Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!canLink}>
            {t('resolve.link')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
