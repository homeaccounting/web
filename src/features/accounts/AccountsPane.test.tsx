import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('renders an "Add account" button at the top of the pane', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/' });
    expect(await screen.findByRole('button', { name: /add account/i })).toBeInTheDocument();
  });

  it('opens the create-account dialog when the header "+" is clicked', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/' });
    const trigger = await screen.findByRole('button', { name: /add account/i });
    await user.click(trigger);
    expect(await screen.findByRole('dialog', { name: /create account/i })).toBeInTheDocument();
  });

  it('renders the Edit button disabled when no account is selected', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/' });
    const edit = await screen.findByRole('button', { name: /edit account/i });
    expect(edit).toBeDisabled();
  });

  it('enables the Edit button when an account is selected', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: `/accounts/${accountFixture.id}` });
    const edit = await screen.findByRole('button', { name: /edit account/i });
    await waitFor(() => expect(edit).not.toBeDisabled());
  });

  it('opens the Edit dialog from the sidebar when an account is selected', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: `/accounts/${accountFixture.id}` });
    const edit = await screen.findByRole('button', { name: /edit account/i });
    await waitFor(() => expect(edit).not.toBeDisabled());
    await user.click(edit);
    expect(await screen.findByRole('dialog', { name: /edit account/i })).toBeInTheDocument();
  });

  it('shows a tooltip describing the action when an icon button is focused', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/' });
    fireEvent.focus(await screen.findByRole('button', { name: /add account/i }));
    expect(await screen.findByRole('tooltip', { name: /add account/i })).toBeInTheDocument();
  });
});
