import { useMemo } from 'react';
import { useQueries } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { transactionsApi } from '@/api/transactions';
import type { TransactionResponse, UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';
import { roundMoney } from '@/lib/money';
import { useTransactionRelations } from './useTransactionRelations';

export interface RefundSummary {
  isLoading: boolean;
  isError: boolean;
  refundedTotal: number;
  refundedByCategory: Record<UUID, number>;
  remainingTotal: number;
  remainingByCategory: Record<UUID, number>;
}

// Stable empty reference for the "no resolved refunds yet" case, so memos keyed
// on the resolved list don't recompute on every render before the fan-out lands.
const EMPTY_REFUNDS: readonly TransactionResponse[] = [];

// Per-category totals summed from an allocations' expense bucket. An expense's
// slices live in `expenses`; a refund is income-with-contra, so its contra
// slices are ALSO in `expenses` — both sides are read from the same bucket.
function sumExpenses(tx: TransactionResponse): Record<UUID, number> {
  const acc: Record<UUID, number> = {};
  for (const slice of tx.allocations.expenses) {
    acc[slice.categoryId] = (acc[slice.categoryId] ?? 0) + slice.amount.amount;
  }
  return acc;
}

// Computes how much of `original` remains refundable after accounting for every
// prior refund linked to it. Resolves the original's inbound `refund` edges,
// fetches each prior refund, and subtracts its per-category contra amounts from
// the original's per-category amounts (floored at 0 per category).
//
// `isError` is true if the relations query OR any prior-refund fetch fails — we
// never seed a new refund against partial data. `isLoading` stays true until
// relations and all prior-refund fetches resolve.
export function useRefundSummary(original: TransactionResponse, enabled: boolean): RefundSummary {
  const { tokenRef, signOut } = useAuth();

  const relationsQuery = useTransactionRelations(original.id, enabled);

  const priorRefundIds: UUID[] =
    relationsQuery.data?.inbound
      .filter((edge) => edge.relationKind === 'refund')
      .map((edge) => edge.relatedTransactionId) ?? [];

  // `combine` derives the aggregate under framework-managed memoization: its
  // result is stably referenced across renders as long as the underlying query
  // results are unchanged, so downstream memos can key on `refundQueries.data`
  // directly without a fragile hand-rolled id key.
  const refundQueries = useQueries({
    queries: priorRefundIds.map((id) => ({
      queryKey: ['transaction', id],
      // Only fetch once relations resolved and the parent is enabled.
      enabled: enabled && relationsQuery.isSuccess,
      queryFn: () => {
        const client = new ApiClient({
          baseUrl,
          getToken: () => tokenRef.current,
          onUnauthorized: signOut,
        });
        return transactionsApi(client).get(id);
      },
    })),
    combine: (results) => ({
      // All prior-refund fetches have resolved successfully.
      allLoaded: results.length === priorRefundIds.length && results.every((r) => r.isSuccess),
      isError: results.some((r) => r.isError),
      isLoading: results.some((r) => r.isLoading),
      data: results.map((r) => r.data).filter((d): d is TransactionResponse => Boolean(d)),
    }),
  });

  const originalByCategory = useMemo(() => sumExpenses(original), [original]);

  const isError = relationsQuery.isError || refundQueries.isError;

  // Loading until relations settle and every prior-refund fetch settles.
  const isLoading =
    enabled &&
    !isError &&
    (relationsQuery.isLoading ||
      (relationsQuery.isSuccess && !refundQueries.allLoaded && !refundQueries.isError));

  // Empty until the whole fan-out is successful — never seed against partial data.
  const resolvedRefunds = refundQueries.allLoaded ? refundQueries.data : EMPTY_REFUNDS;

  const refundedByCategory = useMemo(() => {
    const acc: Record<UUID, number> = {};
    for (const refund of resolvedRefunds) {
      for (const [cat, amt] of Object.entries(sumExpenses(refund))) {
        acc[cat] = roundMoney((acc[cat] ?? 0) + amt);
      }
    }
    return acc;
  }, [resolvedRefunds]);

  const refundedTotal = useMemo(
    () => roundMoney(Object.values(refundedByCategory).reduce((s, n) => s + n, 0)),
    [refundedByCategory],
  );

  const remainingByCategory = useMemo(() => {
    const acc: Record<UUID, number> = {};
    for (const [cat, orig] of Object.entries(originalByCategory)) {
      acc[cat] = Math.max(0, roundMoney(orig - (refundedByCategory[cat] ?? 0)));
    }
    return acc;
  }, [originalByCategory, refundedByCategory]);

  // Spec §Task3: remainingTotal = originalTotal - refundedTotal (not the sum of
  // per-category remainders, which would differ if a category were over-refunded).
  const originalTotal = useMemo(
    () => roundMoney(Object.values(originalByCategory).reduce((s, n) => s + n, 0)),
    [originalByCategory],
  );
  const remainingTotal = Math.max(0, roundMoney(originalTotal - refundedTotal));

  return {
    isLoading,
    isError,
    refundedTotal,
    refundedByCategory,
    remainingTotal,
    remainingByCategory,
  };
}
