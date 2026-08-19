import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import type { BankConnectionDTO, BankProviderDTO } from '@/api/types';
import { accountFixture } from '@/test/fixtures';
import { BankConnectionDialog } from './BankConnectionDialog';

const apiBase = 'http://localhost:8080';
const connectionsUrl = `${apiBase}/api/users/me/configuration/banking/connections`;
const providersUrl = `${apiBase}/api/users/me/configuration/banking/providers`;

const providers: BankProviderDTO[] = [
  {
    id: 'monobank',
    displayName: 'Monobank',
    supportsPull: true,
    supportsFile: false,
    countries: ['UA'],
    inUserCountry: true,
  },
  {
    id: 'privatbank',
    displayName: 'PrivatBank',
    supportsPull: false,
    supportsFile: true,
    countries: ['UA'],
    inUserCountry: true,
  },
];

const existingConnection: BankConnectionDTO = {
  id: 'conn-1',
  provider: 'monobank',
  name: 'My monobank',
  enabled: true,
  tokenSet: true,
  tokenHint: '1234',
  accountMap: {},
};

function Wrapper({ connection }: { connection?: BankConnectionDTO }) {
  const [open, setOpen] = useState(true);
  return (
    <AuthProvider>
      <BankConnectionDialog open={open} onOpenChange={setOpen} connection={connection} />
    </AuthProvider>
  );
}

async function selectProvider(user: ReturnType<typeof userEvent.setup>, displayName: string) {
  const combobox = await screen.findByRole('combobox', { name: 'Provider' });
  await user.click(combobox);
  await user.click(await screen.findByRole('option', { name: displayName }));
}

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  server.use(
    http.get(providersUrl, () => HttpResponse.json(providers)),
    http.get(`${apiBase}/api/accounts`, () =>
      HttpResponse.json({ accounts: [accountFixture], totalCount: 1 }),
    ),
  );
});

describe('BankConnectionDialog', () => {
  it('provider select is populated from useProviders, not hardcoded', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    const combobox = await screen.findByRole('combobox', { name: 'Provider' });
    expect(combobox).not.toBeDisabled();
    await user.click(combobox);
    expect(await screen.findByRole('option', { name: 'Monobank' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'PrivatBank' })).toBeInTheDocument();
  });

  it('selecting a pull provider shows the token field; blank token shows a validation error and fires no POST', async () => {
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.post(connectionsUrl, () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await selectProvider(user, 'Monobank');
    expect(screen.getByLabelText(/^token$/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/name/i), 'My bank');
    await user.click(screen.getByRole('button', { name: /^ok$/i }));
    expect(await screen.findByText(/token is required/i)).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('selecting the file-only provider hides both the token field and the account picker', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await selectProvider(user, 'PrivatBank');
    expect(screen.queryByLabelText(/^token$/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/import into account/i)).not.toBeInTheDocument();
  });

  it('submitting for the file-only provider creates the connection unmapped, with no accountMap PUT', async () => {
    const user = userEvent.setup();
    let postedBody: unknown = null;
    let accountsPutCalled = false;
    server.use(
      http.post(connectionsUrl, async ({ request }) => {
        postedBody = await request.json();
        return HttpResponse.json(
          { ...existingConnection, id: 'conn-file', provider: 'privatbank' },
          { status: 201 },
        );
      }),
      http.put(`${connectionsUrl}/conn-file/accounts`, () => {
        accountsPutCalled = true;
        return new HttpResponse(null, { status: 200 });
      }),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await user.type(await screen.findByLabelText(/name/i), 'My PrivatBank');
    await selectProvider(user, 'PrivatBank');

    // No account picker is rendered for file connections — they are created
    // unmapped and mapped later via "Link accounts".
    expect(screen.queryByLabelText(/import into account/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^ok$/i }));

    await waitFor(() => {
      expect(postedBody).toEqual({
        provider: 'privatbank',
        name: 'My PrivatBank',
        enabled: true,
      });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // The connection is left unmapped: no accountMap PUT is issued.
    expect(accountsPutCalled).toBe(false);
  });

  it('happy create posts {provider,name,token,enabled} and closes', async () => {
    const user = userEvent.setup();
    let postedBody: unknown = null;
    server.use(
      http.post(connectionsUrl, async ({ request }) => {
        postedBody = await request.json();
        return HttpResponse.json(existingConnection, { status: 201 });
      }),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await user.type(await screen.findByLabelText(/name/i), 'My bank');
    await selectProvider(user, 'Monobank');
    await user.type(screen.getByLabelText(/^token$/i), 'secret-token');
    await user.click(screen.getByRole('button', { name: /^ok$/i }));
    await waitFor(() => {
      expect(postedBody).toEqual({
        provider: 'monobank',
        name: 'My bank',
        token: 'secret-token',
        enabled: true,
      });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('edit with blank token PUTs only {name,enabled} and does not call the token endpoint', async () => {
    const user = userEvent.setup();
    let putBody: unknown = null;
    let tokenCalled = false;
    server.use(
      http.put(`${connectionsUrl}/conn-1`, async ({ request }) => {
        putBody = await request.json();
        return new HttpResponse(null, { status: 200 });
      }),
      http.put(`${connectionsUrl}/conn-1/token`, () => {
        tokenCalled = true;
        return new HttpResponse(null, { status: 200 });
      }),
    );
    renderWithProviders(<Wrapper connection={existingConnection} />, { initialPath: '/' });
    const name = await screen.findByLabelText(/name/i);
    await user.clear(name);
    await user.type(name, 'Renamed');
    await user.click(screen.getByRole('button', { name: /^ok$/i }));
    await waitFor(() => {
      expect(putBody).toEqual({ name: 'Renamed', enabled: true });
    });
    expect(tokenCalled).toBe(false);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('edit with a token also calls the token endpoint', async () => {
    const user = userEvent.setup();
    let tokenBody: unknown = null;
    server.use(
      http.put(`${connectionsUrl}/conn-1`, () => new HttpResponse(null, { status: 200 })),
      http.put(`${connectionsUrl}/conn-1/token`, async ({ request }) => {
        tokenBody = await request.json();
        return new HttpResponse(null, { status: 200 });
      }),
    );
    renderWithProviders(<Wrapper connection={existingConnection} />, { initialPath: '/' });
    await user.type(await screen.findByLabelText(/^token$/i), 'new-token');
    await user.click(screen.getByRole('button', { name: /^ok$/i }));
    await waitFor(() => {
      expect(tokenBody).toEqual({ token: 'new-token' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('edit mode keeps the provider select disabled', async () => {
    renderWithProviders(<Wrapper connection={existingConnection} />, { initialPath: '/' });
    const combobox = await screen.findByRole('combobox', { name: 'Provider' });
    expect(combobox).toBeDisabled();
  });

  it('renders a flat provider list with no "Other countries" group when all providers are in-country', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    const combobox = await screen.findByRole('combobox', { name: 'Provider' });
    await user.click(combobox);
    await screen.findByRole('option', { name: 'Monobank' });
    expect(screen.queryByText('Other countries')).not.toBeInTheDocument();
  });

  it('groups out-of-country providers under an "Other countries" label showing the country', async () => {
    const user = userEvent.setup();
    server.use(
      http.get(providersUrl, () =>
        HttpResponse.json([
          {
            id: 'monobank',
            displayName: 'Monobank',
            supportsPull: true,
            supportsFile: false,
            countries: ['UA'],
            inUserCountry: true,
          },
          {
            id: 'chase',
            displayName: 'Chase',
            supportsPull: true,
            supportsFile: false,
            countries: ['US'],
            inUserCountry: false,
          },
        ] satisfies BankProviderDTO[]),
      ),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    const combobox = await screen.findByRole('combobox', { name: 'Provider' });
    await user.click(combobox);
    expect(await screen.findByText('Other countries')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /united states/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Monobank' })).toBeInTheDocument();
  });

  it('maps backend fieldErrors.name onto the name input', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(connectionsUrl, () =>
        HttpResponse.json(
          { message: 'Validation failed', fieldErrors: { name: 'Already taken' } },
          { status: 400 },
        ),
      ),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await user.type(await screen.findByLabelText(/name/i), 'My bank');
    await selectProvider(user, 'Monobank');
    await user.type(screen.getByLabelText(/^token$/i), 'secret-token');
    await user.click(screen.getByRole('button', { name: /^ok$/i }));
    expect(await screen.findByText(/already taken/i)).toBeInTheDocument();
  });
});
