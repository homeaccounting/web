import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '@/api/client';
import { transactionsApi } from '@/api/transactions';
import type { IncomeRequest, TransactionResponse } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

export function useCreateIncome() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<TransactionResponse, Error, IncomeRequest>({
    mutationFn: (body) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return transactionsApi(client).createIncome(body);
    },
    onSuccess: (_tx, body) => {
      void queryClient.invalidateQueries({ queryKey: ['transactions', body.accountId] });
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}
