import type { ApiClient } from './client';
import type { ExternalAccountDTO, ResyncRequest, ResyncResponse, UUID } from './types';

export const bankingApi = (client: ApiClient) => ({
  resync: (connectionId: UUID, body: ResyncRequest): Promise<ResyncResponse> =>
    client.post<ResyncResponse>(`/api/banking/connections/${connectionId}/resync`, body),
  listExternalAccounts: (connectionId: UUID): Promise<ExternalAccountDTO[]> =>
    client.get<ExternalAccountDTO[]>(`/api/banking/connections/${connectionId}/external-accounts`),
});
