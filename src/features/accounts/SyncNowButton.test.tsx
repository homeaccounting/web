import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import {
  accountFixture,
  bankingEnabledConfigurationFixture,
  configurationFixture,
} from '@/test/fixtures';
import type { BankConnectionDTO, ConfigurationResponse } from '@/api/types';
import { SyncNowButton, last30Days } from './SyncNowButton';

const apiBase = 'http://localhost:8080';

// A connection that maps an external account to the local fixture account `a1`.
const mappedConnection: BankConnectionDTO = {
  id: 'conn-mapped',
  provider: 'monobank',
  name: 'Monobank',
  enabled: true,
  tokenSet: true,
  tokenHint: '3f2',
  accountMap: { 'ext-acc-1': accountFixture.id },
};

// File-only (PrivatBank) connection mapping the same fixture account. Pull-only
// UI (SyncNowButton) must stay hidden for this: the backend has no pull
// transport for a file-only provider.
const privatbankConnection: BankConnectionDTO = {
  id: 'conn-privatbank',
  provider: 'privatbank',
  name: 'PrivatBank',
  enabled: true,
  tokenSet: false,
  tokenHint: '',
  accountMap: { 'ext-acc-2': accountFixture.id },
};

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

function ui() {
  return (
    <AuthProvider>
      <SyncNowButton selectedAccount={accountFixture} />
    </AuthProvider>
  );
}

describe('last30Days', () => {
  it('returns a 30-day window ending at the given now', () => {
    const now = new Date('2026-06-07T12:00:00.000Z');
    const { from, to } = last30Days(now);
    expect(to).toBe(now.toISOString());
    expect(new Date(to).getTime() - new Date(from).getTime()).toBe(30 * 24 * 60 * 60 * 1000);
  });
});

describe('sync now button', () => {
  it('is hidden when the selected account is not a value in any enabled connection accountMap', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    useConfigHandler(configWith([{ ...mappedConnection, accountMap: { 'ext-acc-1': 'other' } }]));
    renderWithProviders(ui(), { initialPath: '/' });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /sync now/i })).not.toBeInTheDocument(),
    );
  });

  it('is hidden when the connection is disabled even if mapped', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    useConfigHandler(configWith([{ ...mappedConnection, enabled: false }]));
    renderWithProviders(ui(), { initialPath: '/' });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /sync now/i })).not.toBeInTheDocument(),
    );
  });

  it('is hidden when bankingFeatureEnabled is false even if mapped', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    useConfigHandler({ ...configWith([mappedConnection], false) });
    renderWithProviders(ui(), { initialPath: '/' });
    // Wait for config to settle, then assert absence.
    await new Promise((r) => setTimeout(r, 0));
    expect(screen.queryByRole('button', { name: /sync now/i })).not.toBeInTheDocument();
  });

  it('is shown when mapped, connection enabled, and the flag is on', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    useConfigHandler(configWith([mappedConnection]));
    renderWithProviders(ui(), { initialPath: '/' });
    expect(await screen.findByRole('button', { name: /sync now/i })).toBeInTheDocument();
  });

  it('is shown for an enabled pull-capable (monobank) connection', async () => {
    // Relies on the default MSW providers handler, which marks monobank
    // supportsPull: true.
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    useConfigHandler(configWith([mappedConnection]));
    renderWithProviders(ui(), { initialPath: '/' });
    expect(await screen.findByRole('button', { name: /sync now/i })).toBeInTheDocument();
  });

  it('is HIDDEN when the account is only connected via a file-only (privatbank) connection', async () => {
    // Relies on the default MSW providers handler, which marks privatbank
    // supportsPull: false. Gating must be fail-closed even though the
    // connection is enabled and maps the account.
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    useConfigHandler(configWith([privatbankConnection]));
    renderWithProviders(ui(), { initialPath: '/' });
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /sync now/i })).not.toBeInTheDocument(),
    );
  });

  it('posts a ~30 day window to the matched connection and renders the summary', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    useConfigHandler(configWith([mappedConnection]));

    let calledPath = '';
    let body: { from: string; to: string } | undefined;
    server.use(
      http.post(`${apiBase}/api/banking/connections/:id/import`, async ({ request, params }) => {
        calledPath = String(params.id);
        body = (await request.json()) as { from: string; to: string };
        return HttpResponse.json({
          accounts: [
            {
              externalAccountId: 'ext-acc-1',
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
    const btn = await screen.findByRole('button', { name: /sync now/i });
    await user.click(btn);

    await screen.findByText(/imported 5 transactions/i);
    expect(screen.getByText(/2 skipped/i)).toBeInTheDocument();
    expect(screen.getByText(/1 failed/i)).toBeInTheDocument();
    expect(calledPath).toBe('conn-mapped');
    expect(body).toBeDefined();
    const span = new Date(body!.to).getTime() - new Date(body!.from).getTime();
    expect(span).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it('omits skipped/failed from the toast when both are zero', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    useConfigHandler(configWith([mappedConnection]));
    server.use(
      http.post(`${apiBase}/api/banking/connections/:id/import`, () =>
        HttpResponse.json({
          accounts: [
            {
              externalAccountId: 'ext-acc-1',
              localAccountId: accountFixture.id,
              importedCount: 90,
              skippedCount: 0,
              failureCount: 0,
            },
          ],
          unresolved: [],
        }),
      ),
    );

    renderWithProviders(ui(), { initialPath: '/' });
    await user.click(await screen.findByRole('button', { name: /sync now/i }));

    const toast = await screen.findByText(/imported 90 transactions/i);
    expect(toast).toBeInTheDocument();
    expect(toast).not.toHaveTextContent(/skipped/i);
    expect(toast).not.toHaveTextContent(/failed/i);
    // Dismissable.
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(screen.queryByText(/imported 90 transactions/i)).not.toBeInTheDocument();
  });

  it('renders a destructive alert on a 422 response', async () => {
    const user = userEvent.setup();
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    useConfigHandler(configWith([mappedConnection]));
    server.use(
      http.post(`${apiBase}/api/banking/connections/:id/import`, () =>
        HttpResponse.json(
          { message: 'Connection is disabled', code: 'CONNECTION_DISABLED' },
          { status: 422 },
        ),
      ),
    );

    renderWithProviders(ui(), { initialPath: '/' });
    const btn = await screen.findByRole('button', { name: /sync now/i });
    await user.click(btn);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/connection is disabled/i);
  });

  // Keep `configurationFixture` referenced for documentation of the disabled default.
  it('default fixture keeps banking disabled', () => {
    expect(configurationFixture.bankingFeatureEnabled).toBe(false);
  });
});
