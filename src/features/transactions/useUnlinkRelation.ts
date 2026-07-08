import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, ApiError, baseUrl } from '@/api/client';
import { transactionsApi } from '@/api/transactions';
import type { RelationKind, TransactionResponse, UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

interface UnlinkRelationParams {
  relatedTransactionId: UUID;
  relationKind: RelationKind;
}

export function useUnlinkRelation(transactionId: UUID) {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<TransactionResponse | undefined, Error, UnlinkRelationParams>({
    mutationFn: async (params) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      try {
        return await transactionsApi(client).unlinkRelation(transactionId, params);
      } catch (e) {
        // The edge is already gone — treat a missing relation as success.
        if (e instanceof ApiError && e.code === 'RELATION_NOT_FOUND') {
          return undefined;
        }
        throw e;
      }
    },
    onSuccess: (_data, params) => {
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['transaction-relations', transactionId] });
      void queryClient.invalidateQueries({
        queryKey: ['transaction-relations', params.relatedTransactionId],
      });
    },
  });
}
