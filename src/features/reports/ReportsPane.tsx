import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { PageContainer } from '@/components/PageContainer';
import { PageHeader } from '@/components/PageHeader';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toQueryRange, type DayRange, type PeriodValue } from '@/lib/period';
import { PeriodSelector } from '@/components/PeriodSelector';
import { IncomeVsExpenseCard } from './IncomeVsExpenseCard';
import { SpendingByCategoryCard } from './SpendingByCategoryCard';
import { NetWorthCard } from './NetWorthCard';
import { readReportsLastView, writeReportsLastView } from './lastView';
import {
  parseReportsParams,
  reportsParamsToSearch,
  REPORTS_PRESETS,
  type ReportsTab,
} from './reportsUrl';

export function ReportsPane() {
  const { t } = useTranslation('reports');
  const [searchParams, setSearchParams] = useSearchParams();
  const lastView = useMemo(() => readReportsLastView(), []);
  const { tab, periodValue, dayRange } = parseReportsParams(
    searchParams,
    new Date(),
    lastView ?? undefined,
  );

  useEffect(() => {
    writeReportsLastView({
      tab,
      period: periodValue,
      ...(periodValue === 'custom' ? { from: dayRange.from, to: dayRange.to } : {}),
    });
  }, [tab, periodValue, dayRange.from, dayRange.to]);

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
      <PageHeader title={t('title')} />
      <Tabs value={tab} onValueChange={onTabChange}>
        <TabsList variant="underline">
          <TabsTrigger value="cash-flow">{t('tabs.cashFlow')}</TabsTrigger>
          <TabsTrigger value="net-worth">{t('tabs.netWorth')}</TabsTrigger>
        </TabsList>
        <TabsContent value="cash-flow" className="flex flex-col gap-4">
          <div className="flex justify-end">
            <PeriodSelector
              value={periodValue}
              range={dayRange}
              presets={REPORTS_PRESETS}
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
