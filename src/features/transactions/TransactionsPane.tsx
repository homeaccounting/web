import type { ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  useConfiguration,
  useDictionaryEntryNames,
} from '@/features/configuration/useConfiguration';
import { useAccountById } from '@/features/accounts/useAccountById';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useTransactions } from './useTransactions';
import { AccountHeader } from './AccountHeader';

export function TransactionsPane() {
  const { id } = useParams<{ id?: string }>();
  const { data, isLoading, isError, refetch } = useTransactions(id);
  const { data: account, isLoading: accountLoading } = useAccountById(id);
  const { data: configuration } = useConfiguration();
  const categoryNameById = useDictionaryEntryNames(configuration);

  if (!id) return <div className="p-6 text-muted-foreground">Select an account.</div>;

  const header = account ? (
    <AccountHeader account={account} />
  ) : accountLoading ? (
    <div className="border-b px-4 py-3">
      <Skeleton className="h-8 w-full" />
    </div>
  ) : null;

  let body: ReactNode;
  if (isLoading) {
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
              <tr key={t.id} className="border-t">
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
            );
          })}
        </tbody>
      </table>
    );
  }

  return (
    <>
      {header}
      {body}
    </>
  );
}
