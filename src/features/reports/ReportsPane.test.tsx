import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '@/test/server';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { renderWithProviders } from '@/test/utils';
import { ReportsPane } from './ReportsPane';

const apiBase = 'http://localhost:8080';
const signIn = () => saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });

describe('ReportsPane', () => {
  it('loads all three reports for the default (this-month) period', async () => {
    signIn();
    renderWithProviders(
      <AuthProvider>
        <ReportsPane />
      </AuthProvider>,
    );
    expect(await screen.findByText('Income vs. expense')).toBeInTheDocument();
    expect(await screen.findByText('Food')).toBeInTheDocument();
    expect(await screen.findByText('Checking')).toBeInTheDocument();
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
    renderWithProviders(
      <AuthProvider>
        <ReportsPane />
      </AuthProvider>,
    );
    await screen.findByText(/no spending/i);
    await userEvent.click(screen.getByRole('combobox', { name: /period/i }));
    await userEvent.click(await screen.findByRole('option', { name: 'All time' }));
    // All time => open range (from param omitted) => a new fetch recorded.
    await waitFor(() => expect(seen).toContain('open'));
  });
});
