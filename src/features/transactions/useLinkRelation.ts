import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { transactionsApi } from '@/api/transactions';
import type { LinkRelationRequest, TransactionResponse, UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

export function useLinkRelation(transactionId: UUID) {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<TransactionResponse, Error, LinkRelationRequest>({
    mutationFn: (body) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return transactionsApi(client).linkRelation(transactionId, body);
    },
    onSuccess: (_data, body) => {
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['transaction-relations', transactionId] });
      void queryClient.invalidateQueries({
        queryKey: ['transaction-relations', body.relatedTransactionId],
      });
    },
  });
}
