import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { accountFixture, bankingEnabledConfigurationFixture } from '@/test/fixtures';
import type { BankConnectionDTO, BankProviderDTO, ConfigurationResponse } from '@/api/types';
import { ImportStatementButton } from './ImportStatementButton';

const apiBase = 'http://localhost:8080';

// File-capable (PrivatBank) connection mapping the fixture account.
const privatbankConnection: BankConnectionDTO = {
  id: 'conn-privatbank',
  provider: 'privatbank',
  name: 'PrivatBank',
  enabled: true,
  tokenSet: false,
  tokenHint: '',
  accountMap: { 'ext-acc-2': accountFixture.id },
};

// Pull-only (Monobank) connection mapping the same account.
const monobankConnection: BankConnectionDTO = {
  id: 'conn-monobank',
  provider: 'monobank',
  name: 'Monobank',
  enabled: true,
  tokenSet: true,
  tokenHint: '3f2',
  accountMap: { 'ext-acc-1': accountFixture.id },
};

const providers: BankProviderDTO[] = [
  { id: 'monobank', displayName: 'Monobank', supportsPull: true, supportsFile: false },
  { id: 'privatbank', displayName: 'PrivatBank', supportsPull: false, supportsFile: true },
];

function configWith(connections: BankConnectionDTO[], enabled = true): ConfigurationResponse {
  return {
    ...bankingEnabledConfigurationFixture,
    bankingFeatureEnabled: enabled,
    banking: { ...bankingEnabledConfigurationFixture.banking, connections },
  };
}

function useConfigHandler(config: ConfigurationResponse) {
  server.use(http.get(`${apiBase}/api/users/me/configuration`, () => HttpResponse.json(config)));
}

function useProvidersHandler(list: BankProviderDTO[] = providers) {
  server.use(
    http.get(`${apiBase}/api/users/me/configuration/banking/providers`, () =>
      HttpResponse.json(list),
    ),
  );
}

function ui() {
  return (
    <AuthProvider>
      <ImportStatementButton selectedAccount={accountFixture} />
    </AuthProvider>
  );
}

function makeCsvFile(name = 'statement.csv'): File {
  return new File(['date,amount\n2026-07-01,100'], name, { type: 'text/csv' });
}

describe('import statement button', () => {
  it('is shown when the account has an enabled file-capable connection', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    useConfigHandler(configWith([privatbankConnection]));
    useProvidersHandler();
    renderWithProviders(ui(), { initialPath: '/' });
    expect(await screen.findByRole('button', { name: /import statement/i })).toBeInTheDocument();
  });

  it('is hidden when the only connection is pull-only (monobank)', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    useConfigHandler(configWith([monobankConnection]));
    useProvidersHandler();
    renderWithProviders(ui(), { initialPath: '/' });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /import statement/i })).not.toBeInTheDocument(),
    );
  });

  it('is hidden when there is no connection for the account', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    useConfigHandler(configWith([]));
    useProvidersHandler();
    renderWithProviders(ui(), { initialPath: '/' });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /import statement/i })).not.toBeInTheDocument(),
    );
  });

  it('is hidden when bankingFeatureEnabled is false even if mapped', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    useConfigHandler(configWith([privatbankConnection], false));
    useProvidersHandler();
    renderWithProviders(ui(), { initialPath: '/' });
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('button', { name: /import statement/i })).not.toBeInTheDocument();
  });

  it('uploads a selected CSV file and shows a success toast summarizing counts', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    useConfigHandler(configWith([privatbankConnection]));
    useProvidersHandler();

    let calledPath = '';
    let format = '';
    server.use(
      http.post(`${apiBase}/api/banking/connections/:id/import/file`, ({ request, params }) => {
        calledPath = String(params.id);
        format = new URL(request.url).searchParams.get('format') ?? '';
        return HttpResponse.json({
          accounts: [
            {
              externalAccountId: 'ext-acc-2',
              localAccountId: accountFixture.id,
              importedCount: 5,
              skippedCount: 2,
              failureCount: 1,
            },
          ],
          unresolved: [],
        });
      }),
    );

    renderWithProviders(ui(), { initialPath: '/' });
    await screen.findByRole('button', { name: /import statement/i });
    const fileInput = screen.getByTestId('import-statement-file-input');
    await user.upload(fileInput, makeCsvFile());

    await screen.findByText(/imported 5 transactions/i);
    expect(screen.getByText(/2 skipped/i)).toBeInTheDocument();
    expect(screen.getByText(/1 failed/i)).toBeInTheDocument();
    expect(calledPath).toBe('conn-privatbank');
    expect(format).toBe('csv');
  });

  it('mentions unresolved rows in the toast when present', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    useConfigHandler(configWith([privatbankConnection]));
    useProvidersHandler();
    server.use(
      http.post(`${apiBase}/api/banking/connections/:id/import/file`, () =>
        HttpResponse.json({
          accounts: [
            {
              externalAccountId: 'ext-acc-2',
              localAccountId: accountFixture.id,
              importedCount: 3,
              skippedCount: 0,
              failureCount: 0,
            },
          ],
          unresolved: ['row-9', 'row-14'],
        }),
      ),
    );

    renderWithProviders(ui(), { initialPath: '/' });
    await screen.findByRole('button', { name: /import statement/i });
    const fileInput = screen.getByTestId('import-statement-file-input');
    await user.upload(fileInput, makeCsvFile());

    await screen.findByText(/imported 3 transactions/i);
    expect(screen.getByText(/2 rows need attention/i)).toBeInTheDocument();
  });

  it('renders a destructive alert on an error response', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    useConfigHandler(configWith([privatbankConnection]));
    useProvidersHandler();
    server.use(
      http.post(`${apiBase}/api/banking/connections/:id/import/file`, () =>
        HttpResponse.json(
          { message: 'Unsupported file format', code: 'INVALID_FORMAT' },
          { status: 422 },
        ),
      ),
    );

    renderWithProviders(ui(), { initialPath: '/' });
    await screen.findByRole('button', { name: /import statement/i });
    const fileInput = screen.getByTestId('import-statement-file-input');
    await user.upload(fileInput, makeCsvFile());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/unsupported file format/i);
  });
});
