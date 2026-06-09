import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import type { BankConnectionDTO } from '@/api/types';
import { BankConnectionDialog } from './BankConnectionDialog';

const apiBase = 'http://localhost:8080';
const connectionsUrl = `${apiBase}/api/users/me/configuration/banking/connections`;

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

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
});

describe('BankConnectionDialog', () => {
  it('create requires a token: blank token shows an error and fires no POST', async () => {
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.post(connectionsUrl, () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await user.type(await screen.findByLabelText(/name/i), 'My bank');
    await user.click(screen.getByRole('button', { name: /^ok$/i }));
    expect(await screen.findByText(/token is required/i)).toBeInTheDocument();
    expect(called).toBe(false);
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
    await user.type(screen.getByLabelText(/token/i), 'secret-token');
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
    await user.type(await screen.findByLabelText(/token/i), 'new-token');
    await user.click(screen.getByRole('button', { name: /^ok$/i }));
    await waitFor(() => {
      expect(tokenBody).toEqual({ token: 'new-token' });
    });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
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
    await user.type(screen.getByLabelText(/token/i), 'secret-token');
    await user.click(screen.getByRole('button', { name: /^ok$/i }));
    expect(await screen.findByText(/already taken/i)).toBeInTheDocument();
  });
});
