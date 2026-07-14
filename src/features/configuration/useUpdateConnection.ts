import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { configurationApi } from '@/api/configuration';
import type { UpdateConnectionRequest, UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

interface UpdateConnectionVars {
  id: UUID;
  body: UpdateConnectionRequest;
}

export function useUpdateConnection() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<void, Error, UpdateConnectionVars>({
    mutationFn: ({ id, body }) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return configurationApi(client).updateConnection(id, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['configuration'] });
    },
  });
}
