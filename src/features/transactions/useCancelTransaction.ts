import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { transactionsApi } from '@/api/transactions';
import type { UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

export interface CancelTransactionVars {
  id: UUID;
  // Both legs of the transaction, de-duplicated, so each touched account's
  // transaction list and balance refresh after the cancel.
  accountIds: UUID[];
}

// Cancels a transaction via DELETE /api/transactions/:id. Invalidates rather
// than optimistically patching: the now-`Cancelled` row drops out of the
// default list and balances change, so a refetch is the simplest correct path.
// Mirrors useEditTransaction's client construction + invalidation shape.
export function useCancelTransaction() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<void, Error, CancelTransactionVars>({
    mutationFn: async ({ id }) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      await transactionsApi(client).cancel(id);
    },
    onSettled: (_data, _err, { accountIds }) => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      for (const acc of accountIds) {
        void queryClient.invalidateQueries({ queryKey: ['transactions', acc] });
      }
    },
  });
}
