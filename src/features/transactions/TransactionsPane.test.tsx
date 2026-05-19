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

  it('renders the AccountHeader above transactions when the account is loaded', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    const heading = await screen.findByRole('heading', { name: 'Checking' });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe('H2');
  });

  it('renders a header skeleton while the accounts list is still loading', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    server.use(http.get(`${apiBase}/api/accounts`, () => new Promise<never>(() => {})));
    const { container } = renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    // The header lives in a border-b container above the transactions area.
    await waitFor(() => {
      const headerArea = container.querySelector('.border-b');
      expect(headerArea).not.toBeNull();
      expect(headerArea?.querySelector('.animate-pulse')).not.toBeNull();
    });
    expect(screen.queryByRole('heading', { name: 'Checking' })).not.toBeInTheDocument();
  });

  it('renders an incoming-leg amount in the target currency when the viewed account is the target', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    server.use(
      http.get(`${apiBase}/api/accounts`, () =>
        HttpResponse.json({
          accounts: [
            {
              id: 'a-uah',
              name: 'UAH wallet',
              balance: 0,
              currency: 'UAH',
              overdraftLimit: null,
              subtype: { type: 'cash' },
              version: 1,
            },
          ],
          totalCount: 1,
        }),
      ),
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            {
              id: 'adj-1',
              sourceAccountId: 'ext-usd',
              targetAccountId: 'a-uah',
              sourceAmount: 100,
              sourceCurrency: 'USD',
              targetAmount: 4000,
              targetCurrency: 'UAH',
              exchangeRate: 40,
              description: 'Adjustment',
              status: 'Completed',
              failureReason: null,
              transferType: 'Adjustment',
              category: null,
              date: '2026-05-01T00:00:00.000Z',
              labels: [],
            },
          ],
          totalCount: 1,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a-uah' });
    expect(await screen.findByText(/4,000/)).toBeInTheDocument();
    expect(screen.queryByText(/100\.00/)).not.toBeInTheDocument();
    expect(screen.queryByText(/USD/)).not.toBeInTheDocument();
  });

  it('renders an outgoing-leg amount as negative in the source currency when the viewed account is the source', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    server.use(
      http.get(`${apiBase}/api/accounts`, () =>
        HttpResponse.json({
          accounts: [
            {
              id: 'a-uah',
              name: 'UAH wallet',
              balance: 0,
              currency: 'UAH',
              overdraftLimit: null,
              subtype: { type: 'cash' },
              version: 1,
            },
          ],
          totalCount: 1,
        }),
      ),
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            {
              id: 'adj-2',
              sourceAccountId: 'a-uah',
              targetAccountId: 'ext-usd',
              sourceAmount: 2000,
              sourceCurrency: 'UAH',
              targetAmount: 50,
              targetCurrency: 'USD',
              exchangeRate: 40,
              description: 'Adjustment',
              status: 'Completed',
              failureReason: null,
              transferType: 'Adjustment',
              category: null,
              date: '2026-05-01T00:00:00.000Z',
              labels: [],
            },
          ],
          totalCount: 1,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a-uah' });
    expect(await screen.findByText(/-.*2,000\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/USD/)).not.toBeInTheDocument();
  });

  it('renders no header when the account id is not in the loaded accounts list', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    server.use(
      http.get(`${apiBase}/api/accounts`, () => HttpResponse.json({ accounts: [], totalCount: 0 })),
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({ transactions: [], totalCount: 0 }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a99' });
    expect(await screen.findByText(/no transactions yet/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });
});
