import { useMemo } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { formatMoney } from '@/lib/format';
import { useAccounts } from '@/features/accounts/useAccounts';
import { useNetWorth } from './useReports';

export function NetWorthCard() {
  const { data, isLoading, isError, refetch } = useNetWorth();
  const { data: accountsData } = useAccounts();

  // useAccounts() returns a bare AccountResponse[] — iterate directly.
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accountsData ?? []) m.set(a.id, a.name);
    return m;
  }, [accountsData]);

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between space-y-0">
        <CardTitle>Net worth</CardTitle>
        <span className="text-xs text-muted-foreground">current</span>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-24 w-full" />}
        {isError && (
          <div className="space-y-2">
            <Alert variant="destructive" role="alert">
              <AlertDescription>Couldn&rsquo;t load net worth.</AlertDescription>
            </Alert>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        )}
        {data && data.accounts.length === 0 && (
          <EmptyState message="No accounts yet." className="p-0" />
        )}
        {data && data.accounts.length > 0 && (
          <>
            <ul className="flex flex-col divide-y">
              {data.accounts.map((a) => {
                const crossCurrency = a.baseBalance.currency !== a.balance.currency;
                return (
                  <li
                    key={a.accountId}
                    className="flex items-baseline justify-between py-1.5 text-sm"
                  >
                    <span className="truncate">
                      {nameById.get(a.accountId) ?? a.accountId.slice(0, 8)}
                    </span>
                    <span className="ml-2 shrink-0 text-right tabular-nums">
                      {formatMoney(a.balance.amount, a.balance.currency)}
                      {crossCurrency && (
                        <span className="ml-2 text-muted-foreground">
                          ({formatMoney(a.baseBalance.amount, a.baseBalance.currency)})
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex items-baseline justify-between border-t pt-3 font-semibold">
              <span>Total</span>
              <span className="tabular-nums">
                {formatMoney(data.total.amount, data.total.currency)}
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
