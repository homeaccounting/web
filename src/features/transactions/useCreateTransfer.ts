import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { transactionsApi } from '@/api/transactions';
import type { InternalTransferRequest, TransactionResponse } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

export function useCreateTransfer() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<TransactionResponse, Error, InternalTransferRequest>({
    mutationFn: (body) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return transactionsApi(client).createTransfer(body);
    },
    onSuccess: (_tx, body) => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['transactions', body.sourceAccountId] });
      void queryClient.invalidateQueries({ queryKey: ['transactions', body.targetAccountId] });
    },
  });
}
