import { describe, expect, it, vi, afterEach, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { profileFixture } from '@/test/fixtures';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import { ProfileAuthPane } from './ProfileAuthPane';

const apiBase = 'http://localhost:8080';

function setup() {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  renderWithProviders(
    <AuthProvider>
      <ProfileAuthPane />
    </AuthProvider>,
  );
}

describe('ProfileAuthPane', () => {
  beforeEach(() => {
    vi.spyOn(window, 'open').mockReturnValue(null);
  });
  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it('renders password form when hasPassword is true', async () => {
    setup();
    await waitFor(() => expect(screen.getByLabelText('Current password')).toBeInTheDocument());
    expect(screen.getByLabelText('New password')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirm new password')).toBeInTheDocument();
  });

  it('submits password change with the right body', async () => {
    let body: unknown = null;
    server.use(
      http.post(`${apiBase}/api/users/me/change-password`, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    setup();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Current password')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Current password'), 'old');
    await user.type(screen.getByLabelText('New password'), 'new-12345');
    await user.type(screen.getByLabelText('Confirm new password'), 'new-12345');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /change password/i })).toBeEnabled(),
    );
    await user.click(screen.getByRole('button', { name: /change password/i }));
    await waitFor(() => expect(body).toEqual({ currentPassword: 'old', newPassword: 'new-12345' }));
  });

  it('shows mismatch error when passwords differ', async () => {
    setup();
    const user = userEvent.setup();
    await waitFor(() => expect(screen.getByLabelText('Current password')).toBeInTheDocument());
    await user.type(screen.getByLabelText('Current password'), 'old');
    await user.type(screen.getByLabelText('New password'), 'new-12345');
    await user.type(screen.getByLabelText('Confirm new password'), 'different');
    await waitFor(() => expect(screen.getByText(/passwords do not match/i)).toBeInTheDocument());
  });

  it('renders notice instead of form when hasPassword is false', async () => {
    server.use(
      http.get(`${apiBase}/api/users/me`, () =>
        HttpResponse.json({ ...profileFixture, hasPassword: false }),
      ),
    );
    setup();
    await waitFor(() =>
      expect(screen.getByText(/your account uses oauth sign-in/i)).toBeInTheDocument(),
    );
    expect(screen.queryByLabelText('Current password')).not.toBeInTheDocument();
  });

  it('Link Google initiates OAuth and redirects', async () => {
    const orig = window.location;
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...orig, href: '' },
    });
    setup();
    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /link google/i })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /link google/i }));
    await waitFor(() =>
      expect((window.location as unknown as { href: string }).href).toContain('google.example'),
    );
    expect(sessionStorage.getItem('ha.oauth.linking')).toBe('1');
    expect(sessionStorage.getItem('ha.oauth.returnTo')).toBe('/profile/auth');
    Object.defineProperty(window, 'location', { configurable: true, value: orig });
  });

  it('Unlink Google fires DELETE after confirmation', async () => {
    let called = false;
    server.use(
      http.get(`${apiBase}/api/users/me`, () =>
        HttpResponse.json({
          ...profileFixture,
          oauthIdentities: [{ provider: 'Google', subject: 'alice@example.com' }],
        }),
      ),
      http.delete(`${apiBase}/api/users/me/oauth/google`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    setup();
    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByText(/linked as alice@example.com/i)).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /unlink/i }));
    await user.click(await screen.findByRole('button', { name: 'Unlink' }));
    await waitFor(() => expect(called).toBe(true));
  });

  it('disables Unlink when only one credential remains', async () => {
    server.use(
      http.get(`${apiBase}/api/users/me`, () =>
        HttpResponse.json({
          ...profileFixture,
          hasPassword: false,
          oauthIdentities: [{ provider: 'Google', subject: 'alice@example.com' }],
        }),
      ),
    );
    setup();
    await waitFor(() =>
      expect(screen.getByText(/linked as alice@example.com/i)).toBeInTheDocument(),
    );
    const unlinkBtn = screen.getByRole('button', { name: /unlink/i });
    expect(unlinkBtn).toBeDisabled();
    expect(unlinkBtn).toHaveAttribute('title', 'You need at least one way to sign in.');
  });

  it('Link Telegram opens the dialog', async () => {
    setup();
    const user = userEvent.setup();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /link telegram/i })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: /link telegram/i }));
    await screen.findByRole('dialog', { name: /link telegram/i });
  });
});
