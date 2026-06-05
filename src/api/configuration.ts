import type { ApiClient } from './client';
import type {
  AddEntryRequest,
  AddEntryResponse,
  ChangeCurrencyRequest,
  ConfigurationResponse,
  DictionaryResponse,
  RenameEntryRequest,
  UUID,
} from './types';

export const configurationApi = (client: ApiClient) => ({
  get: (): Promise<ConfigurationResponse> =>
    client.get<ConfigurationResponse>('/api/users/me/configuration'),
  setBaseCurrency: (body: ChangeCurrencyRequest) =>
    client.put<void>('/api/users/me/configuration/base-currency', body),
  setDefaultCurrency: (body: ChangeCurrencyRequest) =>
    client.put<void>('/api/users/me/configuration/default-currency', body),
  listDictionary: (dictId: string) =>
    client.get<DictionaryResponse>(`/api/users/me/configuration/dictionaries/${dictId}`),
  addEntry: (dictId: string, body: AddEntryRequest) =>
    client.post<AddEntryResponse>(
      `/api/users/me/configuration/dictionaries/${dictId}/entries`,
      body,
    ),
  renameEntry: (dictId: string, entryId: UUID, body: RenameEntryRequest) =>
    client.put<void>(`/api/users/me/configuration/dictionaries/${dictId}/entries/${entryId}`, body),
  removeEntry: (dictId: string, entryId: UUID) =>
    client.delete<void>(`/api/users/me/configuration/dictionaries/${dictId}/entries/${entryId}`),
});
