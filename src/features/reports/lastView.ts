import type { PeriodValue } from '@/lib/period';
import { REPORTS_PRESETS, type ReportsTab, type ReportsLastView } from './reportsUrl'; // ReportsLastView defined once, in reportsUrl.ts

// localStorage key. Persists the last-used reports tab + period so /reports
// can restore it on reopen when the URL carries no params. See
// docs/specs (reports/lastView design) — mirrors stickyDate.ts's tolerant
// parse pattern but uses localStorage (survives restart) rather than
// sessionStorage.
export const REPORTS_LAST_VIEW_KEY = 'ha.reports.lastView';

const TABS: readonly ReportsTab[] = ['cash-flow', 'net-worth'];
// Derived from REPORTS_PRESETS (reportsUrl.ts) + 'custom' so this can't drift.
// Note: REPORTS_PRESETS omits 'last-year' (reports never uses it), so a
// stored last-year value is intentionally rejected here and falls back to
// the default.
const PERIODS: readonly string[] = [...REPORTS_PRESETS, 'custom'];

export function readReportsLastView(): ReportsLastView | null {
  try {
    const raw = localStorage.getItem(REPORTS_LAST_VIEW_KEY);
    const o = JSON.parse(raw ?? '') as Record<string, unknown>;
    if (
      o &&
      typeof o === 'object' &&
      TABS.includes(o.tab as ReportsTab) &&
      PERIODS.includes(o.period as PeriodValue)
    ) {
      const v: ReportsLastView = { tab: o.tab as ReportsTab, period: o.period as PeriodValue };
      if (typeof o.from === 'string') v.from = o.from;
      if (typeof o.to === 'string') v.to = o.to;
      return v;
    }
  } catch {
    // fall through
  }
  return null;
}

export function writeReportsLastView(v: ReportsLastView): void {
  localStorage.setItem(REPORTS_LAST_VIEW_KEY, JSON.stringify(v));
}
