import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { LinkTransactionDialog } from './LinkTransactionDialog';
import type { TransactionResponse } from '@/api/types';

const apiBase = 'http://localhost:8080';

const accountId = '00000000-0000-0000-0000-000000000001';
const otherAccountId = '00000000-0000-0000-0000-000000000002';
const groceriesId = '00000000-0000-0000-0000-000000000601';
const actingId = '00000000-0000-0000-0000-0000000000aa';
const expenseId = '00000000-0000-0000-0000-0000000000bb';
const cancelledExpenseId = '00000000-0000-0000-0000-0000000000cc';
const otherId = '00000000-0000-0000-0000-0000000000dd';
const relatedId = '00000000-0000-0000-0000-0000000000ee';
const priorRefundId = '00000000-0000-0000-0000-0000000000ff';

function makeTx(overrides: Partial<TransactionResponse> = {}): TransactionResponse {
  return {
    id: actingId,
    sourceAccountId: accountId,
    targetAccountId: 'external-1',
    sourceAmount: 100,
    sourceCurrency: 'USD',
    targetAmount: 100,
    targetCurrency: 'USD',
    exchangeRate: null,
    description: 'Some transaction',
    status: 'Completed',
    failureReason: null,
    transactionType: 'expense',
    allocations: { incomes: [], expenses: [] },
    date: '2026-04-27T08:00:00Z',
    labels: [],
    amendmentCount: 0,
    relations: [],
    ...overrides,
  };
}

// An income carrying contra (expense-bucket) allocations — a refund-shaped row.
function incomeWithContra(overrides: Partial<TransactionResponse> = {}): TransactionResponse {
  return makeTx({
    id: actingId,
    description: 'Refund income',
    transactionType: 'income',
    // An income lands in a REAL account (targetAccountId); its source is external.
    sourceAccountId: 'external-1',
    targetAccountId: accountId,
    allocations: {
      incomes: [],
      expenses: [{ categoryId: groceriesId, amount: { amount: 100, currency: 'USD' } }],
    },
    ...overrides,
  });
}

// A non-cancelled expense (valid refund counterpart).
const expenseTx = makeTx({
  id: expenseId,
  description: 'Weekly shop',
  transactionType: 'expense',
  sourceAmount: -80,
  targetAmount: -80,
  allocations: {
    incomes: [],
    expenses: [{ categoryId: groceriesId, amount: { amount: 80, currency: 'USD' } }],
  },
});

// A cancelled expense (must be excluded from the refund counterpart list).
const cancelledExpenseTx = makeTx({
  id: cancelledExpenseId,
  description: 'Voided shop',
  transactionType: 'expense',
  status: 'Cancelled',
  allocations: {
    incomes: [],
    expenses: [{ categoryId: groceriesId, amount: { amount: 50, currency: 'USD' } }],
  },
});

// Another distinct transaction (valid association counterpart).
const otherTx = makeTx({
  id: otherId,
  description: 'Salary',
  transactionType: 'income',
  allocations: {
    incomes: [{ categoryId: groceriesId, amount: { amount: 200, currency: 'USD' } }],
    expenses: [],
  },
});

// A transaction already related to the acting row.
const relatedTx = makeTx({
  id: relatedId,
  description: 'Already linked',
  transactionType: 'income',
});

function mockList(rows: TransactionResponse[]) {
  server.use(
    http.get(`${apiBase}/api/transactions`, () =>
      HttpResponse.json({ transactions: rows, totalCount: rows.length, limit: 200, offset: 0 }),
    ),
  );
}

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  server.use(
    http.get(`${apiBase}/api/accounts`, () =>
      HttpResponse.json({
        accounts: [
          {
            id: accountId,
            name: 'Checking',
            balance: 1234.56,
            currency: 'USD',
            overdraftLimit: null,
            subtype: { type: 'bankAccount', bankName: 'ACME' },
            status: 'Opened',
            version: 1,
          },
          {
            id: otherAccountId,
            name: 'Savings',
            balance: 500,
            currency: 'USD',
            overdraftLimit: null,
            subtype: { type: 'bankAccount', bankName: 'ACME' },
            status: 'Opened',
            version: 1,
          },
        ],
        totalCount: 2,
      }),
    ),
    // No inbound relations by default.
    http.get(`${apiBase}/api/transactions/${actingId}/relations`, () =>
      HttpResponse.json({ outbound: [], inbound: [] }),
    ),
  );
});

function Wrapper({ acting }: { acting: TransactionResponse }) {
  const [open, setOpen] = useState(true);
  return (
    <AuthProvider>
      <LinkTransactionDialog open={open} onOpenChange={setOpen} acting={acting} />
    </AuthProvider>
  );
}

describe('LinkTransactionDialog', () => {
  it('income-with-contra acting row offers both Refund and Association kinds', async () => {
    mockList([]);
    renderWithProviders(<Wrapper acting={incomeWithContra()} />, { initialPath: '/' });

    const kind = await screen.findByRole('combobox', { name: /relation kind/i });
    await userEvent.click(kind);

    expect(await screen.findByRole('option', { name: /refund/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /associat/i })).toBeInTheDocument();
  });

  it('plain expense acting row offers Association only (no Refund)', async () => {
    mockList([]);
    renderWithProviders(<Wrapper acting={makeTx()} />, { initialPath: '/' });

    const kind = await screen.findByRole('combobox', { name: /relation kind/i });
    await userEvent.click(kind);

    expect(await screen.findByRole('option', { name: /associat/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /refund/i })).not.toBeInTheDocument();
  });

  it('Refund kind: lists a non-cancelled expense, excludes cancelled + acting, and posts relationKind refund', async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> | null = null;
    mockList([incomeWithContra(), expenseTx, cancelledExpenseTx]);
    server.use(
      // useRefundSummary fetches the expense's inbound refund edges — none prior.
      http.get(`${apiBase}/api/transactions/${expenseId}/relations`, () =>
        HttpResponse.json({ outbound: [], inbound: [] }),
      ),
      http.post(`${apiBase}/api/transactions/${actingId}/relations`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(incomeWithContra());
      }),
    );

    renderWithProviders(<Wrapper acting={incomeWithContra()} />, { initialPath: '/' });

    // Refund is the offered refund kind — it is selected by default for income-with-contra.
    const counterpart = await screen.findByRole('combobox', { name: /counterpart/i });
    await user.click(counterpart);

    expect(await screen.findByRole('option', { name: /weekly shop/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /voided shop/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /refund income/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: /weekly shop/i }));
    await user.click(screen.getByRole('button', { name: /link/i }));

    await waitFor(() => expect(capturedBody).not.toBeNull());
    expect(capturedBody).toEqual({ relatedTransactionId: expenseId, relationKind: 'refund' });
  });

  it('Association kind: posts relationKind associated and excludes already-related counterparts', async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> | null = null;
    const acting = makeTx({
      relations: [{ relatedTransactionId: relatedId, relationKind: 'associated' }],
    });
    mockList([acting, otherTx, relatedTx]);
    server.use(
      http.post(`${apiBase}/api/transactions/${actingId}/relations`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(acting);
      }),
    );

    renderWithProviders(<Wrapper acting={acting} />, { initialPath: '/' });

    const counterpart = await screen.findByRole('combobox', { name: /counterpart/i });
    await user.click(counterpart);

    expect(await screen.findByRole('option', { name: /salary/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /already linked/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('option', { name: /salary/i }));
    await user.click(screen.getByRole('button', { name: /link/i }));

    await waitFor(() => expect(capturedBody).not.toBeNull());
    expect(capturedBody).toEqual({ relatedTransactionId: otherId, relationKind: 'associated' });
  });

  it('surfaces a backend ApiError inline and keeps the dialog open', async () => {
    const user = userEvent.setup();
    const acting = makeTx();
    mockList([acting, otherTx]);
    server.use(
      http.post(`${apiBase}/api/transactions/${actingId}/relations`, () =>
        HttpResponse.json(
          { code: 'RELATION_ALREADY_EXISTS', message: 'These transactions are already linked.' },
          { status: 409 },
        ),
      ),
    );

    renderWithProviders(<Wrapper acting={acting} />, { initialPath: '/' });

    const counterpart = await screen.findByRole('combobox', { name: /counterpart/i });
    await user.click(counterpart);
    await user.click(await screen.findByRole('option', { name: /salary/i }));
    await user.click(screen.getByRole('button', { name: /link/i }));

    expect(await screen.findByText(/already linked/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Association: offers a counterpart on a DIFFERENT account, labelled with its account, and posts associated', async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> | null = null;
    // Acting row is a plain expense on `accountId` (association-only); the
    // counterpart is a separate expense on `otherAccountId` (e.g. a delivery
    // charge paid from a different account) — the core cross-account use case.
    const acting = makeTx({ description: 'Online order', transactionType: 'expense' });
    const crossAccountExpense = makeTx({
      id: otherId,
      sourceAccountId: otherAccountId,
      description: 'Delivery charge',
      transactionType: 'expense',
      allocations: {
        incomes: [],
        expenses: [{ categoryId: groceriesId, amount: { amount: 20, currency: 'USD' } }],
      },
    });
    mockList([acting, crossAccountExpense]);
    server.use(
      http.post(`${apiBase}/api/transactions/${actingId}/relations`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json(acting);
      }),
    );

    renderWithProviders(<Wrapper acting={acting} />, { initialPath: '/' });

    const counterpart = await screen.findByRole('combobox', { name: /counterpart/i });
    await user.click(counterpart);

    // The cross-account counterpart is offered and labelled with its account.
    const option = await screen.findByRole('option', { name: /delivery charge/i });
    expect(option).toHaveTextContent(/Savings/);
    await user.click(option);
    await user.click(screen.getByRole('button', { name: /link/i }));

    await waitFor(() => expect(capturedBody).not.toBeNull());
    expect(capturedBody).toEqual({ relatedTransactionId: otherId, relationKind: 'associated' });
  });

  it('Refund: excludes a candidate expense on a DIFFERENT account (same-account only)', async () => {
    const user = userEvent.setup();
    const acting = incomeWithContra(); // account = `accountId`
    const sameAccountExpense = expenseTx; // sourceAccountId = accountId
    const crossAccountExpense = makeTx({
      id: otherId,
      sourceAccountId: otherAccountId,
      description: 'Other-account purchase',
      transactionType: 'expense',
      allocations: {
        incomes: [],
        expenses: [{ categoryId: groceriesId, amount: { amount: 30, currency: 'USD' } }],
      },
    });
    mockList([acting, sameAccountExpense, crossAccountExpense]);
    server.use(
      http.get(`${apiBase}/api/transactions/:id/relations`, () =>
        HttpResponse.json({ outbound: [], inbound: [] }),
      ),
    );

    renderWithProviders(<Wrapper acting={acting} />, { initialPath: '/' });

    // Refund is the default kind for income-with-contra.
    const counterpart = await screen.findByRole('combobox', { name: /counterpart/i });
    await user.click(counterpart);

    // Same-account expense is offered; the cross-account one is not.
    expect(await screen.findByRole('option', { name: /weekly shop/i })).toBeInTheDocument();
    expect(
      screen.queryByRole('option', { name: /other-account purchase/i }),
    ).not.toBeInTheDocument();
  });

  it('Refund kind: blocks submit and shows "already fully refunded" when the expense is fully refunded', async () => {
    const user = userEvent.setup();
    // Expense total is 80 (matches expenseTx). A prior refund covers the full 80.
    mockList([incomeWithContra(), expenseTx]);
    server.use(
      // The expense has one inbound refund edge.
      http.get(`${apiBase}/api/transactions/${expenseId}/relations`, () =>
        HttpResponse.json({
          outbound: [],
          inbound: [{ relatedTransactionId: priorRefundId, relationKind: 'refund' }],
        }),
      ),
      // The prior refund's contra allocations cover the expense's full total.
      http.get(`${apiBase}/api/transactions/${priorRefundId}`, () =>
        HttpResponse.json(
          incomeWithContra({
            id: priorRefundId,
            description: 'Prior refund',
            allocations: {
              incomes: [],
              expenses: [{ categoryId: groceriesId, amount: { amount: 80, currency: 'USD' } }],
            },
          }),
        ),
      ),
    );

    renderWithProviders(<Wrapper acting={incomeWithContra()} />, { initialPath: '/' });

    const counterpart = await screen.findByRole('combobox', { name: /counterpart/i });
    await user.click(counterpart);
    await user.click(await screen.findByRole('option', { name: /weekly shop/i }));

    // The over-refund hint renders and the Link button is disabled.
    expect(await screen.findByText(/already fully refunded/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /link/i })).toBeDisabled();
  });
});
