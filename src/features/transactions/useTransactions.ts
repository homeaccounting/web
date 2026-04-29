import { useQuery } from '@tanstack/react-query';
import { ApiClient } from '@/api/client';
import { transactionsApi } from '@/api/transactions';
import { useAuth } from '@/auth/useAuth';

const baseUrl =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://localhost:8080';

export function useTransactions(accountId: string | undefined) {
  const { tokenRef, signOut, session } = useAuth();
  return useQuery({
    queryKey: ['transactions', accountId],
    enabled: !!session && !!accountId,
    queryFn: () => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return transactionsApi(client).list({ accountId: accountId! });
    },
  });
}
