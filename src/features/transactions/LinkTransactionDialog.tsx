import { useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/api/client';
import { TRANSACTION_TYPE, type RelationKind, type TransactionResponse } from '@/api/types';
import { formatDate, formatMoney } from '@/lib/format';
import { useAccounts } from '@/features/accounts/useAccounts';
import { useLinkRelation } from './useLinkRelation';
import { useTransactionRelations } from './useTransactionRelations';
import { useRefundSummary } from './useRefundSummary';
import { useAllAccountsWindowedTransactions } from './useWindowedTransactions';

export interface LinkTransactionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  acting: TransactionResponse;
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
// by its `sourceAccountId`. Used to keep refunds on the acting income's account
// and to label each counterpart with its account.
export function accountIdOf(tx: TransactionResponse): string {
  return tx.transactionType === TRANSACTION_TYPE.income ? tx.targetAccountId : tx.sourceAccountId;
}

// The kinds offered for a given acting row, adaptive so `acting` is always the
// edge `from`/owner: income-with-contra can additionally mark an expense as its
// refund target; every other row can only associate.
export function availableKinds(tx: TransactionResponse): LinkKind[] {
  return isIncomeWithContra(tx) ? ['refund', 'associated'] : ['associated'];
}

// A wide window (acting date .. today) for the counterpart list, spanning ALL
// of the user's accounts (Association's core use case links transactions on
// DIFFERENT accounts). Local calendar dates; the list hook converts them to
// inclusive UTC bounds.
function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const KIND_LABEL: Record<LinkKind, string> = {
  refund: 'Refund (mark as refund of an expense)',
  associated: 'Association',
};

export function LinkTransactionDialog({ open, onOpenChange, acting }: LinkTransactionDialogProps) {
  const kinds = useMemo(() => availableKinds(acting), [acting]);
  const [kind, setKind] = useState<LinkKind>(kinds[0] ?? 'associated');
  const [counterpartId, setCounterpartId] = useState<string>('');

  // Widest sensible window: from the acting row's date back a year, forward to
  // today — enough to surface the expense a refund refers to.
  const { fromDate, toDate } = useMemo(() => {
    const actingDate = new Date(acting.date);
    const from = new Date(actingDate);
    from.setFullYear(from.getFullYear() - 1);
    const today = new Date();
    const to = today > actingDate ? today : actingDate;
    return { fromDate: toDateInput(from), toDate: toDateInput(to) };
  }, [acting.date]);

  const listQuery = useAllAccountsWindowedTransactions(fromDate, toDate);
  const relationsQuery = useTransactionRelations(acting.id, open);

  // Account id → name, so each counterpart can be labelled with its account
  // (associations span accounts, so the account disambiguates rows).
  const { data: accounts } = useAccounts();
  const accountNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accounts ?? []) m.set(a.id, a.name);
    return m;
  }, [accounts]);

  const link = useLinkRelation(acting.id);

  // Ids already related to the acting row in EITHER direction, so we never offer
  // a reciprocal duplicate. Outbound edges ride on the row itself; inbound come
  // from the relations query.
  const relatedIds = useMemo(() => {
    const ids = new Set<string>();
    for (const e of acting.relations) ids.add(e.relatedTransactionId);
    for (const e of relationsQuery.data?.outbound ?? []) ids.add(e.relatedTransactionId);
    for (const e of relationsQuery.data?.inbound ?? []) ids.add(e.relatedTransactionId);
    return ids;
  }, [acting.relations, relationsQuery.data]);

  const candidates = useMemo(() => {
    const rows = listQuery.data ?? [];
    return rows.filter((tx) => {
      if (tx.id === acting.id) return false; // never self-link
      if (relatedIds.has(tx.id)) return false; // already related (either direction)
      if (kind === 'refund') {
        // Refund target must be a non-cancelled expense on the SAME account as
        // the acting income (money returns to the account it left).
        if (tx.transactionType !== TRANSACTION_TYPE.expense) return false;
        if (tx.status === 'Cancelled') return false;
        if (accountIdOf(tx) !== accountIdOf(acting)) return false;
      }
      return true;
    });
  }, [listQuery.data, acting, relatedIds, kind]);

  const selected = candidates.find((tx) => tx.id === counterpartId) ?? null;

  // Remaining-refundable hint for the chosen expense (Refund kind only).
  const emptyExpense: TransactionResponse = selected ?? acting;
  const refundSummary = useRefundSummary(
    emptyExpense,
    open && kind === 'refund' && selected !== null,
  );
  const overRefund =
    kind === 'refund' &&
    selected !== null &&
    !refundSummary.isLoading &&
    !refundSummary.isError &&
    refundSummary.remainingTotal <= 0;

  const [fieldError, setFieldError] = useState<string | null>(null);

  const reset = () => {
    setCounterpartId('');
    setFieldError(null);
  };

  const handleSubmit = async () => {
    if (!selected || overRefund) return;
    setFieldError(null);
    try {
      await link.mutateAsync({
        relatedTransactionId: selected.id,
        relationKind: kind,
      });
      reset();
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
          <DialogTitle>Link transaction</DialogTitle>
          <DialogDescription>
            Link a typed relation from this transaction to another existing one.
          </DialogDescription>
        </DialogHeader>

        {fieldError && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{fieldError}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="link-kind">Relation kind</Label>
            <Select
              value={kind}
              onValueChange={(v) => {
                setKind(v as LinkKind);
                setCounterpartId('');
                setFieldError(null);
              }}
            >
              <SelectTrigger id="link-kind" aria-label="Relation kind">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {kinds.map((k) => (
                  <SelectItem key={k} value={k}>
                    {KIND_LABEL[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="link-counterpart">Counterpart</Label>
            <Select value={counterpartId} onValueChange={setCounterpartId}>
              <SelectTrigger id="link-counterpart" aria-label="Counterpart transaction">
                <SelectValue placeholder="Select a transaction…" />
              </SelectTrigger>
              <SelectContent>
                {candidates.map((tx) => (
                  <SelectItem key={tx.id} value={tx.id}>
                    {tx.description} · {formatDate(tx.date)} ·{' '}
                    {accountNameById.get(accountIdOf(tx)) ?? 'Unknown account'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {candidates.length === 0 && !listQuery.isLoading && (
              <p className="text-sm text-muted-foreground">No eligible transactions.</p>
            )}
          </div>

          {kind === 'refund' && selected && (
            <div className="text-sm text-muted-foreground">
              {refundSummary.isLoading ? (
                'Checking refundable amount…'
              ) : refundSummary.isError ? (
                'Couldn’t load prior refunds for this expense.'
              ) : overRefund ? (
                <span role="alert" className="text-destructive">
                  This expense is already fully refunded.
                </span>
              ) : (
                <>
                  {formatMoney(refundSummary.remainingTotal, selected.sourceCurrency)} of{' '}
                  {formatMoney(refundSummary.originalTotal, selected.sourceCurrency)} left to refund
                </>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" type="button" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={!selected || overRefund || link.isPending}
          >
            Link
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
