import { describe, expect, it, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import { configurationFixture } from '@/test/fixtures';
import OnboardingPage from './OnboardingPage';

const apiBase = 'http://localhost:8080';

function ui() {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  return (
    <AuthProvider>
      <Routes>
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/transactions" element={<div>transactions view</div>} />
      </Routes>
    </AuthProvider>
  );
}

describe('OnboardingPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({ transactions: [], totalCount: 0, limit: 1, offset: 0 }),
      ),
      http.get(`${apiBase}/api/users/me/configuration`, () =>
        HttpResponse.json({ ...configurationFixture, country: null }),
      ),
    );
  });

  it('shows a welcome heading and the change-later reassurance', async () => {
    renderWithProviders(ui(), { initialPath: '/onboarding' });
    expect(await screen.findByText(/set up the basics/i)).toBeInTheDocument();
    expect(screen.getByText(/change any of this later in settings/i)).toBeInTheDocument();
  });

  it('"Get started" navigates into the app', async () => {
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/onboarding' });
    await user.click(await screen.findByRole('button', { name: /get started/i }));
    await waitFor(() => expect(screen.getByText('transactions view')).toBeInTheDocument());
  });

  it('"Skip for now" sets the session flag and navigates into the app', async () => {
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/onboarding' });
    await user.click(await screen.findByRole('button', { name: /skip for now/i }));
    await waitFor(() => expect(screen.getByText('transactions view')).toBeInTheDocument());
    expect(sessionStorage.getItem('onboarding:skipped:u')).toBe('1');
  });
});
