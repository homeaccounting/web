import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { configurationFixture } from '@/test/fixtures';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import { toast } from '@/lib/toast';
import { ProfileGeneralPane } from './ProfileGeneralPane';

vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

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
const countryCombo = () => screen.getByRole('combobox', { name: 'Country' });
const languageCombo = () => screen.getByRole('combobox', { name: 'Language' });

describe('ProfileGeneralPane', () => {
  it('renders both selects with current currencies', async () => {
    setup();
    await waitFor(() => expect(defaultCombo()).toHaveTextContent('USD'));
    expect(baseCombo()).toHaveTextContent('USD');
  });

  it('reflects a country-cascaded default-currency change without a reload', async () => {
    // Changing country applies a regional preset that can change the default
    // currency server-side; useSetCountry refetches config. The Default currency
    // row must follow the refetched value, not stay stuck on its mount-time value.
    let countryChanged = false;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/country`, () => {
        countryChanged = true;
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(`${apiBase}/api/users/me/configuration`, () =>
        HttpResponse.json(
          countryChanged
            ? { ...configurationFixture, country: 'UA', defaultCurrency: 'UAH' }
            : configurationFixture,
        ),
      ),
    );
    setup();
    const user = userEvent.setup();
    await waitFor(() => expect(defaultCombo()).toHaveTextContent('USD'));

    await user.click(countryCombo());
    await user.click(await screen.findByRole('option', { name: 'Ukraine' }));

    await waitFor(() => expect(defaultCombo()).toHaveTextContent('UAH'));
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

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Updated.'));
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

  it('still shows the sharing ID when configuration fails to load, with a Retry button', async () => {
    server.use(
      http.get(`${apiBase}/api/users/me/configuration`, () =>
        HttpResponse.json({ message: 'boom' }, { status: 500 }),
      ),
    );
    setup();
    // Sharing-ID card depends only on the auth session, not configuration.
    expect(screen.getByText('Your sharing ID')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByText(/couldn.t load configuration/i)).toBeInTheDocument(),
    );
    expect(screen.getByRole('button', { name: /retry/i })).toBeInTheDocument();
  });

  describe('LocalizationSection', () => {
    it('renders Country and Language selects with options from useLocalizationOptions', async () => {
      setup();
      const user = userEvent.setup();
      await waitFor(() => expect(countryCombo()).toBeInTheDocument());
      expect(languageCombo()).toBeInTheDocument();

      // Language reflects the current configuration (en -> English).
      expect(languageCombo()).toHaveTextContent('English');
      // Country is null in the fixture -> placeholder.
      expect(countryCombo()).toHaveTextContent(/not set/i);

      await user.click(countryCombo());
      expect(await screen.findByRole('option', { name: 'Ukraine' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'United States' })).toBeInTheDocument();
      // Close the country listbox before opening the language one.
      await user.keyboard('{Escape}');

      await user.click(languageCombo());
      expect(await screen.findByRole('option', { name: 'English' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Ukrainian' })).toBeInTheDocument();
    });

    it('selecting a language fires PUT …/language immediately (no dialog)', async () => {
      let body: unknown = null;
      server.use(
        http.put(`${apiBase}/api/users/me/configuration/language`, async ({ request }) => {
          body = await request.json();
          return new HttpResponse(null, { status: 204 });
        }),
      );
      setup();
      const user = userEvent.setup();
      await waitFor(() => expect(languageCombo()).toBeInTheDocument());

      await user.click(languageCombo());
      await user.click(await screen.findByRole('option', { name: 'Ukrainian' }));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      await waitFor(() => expect(body).toEqual({ language: 'uk' }));
    });

    it('selecting a country fires PUT …/country immediately (no dialog)', async () => {
      let body: unknown = null;
      server.use(
        http.put(`${apiBase}/api/users/me/configuration/country`, async ({ request }) => {
          body = await request.json();
          return new HttpResponse(null, { status: 204 });
        }),
      );
      setup();
      const user = userEvent.setup();
      await waitFor(() => expect(countryCombo()).toBeInTheDocument());

      await user.click(countryCombo());
      await user.click(await screen.findByRole('option', { name: 'Ukraine' }));

      expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
      await waitFor(() => expect(body).toEqual({ country: 'UA' }));
    });
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
