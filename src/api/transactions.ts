import type { TransactionListResponse, TransactionResponse, UUID } from './types';
import type { ApiClient } from './client';

export const transactionsApi = (client: ApiClient) => ({
  list: async (params: { accountId: UUID }): Promise<TransactionResponse[]> => {
    const qs = new URLSearchParams({ accountId: params.accountId }).toString();
    const res = await client.get<TransactionListResponse>(`/api/transactions?${qs}`);
    return res.transactions;
  },
});
