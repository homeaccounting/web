import { describe, expect, it, vi, beforeEach } from 'vitest';
import { ApiClient } from './client';
import { usersApi } from './users';

const mkClient = () =>
  new ApiClient({
    baseUrl: 'http://test',
    getToken: () => 'jwt',
    onUnauthorized: () => undefined,
  });

describe('usersApi', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
  });

  it('POSTs change-password', async () => {
    await usersApi(mkClient()).changePassword({
      currentPassword: 'old',
      newPassword: 'new-12345',
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://test/api/users/me/change-password',
      expect.objectContaining({
        method: 'POST',
        body: '{"currentPassword":"old","newPassword":"new-12345"}',
      }),
    );
  });

  it('DELETEs unlinkOAuth using lowercase slug', async () => {
    await usersApi(mkClient()).unlinkOAuth('Google');
    expect(fetch).toHaveBeenCalledWith(
      'http://test/api/users/me/oauth/google',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });

  it('DELETEs unlinkTelegram', async () => {
    await usersApi(mkClient()).unlinkTelegram();
    expect(fetch).toHaveBeenCalledWith(
      'http://test/api/users/me/telegram',
      expect.objectContaining({ method: 'DELETE' }),
    );
  });
});
