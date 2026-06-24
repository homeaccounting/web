import { Alert, AlertDescription } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { formatMoney } from '@/lib/format';
import type { ReportRange } from '@/api/reports';
import { cn } from '@/lib/utils';
import { useIncomeVsExpense } from './useReports';

function Figure({
  label,
  money,
  className,
}: {
  label: string;
  money: { amount: number; currency: string };
  className?: string;
}) {
  return (
    <div className="flex flex-col">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn('text-lg font-semibold tabular-nums', className)}>
        {formatMoney(money.amount, money.currency)}
      </span>
    </div>
  );
}

export function IncomeVsExpenseCard({ range }: { range: ReportRange }) {
  const { data, isLoading, isError } = useIncomeVsExpense(range);
  return (
    <section className="rounded-lg border p-4">
      <h2 className="mb-3 font-semibold">Income vs. expense</h2>
      {isLoading && <Skeleton className="h-12 w-full" />}
      {isError && (
        <Alert variant="destructive" role="alert">
          <AlertDescription>Could not load income vs. expense.</AlertDescription>
        </Alert>
      )}
      {data && (
        <div className="flex flex-wrap gap-8">
          <Figure label="Income" money={data.income} className="text-green-600" />
          <Figure label="Expense" money={data.expense} className="text-red-600" />
          <Figure
            label="Net"
            money={data.net}
            className={data.net.amount < 0 ? 'text-red-600' : 'text-green-600'}
          />
        </div>
      )}
    </section>
  );
}
