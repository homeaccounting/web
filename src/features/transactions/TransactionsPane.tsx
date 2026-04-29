import { useParams } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { formatDate, formatMoney } from '@/lib/format';
import { cn } from '@/lib/utils';
import { useTransactions } from './useTransactions';

export function TransactionsPane() {
  const { id } = useParams<{ id?: string }>();
  const { data, isLoading, isError, refetch } = useTransactions(id);

  if (!id) return <div className="p-6 text-muted-foreground">Select an account.</div>;

  if (isLoading) {
    return (
      <div className="space-y-2 p-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="space-y-2 p-4">
        <Alert role="alert" variant="destructive">
          <AlertDescription>Could not load transactions.</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  if (!data || data.length === 0) {
    return <div className="p-6 text-muted-foreground">No transactions yet.</div>;
  }

  return (
    <table className="w-full text-sm">
      <thead className="text-muted-foreground">
        <tr>
          <th className="px-4 py-2 text-left font-medium">Date</th>
          <th className="px-4 py-2 text-left font-medium">Description</th>
          <th className="px-4 py-2 text-left font-medium">Category</th>
          <th className="px-4 py-2 text-right font-medium">Amount</th>
        </tr>
      </thead>
      <tbody>
        {data.map((t) => {
          const negative = t.sourceAmount < 0;
          return (
            <tr key={t.id} className="border-t">
              <td className="px-4 py-2">{formatDate(t.date)}</td>
              <td className="px-4 py-2">{t.description}</td>
              <td className="px-4 py-2">{t.category ?? ''}</td>
              <td
                className={cn('px-4 py-2 text-right tabular-nums', negative && 'text-destructive')}
              >
                {formatMoney(t.sourceAmount, t.sourceCurrency)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
