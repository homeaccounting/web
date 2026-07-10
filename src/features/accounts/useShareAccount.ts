import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { accountsApi } from '@/api/accounts';
import { useAuth } from '@/auth/useAuth';
import type { ShareAccountRequest, UUID } from '@/api/types';

export function useShareAccount(id: UUID) {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<void, Error, ShareAccountRequest>({
    mutationFn: (body) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return accountsApi(client).share(id, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['account-access', id] });
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}
