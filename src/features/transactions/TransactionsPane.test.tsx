import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { TransactionsPane } from './TransactionsPane';
import { transactionFixture } from '@/test/fixtures';

const apiBase = 'http://localhost:8080';

function ui() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<TransactionsPane />} />
        <Route path="/accounts/:id" element={<TransactionsPane />} />
      </Routes>
    </AuthProvider>
  );
}

describe('TransactionsPane', () => {
  it('shows placeholder when no account selected', () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/' });
    expect(screen.getByText(/select an account/i)).toBeInTheDocument();
  });

  it('renders transactions for the selected account', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    expect(await screen.findByText(transactionFixture.description)).toBeInTheDocument();
  });

  it('renders the category name resolved from the configuration dictionary', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    expect(await screen.findByText('Food')).toBeInTheDocument();
    expect(screen.queryByText(transactionFixture.category as string)).not.toBeInTheDocument();
  });

  it('renders empty state when there are no transactions', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({ transactions: [], totalCount: 0 }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    expect(await screen.findByText(/no transactions yet/i)).toBeInTheDocument();
  });

  it('fetches with the accountId from the URL', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const calledFor: string[] = [];
    server.use(
      http.get(`${apiBase}/api/transactions`, ({ request }) => {
        const url = new URL(request.url);
        calledFor.push(url.searchParams.get('accountId') ?? '');
        return HttpResponse.json({ transactions: [], totalCount: 0 });
      }),
    );
    const first = renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await waitFor(() => expect(calledFor).toContain('a1'));
    first.unmount();
    renderWithProviders(ui(), { initialPath: '/accounts/a2' });
    await waitFor(() => expect(calledFor).toContain('a2'));
  });
});
