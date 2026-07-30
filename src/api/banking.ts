import type { ApiClient } from './client';
import type { ConnectionImportRequest, ExternalAccountDTO, ImportResponse, UUID } from './types';

// Build a multipart body with every file appended under the `files` field.
// The backend reads all file parts regardless of field name, so a single
// repeated name keeps the request shape uniform.
const filesForm = (files: File[]): FormData => {
  const form = new FormData();
  for (const f of files) form.append('files', f, f.name);
  return form;
};

export const bankingApi = (client: ApiClient) => ({
  importConnection: (connectionId: UUID, body: ConnectionImportRequest): Promise<ImportResponse> =>
    client.post<ImportResponse>(`/api/banking/connections/${connectionId}/import`, body),
  importStatement: (connectionId: UUID, format: string, files: File[]): Promise<ImportResponse> =>
    client.postForm<ImportResponse>(
      `/api/banking/connections/${connectionId}/import/file?format=${encodeURIComponent(format)}`,
      filesForm(files),
    ),
  listExternalAccounts: (connectionId: UUID): Promise<ExternalAccountDTO[]> =>
    client.get<ExternalAccountDTO[]>(`/api/banking/connections/${connectionId}/external-accounts`),
  listExternalAccountsFromFile: (
    connectionId: UUID,
    format: string,
    files: File[],
  ): Promise<ExternalAccountDTO[]> =>
    client.postForm<ExternalAccountDTO[]>(
      `/api/banking/connections/${connectionId}/external-accounts/from-file?format=${encodeURIComponent(
        format,
      )}`,
      filesForm(files),
    ),
});
