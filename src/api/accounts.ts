import type { AccountListResponse, AccountResponse } from './types';
import type { ApiClient } from './client';

export const accountsApi = (client: ApiClient) => ({
  list: async (): Promise<AccountResponse[]> => {
    const res = await client.get<AccountListResponse>('/api/accounts');
    return res.accounts;
  },
});
