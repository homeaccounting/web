import type {
  AccountListResponse,
  AccountResponse,
  AdjustBalanceRequest,
  CreateAccountRequest,
  RenameAccountRequest,
  SetAccountSubtypeRequest,
  SetOverdraftLimitRequest,
  TransactionResponse,
  UUID,
} from './types';
import type { ApiClient } from './client';

export const accountsApi = (client: ApiClient) => ({
  list: async (): Promise<AccountResponse[]> => {
    const res = await client.get<AccountListResponse>('/api/accounts');
    return res.accounts;
  },
  create: (body: CreateAccountRequest): Promise<AccountResponse> =>
    client.post<AccountResponse>('/api/accounts', body),
  rename: (id: UUID, body: RenameAccountRequest): Promise<void> =>
    client.put<void>(`/api/accounts/${id}/name`, body),
  updateOverdraftLimit: (id: UUID, body: SetOverdraftLimitRequest): Promise<void> =>
    client.put<void>(`/api/accounts/${id}/overdraft-limit`, body),
  updateSubtype: (id: UUID, body: SetAccountSubtypeRequest): Promise<void> =>
    client.put<void>(`/api/accounts/${id}/type`, body),
  adjustBalance: (id: UUID, body: AdjustBalanceRequest): Promise<TransactionResponse> =>
    client.put<TransactionResponse>(`/api/accounts/${id}/balance`, body),
});
