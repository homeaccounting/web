import { useEffect, useRef } from 'react';
import {
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
  type UseQueryResult,
} from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { syncApi } from '@/api/sync';
import { useAuth } from '@/auth/useAuth';

// Transport-agnostic scope→key map: the single place that knows which cached
// query key prefixes represent "data covered by /api/sync/version". When
// polling is swapped for SSE later, only the fetch mechanism below changes —
// this map (and the mutation hooks' own existing invalidations, which this
// signal supplements rather than replaces) stay untouched. Deliberately
// excludes ['configuration'], which the sync version does not cover.
export const DATA_SCOPE_KEYS = [
  ['accounts'],
  ['transactions'],
  ['reports'],
  ['transaction-relations'],
  ['account-access'],
] as const;

export function invalidateDataScopes(queryClient: QueryClient) {
  DATA_SCOPE_KEYS.forEach((key) => {
    void queryClient.invalidateQueries({ queryKey: key as unknown as QueryKey });
  });
}

/**
 * Polls the per-user sync version and invalidates the affected caches
 * whenever it changes (in either direction — a lower value, e.g. from a
 * backend restart/regression, still triggers a refetch rather than being
 * treated as stale-but-fine). Self-gates on session so it's a no-op while
 * logged out, and backs off automatically while the tab is hidden via
 * `refetchIntervalInBackground: false`.
 */
export function useDataChangeSignal(): UseQueryResult<number> {
  const { tokenRef, signOut, session } = useAuth();
  const queryClient = useQueryClient();
  const lastSeenRef = useRef<number | undefined>(undefined);

  const query = useQuery({
    queryKey: ['sync', 'version'],
    enabled: !!session,
    refetchInterval: 10_000,
    refetchIntervalInBackground: false,
    staleTime: 0,
    queryFn: () => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      return syncApi(client).getSyncVersion();
    },
  });

  useEffect(() => {
    if (query.data === undefined) return;
    if (lastSeenRef.current === undefined) {
      lastSeenRef.current = query.data;
      return;
    }
    if (query.data !== lastSeenRef.current) {
      lastSeenRef.current = query.data;
      invalidateDataScopes(queryClient);
    }
  }, [query.data, queryClient]);

  return query;
}
