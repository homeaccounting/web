import type { TransactionResponse } from '@/api/types';
import { roundMoney } from '@/lib/money';

export interface RefundStat {
  count: number;
  total: number;
}

// Sum both allocation buckets. For a refund income the refunded amount lands in
// the `expenses` contra-bucket; `incomes` is typically empty. Summing both is
// intentional and matches how the backend reports the categorised total.
// Assumption: a refund transaction does not carry non-zero amounts in both
// buckets simultaneously (the backend enforces this for the Refund relation kind).
const txTotal = (t: TransactionResponse): number =>
  roundMoney(
    [...t.allocations.incomes, ...t.allocations.expenses].reduce((s, a) => s + a.amount.amount, 0),
  );

/** Map originalId → aggregate of refunds pointing at it, from the loaded window. */
export function buildRefundIndex(transactions: TransactionResponse[]): Map<string, RefundStat> {
  const idx = new Map<string, RefundStat>();
  for (const t of transactions) {
    for (const rel of t.relations) {
      if (rel.relationKind !== 'refund') continue;
      const prev = idx.get(rel.relatedTransactionId) ?? { count: 0, total: 0 };
      idx.set(rel.relatedTransactionId, {
        count: prev.count + 1,
        total: roundMoney(prev.total + txTotal(t)),
      });
    }
  }
  return idx;
}
