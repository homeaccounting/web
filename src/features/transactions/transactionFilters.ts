import type { TransactionResponse } from '@/api/types';

export interface TransactionFilters {
  description: string;
  labelIds: string[];
  categoryId: string; // '' = no category constraint (UUID | '')
  showCancelledFailed: boolean; // false (default) hides Failed & Cancelled rows
}

// Browser-side filtering over the loaded window. AND across fields; an empty
// field imposes no constraint. Label match is ANY-of (backend overlap
// semantics). Category is exact-match on the head allocation surfaced by the
// backend; null-category rows (transfer/adjustment) are excluded when a
// category is selected. See spec §5.
export function applyTransactionFilters(
  rows: TransactionResponse[],
  filters: TransactionFilters,
): TransactionResponse[] {
  const q = filters.description.trim().toLowerCase();
  return rows.filter((row) => {
    if (q && !row.description.toLowerCase().includes(q)) return false;
    if (filters.labelIds.length > 0 && !filters.labelIds.some((id) => row.labels.includes(id)))
      return false;
    if (filters.categoryId && row.category !== filters.categoryId) return false;
    if (!filters.showCancelledFailed && (row.status === 'Failed' || row.status === 'Cancelled'))
      return false;
    return true;
  });
}

// Matches the backend ordering exactly: date descending, ties broken by id
// ascending (Application/ReadModels/Transaction.hs). Defensive so pagination
// is deterministic regardless of page-merge order.
export function sortTransactions(rows: TransactionResponse[]): TransactionResponse[] {
  return [...rows].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    return 0;
  });
}

function toDateInput(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Default window: last month .. today (local calendar dates — cosmetic
// default only; the UTC bounds for the request come from the helpers below).
// Note: setMonth(-1) on a 31st normalizes (e.g. May 31 → "April 31" → May 1),
// a harmless ~1-day skew in the default window.
export function defaultDateWindow(today: Date): { from: string; to: string } {
  const fromDate = new Date(today);
  fromDate.setMonth(fromDate.getMonth() - 1);
  return { from: toDateInput(fromDate), to: toDateInput(today) };
}

// True for a complete YYYY-MM-DD date-input value (native date inputs emit ''
// while mid-edit). Used to avoid driving a refetch with an incomplete date.
export function isDateInputValue(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v);
}

// A window is safe to send to the backend only when both bounds are complete
// dates and from <= to (string compare is chronological for YYYY-MM-DD). A
// from > to range is a 400 on the backend (dateFrom > dateTo).
export function isValidDateWindow(from: string, to: string): boolean {
  return isDateInputValue(from) && isDateInputValue(to) && from <= to;
}

// Inclusive UTC bounds for the backend dateFrom/dateTo params. Start-of-day
// mirrors the existing isoDay pattern (schema.ts); end-of-day is new to this
// slice and correct because Range.within compares the ISO text lexically.
export function dateInputToUtcStart(yyyyMmDd: string): string {
  return `${yyyyMmDd}T00:00:00.000Z`;
}
export function dateInputToUtcEnd(yyyyMmDd: string): string {
  return `${yyyyMmDd}T23:59:59.999Z`;
}
