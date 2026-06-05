import type { ChangePasswordRequest, OAuthProviderName, UserProfileResponse } from './types';
import type { ApiClient } from './client';

export const usersApi = (client: ApiClient) => ({
  getMe: () => client.get<UserProfileResponse>('/api/users/me'),
  changePassword: (body: ChangePasswordRequest) =>
    client.post<void>('/api/users/me/change-password', body),
  // Backend `Capture "provider" Text` accepts lowercase slug, same convention
  // as authApi.initiateOAuth — convert PascalCase to slug at the call site.
  unlinkOAuth: (provider: OAuthProviderName) =>
    client.delete<void>(`/api/users/me/oauth/${provider.toLowerCase()}`),
  unlinkTelegram: () => client.delete<void>('/api/users/me/telegram'),
});
