import { describe, expect, it, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClientProvider } from '@tanstack/react-query';
import { http, HttpResponse, delay } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { makeQueryClient } from '@/test/utils';
import { configurationFixture } from '@/test/fixtures';
import { OnboardingForm } from './OnboardingForm';

vi.mock('@/lib/toast', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn() }) }));

const apiBase = 'http://localhost:8080';

function renderForm() {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  const client = makeQueryClient();
  return render(<OnboardingForm />, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <AuthProvider>{children}</AuthProvider>
      </QueryClientProvider>
    ),
  });
}

describe('OnboardingForm', () => {
  it('persists the selected country (fires the preset cascade)', async () => {
    const user = userEvent.setup();
    let received: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/country`, async ({ request }) => {
        received = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderForm();
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Country' })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('combobox', { name: 'Country' }));
    await user.click(await screen.findByRole('option', { name: 'United States' }));
    await waitFor(() => expect(received).toEqual({ country: 'US' }));
  });

  it('reflects a preset-shifted currency from the refetched config', async () => {
    renderForm();
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Default currency' })).toHaveTextContent('USD'),
    );
    // Country change → backend applies preset → next config GET returns UAH.
    server.use(
      http.put(
        `${apiBase}/api/users/me/configuration/country`,
        () => new HttpResponse(null, { status: 204 }),
      ),
      http.get(`${apiBase}/api/users/me/configuration`, () =>
        HttpResponse.json({ ...configurationFixture, country: 'UA', defaultCurrency: 'UAH' }),
      ),
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('combobox', { name: 'Country' }));
    await user.click(await screen.findByRole('option', { name: 'Ukraine' }));
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Default currency' })).toHaveTextContent('UAH'),
    );
  });

  it('locks the other controls while the country preset cascade is in flight', async () => {
    const user = userEvent.setup();
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/country`, async () => {
        // Keep the cascade in flight long enough to observe the locked state.
        await delay(100);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderForm();
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Country' })).toBeInTheDocument(),
    );
    const language = screen.getByRole('combobox', { name: 'Language' });
    expect(language).toBeEnabled();

    await user.click(screen.getByRole('combobox', { name: 'Country' }));
    await user.click(await screen.findByRole('option', { name: 'United States' }));

    // While the cascade (PUT + refetch) is settling, the user must not be able
    // to change language — otherwise the cascade's refetch clobbers their pick.
    await waitFor(() => expect(language).toBeDisabled());
    // Once it settles, the controls unlock so a later choice sticks.
    await waitFor(() => expect(language).toBeEnabled());
  });

  it('persists the base currency with no confirmation dialog', async () => {
    const user = userEvent.setup();
    let received: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/base-currency`, async ({ request }) => {
        received = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderForm();
    await waitFor(() =>
      expect(screen.getByRole('combobox', { name: 'Base currency' })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('combobox', { name: 'Base currency' }));
    await user.click(await screen.findByRole('option', { name: 'EUR' }));
    await waitFor(() => expect(received).toEqual({ currency: 'EUR' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
