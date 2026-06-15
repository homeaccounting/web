import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { CloseAccountDialog } from './CloseAccountDialog';
import { accountFixture } from '@/test/fixtures';

const apiBase = 'http://localhost:8080';

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
});

function renderDialog(onOpenChange = vi.fn()) {
  renderWithProviders(
    <AuthProvider>
      <CloseAccountDialog open onOpenChange={onOpenChange} account={accountFixture} />
    </AuthProvider>,
  );
  return { onOpenChange };
}

describe('CloseAccountDialog', () => {
  it('renders the confirmation prompt when open', () => {
    renderDialog();
    expect(screen.getByText('Close this account?')).toBeInTheDocument();
  });

  it('confirming closes the account and dismisses the dialog', async () => {
    let hit: string | undefined;
    server.use(
      http.post(`${apiBase}/api/accounts/:id/close`, ({ params }) => {
        hit = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { onOpenChange } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(hit).toBe('a1'));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('shows the backend error inline and stays open on failure', async () => {
    server.use(
      http.post(`${apiBase}/api/accounts/:id/close`, () =>
        HttpResponse.json(
          { status: 400, code: 'ACCOUNT_ERROR', message: 'Account command rejected by domain' },
          { status: 400 },
        ),
      ),
    );
    const { onOpenChange } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByText('Account command rejected by domain')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
