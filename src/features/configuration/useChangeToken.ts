import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { configurationApi } from '@/api/configuration';
import type { ChangeBankTokenRequest, UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

interface ChangeTokenVars {
  id: UUID;
  body: ChangeBankTokenRequest;
}

export function useChangeToken() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<void, Error, ChangeTokenVars>({
    mutationFn: ({ id, body }) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return configurationApi(client).changeToken(id, body);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['configuration'] });
    },
  });
}
