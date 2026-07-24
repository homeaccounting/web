import { useMemo, useState } from 'react';
import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';
import { presetRange, toQueryRange, type DayRange } from './period';
import { PeriodSelector, type PeriodValue } from './PeriodSelector';
import { IncomeVsExpenseCard } from './IncomeVsExpenseCard';
import { SpendingByCategoryCard } from './SpendingByCategoryCard';
import { NetWorthCard } from './NetWorthCard';

export function ReportsPane() {
  const [periodValue, setPeriodValue] = useState<PeriodValue>('this-month');
  const [dayRange, setDayRange] = useState<DayRange>(() => presetRange('this-month', new Date()));

  const onPresetChange = (next: PeriodValue) => {
    setPeriodValue(next);
    if (next !== 'custom') setDayRange(presetRange(next, new Date()));
  };

  const query = useMemo(() => toQueryRange(dayRange), [dayRange]);

  return (
    <PageContainer className="flex flex-col gap-4">
      <PageHeader
        title="Reports"
        actions={
          <PeriodSelector
            value={periodValue}
            range={dayRange}
            onPresetChange={onPresetChange}
            onRangeChange={setDayRange}
          />
        }
      />
      <IncomeVsExpenseCard range={query} />
      <SpendingByCategoryCard range={query} />
      <NetWorthCard />
    </PageContainer>
  );
}
