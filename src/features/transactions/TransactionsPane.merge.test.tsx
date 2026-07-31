import { describe, expect, it, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { TransactionsPane } from './TransactionsPane';
import { transactionFixture } from '@/test/fixtures';
import type { TransactionResponse } from '@/api/types';

const apiBase = 'http://localhost:8080';

function ui() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/accounts/:id" element={<TransactionsPane />} />
      </Routes>
    </AuthProvider>
  );
}

const coffee: TransactionResponse = {
  ...transactionFixture,
  id: 't-coffee',
  description: 'Coffee',
};
const pastry: TransactionResponse = {
  ...transactionFixture,
  id: 't-pastry',
  description: 'Pastry',
};

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  server.use(
    http.get(`${apiBase}/api/transactions`, () =>
      HttpResponse.json({ transactions: [coffee, pastry], totalCount: 2, limit: 50, offset: 0 }),
    ),
  );
});

async function select(user: ReturnType<typeof userEvent.setup>, description: string) {
  await user.click(
    screen.getByRole('checkbox', { name: new RegExp(`select ${description}`, 'i') }),
  );
}

describe('TransactionsPane — selection-driven merge', () => {
  it('renders a selection checkbox per row', async () => {
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText('Coffee');
    expect(screen.getByRole('checkbox', { name: /select coffee/i })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /select pastry/i })).toBeInTheDocument();
  });

  it('selecting a row via its checkbox does not open the edit dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText('Coffee');
    await select(user, 'coffee');
    expect(screen.getByRole('checkbox', { name: /select coffee/i })).toBeChecked();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('header checkbox selects and clears every row on the page', async () => {
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText('Coffee');

    await user.click(screen.getByRole('checkbox', { name: /select all/i }));
    expect(screen.getByRole('checkbox', { name: /select coffee/i })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /select pastry/i })).toBeChecked();
    expect(await screen.findByRole('region', { name: /selection actions/i })).toHaveTextContent(
      /2 selected/i,
    );

    await user.click(screen.getByRole('checkbox', { name: /select all/i }));
    expect(screen.getByRole('checkbox', { name: /select coffee/i })).not.toBeChecked();
  });

  it('no longer offers "Merge into this…" in a row context menu', async () => {
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    const row = (await screen.findByText('Coffee')).closest('tr')!;
    await user.pointer({ keys: '[MouseRight]', target: row });
    await screen.findByRole('menuitem', { name: /edit/i });
    expect(screen.queryByRole('menuitem', { name: /merge into this/i })).not.toBeInTheDocument();
  });

  it('selecting two rows reveals the action bar and opens the merge dialog', async () => {
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText('Coffee');

    await select(user, 'coffee');
    await select(user, 'pastry');

    const bar = await screen.findByRole('region', { name: /selection actions/i });
    expect(bar).toHaveTextContent(/2 selected/i);
    await user.click(screen.getByRole('button', { name: /merge selected/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/merge 2 transactions/i);
    // Both rows appear as survivor radios.
    expect(screen.getByRole('radio', { name: /Coffee/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Pastry/ })).toBeInTheDocument();
  });

  it('merges an income+expense pair on different accounts into a transfer', async () => {
    const user = userEvent.setup();
    const transferIn: TransactionResponse = {
      ...transactionFixture,
      id: 't-in',
      description: 'Transfer in',
      transactionType: 'income',
      sourceAccountId: 'external',
      targetAccountId: 'a-savings',
      sourceAmount: 100,
      sourceCurrency: 'USD',
      targetAmount: 100,
      targetCurrency: 'USD',
      allocations: {
        incomes: [{ categoryId: 'c', amount: { amount: 100, currency: 'USD' } }],
        expenses: [],
      },
    };
    const transferOut: TransactionResponse = {
      ...transactionFixture,
      id: 't-out',
      description: 'Transfer out',
      transactionType: 'expense',
      sourceAccountId: 'a-checking',
      targetAccountId: 'external',
      sourceAmount: 100,
      sourceCurrency: 'USD',
      targetAmount: 100,
      targetCurrency: 'USD',
      allocations: {
        incomes: [],
        expenses: [{ categoryId: 'c', amount: { amount: 100, currency: 'USD' } }],
      },
    };
    let captured: unknown;
    let calledId = '';
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [transferIn, transferOut],
          totalCount: 2,
          limit: 50,
          offset: 0,
        }),
      ),
      http.post(`${apiBase}/api/transactions/:id/merge`, async ({ request, params }) => {
        calledId = params.id as string;
        captured = await request.json();
        return HttpResponse.json({ ...transferIn, transactionType: 'transfer', amendmentCount: 1 });
      }),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText('Transfer in');

    await select(user, 'transfer in');
    await select(user, 'transfer out');
    await user.click(await screen.findByRole('button', { name: /merge selected/i }));

    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent(/merge into transfer/i);
    await user.click(await screen.findByRole('button', { name: /make transfer/i }));

    // Income is the survivor (:id); the expense is the single cancelled source.
    await waitFor(() => expect(calledId).toBe('t-in'));
    expect(captured).toEqual({ sourceTransactionIds: ['t-out'] });
  });

  it('merges the selected rows into the chosen survivor and clears the selection', async () => {
    const user = userEvent.setup();
    let captured: unknown;
    let calledId = '';
    server.use(
      http.post(`${apiBase}/api/transactions/:id/merge`, async ({ request, params }) => {
        calledId = params.id as string;
        captured = await request.json();
        return HttpResponse.json({ ...coffee, amendmentCount: 1 });
      }),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText('Coffee');

    await select(user, 'coffee');
    await select(user, 'pastry');
    await user.click(await screen.findByRole('button', { name: /merge selected/i }));

    // Same date → survivor defaults to the first row in window order (Coffee).
    await user.click(await screen.findByRole('button', { name: /^merge$/i }));

    await waitFor(() => expect(calledId).toBe('t-coffee'));
    expect(captured).toEqual({ sourceTransactionIds: ['t-pastry'] });
    // Selection cleared → the action bar is gone.
    await waitFor(() =>
      expect(screen.queryByRole('region', { name: /selection actions/i })).not.toBeInTheDocument(),
    );
  });
});
