import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import { configurationFixture, foodCategoryId } from '@/test/fixtures';
import { ProfileDictionariesPane } from './ProfileDictionariesPane';

const apiBase = 'http://localhost:8080';
const configUrl = `${apiBase}/api/users/me/configuration`;

describe('ProfileDictionariesPane', () => {
  it('renders Categories (Income/Expense) and Labels cards from fixture', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(
      <AuthProvider>
        <ProfileDictionariesPane />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('Categories')).toBeInTheDocument());
    expect(screen.getAllByText('Labels').length).toBeGreaterThan(0);
    expect(screen.getByText('Income')).toBeInTheDocument();
    expect(screen.getByText('Expense')).toBeInTheDocument();
    expect(screen.getAllByText('Salary').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Food').length).toBeGreaterThan(0);
    expect(screen.getByText('Trip')).toBeInTheDocument();
  });

  it('renders the Default categories card even when banking is disabled', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    server.use(
      http.get(configUrl, () =>
        HttpResponse.json({ ...configurationFixture, bankingFeatureEnabled: false }),
      ),
    );
    renderWithProviders(
      <AuthProvider>
        <ProfileDictionariesPane />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('Default categories')).toBeInTheDocument());
    expect(screen.getByRole('combobox', { name: 'Default income category' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Default expense category' })).toBeInTheDocument();
  });

  it('saving a default category PUTs /configuration/defaults', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    let body: unknown = null;
    server.use(
      http.put(`${configUrl}/defaults`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ ...configurationFixture }, { status: 200 });
      }),
    );
    renderWithProviders(
      <AuthProvider>
        <ProfileDictionariesPane />
      </AuthProvider>,
    );
    const user = userEvent.setup();
    const row = await screen.findByRole('combobox', { name: 'Default expense category' });
    await user.click(row);
    await user.click(await screen.findByRole('option', { name: 'Food' }));
    const form = row.closest('form')!;
    await user.click(within(form).getByRole('button', { name: /save/i }));
    await waitFor(() => expect(body).toEqual({ defaultExpenseCategory: foodCategoryId }));
  });
});
