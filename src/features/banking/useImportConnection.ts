import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { bankingApi } from '@/api/banking';
import type { ConnectionImportRequest, ImportResponse, UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

export function useImportConnection(connectionId: UUID) {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<ImportResponse, Error, ConnectionImportRequest>({
    mutationFn: (body) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return bankingApi(client).importConnection(connectionId, body);
    },
    onSuccess: () => {
      // A sync changes both transactions and accounts.
      void queryClient.invalidateQueries({ queryKey: ['transactions'] });
      void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
}
