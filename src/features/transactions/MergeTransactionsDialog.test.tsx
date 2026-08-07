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
    bankProviderCategory: null,
    bankProviderContact: null,
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

// A matching income+expense transfer pair on two different accounts.
const accEx = '00000000-0000-0000-0000-0000000000ex';
const accIn = '00000000-0000-0000-0000-0000000000in';

function transferExpense(over: Partial<TransactionResponse> = {}): TransactionResponse {
  return expenseTx({
    id: 'EXP',
    description: 'Sent to savings',
    sourceAccountId: accEx,
    sourceAmount: 100,
    sourceCurrency: 'EUR',
    targetAmount: 100,
    targetCurrency: 'EUR',
    date: '2026-04-27T08:00:00Z',
    ...over,
  });
}

function transferIncome(over: Partial<TransactionResponse> = {}): TransactionResponse {
  return expenseTx({
    id: 'INC',
    description: 'Received from checking',
    transactionType: 'income',
    sourceAccountId: 'external-1',
    targetAccountId: accIn,
    sourceAmount: 100,
    sourceCurrency: 'EUR',
    targetAmount: 100,
    targetCurrency: 'EUR',
    allocations: {
      incomes: [{ categoryId: 'c', amount: { amount: 100, currency: 'EUR' } }],
      expenses: [],
    },
    date: '2026-04-27T08:00:00Z',
    ...over,
  });
}

// Two accounts so the From→To summary resolves distinct labels.
function useTwoAccounts() {
  server.use(
    http.get(`${apiBase}/api/accounts`, () =>
      HttpResponse.json({
        accounts: [
          {
            id: accEx,
            name: 'Checking',
            balance: 0,
            currency: 'EUR',
            overdraftLimit: null,
            subtype: { type: 'bankAccount', bankName: 'ACME' },
            status: 'Opened',
            role: 'owner',
            version: 1,
          },
          {
            id: accIn,
            name: 'Savings',
            balance: 0,
            currency: 'EUR',
            overdraftLimit: null,
            subtype: { type: 'bankAccount', bankName: 'ACME' },
            status: 'Opened',
            role: 'owner',
            version: 1,
          },
        ],
        totalCount: 2,
      }),
    ),
  );
}

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

  it('renders a transfer summary (no survivor radios) for an income+expense pair', async () => {
    useTwoAccounts();
    renderWithProviders(<Wrapper selected={[transferIncome(), transferExpense()]} />, {
      initialPath: '/',
    });

    // From = the expense's account, To = the income's account (await accounts load).
    const summary = await screen.findByTestId('transfer-summary');
    await waitFor(() => expect(summary).toHaveTextContent('Checking'));
    expect(summary).toHaveTextContent('Savings');
    expect(summary).toHaveTextContent('€100.00');
    // No survivor picker in transfer mode — the income is always the survivor.
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('merges an income+expense pair into a transfer: posts the expense as source to the income id', async () => {
    const user = userEvent.setup();
    useTwoAccounts();
    let captured: unknown;
    let calledId = '';
    server.use(
      http.post(`${apiBase}/api/transactions/:id/merge`, async ({ request, params }) => {
        calledId = params.id as string;
        captured = await request.json();
        return HttpResponse.json({
          ...transferIncome(),
          transactionType: 'transfer',
          amendmentCount: 1,
        });
      }),
    );
    renderWithProviders(<Wrapper selected={[transferExpense(), transferIncome()]} />, {
      initialPath: '/',
    });

    await user.click(await screen.findByRole('button', { name: /transfer/i }));

    await waitFor(() => expect(calledId).toBe('INC'));
    expect(captured).toEqual({ sourceTransactionIds: ['EXP'] });
  });

  it('blocks and explains a same-account income+expense pair', () => {
    useTwoAccounts();
    renderWithProviders(
      <Wrapper selected={[transferIncome({ targetAccountId: accEx }), transferExpense()]} />,
      { initialPath: '/' },
    );
    expect(screen.getByRole('button', { name: /transfer|merge/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/two different accounts/i);
  });

  it('blocks and explains a non-matching income+expense pair (unequal amount)', () => {
    useTwoAccounts();
    renderWithProviders(
      <Wrapper
        selected={[transferIncome({ targetAmount: 100 }), transferExpense({ sourceAmount: 90 })]}
      />,
      { initialPath: '/' },
    );
    expect(screen.getByRole('button', { name: /transfer|merge/i })).toBeDisabled();
    expect(screen.getByRole('alert')).toHaveTextContent(/must match/i);
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
