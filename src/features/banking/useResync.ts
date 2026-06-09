import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { bankingApi } from '@/api/banking';
import type { ResyncRequest, ResyncResponse, UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

export function useResync(connectionId: UUID) {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<ResyncResponse, Error, ResyncRequest>({
    mutationFn: (body) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return bankingApi(client).resync(connectionId, body);
    },
    onSuccess: () => {
      // A sync changes both transactions and accounts.
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}
