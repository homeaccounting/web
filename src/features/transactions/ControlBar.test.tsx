import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import type { AccountResponse } from '@/api/types';
import { ControlBar } from './ControlBar';

const apiBase = 'http://localhost:8080';

// Two UUID accounts so the transfer form can render (needs >= 2 accounts)
const twoAccounts = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Checking',
    balance: 1000,
    currency: 'USD',
    overdraftLimit: null,
    subtype: { type: 'bankAccount', bankName: 'ACME' },
    version: 1,
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Savings',
    balance: 5000,
    currency: 'USD',
    overdraftLimit: null,
    subtype: { type: 'bankAccount', bankName: 'ACME' },
    version: 1,
  },
];

function ui() {
  return (
    <AuthProvider>
      <ControlBar />
    </AuthProvider>
  );
}

const selectedAccount: AccountResponse = {
  id: '00000000-0000-0000-0000-000000000001',
  name: 'Checking',
  balance: 1000,
  currency: 'USD',
  overdraftLimit: null,
  subtype: { type: 'bankAccount', bankName: 'ACME' },
  status: 'Opened',
  role: 'owner',
  version: 1,
};

function uiWithAccount() {
  return (
    <AuthProvider>
      <ControlBar selectedAccountId={selectedAccount.id} selectedAccount={selectedAccount} />
    </AuthProvider>
  );
}

function seedNoAccounts() {
  server.use(
    http.get(`${apiBase}/api/accounts`, () => HttpResponse.json({ accounts: [], totalCount: 0 })),
  );
}

describe('ControlBar', () => {
  beforeEach(() => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  });

  it('renders all three icon buttons with accessible names', () => {
    renderWithProviders(ui(), { initialPath: '/' });
    expect(screen.getByRole('button', { name: /add income/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add expense/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /add transfer/i })).toBeInTheDocument();
  });

  it('clicking "Add income" opens the income dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add income/i })).toHaveAttribute(
        'aria-disabled',
        'false',
      ),
    );
    await user.click(screen.getByRole('button', { name: /add income/i }));
    const dialog = await screen.findByRole('dialog', { name: /add income/i });
    expect(dialog).toBeInTheDocument();
    // Verify the submit button lives inside the dialog
    expect(within(dialog).getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });

  it('clicking "Add expense" opens the expense dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add expense/i })).toHaveAttribute(
        'aria-disabled',
        'false',
      ),
    );
    await user.click(screen.getByRole('button', { name: /add expense/i }));
    const dialog = await screen.findByRole('dialog', { name: /add expense/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });

  it('clicking "Add transfer" opens the transfer dialog', async () => {
    const user = userEvent.setup();
    // Override accounts to return two accounts so the transfer form renders (needs >= 2)
    server.use(
      http.get(`${apiBase}/api/accounts`, () =>
        HttpResponse.json({ accounts: twoAccounts, totalCount: 2 }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add transfer/i })).toHaveAttribute(
        'aria-disabled',
        'false',
      ),
    );
    await user.click(screen.getByRole('button', { name: /add transfer/i }));
    const dialog = await screen.findByRole('dialog', { name: /add transfer/i });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'OK' })).toBeInTheDocument();
  });

  it('disables all four buttons when there are no accounts', async () => {
    seedNoAccounts();
    renderWithProviders(ui(), { initialPath: '/' });
    for (const name of [/add expense/i, /add income/i, /add transfer/i, /adjust balance/i]) {
      await waitFor(() =>
        expect(screen.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true'),
      );
    }
  });

  it('enables all four buttons when at least one account exists', async () => {
    renderWithProviders(ui(), { initialPath: '/' });
    for (const name of [/add expense/i, /add income/i, /add transfer/i, /adjust balance/i]) {
      await waitFor(() =>
        expect(screen.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'false'),
      );
    }
  });

  it('shows a "create an account first" tooltip on a disabled button', async () => {
    seedNoAccounts();
    renderWithProviders(ui(), { initialPath: '/' });
    const btn = await screen.findByRole('button', { name: /add expense/i });
    await waitFor(() => expect(btn).toHaveAttribute('aria-disabled', 'true'));
    fireEvent.focus(btn);
    expect(
      await screen.findByRole('tooltip', { name: /create an account first/i }),
    ).toBeInTheDocument();
  });

  it('clicking a disabled action button does not open its dialog', async () => {
    const user = userEvent.setup();
    seedNoAccounts();
    renderWithProviders(ui(), { initialPath: '/' });
    const btn = await screen.findByRole('button', { name: /add expense/i });
    await waitFor(() => expect(btn).toHaveAttribute('aria-disabled', 'true'));
    await user.click(btn);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('clicking "Adjust balance" opens the adjust balance dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(uiWithAccount(), { initialPath: '/' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /adjust balance/i })).toHaveAttribute(
        'aria-disabled',
        'false',
      ),
    );
    await user.click(screen.getByRole('button', { name: /adjust balance/i }));
    expect(await screen.findByRole('dialog', { name: /adjust balance/i })).toBeInTheDocument();
  });

  it('shows a tooltip describing the action when an icon button is focused', async () => {
    renderWithProviders(ui(), { initialPath: '/' });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: /add expense/i })).toHaveAttribute(
        'aria-disabled',
        'false',
      ),
    );
    fireEvent.focus(screen.getByRole('button', { name: /add expense/i }));
    expect(await screen.findByRole('tooltip', { name: /add expense/i })).toBeInTheDocument();
  });
});
