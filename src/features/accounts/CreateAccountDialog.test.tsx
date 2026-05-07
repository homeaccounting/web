import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { CreateAccountDialog } from './CreateAccountDialog';

const apiBase = 'http://localhost:8080';

function Wrapper() {
  const [open, setOpen] = useState(true);
  return (
    <AuthProvider>
      <CreateAccountDialog open={open} onOpenChange={setOpen} />
    </AuthProvider>
  );
}

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
});

describe('CreateAccountDialog', () => {
  it('renders default values (name empty, currency from configuration, balance 0, subtype cash)', async () => {
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    expect(await screen.findByRole('dialog', { name: /create account/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toHaveValue('');
    expect(screen.getByLabelText(/initial balance/i)).toHaveValue(0);
    // configurationFixture.defaultCurrency is 'USD'
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: /currency/i })).toHaveTextContent('USD'),
    );
  });

  it('blocks submission with an empty name and shows the inline error', async () => {
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.post(`${apiBase}/api/accounts`, () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await user.click(await screen.findByRole('button', { name: /^ok$/i }));
    expect(await screen.findByText(/name is required/i)).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('blocks submission with negative balance and no overdraft limit', async () => {
    const user = userEvent.setup();
    let called = false;
    server.use(
      http.post(`${apiBase}/api/accounts`, () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await user.type(screen.getByLabelText(/name/i), 'Test');
    await user.clear(screen.getByLabelText(/initial balance/i));
    await user.type(screen.getByLabelText(/initial balance/i), '-100');
    await user.click(await screen.findByRole('button', { name: /^ok$/i }));
    expect(await screen.findByText(/overdraft limit is required/i)).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('swaps subtype-specific fields when the type changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    // Default: cash → "Storage location" visible
    expect(await screen.findByLabelText(/storage location/i)).toBeInTheDocument();
    // Switch to bankAccount via the type Select
    await user.click(screen.getByRole('combobox', { name: /account type/i }));
    await user.click(screen.getByRole('option', { name: /bank account/i }));
    expect(await screen.findByLabelText(/bank name/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/storage location/i)).not.toBeInTheDocument();
  });

  it('happy path posts the right payload, refetches, navigates', async () => {
    const user = userEvent.setup();
    let postedBody: unknown = null;
    server.use(
      http.post(`${apiBase}/api/accounts`, async ({ request }) => {
        postedBody = await request.json();
        return HttpResponse.json(
          {
            id: 'new-id',
            name: 'Test',
            balance: 0,
            currency: 'USD',
            overdraftLimit: null,
            subtype: { type: 'cash' },
            version: 1,
          },
          { status: 201 },
        );
      }),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await user.type(screen.getByLabelText(/name/i), 'Test');
    await user.click(screen.getByRole('button', { name: /^ok$/i }));
    await waitFor(() => {
      expect(postedBody).toMatchObject({
        name: 'Test',
        currency: 'USD',
        initialBalance: 0,
        subtype: { type: 'cash' },
      });
    });
    // Dialog closed after success
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('maps backend fieldErrors onto inputs', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${apiBase}/api/accounts`, () =>
        HttpResponse.json(
          { message: 'Validation failed', fieldErrors: { name: 'Already taken' } },
          { status: 400 },
        ),
      ),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await user.type(screen.getByLabelText(/name/i), 'Test');
    await user.click(screen.getByRole('button', { name: /^ok$/i }));
    expect(await screen.findByText(/already taken/i)).toBeInTheDocument();
  });

  it('renders an inline alert on a 500 with no fieldErrors', async () => {
    const user = userEvent.setup();
    server.use(http.post(`${apiBase}/api/accounts`, () => new HttpResponse(null, { status: 500 })));
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await user.type(screen.getByLabelText(/name/i), 'Test');
    await user.click(screen.getByRole('button', { name: /^ok$/i }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('auto-expands "More options" when the server returns an overdraftLimit fieldError', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${apiBase}/api/accounts`, () =>
        HttpResponse.json(
          { message: 'Validation failed', fieldErrors: { overdraftLimit: 'too low' } },
          { status: 400 },
        ),
      ),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await user.type(screen.getByLabelText(/name/i), 'Test');
    await user.click(screen.getByRole('button', { name: /^ok$/i }));
    expect(await screen.findByLabelText(/overdraft limit/i)).toBeInTheDocument();
    expect(await screen.findByText(/too low/i)).toBeInTheDocument();
  });
});
