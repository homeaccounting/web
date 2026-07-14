import type { ApiClient } from './client';
import type { ConnectionImportRequest, ExternalAccountDTO, ImportResponse, UUID } from './types';

export const bankingApi = (client: ApiClient) => ({
  importConnection: (connectionId: UUID, body: ConnectionImportRequest): Promise<ImportResponse> =>
    client.post<ImportResponse>(`/api/banking/connections/${connectionId}/import`, body),
  importStatement: (connectionId: UUID, format: string, file: Blob): Promise<ImportResponse> =>
    client.postBinary<ImportResponse>(
      `/api/banking/connections/${connectionId}/import/file?format=${encodeURIComponent(format)}`,
      file,
    ),
  listExternalAccounts: (connectionId: UUID): Promise<ExternalAccountDTO[]> =>
    client.get<ExternalAccountDTO[]>(`/api/banking/connections/${connectionId}/external-accounts`),
});
