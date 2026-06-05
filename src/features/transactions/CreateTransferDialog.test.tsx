import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { CreateTransferDialog } from './CreateTransferDialog';

const apiBase = 'http://localhost:8080';

// Two USD accounts for same-currency tests
const accountA = '00000000-0000-0000-0000-000000000001';
const accountB = '00000000-0000-0000-0000-000000000002';
// EUR account for cross-currency tests
const accountEur = '00000000-0000-0000-0000-000000000003';

const twoUsdAccounts = [
  {
    id: accountA,
    name: 'USD Checking',
    balance: 1000,
    currency: 'USD',
    overdraftLimit: null,
    subtype: null,
    version: 1,
  },
  {
    id: accountB,
    name: 'USD Savings',
    balance: 500,
    currency: 'USD',
    overdraftLimit: null,
    subtype: null,
    version: 1,
  },
];

const usdAndEurAccounts = [
  {
    id: accountA,
    name: 'USD Checking',
    balance: 1000,
    currency: 'USD',
    overdraftLimit: null,
    subtype: null,
    version: 1,
  },
  {
    id: accountEur,
    name: 'EUR Account',
    balance: 500,
    currency: 'EUR',
    overdraftLimit: null,
    subtype: null,
    version: 1,
  },
];

function setupAccounts(accounts: typeof twoUsdAccounts) {
  server.use(
    http.get(`${apiBase}/api/accounts`, () =>
      HttpResponse.json({ accounts, totalCount: accounts.length }),
    ),
  );
}

function Wrapper() {
  const [open, setOpen] = useState(true);
  return (
    <AuthProvider>
      <CreateTransferDialog open={open} onOpenChange={setOpen} />
    </AuthProvider>
  );
}

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  setupAccounts(twoUsdAccounts);
});

describe('CreateTransferDialog', () => {
  it('happy path: POSTs to /api/transactions/transfer and closes dialog', async () => {
    const user = userEvent.setup();
    let requestUrl = '';

    server.use(
      http.post(`${apiBase}/api/transactions/transfer`, ({ request }) => {
        requestUrl = request.url;
        return HttpResponse.json({
          id: 'tx-transfer-1',
          sourceAccountId: accountA,
          targetAccountId: accountB,
          sourceAmount: -100,
          sourceCurrency: 'USD',
          targetAmount: 100,
          targetCurrency: 'USD',
          exchangeRate: null,
          description: 'Transfer',
          status: 'Completed',
          failureReason: null,
          transactionType: 'transfer',
          category: null,
          date: '2026-06-01T00:00:00.000Z',
          labels: [],
        });
      }),
    );

    renderWithProviders(<Wrapper />, { initialPath: '/' });
    expect(await screen.findByRole('dialog', { name: /add transfer/i })).toBeInTheDocument();
    await screen.findByLabelText(/source account/i);

    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '100');
    await user.type(screen.getByLabelText(/description/i), 'Transfer');

    await user.click(screen.getByRole('button', { name: /add transfer/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(requestUrl).toContain('/api/transactions/transfer');
  });

  it('when currencies match, exchangeRate is omitted from the request payload', async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};

    server.use(
      http.post(`${apiBase}/api/transactions/transfer`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: 'tx-transfer-same',
          sourceAccountId: accountA,
          targetAccountId: accountB,
          sourceAmount: -50,
          sourceCurrency: 'USD',
          targetAmount: 50,
          targetCurrency: 'USD',
          exchangeRate: null,
          description: 'Move',
          status: 'Completed',
          failureReason: null,
          transactionType: 'transfer',
          category: null,
          date: '2026-06-01T00:00:00.000Z',
          labels: [],
        });
      }),
    );

    // Two USD accounts — exchange rate field should not render
    setupAccounts(twoUsdAccounts);

    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByRole('dialog', { name: /add transfer/i });
    await screen.findByLabelText(/source account/i);

    // Exchange rate field should NOT be visible for same-currency
    expect(screen.queryByLabelText(/exchange rate/i)).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '50');
    await user.type(screen.getByLabelText(/description/i), 'Move');

    await user.click(screen.getByRole('button', { name: /add transfer/i }));

    await waitFor(() => expect(Object.keys(capturedBody).length).toBeGreaterThan(0));
    expect(capturedBody.exchangeRate).toBeUndefined();
  });

  it('when currencies differ, exchange rate field renders and is included in payload', async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};

    server.use(
      http.post(`${apiBase}/api/transactions/transfer`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: 'tx-transfer-cross',
          sourceAccountId: accountA,
          targetAccountId: accountEur,
          sourceAmount: -100,
          sourceCurrency: 'USD',
          targetAmount: 92,
          targetCurrency: 'EUR',
          exchangeRate: 0.92,
          description: 'Cross-currency',
          status: 'Completed',
          failureReason: null,
          transactionType: 'transfer',
          category: null,
          date: '2026-06-01T00:00:00.000Z',
          labels: [],
        });
      }),
    );

    setupAccounts(usdAndEurAccounts);

    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByRole('dialog', { name: /add transfer/i });
    await screen.findByLabelText(/source account/i);

    // Exchange rate field should be visible because accounts have different currencies
    await waitFor(() => expect(screen.getByLabelText(/exchange rate/i)).toBeInTheDocument());

    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '100');
    await user.type(screen.getByLabelText(/description/i), 'Cross-currency');
    await user.clear(screen.getByLabelText(/exchange rate/i));
    await user.type(screen.getByLabelText(/exchange rate/i), '0.92');

    await user.click(screen.getByRole('button', { name: /add transfer/i }));

    await waitFor(() => expect(Object.keys(capturedBody).length).toBeGreaterThan(0));
    expect(capturedBody.exchangeRate).toBe(0.92);
  });

  it('field error surfaces under the named field', async () => {
    const user = userEvent.setup();

    server.use(
      http.post(`${apiBase}/api/transactions/transfer`, () =>
        HttpResponse.json(
          { message: 'Validation failed', fieldErrors: { amount: 'Must be positive' } },
          { status: 422 },
        ),
      ),
    );

    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByRole('dialog', { name: /add transfer/i });
    await screen.findByLabelText(/source account/i);

    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '100');
    await user.type(screen.getByLabelText(/description/i), 'Move');

    await user.click(screen.getByRole('button', { name: /add transfer/i }));

    expect(await screen.findByText(/must be positive/i)).toBeInTheDocument();
  });

  it('shows destructive alert banner for generic 500 error', async () => {
    const user = userEvent.setup();

    server.use(
      http.post(`${apiBase}/api/transactions/transfer`, () =>
        HttpResponse.json({ message: 'Boom' }, { status: 500 }),
      ),
    );

    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByRole('dialog', { name: /add transfer/i });
    await screen.findByLabelText(/source account/i);

    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '100');
    await user.type(screen.getByLabelText(/description/i), 'Move');

    await user.click(screen.getByRole('button', { name: /add transfer/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
  });
});
