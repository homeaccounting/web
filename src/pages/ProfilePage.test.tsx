import { describe, expect, it, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Route, Routes } from 'react-router-dom';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { bankingEnabledConfigurationFixture } from '@/test/fixtures';
import ProfilePage from './ProfilePage';

const configUrl = 'http://localhost:8080/api/users/me/configuration';

function ui() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/:tab" element={<ProfilePage />} />
      </Routes>
    </AuthProvider>
  );
}

describe('ProfilePage', () => {
  beforeEach(() => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  });

  it('renders the static tabs with General selected by default', () => {
    renderWithProviders(ui(), { initialPath: '/profile' });
    expect(screen.getByRole('tab', { name: /general/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /dictionaries/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /defaults/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /auth/i })).toBeInTheDocument();
  });

  it('deep-links to the dictionaries tab', () => {
    renderWithProviders(ui(), { initialPath: '/profile/dictionaries' });
    expect(screen.getByRole('tab', { name: /dictionaries/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('clicking a tab makes it active', async () => {
    renderWithProviders(ui(), { initialPath: '/profile' });
    await userEvent.setup().click(screen.getByRole('tab', { name: /auth/i }));
    expect(screen.getByRole('tab', { name: /auth/i })).toHaveAttribute('aria-selected', 'true');
  });

  describe('banking tab', () => {
    it('shows the Banking tab and renders the pane when bankingFeatureEnabled', async () => {
      server.use(http.get(configUrl, () => HttpResponse.json(bankingEnabledConfigurationFixture)));
      renderWithProviders(ui(), { initialPath: '/profile/banking' });
      await waitFor(() =>
        expect(screen.getByRole('tab', { name: /banking/i })).toHaveAttribute(
          'aria-selected',
          'true',
        ),
      );
      // pane content (the seeded connection) is shown
      expect(await screen.findByText('Monobank')).toBeInTheDocument();
    });

    it('hides the Banking tab and redirects /profile/banking when disabled', async () => {
      // default fixture has bankingFeatureEnabled: false
      renderWithProviders(ui(), { initialPath: '/profile/banking' });
      await waitFor(() =>
        expect(screen.getByRole('tab', { name: /general/i })).toHaveAttribute(
          'aria-selected',
          'true',
        ),
      );
      expect(screen.queryByRole('tab', { name: /banking/i })).not.toBeInTheDocument();
    });
  });
});
