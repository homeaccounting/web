import type { ApiClient } from './client';
import type {
  IncomeVsExpenseResponse,
  NetWorthResponse,
  SpendingByCategoryResponse,
} from './types';

// from/to are ISO-8601 UTC timestamps (backend UTCTime); absent => open bound.
export interface ReportRange {
  from?: string;
  to?: string;
}

function rangeQuery(range: ReportRange): string {
  const qs = new URLSearchParams();
  if (range.from) qs.set('from', range.from);
  if (range.to) qs.set('to', range.to);
  const s = qs.toString();
  return s ? `?${s}` : '';
}

export const reportsApi = (client: ApiClient) => ({
  spendingByCategory: (range: ReportRange): Promise<SpendingByCategoryResponse> =>
    client.get<SpendingByCategoryResponse>(`/api/reports/spending-by-category${rangeQuery(range)}`),
  incomeVsExpense: (range: ReportRange): Promise<IncomeVsExpenseResponse> =>
    client.get<IncomeVsExpenseResponse>(`/api/reports/income-vs-expense${rangeQuery(range)}`),
  netWorth: (): Promise<NetWorthResponse> => client.get<NetWorthResponse>('/api/reports/net-worth'),
});
