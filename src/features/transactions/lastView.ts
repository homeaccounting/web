import type { PeriodValue } from '@/lib/period';
import type { TransactionFilters } from './transactionFilters';

// localStorage key. Persists the last-used account + period (+ custom
// from/to) + filters so the transactions page can restore its view on
// reopen. Mirrors src/features/reports/lastView.ts's tolerant parse pattern
// but carries the richer transactions shape (account scope + full filters).
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
  accounts: 'all' | string[]; // 'all' = every account; a list = that subset (one id = single)
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

// Read the persisted scope, tolerant of the legacy `{ accountId: string }`
// shape (a single-account view before account-as-a-filter): it maps to a
// one-element subset. Returns null when no usable scope is present.
function readAccounts(o: Record<string, unknown>): 'all' | string[] | null {
  if (o.accounts === 'all') return 'all';
  if (
    Array.isArray(o.accounts) &&
    o.accounts.length > 0 &&
    o.accounts.every((x): x is string => typeof x === 'string')
  ) {
    return o.accounts;
  }
  if (typeof o.accountId === 'string' && o.accountId !== '') return [o.accountId];
  return null;
}

export function readLastView(): TxLastView | null {
  try {
    const raw = localStorage.getItem(TX_LAST_VIEW_KEY);
    const o = JSON.parse(raw ?? '') as Record<string, unknown>;
    const accounts = readAccounts(o);
    if (
      o &&
      typeof o === 'object' &&
      accounts !== null &&
      PERIODS.includes(o.period as PeriodValue) &&
      isFilters(o.filters)
    ) {
      const v: TxLastView = { accounts, period: o.period as PeriodValue, filters: o.filters };
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
