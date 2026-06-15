import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { accountsApi } from '@/api/accounts';
import type { UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

export interface AccountStatusVars {
  id: UUID;
}

// Shared builder: close and reopen are symmetric — same client construction and
// the same `['accounts']` invalidation (a refetch is the simplest correct path,
// since the row's list visibility and the "Show closed" count both change).
function useAccountStatusMutation(
  action: (api: ReturnType<typeof accountsApi>, id: UUID) => Promise<void>,
): UseMutationResult<void, Error, AccountStatusVars> {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<void, Error, AccountStatusVars>({
    mutationFn: ({ id }) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return action(accountsApi(client), id);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}

export function useCloseAccount() {
  return useAccountStatusMutation((api, id) => api.close(id));
}

export function useReopenAccount() {
  return useAccountStatusMutation((api, id) => api.reopen(id));
}
