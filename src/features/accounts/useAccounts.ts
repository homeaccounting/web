import { useQuery } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { accountsApi } from '@/api/accounts';
import { useAuth } from '@/auth/useAuth';
import { sortAccounts } from './accountLabel';

export function useAccounts() {
  const { tokenRef, signOut, session } = useAuth();
  return useQuery({
    queryKey: ['accounts'],
    enabled: !!session,
    queryFn: () => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return accountsApi(client).list();
    },
    // Impose a single, predictable order (by display label) for every consumer
    // — pane groups, pickers, reports — instead of the backend's arbitrary
    // order. buildAccountGroups preserves this incoming order within groups.
    select: sortAccounts,
  });
}
