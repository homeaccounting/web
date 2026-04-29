import type { UserProfileResponse } from './types';
import type { ApiClient } from './client';

export const usersApi = (client: ApiClient) => ({
  getMe: () => client.get<UserProfileResponse>('/api/users/me'),
});
