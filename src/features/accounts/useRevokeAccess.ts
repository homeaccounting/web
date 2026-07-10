import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { accountsApi } from '@/api/accounts';
import { useAuth } from '@/auth/useAuth';
import type { UUID } from '@/api/types';

export function useRevokeAccess(id: UUID) {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<void, Error, UUID>({
    mutationFn: (userId) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return accountsApi(client).revokeAccess(id, userId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['account-access', id] });
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}
