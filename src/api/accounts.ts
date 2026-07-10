import type {
  AccountAccessEntry,
  AccountAccessListResponse,
  AccountListResponse,
  AccountResponse,
  AdjustBalanceRequest,
  CreateAccountRequest,
  RenameAccountRequest,
  SetAccountSubtypeRequest,
  SetOverdraftLimitRequest,
  ShareAccountRequest,
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
  // POST /api/accounts/:id/close → 204 (owner only). Hides the account from the
  // default list. Backend: Web/API/AccountAPI.hs:174-180.
  close: (id: UUID): Promise<void> => client.post<void>(`/api/accounts/${id}/close`),
  // POST /api/accounts/:id/reopen → 204 (owner only). Backend: AccountAPI.hs:181-187.
  reopen: (id: UUID): Promise<void> => client.post<void>(`/api/accounts/${id}/reopen`),
  // GET /api/accounts/:id/access → list of users with access. tracker#29.
  listAccess: async (id: UUID): Promise<AccountAccessEntry[]> => {
    const res = await client.get<AccountAccessListResponse>(`/api/accounts/${id}/access`);
    return res.access;
  },
  // POST /api/accounts/:id/share → 204. Grants/updates a user's role. tracker#29.
  share: (id: UUID, body: ShareAccountRequest): Promise<void> =>
    client.post<void>(`/api/accounts/${id}/share`, body),
  // DELETE /api/accounts/:id/access/:userId → 204. Revokes a user's access. tracker#29.
  revokeAccess: (id: UUID, userId: UUID): Promise<void> =>
    client.delete<void>(`/api/accounts/${id}/access/${userId}`),
});
