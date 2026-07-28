import { dateInputToUtcEnd, dateInputToUtcStart } from '@/lib/dates';

export type PeriodPreset = 'this-month' | 'last-month' | 'this-year' | 'last-year' | 'all-time';

export type PeriodValue = PeriodPreset | 'custom';

export const PERIOD_PRESETS: readonly PeriodPreset[] = [
  'this-month',
  'last-month',
  'this-year',
  'all-time',
] as const;

export const PERIOD_PRESET_LABELS: Record<PeriodPreset, string> = {
  'this-month': 'This month',
  'last-month': 'Last month',
  'this-year': 'This year',
  'last-year': 'Last year',
  'all-time': 'All time',
};

// 'YYYY-MM-DD' day strings — the shape DatePicker and the API converters use.
export interface DayRange {
  from: string;
  to: string;
}

const pad = (n: number) => String(n).padStart(2, '0');
const day = (y: number, m1: number, d: number) => `${y}-${pad(m1)}-${pad(d)}`;
// Last day of month m1 (1-based) in year y; day 0 of next month rolls back.
const lastDay = (y: number, m1: number) => new Date(y, m1, 0).getDate();

export function presetRange(preset: PeriodPreset, today: Date): DayRange {
  const y = today.getFullYear();
  const m1 = today.getMonth() + 1; // 1-based
  switch (preset) {
    case 'this-month':
      return { from: day(y, m1, 1), to: day(y, m1, lastDay(y, m1)) };
    case 'last-month': {
      const ly = m1 === 1 ? y - 1 : y;
      const lm = m1 === 1 ? 12 : m1 - 1;
      return { from: day(ly, lm, 1), to: day(ly, lm, lastDay(ly, lm)) };
    }
    case 'this-year':
      return { from: day(y, 1, 1), to: day(y, 12, 31) };
    case 'last-year':
      return { from: day(y - 1, 1, 1), to: day(y - 1, 12, 31) };
    case 'all-time':
      return { from: '', to: '' };
  }
}

// DayRange -> API-style inclusive UTC bounds; empty => omitted.
// Structurally identical to `ReportRange` (src/api/reports.ts) — report cards
// keep typing their prop as `ReportRange` at the call site.
export function toQueryRange(range: DayRange): { from?: string; to?: string } {
  const out: { from?: string; to?: string } = {};
  if (range.from) out.from = dateInputToUtcStart(range.from);
  if (range.to) out.to = dateInputToUtcEnd(range.to);
  return out;
}

const isDay = (v: string | null | undefined): v is string => !!v && /^\d{4}-\d{2}-\d{2}$/.test(v);

const isKnownPreset = (
  v: string | null | undefined,
  presets: readonly PeriodPreset[],
): v is PeriodPreset => !!v && (presets as readonly string[]).includes(v);

export interface PeriodResolution {
  periodValue: PeriodValue;
  dayRange: DayRange;
}

export interface PeriodFallback {
  period: PeriodValue;
  from?: string;
  to?: string;
}

export interface PeriodParseOptions {
  presets: readonly PeriodPreset[];
  defaultPreset: PeriodPreset;
  fallback?: PeriodFallback;
}

// Shared URL -> period resolution, consumed by both the reports and
// transactions pages. Precedence: URL -> fallback (persisted "last view") ->
// default preset. An explicit `?period=custom` with missing/invalid dates
// keeps `periodValue: 'custom'` but falls back to the default preset's range.
export function parsePeriodParams(
  params: URLSearchParams,
  today: Date,
  { presets, defaultPreset, fallback }: PeriodParseOptions,
): PeriodResolution {
  const raw = params.get('period');
  if (raw === 'custom') {
    const from = params.get('from');
    const to = params.get('to');
    const dayRange = isDay(from) && isDay(to) ? { from, to } : presetRange(defaultPreset, today);
    return { periodValue: 'custom', dayRange };
  }
  if (isKnownPreset(raw, presets)) {
    return { periodValue: raw, dayRange: presetRange(raw, today) };
  }
  // URL silent or unknown → fallback → default
  if (fallback) {
    if (fallback.period === 'custom' && isDay(fallback.from) && isDay(fallback.to)) {
      return { periodValue: 'custom', dayRange: { from: fallback.from, to: fallback.to } };
    }
    if (fallback.period !== 'custom' && isKnownPreset(fallback.period, presets)) {
      return { periodValue: fallback.period, dayRange: presetRange(fallback.period, today) };
    }
  }
  return { periodValue: defaultPreset, dayRange: presetRange(defaultPreset, today) };
}

export function periodParamsToSearch(
  periodValue: PeriodValue,
  dayRange: DayRange,
): Record<string, string> {
  const out: Record<string, string> = { period: periodValue };
  if (periodValue === 'custom') {
    out.from = dayRange.from;
    out.to = dayRange.to;
  }
  return out;
}
