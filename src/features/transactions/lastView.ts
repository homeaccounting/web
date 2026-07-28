import type { PeriodValue } from '@/lib/period';
import type { TransactionFilters } from './transactionFilters';

// localStorage key. Persists the last-used account + period (+ custom
// from/to) + filters so the transactions page can restore its view on
// reopen. Mirrors src/features/reports/lastView.ts's tolerant parse pattern
// but carries the richer transactions shape (accountId + full filters).
export const TX_LAST_VIEW_KEY = 'ha.transactions.lastView';

const PERIODS: readonly PeriodValue[] = [
  'this-month',
  'last-month',
  'this-year',
  'last-year',
  'all-time',
  'custom',
];

export interface TxLastView {
  accountId: string;
  period: PeriodValue;
  from?: string;
  to?: string;
  filters: TransactionFilters;
}

function isFilters(f: unknown): f is TransactionFilters {
  if (!f || typeof f !== 'object') return false;
  const o = f as Record<string, unknown>;
  return (
    typeof o.description === 'string' &&
    Array.isArray(o.labelIds) &&
    o.labelIds.every((x) => typeof x === 'string') &&
    typeof o.category === 'string' &&
    typeof o.contactId === 'string' &&
    typeof o.showCancelledFailed === 'boolean'
  );
}

export function readLastView(): TxLastView | null {
  try {
    const raw = localStorage.getItem(TX_LAST_VIEW_KEY);
    const o = JSON.parse(raw ?? '') as Record<string, unknown>;
    if (
      o &&
      typeof o === 'object' &&
      typeof o.accountId === 'string' &&
      o.accountId !== '' &&
      PERIODS.includes(o.period as PeriodValue) &&
      isFilters(o.filters)
    ) {
      const v: TxLastView = {
        accountId: o.accountId,
        period: o.period as PeriodValue,
        filters: o.filters,
      };
      if (typeof o.from === 'string') v.from = o.from;
      if (typeof o.to === 'string') v.to = o.to;
      return v;
    }
  } catch {
    // fall through
  }
  return null;
}

export function writeLastView(v: TxLastView): void {
  localStorage.setItem(TX_LAST_VIEW_KEY, JSON.stringify(v));
}
