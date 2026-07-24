import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { MergeTransactionsDialog } from './MergeTransactionsDialog';
import type { TransactionResponse } from '@/api/types';

const apiBase = 'http://localhost:8080';
const accountId = '00000000-0000-0000-0000-000000000001';

function expenseTx(over: Partial<TransactionResponse> = {}): TransactionResponse {
  return {
    id: 'x',
    sourceAccountId: accountId,
    targetAccountId: 'external-1',
    sourceAmount: 10,
    sourceCurrency: 'EUR',
    targetAmount: 10,
    targetCurrency: 'EUR',
    exchangeRate: null,
    description: 'Item',
    status: 'Completed',
    failureReason: null,
    transactionType: 'expense',
    allocations: {
      incomes: [],
      expenses: [{ categoryId: 'c', amount: { amount: 10, currency: 'EUR' } }],
    },
    date: '2026-04-27T08:00:00Z',
    labels: [],
    amendmentCount: 0,
    contactId: null,
    mcc: null,
    relations: [],
    ...over,
  };
}

const expenseOf = (
  id: string,
  description: string,
  amount: number,
  over: Partial<TransactionResponse> = {},
) =>
  expenseTx({
    id,
    description,
    allocations: {
      incomes: [],
      expenses: [{ categoryId: 'c', amount: { amount, currency: 'EUR' } }],
    },
    ...over,
  });

// Survivor (target).
const acting = expenseOf('A', 'Coffee', 4);

function Wrapper({
  acting: act,
  candidates,
}: {
  acting: TransactionResponse;
  candidates: TransactionResponse[];
}) {
  const [open, setOpen] = useState(true);
  return (
    <AuthProvider>
      <MergeTransactionsDialog
        open={open}
        onOpenChange={setOpen}
        acting={act}
        candidates={candidates}
      />
    </AuthProvider>
  );
}

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
});

describe('MergeTransactionsDialog', () => {
  it('lists only compatible candidates (same account/kind/currency, Completed, not the acting row)', () => {
    const candidates = [
      acting, // self — excluded
      expenseOf('B', 'Pastry', 6), // compatible
      expenseOf('C', 'Fuel', 3, { sourceCurrency: 'USD' }), // different currency — excluded
      expenseOf('D', 'Void', 5, { status: 'Cancelled' }), // cancelled — excluded
      expenseTx({
        id: 'E',
        description: 'Salary',
        transactionType: 'income',
        targetAccountId: accountId,
        allocations: {
          incomes: [{ categoryId: 'c', amount: { amount: 8, currency: 'EUR' } }],
          expenses: [],
        },
      }), // different kind — excluded
    ];
    renderWithProviders(<Wrapper acting={acting} candidates={candidates} />, { initialPath: '/' });

    expect(screen.getByRole('checkbox', { name: /Pastry/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Coffee/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Fuel/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Void/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Salary/ })).not.toBeInTheDocument();
  });

  it('updates the combined total as candidates are selected', async () => {
    const user = userEvent.setup();
    const candidates = [expenseOf('B', 'Pastry', 6), expenseOf('C', 'Bagel', 3)];
    renderWithProviders(<Wrapper acting={acting} candidates={candidates} />, { initialPath: '/' });

    // Acting alone = 4.
    expect(screen.getByTestId('merge-total')).toHaveTextContent('€4.00');
    await user.click(screen.getByRole('checkbox', { name: /Pastry/ }));
    expect(screen.getByTestId('merge-total')).toHaveTextContent('€10.00');
    await user.click(screen.getByRole('checkbox', { name: /Bagel/ }));
    expect(screen.getByTestId('merge-total')).toHaveTextContent('€13.00');
  });

  it('merge is disabled until at least one candidate is selected', async () => {
    const user = userEvent.setup();
    const candidates = [expenseOf('B', 'Pastry', 6)];
    renderWithProviders(<Wrapper acting={acting} candidates={candidates} />, { initialPath: '/' });

    expect(screen.getByRole('button', { name: /^merge$/i })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: /Pastry/ }));
    expect(screen.getByRole('button', { name: /^merge$/i })).toBeEnabled();
  });

  it('merges the selected candidates into the acting row and closes', async () => {
    const user = userEvent.setup();
    let captured: unknown;
    let calledId = '';
    server.use(
      http.post(`${apiBase}/api/transactions/:id/merge`, async ({ request, params }) => {
        calledId = params.id as string;
        captured = await request.json();
        return HttpResponse.json({ ...acting, amendmentCount: 1 });
      }),
    );
    const candidates = [expenseOf('B', 'Pastry', 6), expenseOf('C', 'Bagel', 3)];
    renderWithProviders(<Wrapper acting={acting} candidates={candidates} />, { initialPath: '/' });

    await user.click(screen.getByRole('checkbox', { name: /Pastry/ }));
    await user.click(screen.getByRole('checkbox', { name: /Bagel/ }));
    await user.click(screen.getByRole('button', { name: /^merge$/i }));

    await waitFor(() => expect(calledId).toBe('A'));
    expect(captured).toEqual({ sourceTransactionIds: ['B', 'C'] });
  });

  it('blocks and explains when a selection introduces conflicting contacts', async () => {
    const user = userEvent.setup();
    // acting has no contact; two candidates carry DIFFERENT contacts.
    const candidates = [
      expenseOf('B', 'Pastry', 6, { contactId: 'k1' }),
      expenseOf('C', 'Bagel', 3, { contactId: 'k2' }),
    ];
    renderWithProviders(<Wrapper acting={acting} candidates={candidates} />, { initialPath: '/' });

    await user.click(screen.getByRole('checkbox', { name: /Pastry/ }));
    await user.click(screen.getByRole('checkbox', { name: /Bagel/ }));

    expect(screen.getByRole('button', { name: /^merge$/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/contact/i);
  });

  it('surfaces a server error without closing', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${apiBase}/api/transactions/:id/merge`, () =>
        HttpResponse.json(
          { message: 'Validation failed', fieldErrors: { sourceTransactionIds: 'Cannot merge' } },
          { status: 422 },
        ),
      ),
    );
    const candidates = [expenseOf('B', 'Pastry', 6)];
    renderWithProviders(<Wrapper acting={acting} candidates={candidates} />, { initialPath: '/' });

    await user.click(screen.getByRole('checkbox', { name: /Pastry/ }));
    await user.click(screen.getByRole('button', { name: /^merge$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot merge/i);
    expect(screen.getByRole('button', { name: /^merge$/i })).toBeInTheDocument();
  });

  it('shows an empty-state when there are no compatible candidates', () => {
    renderWithProviders(<Wrapper acting={acting} candidates={[acting]} />, { initialPath: '/' });
    expect(screen.getByText(/no compatible transactions/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^merge$/i })).toBeDisabled();
  });
});
