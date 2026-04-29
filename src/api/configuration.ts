import type { ApiClient } from './client';
import type { ConfigurationResponse } from './types';

export const configurationApi = (client: ApiClient) => ({
  get: (): Promise<ConfigurationResponse> =>
    client.get<ConfigurationResponse>('/api/users/me/configuration'),
});
