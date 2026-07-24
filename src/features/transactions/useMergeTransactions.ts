import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { transactionsApi } from '@/api/transactions';
import type { MergeTransactionsRequest, TransactionResponse, UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

// Merge the source transactions into `targetId`. On success the target absorbs
// the combined allocations/amount and the sources become Cancelled, so the
// windowed transaction lists and account balances both change — invalidate the
// whole `['transactions']` prefix (keys are ['transactions', accountId, …]),
// `['accounts']`, and the relation caches for the target + every source.
export function useMergeTransactions(targetId: UUID) {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<TransactionResponse, Error, MergeTransactionsRequest>({
    mutationFn: (body) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return transactionsApi(client).merge(targetId, body);
    },
    onSuccess: (_data, body) => {
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['transaction-relations', targetId] });
      for (const sourceId of body.sourceTransactionIds) {
        void queryClient.invalidateQueries({ queryKey: ['transaction-relations', sourceId] });
      }
    },
  });
}
