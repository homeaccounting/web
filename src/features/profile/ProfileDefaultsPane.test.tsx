import { describe, it, expect } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import { ProfileDefaultsPane } from './ProfileDefaultsPane';

const configUrl = 'http://localhost:8080/api/users/me/configuration';

describe('ProfileDefaultsPane', () => {
  it('renders both defaults cards once loaded', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(
      <AuthProvider>
        <ProfileDefaultsPane />
      </AuthProvider>,
    );
    expect(await screen.findByText('Default categories')).toBeInTheDocument();
    expect(await screen.findByText('Default accounts')).toBeInTheDocument();
  });

  it('shows an error alert with a Retry button when configuration fails to load', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    server.use(http.get(configUrl, () => HttpResponse.json({}, { status: 500 })));
    renderWithProviders(
      <AuthProvider>
        <ProfileDefaultsPane />
      </AuthProvider>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn.t load configuration/i);
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('Retry re-fetches configuration and renders once it succeeds', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    server.use(http.get(configUrl, () => HttpResponse.json({}, { status: 500 })));
    renderWithProviders(
      <AuthProvider>
        <ProfileDefaultsPane />
      </AuthProvider>,
    );
    await screen.findByRole('alert');
    // Restore the default (successful) configuration handler, then retry.
    server.resetHandlers();
    await userEvent.setup().click(screen.getByRole('button', { name: /retry/i }));
    await waitFor(() => expect(screen.getByText('Default categories')).toBeInTheDocument());
  });
});
