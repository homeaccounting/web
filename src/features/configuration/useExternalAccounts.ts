import { useQuery } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { bankingApi } from '@/api/banking';
import type { UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

export function useExternalAccounts(connectionId: UUID) {
  const { tokenRef, signOut } = useAuth();
  return useQuery({
    queryKey: ['external-accounts', connectionId],
    enabled: false, // fetched on demand from the Link dialog
    gcTime: 0, // never cache a live bank listing
    queryFn: () => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return bankingApi(client).listExternalAccounts(connectionId);
    },
  });
}
