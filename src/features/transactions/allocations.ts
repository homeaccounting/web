import type { Allocations, TransactionResponse, UUID } from '@/api/types';

export interface Slice {
  category: UUID; // UUID is string; '' represents a blank/unselected row
  amount: number; // amount NaN while blank
  comment: string; // free-text note; '' when none
}

const allSlices = (a: Allocations) => [...a.incomes, ...a.expenses];

// Client mirror of backend Domain/Core/Types.hs:1077 normalizeComment: trim and
// treat blank/whitespace-only as absent. Used on submit and in diff comparison so
// a stray space never counts as a change or gets sent as "".
export function normalizeComment(c: string | null | undefined): string | undefined {
  const t = (c ?? '').trim();
  return t === '' ? undefined : t;
}

export function allocationCategoryIds(tx: Pick<TransactionResponse, 'allocations'>): UUID[] {
  return allSlices(tx.allocations).map((s) => s.categoryId);
}

// Non-empty allocation comments across both buckets, incomes first then expenses,
// in slice order. Used by the transactions list description column.
export function allocationComments(tx: Pick<TransactionResponse, 'allocations'>): string[] {
  return allSlices(tx.allocations)
    .map((s) => normalizeComment(s.comment))
    .filter((c): c is string => c !== undefined);
}

export function sliceArraysFromTx(tx: Pick<TransactionResponse, 'allocations'>): {
  incomes: Slice[];
  expenses: Slice[];
} {
  const map = (xs: Allocations['incomes']): Slice[] =>
    xs.map((s) => ({ category: s.categoryId, amount: s.amount.amount, comment: s.comment ?? '' }));
  return {
    incomes: map(tx.allocations.incomes),
    expenses: map(tx.allocations.expenses),
  };
}

// Collapse rows that share a category into one, preserving the order in which each
// category first appears. Blank-category rows are never grouped — each stays in place.
// A merged row sums the finite amounts of its members (NaN only if none is finite) and
// joins their comments (normalized, distinct, in order) with ", "; the comment is ''
// when no member has one. Used by the allocations editor's "Collapse duplicates" action.
export function collapseSlices(rows: Slice[]): Slice[] {
  const indexByCategory = new Map<string, number>();
  const out: Slice[] = [];
  for (const row of rows) {
    if (row.category === '') {
      out.push({ ...row });
      continue;
    }
    const existing = indexByCategory.get(row.category);
    if (existing === undefined) {
      indexByCategory.set(row.category, out.length);
      // Seed with a normalized comment so a later member joins against clean text.
      out.push({ ...row, comment: normalizeComment(row.comment) ?? '' });
      continue;
    }
    const target = out[existing]!;
    if (Number.isFinite(row.amount)) {
      target.amount = Number.isFinite(target.amount) ? target.amount + row.amount : row.amount;
    }
    const next = normalizeComment(row.comment);
    if (next !== undefined && !splitComment(target.comment).includes(next)) {
      target.comment = target.comment === '' ? next : `${target.comment}, ${next}`;
    }
  }
  return out;
}

// The individual comments in a joined ", "-separated comment string, used to skip
// duplicates while collapsing. Blank pieces are dropped.
function splitComment(joined: string): string[] {
  return joined
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s !== '');
}

// Generic over the row shape (comment optional) so both the editor `Slice` and the
// form-values slice can be filtered. A row is empty only when the category is blank
// AND the amount is NaN — a lone comment never makes a row submittable.
export function dropEmptySlices<T extends { category: string; amount: number }>(slices: T[]): T[] {
  return slices.filter((s) => !(s.category === '' && Number.isNaN(s.amount)));
}
