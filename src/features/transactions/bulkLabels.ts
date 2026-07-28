import type { TransactionResponse, UUID } from '@/api/types';
import { isIncome, isExpense } from './transactionType';

// Shared status gate for bulk label & category, mirroring the single-row
// pickers which only render for Completed rows (TransactionsPane.tsx).
export function allCompleted(rows: TransactionResponse[]): boolean {
  return rows.length > 0 && rows.every((t) => t.status === 'Completed');
}

export type LabelState = 'all' | 'some' | 'none';

// How a label sits across the selection: on all rows, on some, or none.
export function labelState(rows: TransactionResponse[], labelId: UUID): LabelState {
  if (rows.length === 0) return 'none';
  const count = rows.filter((t) => t.labels.includes(labelId)).length;
  if (count === 0) return 'none';
  return count === rows.length ? 'all' : 'some';
}

// Per-row array transforms. Add dedups; remove is a no-op when absent.
export function withLabelAdded(labels: UUID[], labelId: UUID): UUID[] {
  return labels.includes(labelId) ? labels : [...labels, labelId];
}
export function withLabelRemoved(labels: UUID[], labelId: UUID): UUID[] {
  return labels.filter((l) => l !== labelId);
}

export interface BulkCategoryEligibility {
  enabled: boolean;
  reason?: string;
  type?: 'income' | 'expense';
}

// A row whose category can be re-assigned with a single same-type category: it
// has exactly one allocation slice, and that slice sits in the bucket matching
// its type (income→incomes, expense→expenses). This deliberately excludes
// - splits (more than one slice), and
// - refund/reimbursement incomes, whose contra slice lives in the `expenses`
//   bucket (incomes empty for a refund; both buckets for a reimbursement).
// Setting an income category onto a contra expense-bucket slice is rejected by
// the backend, so those rows must not be offered a bulk category.
export function hasSingleNaturalAllocation(t: TransactionResponse): boolean {
  const { incomes, expenses } = t.allocations;
  if (isIncome(t.transactionType)) return incomes.length === 1 && expenses.length === 0;
  if (isExpense(t.transactionType)) return expenses.length === 1 && incomes.length === 0;
  return false;
}

// Whether "Set category" is offered for the selection, and if not, why. Gating
// order: status → has-category → single-type → single natural allocation. `type`
// (when enabled) selects the income/expense dictionary.
export function bulkCategoryEligibility(rows: TransactionResponse[]): BulkCategoryEligibility {
  if (!allCompleted(rows)) {
    return { enabled: false, reason: 'Only completed transactions can be edited' };
  }
  if (rows.some((t) => !isIncome(t.transactionType) && !isExpense(t.transactionType))) {
    return { enabled: false, reason: 'These transactions have no category' };
  }
  const allIncome = rows.every((t) => isIncome(t.transactionType));
  const allExpense = rows.every((t) => isExpense(t.transactionType));
  if (!allIncome && !allExpense) {
    return { enabled: false, reason: 'Select transactions of one type to set a category' };
  }
  if (rows.some((t) => !hasSingleNaturalAllocation(t))) {
    return { enabled: false, reason: "Can't set a category on split or refund transactions" };
  }
  return { enabled: true, type: allIncome ? 'income' : 'expense' };
}
