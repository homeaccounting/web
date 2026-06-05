import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ApiClient } from '@/api/client';
import { usersApi } from '@/api/users';
import type { OAuthProviderName } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

export function useUnlinkOAuth() {
  const { tokenRef, signOut } = useAuth();
  const queryClient = useQueryClient();
  return useMutation<void, Error, OAuthProviderName>({
    mutationFn: (provider) => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return usersApi(client).unlinkOAuth(provider);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users', 'me'] });
    },
  });
}
