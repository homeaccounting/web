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
import {
  bankConnectionFixture,
  configurationFixture,
  externalAccountsFixture,
  externalAccountsFromFileFixture,
} from '@/test/fixtures';
import { LinkAccountsDialog } from './LinkAccountsDialog';

const apiBase = 'http://localhost:8080';
const externalAccountsUrl = `${apiBase}/api/banking/connections/conn-1/external-accounts`;
const externalAccountsFromFileUrl = `${apiBase}/api/banking/connections/conn-1/external-accounts/from-file`;
const accountsMapUrl = `${apiBase}/api/users/me/configuration/banking/connections/conn-1/accounts`;
const configurationUrl = `${apiBase}/api/users/me/configuration`;

// Point the configuration GET at a banking config whose `connections` list is
// exactly `connections`. LinkAccountsDialog reads this to learn which local
// accounts other connections have already claimed.
function useConfigConnections(connections: BankConnectionDTO[]) {
  server.use(
    http.get(configurationUrl, () =>
      HttpResponse.json({
        ...configurationFixture,
        banking: { ...configurationFixture.banking, connections },
      }),
    ),
  );
}

function bankAccount(
  id: string,
  name: string,
  currency: string,
  subtype: AccountResponse['subtype'] = { type: 'bankAccount' },
): AccountResponse {
  return {
    id,
    name,
    balance: 0,
    currency,
    overdraftLimit: null,
    subtype,
    status: 'Opened',
    role: 'owner',
    version: 1,
  };
}

function useLocalAccounts(list: AccountResponse[]) {
  server.use(
    http.get(`${apiBase}/api/accounts`, () =>
      HttpResponse.json({ accounts: list, totalCount: list.length }),
    ),
  );
}

const localAccounts: AccountResponse[] = [
  {
    id: 'a1',
    name: 'Checking',
    balance: 100,
    currency: 'UAH',
    overdraftLimit: null,
    subtype: { type: 'bankAccount' },
    status: 'Opened',
    role: 'owner',
    version: 1,
  },
  {
    id: 'a2',
    name: 'Savings',
    balance: 200,
    currency: 'USD',
    overdraftLimit: null,
    subtype: { type: 'bankAccount' },
    status: 'Opened',
    role: 'owner',
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

  it('keeps a local account selectable in another row once it is chosen', async () => {
    const user = userEvent.setup();
    // Sibling cards (e.g. two PrivatBank cards) legitimately share one local
    // account, so a chosen account must stay selectable in same-currency rows.
    server.use(
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
    expect(checkingOption).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('Save PUTs the same local account for two external accounts (many-to-one)', async () => {
    const user = userEvent.setup();
    let putBody: unknown = null;
    // Two same-currency external accounts (sibling cards on one local account).
    server.use(
      http.get(externalAccountsUrl, () =>
        HttpResponse.json([
          { ...externalAccountsFixture[0]! },
          { ...externalAccountsFixture[1]!, currency: 'UAH' },
        ]),
      ),
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

    const secondSelect = screen.getByRole('combobox', {
      name: /UA213223130000026007233566002/,
    });
    await user.click(secondSelect);
    const listbox = await screen.findByRole('listbox');
    await user.click(within(listbox).getByRole('option', { name: 'Checking' }));

    await user.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => {
      expect(putBody).toEqual({ accountMap: { 'ext-acc-1': 'a1', 'ext-acc-2': 'a1' } });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
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

  it('does not offer a bank account already linked by another connection', async () => {
    const user = userEvent.setup();
    // a1 is claimed by conn-2; a3 is an unlinked same-currency bank account.
    useLocalAccounts([bankAccount('a1', 'Checking', 'UAH'), bankAccount('a3', 'Reserve', 'UAH')]);
    useConfigConnections([
      { ...bankConnectionFixture, id: 'conn-1', accountMap: {} },
      { ...bankConnectionFixture, id: 'conn-2', accountMap: { 'other-ext': 'a1' } },
    ]);
    renderWithProviders(<Wrapper conn={connection} />, { initialPath: '/' });

    const uahSelect = await screen.findByRole('combobox', {
      name: /UA213223130000026007233566001/,
    });
    await user.click(uahSelect);
    const listbox = await screen.findByRole('listbox');
    // Unlinked bank account is offered; the one owned by conn-2 is not.
    expect(within(listbox).getByRole('option', { name: 'Reserve' })).toBeInTheDocument();
    expect(within(listbox).queryByRole('option', { name: 'Checking' })).not.toBeInTheDocument();
  });

  it('still offers a bank account mapped only by this connection', async () => {
    const user = userEvent.setup();
    // a1 is claimed by THIS connection (conn-1) — it must stay eligible.
    useLocalAccounts([bankAccount('a1', 'Checking', 'UAH')]);
    useConfigConnections([{ ...bankConnectionFixture, id: 'conn-1', accountMap: { x: 'a1' } }]);
    renderWithProviders(<Wrapper conn={connection} />, { initialPath: '/' });

    const uahSelect = await screen.findByRole('combobox', {
      name: /UA213223130000026007233566001/,
    });
    await user.click(uahSelect);
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: 'Checking' })).toBeInTheDocument();
  });

  it('does not offer non-bank local accounts', async () => {
    const user = userEvent.setup();
    // Same currency, but only the bank account is a valid target.
    useLocalAccounts([
      bankAccount('a1', 'Checking', 'UAH'),
      bankAccount('cash1', 'Wallet', 'UAH', { type: 'cash', storageLocation: 'Home' }),
      bankAccount('null1', 'Mystery', 'UAH', null),
    ]);
    renderWithProviders(<Wrapper conn={connection} />, { initialPath: '/' });

    const uahSelect = await screen.findByRole('combobox', {
      name: /UA213223130000026007233566001/,
    });
    await user.click(uahSelect);
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: 'Checking' })).toBeInTheDocument();
    expect(within(listbox).queryByRole('option', { name: 'Wallet' })).not.toBeInTheDocument();
    expect(within(listbox).queryByRole('option', { name: 'Mystery' })).not.toBeInTheDocument();
  });

  it('keeps a currently-mapped non-bank account selectable in its own row', async () => {
    const user = userEvent.setup();
    // A legacy mapping points ext-acc-1 at a cash account; it must survive the
    // bank-only filter so re-opening the dialog never silently drops it.
    useLocalAccounts([
      bankAccount('a1', 'Checking', 'UAH'),
      bankAccount('cash1', 'Wallet', 'UAH', { type: 'cash' }),
    ]);
    const mapped: BankConnectionDTO = {
      ...connection,
      accountMap: { 'ext-acc-1': 'cash1' },
    };
    renderWithProviders(<Wrapper conn={mapped} />, { initialPath: '/' });

    const uahSelect = await screen.findByRole('combobox', {
      name: /UA213223130000026007233566001/,
    });
    // The seeded, otherwise-filtered selection is shown on the trigger…
    expect(uahSelect).toHaveTextContent('Wallet');
    // …and remains selectable within its own row, alongside the bank account.
    await user.click(uahSelect);
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: 'Wallet' })).toBeInTheDocument();
    expect(within(listbox).getByRole('option', { name: 'Checking' })).toBeInTheDocument();
  });

  it('keeps the sole current mapping selectable and hides the empty-state hint', async () => {
    const user = userEvent.setup();
    // The seeded selection is a non-bank account and it's the ONLY same-currency
    // account, so nothing else is eligible. The row must still let you keep it,
    // and the "no account" empty-state hint must not appear alongside it.
    useLocalAccounts([bankAccount('cash1', 'Wallet', 'UAH', { type: 'cash' })]);
    const mapped: BankConnectionDTO = {
      ...connection,
      accountMap: { 'ext-acc-1': 'cash1' },
    };
    renderWithProviders(<Wrapper conn={mapped} />, { initialPath: '/' });

    const uahSelect = await screen.findByRole('combobox', {
      name: /UA213223130000026007233566001/,
    });
    expect(uahSelect).toHaveTextContent('Wallet');
    // The empty-state hint must not render when the unioned selection is offered.
    expect(screen.queryByText(/No UAH account/i)).not.toBeInTheDocument();

    await user.click(uahSelect);
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: 'Wallet' })).toBeInTheDocument();
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

    await user.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => {
      expect(putBody).toEqual({ accountMap: { 'ext-acc-1': 'a1' } });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('disambiguates same-currency local accounts by their bank label', async () => {
    const user = userEvent.setup();
    // Two UAH accounts that share the name "Card" — indistinguishable without
    // the bank qualifier the accountLabel helper appends.
    server.use(
      http.get(`${apiBase}/api/accounts`, () => {
        const uahAccounts: AccountResponse[] = [
          {
            id: 'a1',
            name: 'Card',
            balance: 100,
            currency: 'UAH',
            overdraftLimit: null,
            subtype: { type: 'bankAccount', bankName: 'Monobank' },
            status: 'Opened',
            role: 'owner',
            version: 1,
          },
          {
            id: 'a3',
            name: 'Card',
            balance: 5,
            currency: 'UAH',
            overdraftLimit: null,
            subtype: { type: 'bankAccount', bankName: 'PrivatBank' },
            status: 'Opened',
            role: 'owner',
            version: 1,
          },
        ];
        return HttpResponse.json({ accounts: uahAccounts, totalCount: uahAccounts.length });
      }),
    );
    renderWithProviders(<Wrapper conn={connection} />, { initialPath: '/' });
    const uahSelect = await screen.findByRole('combobox', {
      name: /UA213223130000026007233566001/,
    });
    await user.click(uahSelect);
    const listbox = await screen.findByRole('listbox');
    expect(within(listbox).getByRole('option', { name: 'Card · Monobank' })).toBeInTheDocument();
    expect(within(listbox).getByRole('option', { name: 'Card · PrivatBank' })).toBeInTheDocument();
    // The bare, ambiguous name must no longer appear on its own.
    expect(within(listbox).queryByRole('option', { name: 'Card' })).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByText(/already mapped/i)).toBeInTheDocument();
  });
});

describe('LinkAccountsDialog (file provider)', () => {
  // privatbank is file-only (supportsPull:false, supportsFile:true) per the
  // default providers handler.
  const fileConnection: BankConnectionDTO = {
    id: 'conn-1',
    provider: 'privatbank',
    name: 'PrivatBank',
    enabled: true,
    tokenSet: true,
    tokenHint: 'abc',
    accountMap: {},
  };

  it('does not auto-fetch external accounts and shows a statement upload prompt', async () => {
    let pulled = false;
    server.use(
      http.get(externalAccountsUrl, () => {
        pulled = true;
        return HttpResponse.json(externalAccountsFixture);
      }),
    );
    renderWithProviders(<Wrapper conn={fileConnection} />, { initialPath: '/' });
    expect(await screen.findByLabelText(/statement files/i)).toBeInTheDocument();
    expect(screen.getByText(/upload your statement/i)).toBeInTheDocument();
    // No pull GET should ever fire for a file-only provider.
    expect(pulled).toBe(false);
  });

  it('discovers accounts from an uploaded statement, then Save PUTs the accountMap', async () => {
    const user = userEvent.setup();
    let putBody: unknown = null;
    server.use(
      http.post(externalAccountsFromFileUrl, () =>
        HttpResponse.json(externalAccountsFromFileFixture),
      ),
      http.put(accountsMapUrl, async ({ request }) => {
        putBody = await request.json();
        return new HttpResponse(null, { status: 200 });
      }),
    );
    renderWithProviders(<Wrapper conn={fileConnection} />, { initialPath: '/' });

    const fileInput = await screen.findByLabelText(/statement files/i);
    const file = new File(['date,amount\n2026-01-01,10'], 'statement.csv', { type: 'text/csv' });
    await user.upload(fileInput, file);

    // A row per discovered account (from the from-file fixture, not the pull one).
    const uahSelect = await screen.findByRole('combobox', {
      name: /UA903052992990004149123456789/,
    });
    await user.click(uahSelect);
    await user.click(await screen.findByRole('option', { name: 'Checking' }));

    const usdSelect = screen.getByRole('combobox', {
      name: /UA903052992990004149987654321/,
    });
    await user.click(usdSelect);
    await user.click(await screen.findByRole('option', { name: 'Savings' }));

    await user.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => {
      expect(putBody).toEqual({ accountMap: { 'ext-file-1': 'a1', 'ext-file-2': 'a2' } });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});
