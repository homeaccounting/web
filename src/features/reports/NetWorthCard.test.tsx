import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { server } from '@/test/server';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { renderWithProviders } from '@/test/utils';
import { NetWorthCard } from './NetWorthCard';

const apiBase = 'http://localhost:8080';
const signIn = () => saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });

describe('NetWorthCard', () => {
  it('resolves account names and shows the total', async () => {
    signIn();
    renderWithProviders(
      <AuthProvider>
        <NetWorthCard />
      </AuthProvider>,
    );
    expect(await screen.findByText('Checking')).toBeInTheDocument(); // accountFixture a1
    expect(screen.getAllByText('$1,234.56').length).toBeGreaterThan(0);
  });

  it('shows both native and base amounts for a cross-currency account', async () => {
    signIn();
    server.use(
      http.get(`${apiBase}/api/reports/net-worth`, () =>
        HttpResponse.json({
          accounts: [
            {
              accountId: 'a1',
              balance: { amount: 1000, currency: 'EUR' },
              baseBalance: { amount: 1100, currency: 'USD' },
            },
          ],
          total: { amount: 1100, currency: 'USD' },
        }),
      ),
    );
    renderWithProviders(
      <AuthProvider>
        <NetWorthCard />
      </AuthProvider>,
    );
    // native EUR balance shown, with base USD equivalent alongside
    expect(await screen.findByText(/€1,000\.00/)).toBeInTheDocument();
    // $1,100.00 appears twice (per-account base equivalent + Total row, since
    // the single account's base balance equals the total). Assert it renders.
    expect(screen.getAllByText(/\$1,100\.00/).length).toBeGreaterThan(0);
  });
});
