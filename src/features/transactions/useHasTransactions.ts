import { useQuery } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { transactionsApi } from '@/api/transactions';
import { useAuth } from '@/auth/useAuth';

// Cheap "does this account have any transaction?" probe used by the onboarding
// gate (tracker#58). limit:1 keeps the payload minimal; omitting accountId lists
// across ALL the user's accounts (src/api/transactions.ts:47-64). The
// ['transactions','any'] key is deliberately distinct from the account-scoped
// transaction-list keys, so it is untouched by the useSetCountry refetch (which
// targets ['configuration'] + ['providers']) and by account-scoped invalidations.
export function useHasTransactions() {
  const { tokenRef, signOut, session } = useAuth();
  return useQuery({
    queryKey: ['transactions', 'any'],
    enabled: !!session,
    queryFn: async () => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      const res = await transactionsApi(client).list({ limit: 1 });
      return res.transactions.length > 0;
    },
  });
}
