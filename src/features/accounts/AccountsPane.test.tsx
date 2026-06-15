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
import { accountFixture, closedAccountFixture } from '@/test/fixtures';

const apiBase = 'http://localhost:8080';

function serveMixedAccounts() {
  server.use(
    http.get(`${apiBase}/api/accounts`, () =>
      HttpResponse.json({ accounts: [accountFixture, closedAccountFixture], totalCount: 2 }),
    ),
  );
}

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

  it('hides closed accounts from the list by default', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    serveMixedAccounts();
    renderWithProviders(ui(), { initialPath: '/' });
    expect(await screen.findByText('Checking')).toBeInTheDocument();
    expect(screen.queryByText('Old Savings')).not.toBeInTheDocument();
  });

  it('reveals closed accounts when "Show closed" is toggled', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    serveMixedAccounts();
    renderWithProviders(ui(), { initialPath: '/' });
    await screen.findByText('Checking');
    await user.click(screen.getByRole('button', { name: /show closed/i }));
    expect(await screen.findByText('Old Savings')).toBeInTheDocument();
  });

  it('does not render the "Show closed" toggle when there are no closed accounts', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/' }); // default handler: only the open accountFixture
    await screen.findByText('Checking');
    expect(screen.queryByRole('button', { name: /show closed/i })).not.toBeInTheDocument();
  });

  it('shows a Close action in the toolbar for a selected open account', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    serveMixedAccounts();
    renderWithProviders(ui(), { initialPath: `/accounts/${accountFixture.id}` });
    const btn = await screen.findByRole('button', { name: /close account/i });
    await waitFor(() => expect(btn).not.toBeDisabled());
  });

  it('toolbar Close opens the confirmation dialog', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    serveMixedAccounts();
    renderWithProviders(ui(), { initialPath: `/accounts/${accountFixture.id}` });
    const btn = await screen.findByRole('button', { name: /close account/i });
    await waitFor(() => expect(btn).not.toBeDisabled());
    await user.click(btn);
    expect(await screen.findByText('Close this account?')).toBeInTheDocument();
  });

  it('shows a Reopen action in the toolbar for a selected closed account and reopens it', async () => {
    const user = userEvent.setup();
    let hit: string | undefined;
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    serveMixedAccounts();
    server.use(
      http.post(`${apiBase}/api/accounts/:id/reopen`, ({ params }) => {
        hit = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(ui(), { initialPath: `/accounts/${closedAccountFixture.id}` });
    const btn = await screen.findByRole('button', { name: /reopen account/i });
    await waitFor(() => expect(btn).not.toBeDisabled());
    await user.click(btn);
    await waitFor(() => expect(hit).toBe('a2'));
  });

  it('opens the confirmation dialog from a row right-click context menu', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    serveMixedAccounts();
    renderWithProviders(ui(), { initialPath: '/' });
    const row = await screen.findByText('Checking');
    await user.pointer({ keys: '[MouseRight]', target: row });
    await user.click(await screen.findByRole('menuitem', { name: /^close$/i }));
    expect(await screen.findByText('Close this account?')).toBeInTheDocument();
  });

  it('surfaces a dismissible error toast when reopen fails', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    serveMixedAccounts();
    server.use(
      http.post(`${apiBase}/api/accounts/:id/reopen`, () =>
        HttpResponse.json(
          { status: 400, code: 'ACCOUNT_ERROR', message: 'Account command rejected by domain' },
          { status: 400 },
        ),
      ),
    );
    renderWithProviders(ui(), { initialPath: `/accounts/${closedAccountFixture.id}` });
    const btn = await screen.findByRole('button', { name: /reopen account/i });
    await waitFor(() => expect(btn).not.toBeDisabled());
    await user.click(btn);
    expect(await screen.findByText('Account command rejected by domain')).toBeInTheDocument();
  });
});
