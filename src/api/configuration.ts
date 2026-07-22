import type { ApiClient } from './client';
import type {
  AddConnectionRequest,
  AddEntryRequest,
  AddEntryResponse,
  BankConnectionDTO,
  BankingConfigurationDTO,
  BankProviderDTO,
  ChangeCurrencyRequest,
  ChangeTokenRequest,
  ConfigurationResponse,
  DictionaryResponse,
  MoveEntryRequest,
  RenameEntryRequest,
  SetAccountMapRequest,
  UpdateBankingRequest,
  UpdateConnectionRequest,
  UpdateDefaultsRequest,
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
  moveEntry: (dictId: string, entryId: UUID, body: MoveEntryRequest) =>
    client.patch<void>(
      `/api/users/me/configuration/dictionaries/${dictId}/entries/${entryId}/parent`,
      body,
    ),
  updateBanking: (body: UpdateBankingRequest) =>
    client.put<BankingConfigurationDTO>('/api/users/me/configuration/banking', body),
  updateDefaults: (body: UpdateDefaultsRequest) =>
    client.put<ConfigurationResponse>('/api/users/me/configuration/defaults', body),
  addConnection: (body: AddConnectionRequest) =>
    client.post<BankConnectionDTO>('/api/users/me/configuration/banking/connections', body),
  updateConnection: (id: UUID, body: UpdateConnectionRequest) =>
    client.put<void>(`/api/users/me/configuration/banking/connections/${id}`, body),
  changeToken: (id: UUID, body: ChangeTokenRequest) =>
    client.put<void>(`/api/users/me/configuration/banking/connections/${id}/token`, body),
  removeConnection: (id: UUID) =>
    client.delete<void>(`/api/users/me/configuration/banking/connections/${id}`),
  setAccountMap: (id: UUID, body: SetAccountMapRequest) =>
    client.put<void>(`/api/users/me/configuration/banking/connections/${id}/accounts`, body),
  listProviders: (): Promise<BankProviderDTO[]> =>
    client.get<BankProviderDTO[]>('/api/users/me/configuration/banking/providers'),
});
