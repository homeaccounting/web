import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { configurationFixture } from '@/test/fixtures';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import { ProfileGeneralPane } from './ProfileGeneralPane';

const apiBase = 'http://localhost:8080';

function setup() {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  renderWithProviders(
    <AuthProvider>
      <ProfileGeneralPane />
    </AuthProvider>,
  );
}

const defaultCombo = () => screen.getByRole('combobox', { name: 'Default currency' });
const baseCombo = () => screen.getByRole('combobox', { name: 'Base currency' });

describe('ProfileGeneralPane', () => {
  it('renders both selects with current currencies', async () => {
    setup();
    await waitFor(() => expect(defaultCombo()).toHaveTextContent('USD'));
    expect(baseCombo()).toHaveTextContent('USD');
  });

  it('saves default currency and shows success status', async () => {
    let body: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/default-currency`, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    setup();
    const user = userEvent.setup();
    await waitFor(() => expect(defaultCombo()).toBeInTheDocument());

    await user.click(defaultCombo());
    await user.click(await screen.findByRole('option', { name: 'EUR' }));
    await user.click(screen.getAllByRole('button', { name: /save/i })[0]!);

    await waitFor(() => expect(screen.getByTestId('defaultCurrency-status')).toBeInTheDocument());
    expect(body).toEqual({ currency: 'EUR' });
  });

  it('base currency Save opens AlertDialog; Cancel does not send a request', async () => {
    let called = 0;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/base-currency`, () => {
        called += 1;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    setup();
    const user = userEvent.setup();
    await waitFor(() => expect(baseCombo()).toBeInTheDocument());

    await user.click(baseCombo());
    await user.click(await screen.findByRole('option', { name: 'EUR' }));
    await user.click(screen.getAllByRole('button', { name: /save/i })[1]!);

    await screen.findByRole('alertdialog');
    await user.click(screen.getByRole('button', { name: /cancel/i }));
    expect(called).toBe(0);
  });

  it('base currency Confirm fires the request', async () => {
    let body: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/base-currency`, async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    setup();
    const user = userEvent.setup();
    await waitFor(() => expect(baseCombo()).toBeInTheDocument());

    await user.click(baseCombo());
    await user.click(await screen.findByRole('option', { name: 'EUR' }));
    await user.click(screen.getAllByRole('button', { name: /save/i })[1]!);

    await user.click(await screen.findByRole('button', { name: /change base currency/i }));
    await waitFor(() => expect(body).toEqual({ currency: 'EUR' }));
  });

  it('renders base currency as disabled when baseCurrencyEditable is false', async () => {
    server.use(
      http.get(`${apiBase}/api/users/me/configuration`, () =>
        HttpResponse.json({ ...configurationFixture, baseCurrencyEditable: false }),
      ),
    );
    setup();
    await waitFor(() => expect(baseCombo()).toBeInTheDocument());
    expect(baseCombo()).toBeDisabled();
    expect(screen.getAllByRole('button', { name: /save/i })).toHaveLength(1);
    expect(
      screen.getByText(/locked because your books already contain transactions/i),
    ).toBeInTheDocument();
  });

  it('shows inline error from a 400 response', async () => {
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/default-currency`, () =>
        HttpResponse.json({ message: 'Bad currency' }, { status: 400 }),
      ),
    );
    setup();
    const user = userEvent.setup();
    await waitFor(() => expect(defaultCombo()).toBeInTheDocument());

    await user.click(defaultCombo());
    await user.click(await screen.findByRole('option', { name: 'EUR' }));
    await user.click(screen.getAllByRole('button', { name: /save/i })[0]!);

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent(/bad currency/i));
  });
});
