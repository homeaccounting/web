import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { UserMenu } from './UserMenu';
import { profileFixture } from '@/test/fixtures';

const apiBase = 'http://localhost:8080';

describe('UserMenu — Link Telegram', () => {
  beforeEach(() => {
    vi.spyOn(window, 'open').mockReturnValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('shows Link Telegram when telegramIdentity is null', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(
      <AuthProvider>
        <UserMenu />
      </AuthProvider>,
    );
    await userEvent.setup().click(await screen.findByRole('button', { name: /open user menu/i }));
    expect(await screen.findByText(/link telegram/i)).toBeInTheDocument();
  });

  it('hides Link Telegram when a Telegram identity is already linked', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    server.use(
      http.get(`${apiBase}/api/users/me`, () =>
        HttpResponse.json({
          ...profileFixture,
          telegramIdentity: { id: 7, username: 'alice', firstName: 'Alice' },
        }),
      ),
    );
    renderWithProviders(
      <AuthProvider>
        <UserMenu />
      </AuthProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /open user menu/i }));
    await waitFor(() => expect(screen.getByText(/sign out/i)).toBeInTheDocument());
    expect(screen.queryByText(/link telegram/i)).not.toBeInTheDocument();
  });

  it('clicking Link Telegram opens the dialog', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(
      <AuthProvider>
        <UserMenu />
      </AuthProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /open user menu/i }));
    await user.click(await screen.findByText(/link telegram/i));
    await screen.findByRole('dialog', { name: /link telegram/i });
  });
});
