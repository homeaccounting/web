import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { transactionsApi } from '@/api/transactions';
import type { ExpenseRequest, TransactionResponse } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

export function useCreateExpense() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<TransactionResponse, Error, ExpenseRequest>({
    mutationFn: (body) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return transactionsApi(client).createExpense(body);
    },
    onSuccess: (_tx, body) => {
      void queryClient.invalidateQueries({ queryKey: ['transactions', body.accountId] });
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}
