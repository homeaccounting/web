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

function Wrapper({ selected }: { selected: TransactionResponse[] }) {
  const [open, setOpen] = useState(true);
  return (
    <AuthProvider>
      <MergeTransactionsDialog open={open} onOpenChange={setOpen} selected={selected} />
    </AuthProvider>
  );
}

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
});

describe('MergeTransactionsDialog', () => {
  it('lists every selected row and defaults the survivor to the most recent by date', () => {
    const selected = [
      expenseOf('A', 'Coffee', 4, { date: '2026-04-20T08:00:00Z' }),
      expenseOf('B', 'Pastry', 6, { date: '2026-04-27T08:00:00Z' }), // most recent → survivor
      expenseOf('C', 'Bagel', 3, { date: '2026-04-25T08:00:00Z' }),
    ];
    renderWithProviders(<Wrapper selected={selected} />, { initialPath: '/' });

    // All three rows are present as survivor radios.
    expect(screen.getByRole('radio', { name: /Coffee/ })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Bagel/ })).toBeInTheDocument();
    // The most recent (Pastry) is the default survivor.
    expect(screen.getByRole('radio', { name: /Pastry/ })).toBeChecked();
  });

  it('shows the combined total of all selected rows and the cancel count', () => {
    const selected = [expenseOf('A', 'Coffee', 4), expenseOf('B', 'Pastry', 6)];
    renderWithProviders(<Wrapper selected={selected} />, { initialPath: '/' });
    expect(screen.getByTestId('merge-total')).toHaveTextContent('€10.00');
    expect(screen.getByText(/1 transaction will be cancelled/i)).toBeInTheDocument();
  });

  it('merges the non-survivor rows into the chosen survivor and closes', async () => {
    const user = userEvent.setup();
    let captured: unknown;
    let calledId = '';
    server.use(
      http.post(`${apiBase}/api/transactions/:id/merge`, async ({ request, params }) => {
        calledId = params.id as string;
        captured = await request.json();
        return HttpResponse.json({ ...expenseOf('B', 'Pastry', 6), amendmentCount: 1 });
      }),
    );
    const selected = [
      expenseOf('A', 'Coffee', 4, { date: '2026-04-20T08:00:00Z' }),
      expenseOf('B', 'Pastry', 6, { date: '2026-04-27T08:00:00Z' }), // survivor
      expenseOf('C', 'Bagel', 3, { date: '2026-04-25T08:00:00Z' }),
    ];
    renderWithProviders(<Wrapper selected={selected} />, { initialPath: '/' });

    await user.click(screen.getByRole('button', { name: /^merge$/i }));

    await waitFor(() => expect(calledId).toBe('B'));
    expect(captured).toEqual({ sourceTransactionIds: ['A', 'C'] });
  });

  it('changing the survivor recomputes the merge target and sources', async () => {
    const user = userEvent.setup();
    let captured: unknown;
    let calledId = '';
    server.use(
      http.post(`${apiBase}/api/transactions/:id/merge`, async ({ request, params }) => {
        calledId = params.id as string;
        captured = await request.json();
        return HttpResponse.json({ ...expenseOf('A', 'Coffee', 4), amendmentCount: 1 });
      }),
    );
    const selected = [
      expenseOf('A', 'Coffee', 4, { date: '2026-04-20T08:00:00Z' }),
      expenseOf('B', 'Pastry', 6, { date: '2026-04-27T08:00:00Z' }), // default survivor
    ];
    renderWithProviders(<Wrapper selected={selected} />, { initialPath: '/' });

    // Pick Coffee as the survivor instead of the default (Pastry).
    await user.click(screen.getByRole('radio', { name: /Coffee/ }));
    await user.click(screen.getByRole('button', { name: /^merge$/i }));

    await waitFor(() => expect(calledId).toBe('A'));
    expect(captured).toEqual({ sourceTransactionIds: ['B'] });
  });

  it('blocks and explains when the selection introduces conflicting contacts', () => {
    const selected = [
      expenseOf('A', 'Coffee', 4, { contactId: 'k1' }),
      expenseOf('B', 'Pastry', 6, { contactId: 'k2' }),
    ];
    renderWithProviders(<Wrapper selected={selected} />, { initialPath: '/' });

    expect(screen.getByRole('button', { name: /^merge$/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/contact/i);
  });

  it('blocks and explains a different-currency selection', () => {
    const selected = [
      expenseOf('A', 'Coffee', 4),
      expenseOf('B', 'Fuel', 3, { sourceCurrency: 'USD', targetCurrency: 'USD' }),
    ];
    renderWithProviders(<Wrapper selected={selected} />, { initialPath: '/' });
    expect(screen.getByRole('button', { name: /^merge$/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/currency/i);
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
    const selected = [expenseOf('A', 'Coffee', 4), expenseOf('B', 'Pastry', 6)];
    renderWithProviders(<Wrapper selected={selected} />, { initialPath: '/' });

    await user.click(screen.getByRole('button', { name: /^merge$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/cannot merge/i);
    expect(screen.getByRole('button', { name: /^merge$/i })).toBeInTheDocument();
  });
});
