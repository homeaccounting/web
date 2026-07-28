import { PERIOD_PRESETS, presetRange, type DayRange, type PeriodPreset } from './period';
import type { PeriodValue } from './PeriodSelector';

export type ReportsTab = 'cash-flow' | 'net-worth';

const TABS: readonly ReportsTab[] = ['cash-flow', 'net-worth'] as const;

export interface ReportsState {
  tab: ReportsTab;
  periodValue: PeriodValue;
  dayRange: DayRange;
}

const isTab = (v: string | null): v is ReportsTab => !!v && TABS.includes(v as ReportsTab);
const isPreset = (v: string | null): v is PeriodPreset =>
  !!v && PERIOD_PRESETS.includes(v as PeriodPreset);

// Accept only the 'YYYY-MM-DD' day shape DatePicker/period.ts use elsewhere.
const isDay = (v: string | null): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

/**
 * Derive reports UI state from URL search params. Unknown/garbage values fall
 * back to defaults (cash-flow tab, this-month period). A `custom` period without
 * a valid from/to pair falls back to the this-month preset range.
 */
export function parseReportsParams(params: URLSearchParams, today: Date): ReportsState {
  const tab: ReportsTab = isTab(params.get('tab'))
    ? (params.get('tab') as ReportsTab)
    : 'cash-flow';

  const period = params.get('period');
  if (period === 'custom') {
    const from = params.get('from');
    const to = params.get('to');
    const dayRange: DayRange =
      isDay(from) && isDay(to) ? { from, to } : presetRange('this-month', today);
    return { tab, periodValue: 'custom', dayRange };
  }

  const periodValue: PeriodPreset = isPreset(period) ? period : 'this-month';
  return { tab, periodValue, dayRange: presetRange(periodValue, today) };
}

/** Serialise reports state to a search-param map; from/to are emitted only for custom periods. */
export function reportsParamsToSearch(state: ReportsState): Record<string, string> {
  const out: Record<string, string> = { tab: state.tab, period: state.periodValue };
  if (state.periodValue === 'custom') {
    out.from = state.dayRange.from;
    out.to = state.dayRange.to;
  }
  return out;
}
