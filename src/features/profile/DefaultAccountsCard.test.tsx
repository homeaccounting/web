import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import { toast } from '@/lib/toast';
import type { AccountResponse } from '@/api/types';
import { DefaultAccountsCard } from './DefaultAccountsCard';

vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const apiBase = 'http://localhost:8080';
const acct = (id: string, name: string, type: string): AccountResponse => ({
  id,
  name,
  balance: 0,
  currency: 'USD',
  overdraftLimit: null,
  subtype: { type },
  status: 'Opened',
  role: 'owner',
  version: 1,
});
const accounts = [acct('cash-1', 'Wallet', 'cash'), acct('bank-1', 'Checking', 'bankAccount')];

function renderCard(props?: Partial<React.ComponentProps<typeof DefaultAccountsCard>>) {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  renderWithProviders(
    <AuthProvider>
      <DefaultAccountsCard
        accounts={accounts}
        accountCurrent={null}
        subtypeCurrent={{}}
        {...props}
      />
    </AuthProvider>,
  );
}

describe('DefaultAccountsCard', () => {
  it('per-type row lists only matching subtype and PUTs the full map', async () => {
    let body: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/defaults`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    renderCard();
    const user = userEvent.setup();

    const cashRow = screen.getByRole('combobox', { name: 'Cash default account' });
    await user.click(cashRow);
    await user.click(await screen.findByRole('option', { name: 'Wallet' }));
    // Re-open to inspect options; the bank account must NOT be offered on the cash row.
    await user.click(cashRow);
    expect(screen.queryByRole('option', { name: 'Checking' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(body).toEqual({ subtypeAccounts: { CashKind: 'cash-1' } }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Updated.'));
  });

  it('changing only the global account preserves the existing per-type map', async () => {
    let body: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/defaults`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    renderCard({ accountCurrent: null, subtypeCurrent: { CashKind: 'cash-1' } });
    const user = userEvent.setup();

    await user.click(screen.getByRole('combobox', { name: 'Default account' }));
    await user.click(await screen.findByRole('option', { name: 'Wallet' }));

    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() =>
      expect(body).toEqual({ subtypeAccounts: { CashKind: 'cash-1' }, account: 'cash-1' }),
    );
  });

  it('clearing a per-type default via "— none —" omits its key', async () => {
    let body: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/defaults`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    renderCard({ accountCurrent: null, subtypeCurrent: { CashKind: 'cash-1' } });
    const user = userEvent.setup();

    await user.click(screen.getByRole('combobox', { name: 'Cash default account' }));
    await user.click(await screen.findByRole('option', { name: /none/i }));

    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(body).toEqual({ subtypeAccounts: {} }));
  });

  it('excludes closed and external accounts from the global select', async () => {
    renderCard({
      accounts: [
        acct('cash-1', 'Wallet', 'cash'),
        { ...acct('closed-1', 'Old', 'cash'), status: 'Closed' },
        { ...acct('ext-1', 'External', 'cash'), subtype: null },
      ],
    });
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Default account' }));
    expect(await screen.findByRole('option', { name: 'Wallet' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Old' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'External' })).not.toBeInTheDocument();
  });
});
