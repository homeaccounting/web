import { describe, expect, it, vi, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { TransactionsPane } from './TransactionsPane';
import { transactionFixture, tripLabelId, foodCategoryId } from '@/test/fixtures';
import type { TransactionResponse } from '@/api/types';

const apiBase = 'http://localhost:8080';

// Spy on the toast wrapper (same seam the profile tests use).
const toastSuccess = vi.fn();
const toastError = vi.fn();
vi.mock('@/lib/toast', () => ({
  toast: {
    success: (m: string) => {
      toastSuccess(m);
    },
    error: (m: string) => {
      toastError(m);
    },
  },
}));

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
const tea: TransactionResponse = { ...transactionFixture, id: 't-tea', description: 'Tea' };
const salary: TransactionResponse = {
  ...transactionFixture,
  id: 't-salary',
  description: 'Salary',
  transactionType: 'income',
  allocations: {
    incomes: [
      {
        categoryId: '00000000-0000-0000-0000-00000005a1a0',
        amount: { amount: 30, currency: 'USD' },
        comment: null,
      },
    ],
    expenses: [],
  },
};
// A refund-shaped income: transactionType 'income' but the only slice is a
// contra-expense (incomes empty) — must not be offered a bulk category.
const refund: TransactionResponse = {
  ...transactionFixture,
  id: 't-refund',
  description: 'Refund',
  transactionType: 'income',
  allocations: {
    incomes: [],
    expenses: [
      { categoryId: foodCategoryId, amount: { amount: 3.5, currency: 'USD' }, comment: null },
    ],
  },
};

function seed(txs: TransactionResponse[]) {
  server.use(
    http.get(`${apiBase}/api/transactions`, () =>
      HttpResponse.json({ transactions: txs, totalCount: txs.length, limit: 50, offset: 0 }),
    ),
  );
}

async function select(user: ReturnType<typeof userEvent.setup>, description: string) {
  await user.click(
    screen.getByRole('checkbox', { name: new RegExp(`select ${description}`, 'i') }),
  );
}
async function rightClick(user: ReturnType<typeof userEvent.setup>, description: string) {
  const row = screen.getByText(description).closest('tr')!;
  await user.pointer({ keys: '[MouseRight]', target: row });
}

beforeEach(() => {
  toastSuccess.mockClear();
  toastError.mockClear();
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
});

describe('TransactionsPane — bulk label/category menu', () => {
  it('right-clicking a selected row (2+) shows the bulk menu, not the single-row menu', async () => {
    const user = userEvent.setup();
    seed([coffee, pastry]);
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText('Coffee');
    await select(user, 'coffee');
    await select(user, 'pastry');
    await rightClick(user, 'Coffee');

    // The bulk menu is present ("Set labels" is bulk-only) and the single-row
    // "Edit" item is not.
    expect(await screen.findByRole('menuitem', { name: /set labels/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^edit$/i })).not.toBeInTheDocument();
  });

  it('right-clicking an unselected row collapses the selection and shows the single-row menu', async () => {
    const user = userEvent.setup();
    seed([coffee, pastry, tea]);
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText('Coffee');
    await select(user, 'coffee');
    await select(user, 'pastry');
    await rightClick(user, 'Tea'); // unselected

    // Single-row menu appears (Edit present)...
    expect(await screen.findByRole('menuitem', { name: /^edit$/i })).toBeInTheDocument();
    // ...and the selection collapsed to just the right-clicked row. (The floating
    // bar is aria-hidden behind the modal menu, so verify via the checkboxes once
    // the menu is dismissed.)
    await user.keyboard('{Escape}');
    await waitFor(() => {
      expect(screen.getByRole('checkbox', { name: /select tea/i })).toBeChecked();
      expect(screen.getByRole('checkbox', { name: /select coffee/i })).not.toBeChecked();
      expect(screen.getByRole('checkbox', { name: /select pastry/i })).not.toBeChecked();
    });
  });

  it('disables bulk Set category with a reason when income and expense are mixed', async () => {
    const user = userEvent.setup();
    seed([coffee, salary]);
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText('Coffee');
    await select(user, 'coffee');
    await select(user, 'salary');
    await rightClick(user, 'Coffee');

    expect(await screen.findByText(/one type to set a category/i)).toBeInTheDocument();
  });

  it('disables bulk Set category for refund-shaped incomes (contra-expense slice)', async () => {
    const user = userEvent.setup();
    seed([
      { ...refund, id: 't-refund-a', description: 'Refund Alpha' },
      { ...refund, id: 't-refund-b', description: 'Refund Beta' },
    ]);
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText('Refund Alpha');
    await select(user, 'refund alpha');
    await select(user, 'refund beta');
    await rightClick(user, 'Refund Alpha');

    expect(await screen.findByText(/split or refund transactions/i)).toBeInTheDocument();
  });

  it('bulk-adds a label to every selected row and shows a success toast', async () => {
    const user = userEvent.setup();
    seed([coffee, pastry]);
    const labelPuts: string[] = [];
    server.use(
      http.put(`${apiBase}/api/transactions/:id/labels`, async ({ request, params }) => {
        labelPuts.push(params.id as string);
        const body = (await request.json()) as { labels: string[] };
        return HttpResponse.json({ ...coffee, id: params.id as string, labels: body.labels });
      }),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText('Coffee');
    await select(user, 'coffee');
    await select(user, 'pastry');
    await rightClick(user, 'Coffee');

    await user.hover(await screen.findByRole('menuitem', { name: /set labels/i }));
    await user.pointer({
      keys: '[MouseLeft]',
      target: await screen.findByRole('option', { name: 'Trip' }),
    });

    await waitFor(() => expect(labelPuts).toHaveLength(2));
    expect(new Set(labelPuts)).toEqual(new Set(['t-coffee', 't-pastry']));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith('Updated 2 transactions.'));
  });

  it('reports a partial failure toast when one row fails', async () => {
    const user = userEvent.setup();
    seed([coffee, pastry]);
    server.use(
      http.put(`${apiBase}/api/transactions/:id/labels`, async ({ request, params }) => {
        if (params.id === 't-pastry') return new HttpResponse(null, { status: 500 });
        const body = (await request.json()) as { labels: string[] };
        return HttpResponse.json({ ...coffee, id: params.id as string, labels: body.labels });
      }),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText('Coffee');
    await select(user, 'coffee');
    await select(user, 'pastry');
    await rightClick(user, 'Coffee');

    await user.hover(await screen.findByRole('menuitem', { name: /set labels/i }));
    await user.pointer({
      keys: '[MouseLeft]',
      target: await screen.findByRole('option', { name: 'Trip' }),
    });

    await waitFor(() => expect(toastError).toHaveBeenCalledWith('Updated 1 of 2; 1 failed.'));
    expect(tripLabelId).toBeTruthy(); // sanity: fixture id present
  });
});
