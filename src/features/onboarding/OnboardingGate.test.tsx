import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import { configurationFixture, transactionFixture } from '@/test/fixtures';
import { OnboardingGate } from './OnboardingGate';

const apiBase = 'http://localhost:8080';

function ui() {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  return (
    <AuthProvider>
      <Routes>
        <Route
          path="/"
          element={
            <OnboardingGate>
              <div>app home</div>
            </OnboardingGate>
          }
        />
        <Route path="/onboarding" element={<div>onboarding screen</div>} />
      </Routes>
    </AuthProvider>
  );
}

describe('OnboardingGate', () => {
  it('redirects a brand-new, unconfigured user to /onboarding', async () => {
    server.use(
      http.get(`${apiBase}/api/users/me/configuration`, () =>
        HttpResponse.json({ ...configurationFixture, country: null }),
      ),
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({ transactions: [], totalCount: 0, limit: 1, offset: 0 }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/' });
    expect(await screen.findByText('onboarding screen')).toBeInTheDocument();
  });

  it('does not flash the app before deciding: holds on a loader while the signal is pending', async () => {
    server.use(
      http.get(`${apiBase}/api/users/me/configuration`, () =>
        HttpResponse.json({ ...configurationFixture, country: null }),
      ),
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({ transactions: [], totalCount: 0, limit: 1, offset: 0 }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/' });
    // Synchronously, while both queries are still pending, the app must NOT be
    // shown — otherwise the user sees the transactions page then gets yanked to
    // onboarding (the reported flash-then-redirect bug).
    expect(screen.queryByText('app home')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Loading')).toBeInTheDocument();
    // Once the signal resolves, they land on onboarding — and never saw the app.
    expect(await screen.findByText('onboarding screen')).toBeInTheDocument();
    expect(screen.queryByText('app home')).not.toBeInTheDocument();
  });

  it('renders the app for an established user', async () => {
    server.use(
      http.get(`${apiBase}/api/users/me/configuration`, () =>
        HttpResponse.json({ ...configurationFixture, country: null }),
      ),
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [transactionFixture],
          totalCount: 1,
          limit: 1,
          offset: 0,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/' });
    expect(await screen.findByText('app home')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('onboarding screen')).not.toBeInTheDocument());
  });
});
