import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { bankingEnabledConfigurationFixture } from '@/test/fixtures';
import { ProfileBankingPane } from './ProfileBankingPane';

const apiBase = 'http://localhost:8080';
const configUrl = `${apiBase}/api/users/me/configuration`;

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  server.use(http.get(configUrl, () => HttpResponse.json(bankingEnabledConfigurationFixture)));
});

function render() {
  return renderWithProviders(
    <AuthProvider>
      <ProfileBankingPane />
    </AuthProvider>,
    { initialPath: '/' },
  );
}

describe('ProfileBankingPane', () => {
  it('renders a connection with name, masked token and mapped-account count', async () => {
    render();
    expect(await screen.findByText('Monobank')).toBeInTheDocument();
    expect(screen.getByText(/•••• 3f2/)).toBeInTheDocument();
    // accountMap is empty in the fixture → 0 mapped accounts
    expect(screen.getByText(/0 mapped/i)).toBeInTheDocument();
  });

  it('toggling the enabled Switch PUTs to the connection endpoint', async () => {
    const user = userEvent.setup();
    let putBody: unknown = null;
    server.use(
      http.put(`${configUrl}/banking/connections/:id`, async ({ request }) => {
        putBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    render();
    const sw = await screen.findByRole('switch');
    await user.click(sw);
    await waitFor(() => expect(putBody).toEqual({ enabled: false }));
  });

  it('Add connection opens the dialog', async () => {
    const user = userEvent.setup();
    render();
    await screen.findByText('Monobank');
    await user.click(screen.getByRole('button', { name: /add connection/i }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });

  it('Remove confirms then DELETEs the connection', async () => {
    const user = userEvent.setup();
    let deleted = false;
    server.use(
      http.delete(`${configUrl}/banking/connections/:id`, () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    render();
    await screen.findByText('Monobank');
    await user.click(screen.getByRole('button', { name: /remove/i }));
    const dialog = await screen.findByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: /remove|delete/i }));
    await waitFor(() => expect(deleted).toBe(true));
  });

  it('no longer renders the Default categories card (moved to Dictionaries)', async () => {
    render();
    await screen.findByText('Monobank');
    expect(screen.queryByText('Default categories')).not.toBeInTheDocument();
  });

  it('shows an empty state when there are no connections', async () => {
    server.use(
      http.get(configUrl, () =>
        HttpResponse.json({
          ...bankingEnabledConfigurationFixture,
          banking: { ...bankingEnabledConfigurationFixture.banking, connections: [] },
        }),
      ),
    );
    render();
    expect(await screen.findByText(/no connections/i)).toBeInTheDocument();
  });
});
