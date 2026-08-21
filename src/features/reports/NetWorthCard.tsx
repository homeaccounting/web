import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { useFormat } from '@/lib/useFormat';
import { useAccounts } from '@/features/accounts/useAccounts';
import { useNetWorth } from './useReports';

export function NetWorthCard() {
  const { t } = useTranslation('reports');
  const { formatMoney } = useFormat();
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
        <CardTitle>{t('netWorth.title')}</CardTitle>
        <span className="text-xs text-muted-foreground">{t('netWorth.current')}</span>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-24 w-full" />}
        {isError && (
          <div className="space-y-2">
            <Alert variant="destructive" role="alert">
              <AlertDescription>{t('netWorth.loadError')}</AlertDescription>
            </Alert>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              {t('common:retry')}
            </Button>
          </div>
        )}
        {data && data.accounts.length === 0 && (
          <EmptyState message={t('netWorth.empty')} className="p-0" />
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
              <span>{t('netWorth.total')}</span>
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
