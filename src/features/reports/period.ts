import { dateInputToUtcEnd, dateInputToUtcStart } from '@/lib/dates';
import type { ReportRange } from '@/api/reports';

export type PeriodPreset = 'this-month' | 'last-month' | 'this-year' | 'all-time';

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
    case 'all-time':
      return { from: '', to: '' };
  }
}

// DayRange -> API ReportRange (inclusive UTC bounds; empty => omitted).
export function toQueryRange(range: DayRange): ReportRange {
  const out: ReportRange = {};
  if (range.from) out.from = dateInputToUtcStart(range.from);
  if (range.to) out.to = dateInputToUtcEnd(range.to);
  return out;
}
