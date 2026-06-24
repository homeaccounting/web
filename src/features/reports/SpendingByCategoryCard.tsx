import { useMemo } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/format';
import type { ReportRange } from '@/api/reports';
import {
  useConfiguration,
  useDictionaryEntryNames,
} from '@/features/configuration/useConfiguration';
import { BreakdownBar } from './BreakdownBar';
import { useSpendingByCategory } from './useReports';

export function SpendingByCategoryCard({ range }: { range: ReportRange }) {
  const { data, isLoading, isError } = useSpendingByCategory(range);
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
  }, [data, nameById]);

  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-3 font-semibold">Spending by category</h2>
      {isLoading && <Skeleton className="h-24 w-full" />}
      {isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>Could not load spending by category.</AlertDescription>
        </Alert>
      )}
      {data && rows.length === 0 && (
        <p className="text-sm text-muted-foreground">No spending in this period.</p>
      )}
      {rows.length > 0 && (
        <div className="flex flex-col">
          {rows.map((r) => (
            <BreakdownBar key={r.key} label={r.label} amount={r.amount} fraction={r.fraction} />
          ))}
        </div>
      )}
    </section>
  );
}
