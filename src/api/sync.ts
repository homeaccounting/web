import type { SyncVersionResponse } from './types';
import type { ApiClient } from './client';

export const syncApi = (client: ApiClient) => ({
  getSyncVersion: async (): Promise<number> => {
    const res = await client.get<SyncVersionResponse>('/api/sync/version');
    return res.version;
  },
});
