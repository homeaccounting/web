import { useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@/components/ui/context-menu';
import { Pencil } from 'lucide-react';
import {
  useConfiguration,
  useDictionaryEntryNames,
} from '@/features/configuration/useConfiguration';
import { useAccountById } from '@/features/accounts/useAccountById';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { TransactionResponse } from '@/api/types';
import { useTransactions } from './useTransactions';
import { AccountHeader } from './AccountHeader';
import { ControlBar } from './ControlBar';
import { EditTransactionDialog } from './EditTransactionDialog';

export function TransactionsPane() {
  const { id } = useParams<{ id?: string }>();
  const { data, isLoading, isError, refetch } = useTransactions(id);
  const { data: account, isLoading: accountLoading } = useAccountById(id);
  const { data: configuration } = useConfiguration();
  const categoryNameById = useDictionaryEntryNames(configuration);

  const [editing, setEditing] = useState<TransactionResponse | null>(null);
  const openEdit = (t: TransactionResponse) => setEditing(t);

  const header = account ? (
    <AccountHeader account={account} />
  ) : accountLoading ? (
    <div className="border-b px-4 py-3">
      <Skeleton className="h-8 w-full" />
    </div>
  ) : null;

  let body: ReactNode;
  if (!id) {
    body = <div className="p-6 text-muted-foreground">Select an account.</div>;
  } else if (isLoading) {
    body = (
      <div className="space-y-2 p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  } else if (isError) {
    body = (
      <div className="space-y-2 p-4">
        <Alert role="alert" variant="destructive">
          <AlertDescription>Could not load transactions.</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  } else if (!data || data.length === 0) {
    body = <div className="p-6 text-muted-foreground">No transactions yet.</div>;
  } else {
    body = (
      <table className="w-full text-sm">
        <thead className="text-muted-foreground">
          <tr>
            <th className="px-4 py-2 text-left font-medium">Date</th>
            <th className="px-4 py-2 text-left font-medium">Description</th>
            <th className="w-40 px-4 py-2 text-left font-medium">Category</th>
            <th className="px-4 py-2 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {data.map((t) => {
            // Display the leg matching the currently-viewed account so the
            // amount appears in that account's currency. Adjustments are
            // booked against an External account in the base currency, so
            // blindly using sourceAmount/sourceCurrency would show base
            // currency for any incoming transfer.
            const isTarget = t.targetAccountId === id && t.sourceAccountId !== id;
            const amount = isTarget ? t.targetAmount : -t.sourceAmount;
            const currency = isTarget ? t.targetCurrency : t.sourceCurrency;
            const negative = amount < 0;
            return (
              <ContextMenu key={t.id}>
                <ContextMenuTrigger asChild>
                  <tr
                    className="cursor-pointer border-t hover:bg-muted/50"
                    role="button"
                    tabIndex={0}
                    onDoubleClick={() => openEdit(t)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openEdit(t);
                      }
                    }}
                  >
                    <td className="px-4 py-2">{formatDate(t.date)}</td>
                    <td className="px-4 py-2">{t.description}</td>
                    <td className="w-40 truncate px-4 py-2">
                      {t.category ? (categoryNameById.get(t.category) ?? '') : ''}
                    </td>
                    <td
                      className={cn(
                        'px-4 py-2 text-right tabular-nums',
                        negative && 'text-destructive',
                      )}
                    >
                      {formatMoney(amount, currency)}
                    </td>
                  </tr>
                </ContextMenuTrigger>
                <ContextMenuContent>
                  <ContextMenuItem onSelect={() => openEdit(t)}>
                    <Pencil className="mr-2 h-4 w-4" aria-hidden />
                    Edit
                  </ContextMenuItem>
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <>
      <ControlBar selectedAccountId={id} />
      {header}
      {body}
      {editing && (
        <EditTransactionDialog
          open
          onOpenChange={(o) => {
            if (!o) setEditing(null);
          }}
          tx={editing}
        />
      )}
    </>
  );
}
