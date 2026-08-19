import { describe, expect, it, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { toast } from '@/lib/toast';
import { accountFixture, bankingEnabledConfigurationFixture } from '@/test/fixtures';
import type { BankConnectionDTO, BankProviderDTO, ConfigurationResponse } from '@/api/types';
import { ImportStatementButton } from './ImportStatementButton';

vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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

function makeXlsxFile(name = 'statement.xlsx'): File {
  return new File(['PK\x03\x04'], name, {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

// Capture every file part sent to the import endpoint across all POSTs so a
// test can assert the whole batch arrived in a SINGLE request.
function captureImportRequests() {
  const capture = { calls: 0, lastFileNames: [] as string[], calledPath: '', format: '' };
  server.use(
    http.post(`${apiBase}/api/banking/connections/:id/import/file`, async ({ request, params }) => {
      capture.calls += 1;
      capture.calledPath = String(params.id);
      capture.format = new URL(request.url).searchParams.get('format') ?? '';
      const form = await request.formData();
      capture.lastFileNames = form.getAll('files').map((f) => (f as File).name);
      return HttpResponse.json({
        accounts: [
          {
            externalAccountId: 'ext-acc-2',
            localAccountId: accountFixture.id,
            importedCount: 4,
            skipped: [],
            failureCount: 0,
          },
        ],
        unresolved: [],
      });
    }),
  );
  return capture;
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
              skipped: [
                'already imported',
                'currency mismatch: account is USD but the transaction is UAH',
              ],
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

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Imported 5 transactions · 2 skipped · 1 failed'),
    );
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
              skipped: [],
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

    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith('Imported 3 transactions · 2 rows need attention'),
    );
  });

  it('sends a single-file selection as one request with one file part', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    useConfigHandler(configWith([privatbankConnection]));
    useProvidersHandler();
    const capture = captureImportRequests();

    renderWithProviders(ui(), { initialPath: '/' });
    await screen.findByRole('button', { name: /import statement/i });
    const fileInput = screen.getByTestId('import-statement-file-input');
    await user.upload(fileInput, makeCsvFile('one.csv'));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(capture.calls).toBe(1);
    expect(capture.lastFileNames).toEqual(['one.csv']);
    expect(capture.calledPath).toBe('conn-privatbank');
    expect(capture.format).toBe('csv');
  });

  it('sends multiple selected files as one request carrying every file', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    useConfigHandler(configWith([privatbankConnection]));
    useProvidersHandler();
    const capture = captureImportRequests();

    renderWithProviders(ui(), { initialPath: '/' });
    await screen.findByRole('button', { name: /import statement/i });
    const fileInput = screen.getByTestId('import-statement-file-input');
    await user.upload(fileInput, [makeCsvFile('jan.csv'), makeCsvFile('feb.csv')]);

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(capture.calls).toBe(1);
    expect(capture.lastFileNames).toEqual(['jan.csv', 'feb.csv']);
    expect(capture.calledPath).toBe('conn-privatbank');
    expect(capture.format).toBe('csv');
  });

  it('uploads an XLSX file with format=xlsx', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    useConfigHandler(configWith([privatbankConnection]));
    useProvidersHandler();
    const capture = captureImportRequests();

    renderWithProviders(ui(), { initialPath: '/' });
    await screen.findByRole('button', { name: /import statement/i });
    const fileInput = screen.getByTestId('import-statement-file-input');
    await user.upload(fileInput, makeXlsxFile('stmts_42.xlsx'));

    await waitFor(() => expect(toast.success).toHaveBeenCalled());
    expect(capture.calls).toBe(1);
    expect(capture.lastFileNames).toEqual(['stmts_42.xlsx']);
    expect(capture.format).toBe('xlsx');
  });

  it('rejects a mixed csv+xlsx selection without sending a request', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    useConfigHandler(configWith([privatbankConnection]));
    useProvidersHandler();
    const capture = captureImportRequests();

    renderWithProviders(ui(), { initialPath: '/' });
    await screen.findByRole('button', { name: /import statement/i });
    const fileInput = screen.getByTestId('import-statement-file-input');
    await user.upload(fileInput, [makeCsvFile('a.csv'), makeXlsxFile('b.xlsx')]);

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(capture.calls).toBe(0);
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

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Unsupported file format'));
  });
});
