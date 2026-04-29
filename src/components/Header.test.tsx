import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { Header } from './Header';
import { profileFixture } from '@/test/fixtures';

const apiBase = 'http://localhost:8080';

describe('Header / UserMenu', () => {
  it('shows Link Google when no Google identity is linked', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(
      <AuthProvider>
        <Header />
      </AuthProvider>,
    );
    const trigger = await screen.findByRole('button', { name: /open user menu/i });
    await userEvent.setup().click(trigger);
    expect(await screen.findByText(/link google/i)).toBeInTheDocument();
  });

  it('hides Link Google when Google identity is already linked', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    server.use(
      http.get(`${apiBase}/api/users/me`, () =>
        HttpResponse.json({
          ...profileFixture,
          oauthIdentities: [{ provider: 'Google', subject: 'g-1' }],
        }),
      ),
    );
    renderWithProviders(
      <AuthProvider>
        <Header />
      </AuthProvider>,
    );
    const user = userEvent.setup();
    const trigger = await screen.findByRole('button', { name: /open user menu/i });
    await user.click(trigger);
    await waitFor(() => expect(screen.getByText(/sign out/i)).toBeInTheDocument());
    expect(screen.queryByText(/link google/i)).not.toBeInTheDocument();
  });
});
