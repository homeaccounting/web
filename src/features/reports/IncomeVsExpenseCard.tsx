import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
  const { data, isLoading, isError, refetch } = useIncomeVsExpense(range);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Income vs. expense</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-12 w-full" />}
        {isError && (
          <div className="space-y-2">
            <Alert variant="destructive" role="alert">
              <AlertDescription>Couldn&rsquo;t load income vs. expense.</AlertDescription>
            </Alert>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Retry
            </Button>
          </div>
        )}
        {data && (
          <div className="flex flex-wrap gap-8">
            <Figure label="Income" money={data.income} className="text-positive" />
            <Figure label="Expense" money={data.expense} className="text-negative" />
            <Figure
              label="Net"
              money={data.net}
              className={data.net.amount < 0 ? 'text-negative' : 'text-positive'}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
