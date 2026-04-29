import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { AccountsPane } from './AccountsPane';
import { accountFixture } from '@/test/fixtures';

const apiBase = 'http://localhost:8080';

function ui() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<AccountsPane />} />
        <Route path="/accounts/:id" element={<AccountsPane />} />
      </Routes>
    </AuthProvider>
  );
}

describe('AccountsPane', () => {
  it('renders the list of accounts when authenticated', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/' });
    expect(await screen.findByText('Checking')).toBeInTheDocument();
  });

  it('renders empty state when accounts list is empty', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    server.use(
      http.get(`${apiBase}/api/accounts`, () => HttpResponse.json({ accounts: [], totalCount: 0 })),
    );
    renderWithProviders(ui(), { initialPath: '/' });
    expect(await screen.findByText(/no accounts yet/i)).toBeInTheDocument();
  });

  it('renders an error banner with retry on failure', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    server.use(http.get(`${apiBase}/api/accounts`, () => new HttpResponse(null, { status: 500 })));
    renderWithProviders(ui(), { initialPath: '/' });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  it('marks the selected account as active', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: `/accounts/${accountFixture.id}` });
    const item = await screen.findByRole('link', { name: /checking/i });
    expect(item).toHaveAttribute('aria-current', 'page');
  });
});
