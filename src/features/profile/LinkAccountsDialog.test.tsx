import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import type { AccountResponse, BankConnectionDTO } from '@/api/types';
import { externalAccountsFixture } from '@/test/fixtures';
import { LinkAccountsDialog } from './LinkAccountsDialog';

const apiBase = 'http://localhost:8080';
const externalAccountsUrl = `${apiBase}/api/banking/connections/conn-1/external-accounts`;
const accountsMapUrl = `${apiBase}/api/users/me/configuration/banking/connections/conn-1/accounts`;

const localAccounts: AccountResponse[] = [
  {
    id: 'a1',
    name: 'Checking',
    balance: 100,
    currency: 'UAH',
    overdraftLimit: null,
    subtype: null,
    status: 'Opened',
    version: 1,
  },
  {
    id: 'a2',
    name: 'Savings',
    balance: 200,
    currency: 'USD',
    overdraftLimit: null,
    subtype: null,
    status: 'Opened',
    version: 1,
  },
];

const connection: BankConnectionDTO = {
  id: 'conn-1',
  provider: 'monobank',
  name: 'Monobank',
  enabled: true,
  tokenSet: true,
  tokenHint: '3f2',
  accountMap: {},
};

function Wrapper({ conn }: { conn: BankConnectionDTO }) {
  const [open, setOpen] = useState(true);
  return (
    <AuthProvider>
      <LinkAccountsDialog open={open} onOpenChange={setOpen} connection={conn} />
    </AuthProvider>
  );
}

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  server.use(
    http.get(`${apiBase}/api/accounts`, () =>
      HttpResponse.json({ accounts: localAccounts, totalCount: localAccounts.length }),
    ),
    http.get(externalAccountsUrl, () => HttpResponse.json(externalAccountsFixture)),
  );
});

describe('LinkAccountsDialog', () => {
  it('opening triggers the external-accounts fetch and lists the two rows', async () => {
    let fetched = false;
    server.use(
      http.get(externalAccountsUrl, () => {
        fetched = true;
        return HttpResponse.json(externalAccountsFixture);
      }),
    );
    renderWithProviders(<Wrapper conn={connection} />, { initialPath: '/' });
    await waitFor(() => expect(fetched).toBe(true));
    expect(await screen.findByText(/UA213223130000026007233566001/)).toBeInTheDocument();
    expect(screen.getByText(/UA213223130000026007233566002/)).toBeInTheDocument();
  });

  it('pre-selects local accounts from a non-empty accountMap', async () => {
    // ext-acc-1 is UAH, so it must map to a UAH local account (Checking).
    const mapped: BankConnectionDTO = {
      ...connection,
      accountMap: { 'ext-acc-1': 'a1' },
    };
    renderWithProviders(<Wrapper conn={mapped} />, { initialPath: '/' });
    const firstSelect = await screen.findByRole('combobox', {
      name: /UA213223130000026007233566001/,
    });
    expect(firstSelect).toHaveTextContent('Checking');
  });

  it('disables an already-chosen local account in the other row', async () => {
    const user = userEvent.setup();
    // Duplicate-prevention only applies between same-currency rows, so use two
    // UAH external accounts and two UAH local accounts here.
    server.use(
      http.get(`${apiBase}/api/accounts`, () => {
        const uahAccounts: AccountResponse[] = [
          { ...localAccounts[0]! },
          {
            id: 'a3',
            name: 'Wallet',
            balance: 5,
            currency: 'UAH',
            overdraftLimit: null,
            subtype: null,
            status: 'Opened',
            version: 1,
          },
        ];
        return HttpResponse.json({ accounts: uahAccounts, totalCount: uahAccounts.length });
      }),
      http.get(externalAccountsUrl, () =>
        HttpResponse.json([
          { ...externalAccountsFixture[0]! },
          { ...externalAccountsFixture[1]!, currency: 'UAH' },
        ]),
      ),
    );
    renderWithProviders(<Wrapper conn={connection} />, { initialPath: '/' });
    const firstSelect = await screen.findByRole('combobox', {
      name: /UA213223130000026007233566001/,
    });
    await user.click(firstSelect);
    await user.click(await screen.findByRole('option', { name: 'Checking' }));

    const secondSelect = screen.getByRole('combobox', {
      name: /UA213223130000026007233566002/,
    });
    await user.click(secondSelect);
    const listbox = await screen.findByRole('listbox');
    const checkingOption = within(listbox).getByRole('option', { name: 'Checking' });
    expect(checkingOption).toHaveAttribute('aria-disabled', 'true');
  });

  it('only offers same-currency local accounts per external account', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Wrapper conn={connection} />, { initialPath: '/' });

    // ext-acc-1 is UAH → only the UAH local account (Checking) is offered.
    const uahSelect = await screen.findByRole('combobox', {
      name: /UA213223130000026007233566001/,
    });
    await user.click(uahSelect);
    let listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: 'Checking' })).toBeInTheDocument();
    expect(within(listbox).queryByRole('option', { name: 'Savings' })).not.toBeInTheDocument();
    await user.keyboard('{Escape}');

    // ext-acc-2 is USD → only the USD local account (Savings) is offered.
    const usdSelect = screen.getByRole('combobox', {
      name: /UA213223130000026007233566002/,
    });
    await user.click(usdSelect);
    listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: 'Savings' })).toBeInTheDocument();
    expect(within(listbox).queryByRole('option', { name: 'Checking' })).not.toBeInTheDocument();
  });

  it('Save PUTs the expected accountMap and closes', async () => {
    const user = userEvent.setup();
    let putBody: unknown = null;
    server.use(
      http.put(accountsMapUrl, async ({ request }) => {
        putBody = await request.json();
        return new HttpResponse(null, { status: 200 });
      }),
    );
    renderWithProviders(<Wrapper conn={connection} />, { initialPath: '/' });
    const firstSelect = await screen.findByRole('combobox', {
      name: /UA213223130000026007233566001/,
    });
    await user.click(firstSelect);
    await user.click(await screen.findByRole('option', { name: 'Checking' }));

    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => {
      expect(putBody).toEqual({ accountMap: { 'ext-acc-1': 'a1' } });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('shows a rate-limit retry affordance on a 429 fetch', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    server.use(
      http.get(externalAccountsUrl, () => {
        attempt += 1;
        if (attempt === 1) {
          return HttpResponse.json(
            { code: 'BANKING_RATE_LIMITED', message: 'rate limited' },
            { status: 429 },
          );
        }
        return HttpResponse.json(externalAccountsFixture);
      }),
    );
    renderWithProviders(<Wrapper conn={connection} />, { initialPath: '/' });
    expect(await screen.findByText(/rate-limited/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(await screen.findByText(/UA213223130000026007233566001/)).toBeInTheDocument();
  });

  it('shows a destructive alert when the save returns a 409 conflict', async () => {
    const user = userEvent.setup();
    server.use(
      http.put(accountsMapUrl, () =>
        HttpResponse.json({ code: 'CONFLICT', message: 'Account already mapped' }, { status: 409 }),
      ),
    );
    renderWithProviders(<Wrapper conn={connection} />, { initialPath: '/' });
    const firstSelect = await screen.findByRole('combobox', {
      name: /UA213223130000026007233566001/,
    });
    await user.click(firstSelect);
    await user.click(await screen.findByRole('option', { name: 'Checking' }));
    await user.click(screen.getByRole('button', { name: /save/i }));
    expect(await screen.findByText(/already mapped/i)).toBeInTheDocument();
  });
});
