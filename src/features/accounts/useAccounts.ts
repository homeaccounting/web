import { useQuery } from '@tanstack/react-query';
import { ApiClient } from '@/api/client';
import { accountsApi } from '@/api/accounts';
import { useAuth } from '@/auth/useAuth';

const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

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
  });
}
