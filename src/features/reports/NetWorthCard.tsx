import { useMemo } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/format';
import { useAccounts } from '@/features/accounts/useAccounts';
import { useNetWorth } from './useReports';

export function NetWorthCard() {
  const { data, isLoading, isError } = useNetWorth();
  const { data: accountsData } = useAccounts();

  // useAccounts() returns a bare AccountResponse[] — iterate directly.
  const nameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of accountsData ?? []) m.set(a.id, a.name);
    return m;
  }, [accountsData]);

  return (
    <section className="rounded-lg border p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-semibold">Net worth</h2>
        <span className="text-xs text-muted-foreground">current</span>
      </div>
      {isLoading && <Skeleton className="h-24 w-full" />}
      {isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>Could not load net worth.</AlertDescription>
        </Alert>
      )}
      {data && data.accounts.length === 0 && (
        <p className="text-sm text-muted-foreground">No accounts yet.</p>
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
    </section>
  );
}
