import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { configurationApi } from '@/api/configuration';
import type { SetAccountMapRequest, UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

interface SetAccountMapVars {
  id: UUID;
  body: SetAccountMapRequest;
}

export function useSetAccountMap() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<void, Error, SetAccountMapVars>({
    mutationFn: ({ id, body }) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return configurationApi(client).setAccountMap(id, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['configuration'] });
    },
  });
}
