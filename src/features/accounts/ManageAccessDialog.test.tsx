import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import type { AccountResponse } from '@/api/types';
import { ManageAccessDialog } from './ManageAccessDialog';

const apiBase = 'http://localhost:8080';

const account: AccountResponse = {
  id: 'acc-1',
  name: 'Checking',
  balance: 100,
  currency: 'USD',
  overdraftLimit: null,
  subtype: { type: 'cash' },
  status: 'Opened',
  role: 'owner',
  version: 1,
};

function Wrapper() {
  const [open, setOpen] = useState(true);
  return (
    <AuthProvider>
      <ManageAccessDialog open={open} onOpenChange={setOpen} account={account} />
    </AuthProvider>
  );
}

beforeEach(() => {
  saveSession({ token: 't', userId: 'me', email: 'me@example.com', expiresAt: 9e15 });
});

function mockAccessList(entries: unknown[]) {
  server.use(
    http.get(`${apiBase}/api/accounts/acc-1/access`, () => HttpResponse.json({ access: entries })),
  );
}

describe('ManageAccessDialog', () => {
  it('renders the current access list (owner + editor)', async () => {
    mockAccessList([
      { userId: 'me', role: 'owner', email: 'me@example.com' },
      { userId: 'u2', role: 'editor', email: 'editor@example.com' },
    ]);
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    expect(await screen.findByRole('dialog', { name: /manage access/i })).toBeInTheDocument();
    expect(await screen.findByText('me@example.com')).toBeInTheDocument();
    expect(await screen.findByText('editor@example.com')).toBeInTheDocument();
  });

  it('shows an error state with a Retry button when the access list fails to load, and Retry refetches', async () => {
    const user = userEvent.setup();
    let calls = 0;
    server.use(
      http.get(`${apiBase}/api/accounts/acc-1/access`, () => {
        calls += 1;
        return calls === 1
          ? new HttpResponse(null, { status: 500 })
          : HttpResponse.json({
              access: [{ userId: 'me', role: 'owner', email: 'me@example.com' }],
            });
      }),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText(/couldn.?t load access/i)).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: /^retry$/i });
    await user.click(retryButton);
    await waitFor(() => expect(calls).toBeGreaterThan(1));
    expect(await screen.findByText('me@example.com')).toBeInTheDocument();
  });

  it("disables the owner row's Revoke control", async () => {
    mockAccessList([
      { userId: 'me', role: 'owner', email: 'me@example.com' },
      { userId: 'u2', role: 'editor', email: 'editor@example.com' },
    ]);
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    const ownerRevoke = await screen.findByRole('button', { name: /revoke me@example\.com/i });
    expect(ownerRevoke).toBeDisabled();
    const editorRevoke = screen.getByRole('button', { name: /revoke editor@example\.com/i });
    expect(editorRevoke).toBeEnabled();
  });

  it('shares by user ID + role, POSTs the right body, and the list refetches', async () => {
    const user = userEvent.setup();
    let call = 0;
    server.use(
      http.get(`${apiBase}/api/accounts/acc-1/access`, () => {
        call += 1;
        return HttpResponse.json({
          access:
            call === 1
              ? [{ userId: 'me', role: 'owner', email: 'me@example.com' }]
              : [
                  { userId: 'me', role: 'owner', email: 'me@example.com' },
                  { userId: 'u3', role: 'editor', email: 'new@example.com' },
                ],
        });
      }),
    );
    let postedBody: unknown = null;
    server.use(
      http.post(`${apiBase}/api/accounts/acc-1/share`, async ({ request }) => {
        postedBody = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByText('me@example.com');
    await user.type(screen.getByLabelText(/user id/i), '11111111-1111-1111-1111-111111111111');
    await user.click(screen.getByRole('combobox', { name: /role/i }));
    await user.click(screen.getByRole('option', { name: /^editor$/i }));
    await user.click(screen.getByRole('button', { name: /^share$/i }));
    await waitFor(() =>
      expect(postedBody).toEqual({
        userId: '11111111-1111-1111-1111-111111111111',
        role: 'editor',
      }),
    );
    expect(await screen.findByText('new@example.com')).toBeInTheDocument();
  });

  it('renders "No user found with that ID." on a 404 share response', async () => {
    const user = userEvent.setup();
    mockAccessList([{ userId: 'me', role: 'owner', email: 'me@example.com' }]);
    server.use(
      http.post(`${apiBase}/api/accounts/acc-1/share`, () =>
        HttpResponse.json({ message: 'User not found' }, { status: 404 }),
      ),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByText('me@example.com');
    await user.type(screen.getByLabelText(/user id/i), '11111111-1111-1111-1111-111111111111');
    await user.click(screen.getByRole('button', { name: /^share$/i }));
    expect(await screen.findByText(/no user found with that id/i)).toBeInTheDocument();
  });

  it('revokes a non-owner row through the confirm step, DELETEing the right userId', async () => {
    const user = userEvent.setup();
    mockAccessList([
      { userId: 'me', role: 'owner', email: 'me@example.com' },
      { userId: 'u2', role: 'editor', email: 'editor@example.com' },
    ]);
    let capturedUserId: string | null = null;
    server.use(
      http.delete(`${apiBase}/api/accounts/acc-1/access/:userId`, ({ params }) => {
        capturedUserId = params.userId as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await user.click(await screen.findByRole('button', { name: /revoke editor@example\.com/i }));
    await user.click(await screen.findByRole('button', { name: /^revoke$/i }));
    await waitFor(() => expect(capturedUserId).toBe('u2'));
  });

  it('keeps the confirm dialog open and shows an inline error when revoke fails', async () => {
    const user = userEvent.setup();
    mockAccessList([
      { userId: 'me', role: 'owner', email: 'me@example.com' },
      { userId: 'u2', role: 'editor', email: 'editor@example.com' },
    ]);
    server.use(
      http.delete(
        `${apiBase}/api/accounts/acc-1/access/:userId`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await user.click(await screen.findByRole('button', { name: /revoke editor@example\.com/i }));
    const confirm = await screen.findByRole('button', { name: /^revoke$/i });
    await user.click(confirm);
    // Inline error alert surfaces and the confirm dialog stays open.
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^revoke$/i })).toBeInTheDocument();
  });

  it('maps a self-share error to the friendly message', async () => {
    const user = userEvent.setup();
    mockAccessList([{ userId: 'me', role: 'owner', email: 'me@example.com' }]);
    server.use(
      http.post(`${apiBase}/api/accounts/acc-1/share`, () =>
        HttpResponse.json(
          { code: 'CannotShareWithSelf', message: 'You cannot share with self' },
          { status: 409 },
        ),
      ),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByText('me@example.com');
    await user.type(screen.getByLabelText(/user id/i), '11111111-1111-1111-1111-111111111111');
    await user.click(screen.getByRole('button', { name: /^share$/i }));
    expect(
      await screen.findByText(/you can't share an account with yourself/i),
    ).toBeInTheDocument();
  });

  it('shows the schema validation message for an invalid UUID and does not POST', async () => {
    const user = userEvent.setup();
    mockAccessList([{ userId: 'me', role: 'owner', email: 'me@example.com' }]);
    let called = false;
    server.use(
      http.post(`${apiBase}/api/accounts/acc-1/share`, () => {
        called = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByText('me@example.com');
    await user.type(screen.getByLabelText(/user id/i), 'not-a-uuid');
    await user.click(screen.getByRole('button', { name: /^share$/i }));
    expect(await screen.findByText(/enter a valid user id/i)).toBeInTheDocument();
    expect(called).toBe(false);
  });
});
