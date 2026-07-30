import { useMemo } from 'react';
import type { TransactionResponse } from '@/api/types';
import type { AccountScope } from './accountScope';
import { isSingleAccount, transactionInScope } from './accountScope';
import {
  useAllAccountsWindowedTransactions,
  useWindowedTransactions,
} from './useWindowedTransactions';

// Fetch the date-bounded transactions for an account scope. Both underlying
// queries are always called (React hook rules — never call a hook behind a
// runtime branch); only the one matching the scope is enabled. Single-account
// scope uses the per-account query directly; all/subset scopes reuse the
// all-accounts query and, for a subset, filter client side — the backend has
// no multi-account query param.
export function useScopedTransactions(scope: AccountScope, fromDate: string, toDate: string) {
  const single = isSingleAccount(scope);
  const singleQuery = useWindowedTransactions(single ?? undefined, fromDate, toDate);
  const allQuery = useAllAccountsWindowedTransactions(fromDate, toDate, !single);
  const active = single ? singleQuery : allQuery;

  const data = useMemo<TransactionResponse[] | undefined>(() => {
    if (!active.data) return active.data;
    if (single || scope.kind === 'all') return active.data;
    return active.data.filter((t) => transactionInScope(t, scope));
  }, [active.data, single, scope]);

  return { ...active, data };
}
