import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/EmptyState';
import { useFormat } from '@/lib/useFormat';
import type { ReportRange } from '@/api/reports';
import {
  useConfiguration,
  useDictionaryEntryNames,
} from '@/features/configuration/useConfiguration';
import { BreakdownBar } from './BreakdownBar';
import { useSpendingByCategory } from './useReports';

export function SpendingByCategoryCard({ range }: { range: ReportRange }) {
  const { t } = useTranslation('reports');
  const { formatMoney } = useFormat();
  const { data, isLoading, isError, refetch } = useSpendingByCategory(range);
  const { data: config } = useConfiguration();
  const nameById = useDictionaryEntryNames(config);

  const rows = useMemo(() => {
    const cats = [...(data?.categories ?? [])].sort((a, b) => b.total.amount - a.total.amount);
    const max = cats.reduce((m, c) => Math.max(m, c.total.amount), 0);
    return cats.map((c) => ({
      key: c.categoryId,
      label: nameById.get(c.categoryId) ?? c.categoryId.slice(0, 8),
      amount: formatMoney(c.total.amount, c.total.currency),
      fraction: max > 0 ? c.total.amount / max : 0,
    }));
  }, [data, nameById, formatMoney]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('spendingByCategory.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-24 w-full" />}
        {isError && (
          <div className="space-y-2">
            <Alert variant="destructive" role="alert">
              <AlertDescription>{t('spendingByCategory.loadError')}</AlertDescription>
            </Alert>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              {t('common:retry')}
            </Button>
          </div>
        )}
        {data && rows.length === 0 && (
          <EmptyState message={t('spendingByCategory.empty')} className="p-0" />
        )}
        {rows.length > 0 && (
          <div className="flex flex-col">
            {rows.map((r) => (
              <BreakdownBar key={r.key} label={r.label} amount={r.amount} fraction={r.fraction} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
