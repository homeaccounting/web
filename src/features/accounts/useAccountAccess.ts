import { useQuery } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { accountsApi } from '@/api/accounts';
import { useAuth } from '@/auth/useAuth';
import type { UUID } from '@/api/types';

export function useAccountAccess(id: UUID | undefined, enabled = true) {
  const { tokenRef, signOut, session } = useAuth();
  return useQuery({
    queryKey: ['account-access', id],
    enabled: !!session && !!id && enabled,
    queryFn: () => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return accountsApi(client).listAccess(id!);
    },
  });
}
