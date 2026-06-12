import { useQuery } from '@tanstack/react-query';
import { ApiClient, baseUrl } from '@/api/client';
import { transactionsApi } from '@/api/transactions';
import type { TransactionResponse } from '@/api/types';
import { useAuth } from '@/auth/useAuth';
import { dateInputToUtcEnd, dateInputToUtcStart } from './transactionFilters';

const PAGE_SIZE = 200; // backend max

// Fetches the whole date-bounded window by paging limit=200/offset until the
// accumulated count reaches totalCount (or a short page signals the end).
// `fromDate`/`toDate` are YYYY-MM-DD.
//
// Rows are returned in the backend's order (business date desc, ties broken by
// creation order — see Application/ReadModels/Transaction.hs `descendingByDate`).
// We deliberately do NOT re-sort client-side: the wire `date` is truncated to
// whole seconds and carries no creation-order signal, so a local (date,id) sort
// would only reshuffle rows the backend already ordered correctly. Sequential
// offset pages concatenated in order preserve the global ordering.
export function useWindowedTransactions(
  accountId: string | undefined,
  fromDate: string,
  toDate: string,
) {
  const { tokenRef, signOut, session } = useAuth();
  return useQuery({
    queryKey: ['transactions', accountId, fromDate, toDate],
    enabled: !!session && !!accountId,
    queryFn: async (): Promise<TransactionResponse[]> => {
      const client = new ApiClient({
        baseUrl,
        getToken: () => tokenRef.current,
        onUnauthorized: signOut,
      });
      const api = transactionsApi(client);
      const dateFrom = dateInputToUtcStart(fromDate);
      const dateTo = dateInputToUtcEnd(toDate);

      const acc: TransactionResponse[] = [];
      let offset = 0;
      // Dual guard: stop on a short page OR once we've reached totalCount.
      for (;;) {
        const res = await api.list({
          accountId: accountId!,
          dateFrom,
          dateTo,
          limit: PAGE_SIZE,
          offset,
        });
        acc.push(...res.transactions);
        if (res.transactions.length < PAGE_SIZE || acc.length >= res.totalCount) break;
        offset += PAGE_SIZE;
      }
      return acc;
    },
  });
}
