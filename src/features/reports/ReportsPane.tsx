import { useMemo, useState } from 'react';
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
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Reports</h1>
        <PeriodSelector
          value={periodValue}
          range={dayRange}
          onPresetChange={onPresetChange}
          onRangeChange={setDayRange}
        />
      </div>
      <IncomeVsExpenseCard range={query} />
      <SpendingByCategoryCard range={query} />
      <NetWorthCard />
    </div>
  );
}
