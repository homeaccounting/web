import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { server } from '@/test/server';
import { renderWithProviders, makeQueryClient } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { EditAccountDialog } from './EditAccountDialog';
import type { AccountResponse } from '@/api/types';
import type { QueryClient } from '@tanstack/react-query';

const apiBase = 'http://localhost:8080';

const fixture: AccountResponse = {
  id: 'a1',
  name: 'Savings',
  balance: 100,
  currency: 'USD',
  overdraftLimit: null,
  subtype: { type: 'cash', storageLocation: 'wallet' },
  status: 'Opened',
  role: 'owner',
  version: 1,
};

function ui(account: AccountResponse, onOpenChange: (open: boolean) => void = () => {}) {
  return (
    <AuthProvider>
      <EditAccountDialog open onOpenChange={onOpenChange} account={account} />
    </AuthProvider>
  );
}

function seed(qc: QueryClient, account: AccountResponse) {
  qc.setQueryData(['accounts'], [account]);
}

let requestPaths: string[] = [];

beforeEach(() => {
  requestPaths = [];
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  server.use(
    http.put(`${apiBase}/api/accounts/:id/name`, ({ request }) => {
      requestPaths.push(new URL(request.url).pathname);
      return new HttpResponse(null, { status: 200 });
    }),
    http.put(`${apiBase}/api/accounts/:id/overdraft-limit`, ({ request }) => {
      requestPaths.push(new URL(request.url).pathname);
      return new HttpResponse(null, { status: 200 });
    }),
    http.put(`${apiBase}/api/accounts/:id/type`, ({ request }) => {
      requestPaths.push(new URL(request.url).pathname);
      return new HttpResponse(null, { status: 200 });
    }),
  );
});

describe('EditAccountDialog', () => {
  it('opens with values populated from the account', async () => {
    const qc = makeQueryClient();
    seed(qc, fixture);
    renderWithProviders(ui(fixture), { queryClient: qc });
    expect(await screen.findByRole('dialog', { name: /edit account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toHaveValue('Savings');
    expect(screen.getByLabelText(/currency/i)).toBeDisabled();
  });

  it('submitting empty name shows field error and does not call API', async () => {
    const qc = makeQueryClient();
    seed(qc, fixture);
    let called = false;
    server.use(
      http.put(`${apiBase}/api/accounts/a1/name`, () => {
        called = true;
        return new HttpResponse(null, { status: 200 });
      }),
    );
    renderWithProviders(ui(fixture), { queryClient: qc });
    const nameInput = await screen.findByLabelText(/name/i);
    await userEvent.clear(nameInput);
    await userEvent.click(screen.getByRole('button', { name: /^ok$/i }));
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('editing only the name fires exactly one PUT to /name and closes the dialog', async () => {
    const qc = makeQueryClient();
    seed(qc, fixture);
    const onOpenChange = vi.fn();
    renderWithProviders(ui(fixture, onOpenChange), { queryClient: qc });
    const nameInput = await screen.findByLabelText(/name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'New Name');
    await userEvent.click(screen.getByRole('button', { name: /^ok$/i }));
    await waitFor(() => {
      expect(requestPaths).toEqual(['/api/accounts/a1/name']);
    });
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('editing name + overdraft fires two PUTs in order: /name then /overdraft-limit', async () => {
    const qc = makeQueryClient();
    seed(qc, fixture);
    renderWithProviders(ui(fixture), { queryClient: qc });
    const nameInput = await screen.findByLabelText(/name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'New Name');
    await userEvent.click(screen.getByRole('button', { name: /more options/i }));
    const overdraftInput = await screen.findByLabelText(/overdraft limit/i);
    await userEvent.type(overdraftInput, '50');
    await userEvent.click(screen.getByRole('button', { name: /^ok$/i }));
    await waitFor(() => {
      expect(requestPaths).toEqual(['/api/accounts/a1/name', '/api/accounts/a1/overdraft-limit']);
    });
  });

  it('editing the subtype type fires the subtype PUT with the new type body', async () => {
    const qc = makeQueryClient();
    seed(qc, fixture);
    let typeBody: unknown = null;
    server.use(
      http.put(`${apiBase}/api/accounts/a1/type`, async ({ request }) => {
        typeBody = await request.json();
        return new HttpResponse(null, { status: 200 });
      }),
    );
    renderWithProviders(ui(fixture), { queryClient: qc });
    await screen.findByLabelText(/name/i);
    await userEvent.click(screen.getByRole('combobox', { name: /account type/i }));
    await userEvent.click(screen.getByRole('option', { name: /bank account/i }));
    await userEvent.click(screen.getByRole('button', { name: /^ok$/i }));
    await waitFor(() => {
      expect(typeBody).toMatchObject({ subtype: { type: 'bankAccount' } });
    });
  });

  it('maps server fieldErrors onto inputs; dialog stays open', async () => {
    const qc = makeQueryClient();
    seed(qc, fixture);
    const onOpenChange = vi.fn();
    server.use(
      http.put(`${apiBase}/api/accounts/a1/name`, () =>
        HttpResponse.json(
          { message: 'Validation failed', fieldErrors: { name: 'Already taken' } },
          { status: 400 },
        ),
      ),
    );
    renderWithProviders(ui(fixture, onOpenChange), { queryClient: qc });
    const nameInput = await screen.findByLabelText(/name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'New Name');
    await userEvent.click(screen.getByRole('button', { name: /^ok$/i }));
    expect(await screen.findByText(/already taken/i)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('partial save: rename succeeds, overdraft fails — banner shown, name persisted in cache and form', async () => {
    const qc = makeQueryClient();
    seed(qc, fixture);
    server.use(
      http.put(`${apiBase}/api/accounts/a1/overdraft-limit`, ({ request }) => {
        requestPaths.push(new URL(request.url).pathname);
        return new HttpResponse(null, { status: 500 });
      }),
    );
    const onOpenChange = vi.fn();
    renderWithProviders(ui(fixture, onOpenChange), { queryClient: qc });
    const nameInput = await screen.findByLabelText(/name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'New Name');
    await userEvent.click(screen.getByRole('button', { name: /more options/i }));
    const overdraftInput = await screen.findByLabelText(/overdraft limit/i);
    await userEvent.type(overdraftInput, '50');
    await userEvent.click(screen.getByRole('button', { name: /^ok$/i }));
    // Wait for both calls to have been attempted (name OK then overdraft 500).
    await waitFor(() => {
      expect(requestPaths).toEqual(['/api/accounts/a1/name', '/api/accounts/a1/overdraft-limit']);
    });
    // Banner shows.
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    // Dialog stays open (no onOpenChange(false)).
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
    // Cache patched with the new name.
    const cached = qc.getQueryData<AccountResponse[]>(['accounts']);
    expect(cached?.[0]?.name).toBe('New Name');
    // Form input still shows the new name (the user's typed value is preserved
    // because we deliberately do not remount RHF — that would also discard
    // their pending overdraft edit).
    expect(screen.getByLabelText(/name/i)).toHaveValue('New Name');
    // Second submit (no further user edits) — only the overdraft PUT fires.
    requestPaths.length = 0;
    await userEvent.click(screen.getByRole('button', { name: /^ok$/i }));
    await waitFor(() => {
      expect(requestPaths).toEqual(['/api/accounts/a1/overdraft-limit']);
    });
  });

  it('closing and reopening the dialog reflects the latest server state', async () => {
    const qc = makeQueryClient();
    seed(qc, fixture);

    function Wrapper() {
      const [open, setOpen] = useState(true);
      const cached = qc.getQueryData<AccountResponse[]>(['accounts']);
      const account = cached?.[0] ?? fixture;
      return (
        <AuthProvider>
          <EditAccountDialog open={open} onOpenChange={setOpen} account={account} />
          <button type="button" onClick={() => setOpen((v) => !v)}>
            toggle
          </button>
        </AuthProvider>
      );
    }

    renderWithProviders(<Wrapper />, { queryClient: qc });
    const nameInput = await screen.findByLabelText(/name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Renamed');
    await userEvent.click(screen.getByRole('button', { name: /^ok$/i }));
    // Wait for the call to succeed and the cache to be patched, dialog closes.
    await waitFor(() => {
      expect(qc.getQueryData<AccountResponse[]>(['accounts'])?.[0]?.name).toBe('Renamed');
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    // Reopen the dialog.
    await userEvent.click(screen.getByRole('button', { name: /toggle/i }));
    expect(await screen.findByRole('dialog', { name: /edit account/i })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText(/name/i)).toHaveValue('Renamed');
    });
  });

  it('overdraft-limit PUT body includes currency matching the account currency', async () => {
    const qc = makeQueryClient();
    seed(qc, fixture);
    let overdraftBody: unknown = null;
    server.use(
      http.put(`${apiBase}/api/accounts/a1/overdraft-limit`, async ({ request }) => {
        overdraftBody = await request.json();
        return new HttpResponse(null, { status: 200 });
      }),
    );
    renderWithProviders(ui(fixture), { queryClient: qc });
    const nameInput = await screen.findByLabelText(/name/i);
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'New Name');
    await userEvent.click(screen.getByRole('button', { name: /more options/i }));
    const overdraftInput = await screen.findByLabelText(/overdraft limit/i);
    await userEvent.type(overdraftInput, '50');
    await userEvent.click(screen.getByRole('button', { name: /^ok$/i }));
    await waitFor(() => {
      expect(overdraftBody).toMatchObject({ currency: 'USD', overdraftLimit: 50 });
    });
  });
});
