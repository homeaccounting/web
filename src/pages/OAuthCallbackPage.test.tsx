import { describe, expect, it, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { server } from '@/test/server';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import { saveOAuthState, beginLinkFlow } from '@/auth/oauthFlow';
import { saveSession } from '@/auth/storage';
import OAuthCallbackPage from './OAuthCallbackPage';

const apiBase = 'http://localhost:8080';

function ui() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/auth/oauth/:provider/callback" element={<OAuthCallbackPage />} />
        <Route path="/" element={<div>home page</div>} />
        <Route path="/login" element={<div>login page</div>} />
      </Routes>
    </AuthProvider>
  );
}

describe('OAuthCallbackPage', () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
  });

  it('shows error on state mismatch', async () => {
    saveOAuthState('expected');
    renderWithProviders(ui(), { initialPath: '/auth/oauth/google/callback?code=c&state=other' });
    expect(await screen.findByRole('alert')).toHaveTextContent(/state mismatch/i);
  });

  it('signs the user in on success and navigates to /', async () => {
    saveOAuthState('s1');
    renderWithProviders(ui(), { initialPath: '/auth/oauth/google/callback?code=c&state=s1' });
    await waitFor(() => expect(screen.getByText('home page')).toBeInTheDocument());
  });

  it('uses POST link-oauth (with PascalCase provider) when linking flow is active', async () => {
    saveSession({ token: 't', userId: 'u', email: null, expiresAt: 9e15 });
    saveOAuthState('s1');
    beginLinkFlow();

    let received: { provider: string; code: string; state: string } | null = null;
    server.use(
      http.post(`${apiBase}/api/auth/link-oauth`, async ({ request }) => {
        received = (await request.json()) as { provider: string; code: string; state: string };
        return new HttpResponse(null, { status: 204 });
      }),
    );

    renderWithProviders(ui(), { initialPath: '/auth/oauth/google/callback?code=c&state=s1' });
    await waitFor(() => expect(received).not.toBeNull());
    expect(received).toEqual({ provider: 'Google', code: 'c', state: 's1' });
    await waitFor(() => expect(screen.getByText('home page')).toBeInTheDocument());
  });
});
