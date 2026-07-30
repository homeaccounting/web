import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { accountsApi } from '@/api/accounts';
import type { AdjustBalanceRequest, TransactionResponse, UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

export function useAdjustBalance(id: UUID) {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<TransactionResponse, Error, AdjustBalanceRequest>({
    mutationFn: (body) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return accountsApi(client).adjustBalance(id, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}
