import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { toast } from '@/lib/toast';
import { AccountsPane } from './AccountsPane';
import { accountFixture, closedAccountFixture } from '@/test/fixtures';

vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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

  it('preserves the current query string on account row links', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), {
      initialPath: `/accounts/${accountFixture.id}?period=this-year`,
    });
    const item = await screen.findByRole('link', { name: /checking/i });
    expect(item).toHaveAttribute('href', expect.stringContaining('?period=this-year'));
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

  it('opens the Edit dialog when a row is double-clicked', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/' });
    const row = await screen.findByText('Checking');
    await user.dblClick(row);
    expect(await screen.findByRole('dialog', { name: /edit account/i })).toBeInTheDocument();
  });

  it('opens the Edit dialog from a row right-click context menu', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/' });
    const row = await screen.findByText('Checking');
    await user.pointer({ keys: '[MouseRight]', target: row });
    await user.click(await screen.findByRole('menuitem', { name: /^edit$/i }));
    expect(await screen.findByRole('dialog', { name: /edit account/i })).toBeInTheDocument();
  });

  it('groups open accounts under a subtype header', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/' });
    await screen.findByText('Checking');
    expect(screen.getByText('Bank account')).toBeInTheDocument();
  });

  it('collapses and expands an account-type group when its header is clicked', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/' });
    await screen.findByText('Checking');
    const header = screen.getByRole('button', { name: /bank account/i });
    await user.click(header);
    expect(screen.queryByText('Checking')).not.toBeInTheDocument();
    await user.click(header);
    expect(await screen.findByText('Checking')).toBeInTheDocument();
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

  it('surfaces an error toast when reopen fails', async () => {
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
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith('Account command rejected by domain'),
    );
  });

  it('enables the Manage access toolbar button for a selected owned account and opens the dialog', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: `/accounts/${accountFixture.id}` });
    const btn = await screen.findByRole('button', { name: /manage access/i });
    await waitFor(() => expect(btn).not.toBeDisabled());
    server.use(
      http.get(`${apiBase}/api/accounts/${accountFixture.id}/access`, () =>
        HttpResponse.json({ access: [] }),
      ),
    );
    await user.click(btn);
    expect(await screen.findByRole('dialog', { name: /manage access/i })).toBeInTheDocument();
  });

  it('disables the Manage access toolbar button for a selected non-owner account', async () => {
    const editorAccount = { ...accountFixture, id: 'a3', role: 'editor' as const };
    server.use(
      http.get(`${apiBase}/api/accounts`, () =>
        HttpResponse.json({ accounts: [accountFixture, editorAccount], totalCount: 2 }),
      ),
    );
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: `/accounts/${editorAccount.id}` });
    const btn = await screen.findByRole('button', { name: /manage access/i });
    await waitFor(() => expect(btn).toBeDisabled());
  });

  function serveSharedMix() {
    const editorAccount = {
      ...accountFixture,
      id: 'a3',
      name: 'Shared Editor',
      role: 'editor' as const,
    };
    const viewerAccount = {
      ...accountFixture,
      id: 'a4',
      name: 'Shared Viewer',
      role: 'viewer' as const,
    };
    server.use(
      http.get(`${apiBase}/api/accounts`, () =>
        HttpResponse.json({
          accounts: [accountFixture, editorAccount, viewerAccount],
          totalCount: 3,
        }),
      ),
    );
    return { editorAccount, viewerAccount };
  }

  it('renders a "Shared with me" group containing shared accounts but not owned ones', async () => {
    const { editorAccount, viewerAccount } = serveSharedMix();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/' });
    await screen.findByText('Checking');
    const sharedHeader = screen.getByRole('button', { name: /shared with me/i });
    expect(sharedHeader).toBeInTheDocument();
    expect(await screen.findByText(editorAccount.name)).toBeInTheDocument();
    expect(await screen.findByText(viewerAccount.name)).toBeInTheDocument();

    // The owned account stays under its subtype group, not under "Shared with me".
    const bankGroupHeader = screen.getByRole('button', { name: /bank account/i });
    const bankGroupContainer = bankGroupHeader.closest('div');
    expect(bankGroupContainer).not.toBeNull();
    expect(bankGroupContainer && bankGroupContainer.textContent?.includes(editorAccount.name)).toBe(
      false,
    );
  });

  it('shows a role badge on shared rows', async () => {
    const { editorAccount } = serveSharedMix();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/' });
    await screen.findByText(editorAccount.name);
    expect(await screen.findByText('Editor')).toBeInTheDocument();
    expect(await screen.findByText('Viewer')).toBeInTheDocument();
  });

  it('disables Edit and Close in the toolbar when a viewer account is selected', async () => {
    const { viewerAccount } = serveSharedMix();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: `/accounts/${viewerAccount.id}` });
    const edit = await screen.findByRole('button', { name: /edit account/i });
    const close = await screen.findByRole('button', { name: /close account/i });
    await waitFor(() => {
      expect(edit).toBeDisabled();
      expect(close).toBeDisabled();
    });
  });

  it('disables Edit and Close when an editor account is selected (both are owner-only)', async () => {
    const { editorAccount } = serveSharedMix();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: `/accounts/${editorAccount.id}` });
    const edit = await screen.findByRole('button', { name: /edit account/i });
    const close = await screen.findByRole('button', { name: /close account/i });
    await waitFor(() => {
      expect(edit).toBeDisabled();
      expect(close).toBeDisabled();
    });
  });

  it('shows an "Owner only" tooltip on Edit when a non-owner account is selected', async () => {
    const { editorAccount } = serveSharedMix();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: `/accounts/${editorAccount.id}` });
    const edit = await screen.findByRole('button', { name: /edit account/i });
    await waitFor(() => expect(edit).toBeDisabled());
    fireEvent.focus(edit);
    expect(await screen.findByRole('tooltip', { name: /owner only/i })).toBeInTheDocument();
  });

  it('enables Edit and Close when an owned account is selected', async () => {
    serveSharedMix();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: `/accounts/${accountFixture.id}` });
    const edit = await screen.findByRole('button', { name: /edit account/i });
    const close = await screen.findByRole('button', { name: /close account/i });
    await waitFor(() => {
      expect(edit).not.toBeDisabled();
      expect(close).not.toBeDisabled();
    });
  });

  function serveManyBankAccounts() {
    const mk = (id: string, bankName: string) => ({
      ...accountFixture,
      id,
      name: id,
      subtype: { type: 'bankAccount', bankName },
    });
    const accounts = [
      mk('Al1', 'Alpha'),
      mk('Be1', 'Beta'),
      mk('Al2', 'Alpha'),
      mk('Be2', 'Beta'),
      mk('Al3', 'Alpha'),
      mk('Be3', 'Beta'),
    ];
    server.use(
      http.get(`${apiBase}/api/accounts`, () =>
        HttpResponse.json({ accounts, totalCount: accounts.length }),
      ),
    );
  }

  it('sub-groups a large bank-account section under per-bank sub-headers', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    serveManyBankAccounts();
    renderWithProviders(ui(), { initialPath: '/' });
    await screen.findByText('Al1');
    expect(screen.getByRole('button', { name: /^bank account$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^alpha$/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^beta$/i })).toBeInTheDocument();
  });

  it('collapses each bank sub-group independently', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    serveManyBankAccounts();
    renderWithProviders(ui(), { initialPath: '/' });
    await screen.findByText('Al1');
    await user.click(screen.getByRole('button', { name: /^beta$/i }));
    // Beta's rows hide; Alpha's stay visible.
    expect(screen.queryByText('Be1')).not.toBeInTheDocument();
    expect(screen.getByText('Al1')).toBeInTheDocument();
  });

  it('collapsing the parent Bank account group hides all sub-groups', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    serveManyBankAccounts();
    renderWithProviders(ui(), { initialPath: '/' });
    await screen.findByText('Al1');
    await user.click(screen.getByRole('button', { name: /^bank account$/i }));
    expect(screen.queryByText('Al1')).not.toBeInTheDocument();
    expect(screen.queryByText('Be1')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^alpha$/i })).not.toBeInTheDocument();
  });

  it('qualifies rows with their bank name in a flat (ungrouped) Bank account section', async () => {
    const mk = (id: string, bankName: string) => ({
      ...accountFixture,
      id,
      name: 'visa',
      subtype: { type: 'bankAccount', bankName },
    });
    const accounts = [mk('v1', 'Monobank'), mk('v2', 'PrivatBank')];
    server.use(
      http.get(`${apiBase}/api/accounts`, () =>
        HttpResponse.json({ accounts, totalCount: accounts.length }),
      ),
    );
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/' });
    await screen.findAllByText('visa');
    // Flat section: no per-bank sub-header, so the bank name shown is the row qualifier.
    expect(screen.getByText('Monobank')).toBeInTheDocument();
    expect(screen.getByText('PrivatBank')).toBeInTheDocument();
    // There is no "Monobank" collapse-toggle header in a flat section.
    expect(screen.queryByRole('button', { name: /^monobank$/i })).not.toBeInTheDocument();
  });

  it('does not repeat the bank name on rows inside a bank sub-group (header carries it)', async () => {
    const mk = (id: string, name: string, bankName: string) => ({
      ...accountFixture,
      id,
      name,
      subtype: { type: 'bankAccount', bankName },
    });
    const accounts = [
      mk('1', 'Black', 'Monobank'),
      mk('2', 'White', 'Monobank'),
      mk('3', 'Gold', 'Monobank'),
      mk('4', 'Salary', 'PrivatBank'),
      mk('5', 'Savings', 'PrivatBank'),
      mk('6', 'Card', 'PrivatBank'),
    ];
    server.use(
      http.get(`${apiBase}/api/accounts`, () =>
        HttpResponse.json({ accounts, totalCount: accounts.length }),
      ),
    );
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/' });
    await screen.findByText('Black');
    // "Monobank" appears once — as the sub-group header — not repeated per row.
    expect(screen.getAllByText('Monobank')).toHaveLength(1);
  });
});
