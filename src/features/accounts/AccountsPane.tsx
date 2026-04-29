import { NavLink } from 'react-router-dom';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { useAccounts } from './useAccounts';

export function AccountsPane() {
  const { data, isLoading, isError, refetch } = useAccounts();

  if (isLoading) {
    return (
      <div className="space-y-2 p-3">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12 w-full" />
        ))}
      </div>
    );
  }
  if (isError) {
    return (
      <div className="space-y-2 p-3">
        <Alert role="alert" variant="destructive">
          <AlertDescription>Could not load accounts.</AlertDescription>
        </Alert>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }
  if (!data || data.length === 0) {
    return <div className="p-3 text-sm text-muted-foreground">No accounts yet.</div>;
  }
  return (
    <ul className="space-y-1 p-2">
      {data.map((a) => (
        <li key={a.id}>
          <NavLink
            to={`/accounts/${a.id}`}
            className={({ isActive }) =>
              cn('block rounded-md p-2 text-sm hover:bg-muted', isActive && 'bg-muted font-medium')
            }
          >
            <div className="flex items-baseline justify-between gap-2">
              <span>{a.name}</span>
              <span className="tabular-nums">{formatMoney(a.balance, a.currency)}</span>
            </div>
            {a.subtype?.type && (
              <div className="text-xs text-muted-foreground">{a.subtype.type}</div>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
