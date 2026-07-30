import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { transactionsApi } from '@/api/transactions';
import type { TransactionResponse, UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';
import type { TransactionEditDiff } from './diffTransaction';

export interface EditTransactionVars {
  id: UUID;
  accountIds: UUID[];
  diff: TransactionEditDiff;
  onSubCallApplied: () => void;
}

export function useEditTransaction() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<TransactionResponse | null, Error, EditTransactionVars>({
    mutationFn: async ({ id, accountIds, diff, onSubCallApplied }) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      const api = transactionsApi(client);
      let last: TransactionResponse | null = null;

      const apply = (resp: TransactionResponse) => {
        last = resp;
        for (const acc of accountIds) {
          patchCachedTx(queryClient, acc, resp);
        }
        onSubCallApplied();
      };

      if (diff.amendment) apply(await api.amend(id, diff.amendment));
      if (diff.allocations)
        apply(await api.setAllocations(id, { newAllocations: diff.allocations }));
      if (diff.description !== undefined)
        apply(await api.setDescription(id, { description: diff.description }));
      if (diff.date) apply(await api.setDate(id, { at: diff.date }));
      // labels presence — not truthiness — gates the request; empty array is
      // the user's explicit "clear labels" and must be sent.
      if (diff.labels !== undefined) apply(await api.setLabels(id, { labels: diff.labels }));
      // Presence, not truthiness — null is the explicit "clear contact".
      if (diff.contactId !== undefined)
        apply(await api.setContact(id, { contactId: diff.contactId }));

      return last;
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });
}

function patchCachedTx(queryClient: QueryClient, accountId: UUID, next: TransactionResponse) {
  queryClient.setQueryData<TransactionResponse[] | undefined>(['transactions', accountId], (list) =>
    list?.map((t) => (t.id === next.id ? next : t)),
  );
}
