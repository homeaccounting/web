import type {
  AuthResponse,
  LinkOAuthRequest,
  LoginRequest,
  OAuthRedirectResponse,
  RefreshTokenRequest,
  RegisterRequest,
} from './types';
import type { ApiClient } from './client';

export const authApi = (client: ApiClient) => ({
  register: (body: RegisterRequest) => client.post<AuthResponse>('/api/auth/register', body),
  login: (body: LoginRequest) => client.post<AuthResponse>('/api/auth/login', body),
  refresh: (body: RefreshTokenRequest) => client.post<AuthResponse>('/api/auth/refresh', body),
  initiateOAuth: (provider: string) =>
    client.get<OAuthRedirectResponse>(`/api/auth/oauth/${provider}`),
  oauthCallback: (provider: string, code: string, state: string) =>
    client.get<AuthResponse>(
      `/api/auth/oauth/${provider}/callback?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`,
    ),
  linkOAuth: (body: LinkOAuthRequest) => client.post<void>('/api/auth/link-oauth', body),
});
