import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { formatMoney } from '@/lib/format';
import { useAccounts } from './useAccounts';
import { CreateAccountDialog } from './CreateAccountDialog';

export function AccountsPane() {
  const { data, isLoading, isError, refetch } = useAccounts();
  const [creating, setCreating] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">Accounts</span>
        <Button
          size="icon"
          variant="ghost"
          aria-label="Add account"
          onClick={() => setCreating(true)}
          className="h-7 w-7"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {isLoading && (
        <div className="space-y-2 p-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {isError && (
        <div className="space-y-2 p-3">
          <Alert role="alert" variant="destructive">
            <AlertDescription>Could not load accounts.</AlertDescription>
          </Alert>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            Retry
          </Button>
        </div>
      )}

      {!isLoading && !isError && (!data || data.length === 0) && (
        <div className="p-3">
          <span className="text-sm text-muted-foreground">No accounts yet.</span>
        </div>
      )}

      {!isLoading && !isError && data && data.length > 0 && (
        <ul className="space-y-1 p-2">
          {data.map((a) => (
            <li key={a.id}>
              <NavLink
                to={`/accounts/${a.id}`}
                className={({ isActive }) =>
                  cn(
                    'block rounded-md p-2 text-sm hover:bg-muted',
                    isActive && 'bg-muted font-medium',
                  )
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
      )}

      <CreateAccountDialog open={creating} onOpenChange={setCreating} />
    </>
  );
}
