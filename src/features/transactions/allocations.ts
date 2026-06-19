import type { Allocations, TransactionResponse, UUID } from '@/api/types';

export interface Slice {
  category: UUID; // UUID is string; '' represents a blank/unselected row
  amount: number; // amount NaN while blank
}

const allSlices = (a: Allocations) => [...a.incomes, ...a.expenses];

export function allocationCategoryIds(tx: Pick<TransactionResponse, 'allocations'>): UUID[] {
  return allSlices(tx.allocations).map((s) => s.categoryId);
}

export function sliceArraysFromTx(tx: Pick<TransactionResponse, 'allocations'>): {
  incomes: Slice[];
  expenses: Slice[];
} {
  const map = (xs: Allocations['incomes']): Slice[] =>
    xs.map((s) => ({ category: s.categoryId, amount: s.amount.amount }));
  return {
    incomes: map(tx.allocations.incomes),
    expenses: map(tx.allocations.expenses),
  };
}

export function dropEmptySlices(slices: Slice[]): Slice[] {
  return slices.filter((s) => !(s.category === '' && Number.isNaN(s.amount)));
}
