import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useFormat } from '@/lib/useFormat';
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
  const { formatMoney } = useFormat();
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
  const { t } = useTranslation('reports');
  const { data, isLoading, isError, refetch } = useIncomeVsExpense(range);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('incomeVsExpense.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && <Skeleton className="h-12 w-full" />}
        {isError && (
          <div className="space-y-2">
            <Alert variant="destructive" role="alert">
              <AlertDescription>{t('incomeVsExpense.loadError')}</AlertDescription>
            </Alert>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              {t('common:retry')}
            </Button>
          </div>
        )}
        {data && (
          <div className="flex flex-wrap gap-8">
            <Figure
              label={t('incomeVsExpense.income')}
              money={data.income}
              className="text-positive"
            />
            <Figure
              label={t('incomeVsExpense.expense')}
              money={data.expense}
              className="text-negative"
            />
            <Figure
              label={t('incomeVsExpense.net')}
              money={data.net}
              className={data.net.amount < 0 ? 'text-negative' : 'text-positive'}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
