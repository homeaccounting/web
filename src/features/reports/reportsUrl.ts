import {
  parsePeriodParams,
  periodParamsToSearch,
  type DayRange,
  type PeriodPreset,
  type PeriodValue,
} from '@/lib/period';

export type ReportsTab = 'cash-flow' | 'net-worth';

const TABS: readonly ReportsTab[] = ['cash-flow', 'net-worth'] as const;

export const REPORTS_PRESETS: readonly PeriodPreset[] = [
  'this-month',
  'last-month',
  'this-year',
  'all-time',
] as const;

export interface ReportsState {
  tab: ReportsTab;
  periodValue: PeriodValue;
  dayRange: DayRange;
}

// Single definition of ReportsLastView — reports/lastView.ts (a later task)
// imports it from here (do not redeclare there).
export interface ReportsLastView {
  tab: ReportsTab;
  period: PeriodValue;
  from?: string;
  to?: string;
}

const isTab = (v: string | null | undefined): v is ReportsTab =>
  !!v && TABS.includes(v as ReportsTab);

/**
 * Derive reports UI state from URL search params. Precedence: URL -> lastView
 * (persisted "last view") -> defaults (cash-flow tab, this-month period).
 * Unknown/garbage values fall back the same way. A `custom` period without a
 * valid from/to pair falls back to the this-month preset range.
 */
export function parseReportsParams(
  params: URLSearchParams,
  today: Date,
  lastView?: ReportsLastView,
): ReportsState {
  const rawTab = params.get('tab');
  const lastTab = lastView?.tab;
  const tab: ReportsTab = isTab(rawTab) ? rawTab : isTab(lastTab) ? lastTab : 'cash-flow';

  const { periodValue, dayRange } = parsePeriodParams(params, today, {
    presets: REPORTS_PRESETS,
    defaultPreset: 'this-month',
    fallback: lastView
      ? { period: lastView.period, from: lastView.from, to: lastView.to }
      : undefined,
  });

  return { tab, periodValue, dayRange };
}

/** Serialise reports state to a search-param map; from/to are emitted only for custom periods. */
export function reportsParamsToSearch(state: ReportsState): Record<string, string> {
  return { tab: state.tab, ...periodParamsToSearch(state.periodValue, state.dayRange) };
}
