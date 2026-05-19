import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { ApiClient } from '@/api/client';
import { accountsApi } from '@/api/accounts';
import type { AccountResponse, UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';
import type { AccountEditDiff } from './diffAccount';

const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

export interface EditAccountVars {
  diff: AccountEditDiff;
  onSubCallApplied: () => void;
}

export function useEditAccount(id: UUID) {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<void, Error, EditAccountVars>({
    mutationFn: async ({ diff, onSubCallApplied }) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      const api = accountsApi(client);

      const current = queryClient
        .getQueryData<AccountResponse[]>(['accounts'])
        ?.find((a) => a.id === id);
      if (!current) {
        throw new Error(`useEditAccount: account ${id} not in cache`);
      }

      if (diff.name !== undefined) {
        await api.rename(id, { name: diff.name });
        patchCachedAccount(queryClient, id, { name: diff.name });
        onSubCallApplied();
      }
      if (diff.overdraftLimit !== undefined) {
        await api.updateOverdraftLimit(id, {
          overdraftLimit: diff.overdraftLimit === null ? undefined : diff.overdraftLimit,
          currency: current.currency,
        });
        patchCachedAccount(queryClient, id, {
          overdraftLimit: diff.overdraftLimit ?? null,
        });
        onSubCallApplied();
      }
      if (diff.subtype !== undefined) {
        await api.updateSubtype(id, { subtype: diff.subtype });
        patchCachedAccount(queryClient, id, {
          subtype: diff.subtype as unknown as AccountResponse['subtype'],
        });
        onSubCallApplied();
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

function patchCachedAccount(queryClient: QueryClient, id: UUID, patch: Partial<AccountResponse>) {
  queryClient.setQueryData<AccountResponse[] | undefined>(['accounts'], (list) =>
    list?.map((a) => (a.id === id ? { ...a, ...patch } : a)),
  );
}
