import type { TransactionResponse } from '@/api/types';
import { allocationCategoryIds } from './allocations';

export interface TransactionFilters {
  description: string;
  labelIds: string[];
  // Category NAME to match ('' = no constraint). Matched by name, not id, so a
  // name shared across the income- and expense-category dictionaries (e.g.
  // "Other", which is seeded into both with distinct ids) matches slices from
  // either dictionary. See spec §5.
  category: string;
  // Contact dictionary-entry id to match ('' = no constraint). Matched by id
  // (exact), unlike `category` (by name), because contacts live in a single
  // shared dictionary. Transfer/adjustment rows carry `contactId === null` and
  // so are excluded whenever a contact is selected.
  contactId: string;
  showCancelledFailed: boolean; // false (default) hides Failed & Cancelled rows
}

// Browser-side filtering over the loaded window. AND across fields; an empty
// field imposes no constraint. Label match is ANY-of (backend overlap
// semantics). Category matches by NAME against any of a row's allocation slices
// (`categoryNameById` resolves slice ids to names); null-category rows
// (transfer/adjustment) are excluded when a category is selected. Contact
// matches by id (exact); there is no server-side contact query param. See spec §5.
export function applyTransactionFilters(
  rows: TransactionResponse[],
  filters: TransactionFilters,
  categoryNameById: Map<string, string>,
): TransactionResponse[] {
  const q = filters.description.trim().toLowerCase();
  return rows.filter((row) => {
    if (q && !row.description.toLowerCase().includes(q)) return false;
    if (filters.labelIds.length > 0 && !filters.labelIds.some((id) => row.labels.includes(id)))
      return false;
    if (
      filters.category &&
      !allocationCategoryIds(row).some((id) => categoryNameById.get(id) === filters.category)
    )
      return false;
    if (filters.contactId && row.contactId !== filters.contactId) return false;
    if (!filters.showCancelledFailed && (row.status === 'Failed' || row.status === 'Cancelled'))
      return false;
    return true;
  });
}

// NOTE: there is intentionally no client-side transaction sorter. The backend
// returns rows already ordered (business date desc, ties broken by creation
// order) and the wire `date` is truncated to whole seconds, so re-sorting here
// could only reshuffle correctly-ordered rows. Consumers must preserve the
// server order — see useWindowedTransactions.

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
// mirrors the existing isoDay pattern (schema.ts); end-of-day is correct
// because Range.within compares the ISO text lexically.
//
// Re-exported from lib/dates so reporting can share the same inclusive-UTC
// bounds without importing across features. Definitions moved there; the
// public surface of this module is unchanged.
export { dateInputToUtcStart, dateInputToUtcEnd } from '@/lib/dates';
