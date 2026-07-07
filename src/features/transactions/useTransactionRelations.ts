import { useQuery } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { transactionsApi } from '@/api/transactions';
import type { TransactionRelationsResponse, UUID } from '@/api/types';
import { useAuth } from '@/auth/useAuth';

// Fetches a transaction's typed relations (inbound + outbound edges) via
// GET /api/transactions/:id/relations. `enabled` gates the query so callers can
// defer the fetch (e.g. until a dialog opens or an id is known).
export function useTransactionRelations(id: UUID | undefined, enabled = true) {
  const { tokenRef, signOut } = useAuth();
  return useQuery<TransactionRelationsResponse>({
    queryKey: ['transaction-relations', id],
    enabled: Boolean(id) && enabled,
    queryFn: () => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return transactionsApi(client).relations(id!);
    },
  });
}
