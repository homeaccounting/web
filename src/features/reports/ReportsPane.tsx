import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toQueryRange, type DayRange } from './period';
import { PeriodSelector, type PeriodValue } from './PeriodSelector';
import { IncomeVsExpenseCard } from './IncomeVsExpenseCard';
import { SpendingByCategoryCard } from './SpendingByCategoryCard';
import { NetWorthCard } from './NetWorthCard';
import { parseReportsParams, reportsParamsToSearch, type ReportsTab } from './reportsUrl';

export function ReportsPane() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { tab, periodValue, dayRange } = parseReportsParams(searchParams, new Date());

  const setState = (next: { tab: ReportsTab; periodValue: PeriodValue; dayRange: DayRange }) => {
    setSearchParams(reportsParamsToSearch(next), { replace: true });
  };

  const onTabChange = (next: string) =>
    setState({ tab: next as ReportsTab, periodValue, dayRange });

  const onPresetChange = (next: PeriodValue) => {
    // Custom keeps the current range for editing; presets are resolved in parseReportsParams.
    setState({ tab, periodValue: next, dayRange });
  };

  const onRangeChange = (range: DayRange) =>
    setState({ tab, periodValue: 'custom', dayRange: range });

  const query = useMemo(() => toQueryRange(dayRange), [dayRange]);

  return (
    <PageContainer className="flex flex-col gap-4">
      <PageHeader title="Reports" />
      <Tabs value={tab} onValueChange={onTabChange}>
        <TabsList variant="underline">
          <TabsTrigger value="cash-flow">Cash flow</TabsTrigger>
          <TabsTrigger value="net-worth">Net worth</TabsTrigger>
        </TabsList>
        <TabsContent value="cash-flow" className="flex flex-col gap-4">
          <div className="flex justify-end">
            <PeriodSelector
              value={periodValue}
              range={dayRange}
              onPresetChange={onPresetChange}
              onRangeChange={onRangeChange}
            />
          </div>
          <IncomeVsExpenseCard range={query} />
          <SpendingByCategoryCard range={query} />
        </TabsContent>
        <TabsContent value="net-worth">
          <NetWorthCard />
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
