import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useLocation } from 'react-router-dom';
import { server } from '@/test/server';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { renderWithProviders } from '@/test/utils';
import { ReportsPane } from './ReportsPane';

const apiBase = 'http://localhost:8080';
const signIn = () => saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });

function LocationSearch() {
  const { search } = useLocation();
  return <div data-testid="search">{search}</div>;
}

const renderPane = (initialPath = '/reports') =>
  renderWithProviders(
    <AuthProvider>
      <ReportsPane />
      <LocationSearch />
    </AuthProvider>,
    { initialPath },
  );

describe('ReportsPane', () => {
  beforeEach(() => localStorage.clear());

  it('shows the cash-flow reports and a period selector by default', async () => {
    signIn();
    renderPane();
    expect(await screen.findByText('Income vs. expense')).toBeInTheDocument();
    expect(await screen.findByText('Food')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /period/i })).toBeInTheDocument();
    // Net worth lives on its own tab, so it is not mounted here.
    expect(screen.queryByText('Checking')).not.toBeInTheDocument();
  });

  it('shows the net-worth report and no period selector on the net-worth tab', async () => {
    signIn();
    renderPane();
    await userEvent.click(screen.getByRole('tab', { name: /net worth/i }));
    expect(await screen.findByText('Checking')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /period/i })).not.toBeInTheDocument();
  });

  it('reflects the selected tab in the URL', async () => {
    signIn();
    renderPane();
    await screen.findByText('Income vs. expense');
    await userEvent.click(screen.getByRole('tab', { name: /net worth/i }));
    await waitFor(() =>
      expect(screen.getByTestId('search').textContent).toContain('tab=net-worth'),
    );
  });

  it('restores the net-worth tab from the URL', async () => {
    signIn();
    renderPane('/reports?tab=net-worth');
    expect(await screen.findByText('Checking')).toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: /period/i })).not.toBeInTheDocument();
  });

  it('restores the last-used tab and period from localStorage when the URL is silent', async () => {
    signIn();
    localStorage.setItem(
      'ha.reports.lastView',
      JSON.stringify({ tab: 'net-worth', period: 'this-year' }),
    );
    renderPane();
    expect(await screen.findByText('Checking')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /net worth/i })).toHaveAttribute('data-state', 'active');
  });

  it('restores a preset period from the URL', async () => {
    signIn();
    const seen: string[] = [];
    server.use(
      http.get(`${apiBase}/api/reports/spending-by-category`, ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('from') ?? 'open');
        return HttpResponse.json({ categories: [], total: { amount: 0, currency: 'USD' } });
      }),
    );
    renderPane('/reports?period=all-time');
    // All time => open range (from param omitted).
    await waitFor(() => expect(seen).toContain('open'));
  });

  it('refetches spending when the period changes', async () => {
    signIn();
    const seen: string[] = [];
    server.use(
      http.get(`${apiBase}/api/reports/spending-by-category`, ({ request }) => {
        seen.push(new URL(request.url).searchParams.get('from') ?? 'open');
        return HttpResponse.json({ categories: [], total: { amount: 0, currency: 'USD' } });
      }),
    );
    renderPane();
    await screen.findByText(/no spending/i);
    await userEvent.click(screen.getByRole('combobox', { name: /period/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'All time' }));
    await waitFor(() => expect(seen).toContain('open'));
  });
});
