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
const groceriesId = '00000000-0000-0000-0000-000000000601';
const incomeId = '00000000-0000-0000-0000-0000000000aa';
const expenseId = '00000000-0000-0000-0000-0000000000bb';
const otherId = '00000000-0000-0000-0000-0000000000dd';
const priorRefundId = '00000000-0000-0000-0000-0000000000ff';

function makeTx(overrides: Partial<TransactionResponse> = {}): TransactionResponse {
  return {
    id: 'tx',
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
    contactId: null,
    bankProviderCategory: null,
    bankProviderContact: null,
    relations: [],
    ...overrides,
  };
}

// An income carrying contra (expense-bucket) allocations — a refund-shaped row.
function incomeWithContra(overrides: Partial<TransactionResponse> = {}): TransactionResponse {
  return makeTx({
    id: incomeId,
    description: 'Refund income',
    transactionType: 'income',
    sourceAccountId: 'external-1',
    targetAccountId: accountId,
    allocations: {
      incomes: [],
      expenses: [{ categoryId: groceriesId, amount: { amount: 80, currency: 'USD' } }],
    },
    ...overrides,
  });
}

const expenseTx = makeTx({
  id: expenseId,
  description: 'Weekly shop',
  transactionType: 'expense',
  allocations: {
    incomes: [],
    expenses: [{ categoryId: groceriesId, amount: { amount: 80, currency: 'USD' } }],
  },
});

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
});

function Wrapper({ pair }: { pair: [TransactionResponse, TransactionResponse] }) {
  const [open, setOpen] = useState(true);
  return (
    <AuthProvider>
      <LinkTransactionDialog open={open} onOpenChange={setOpen} pair={pair} />
    </AuthProvider>
  );
}

describe('LinkTransactionDialog (pair mode)', () => {
  it('income-with-contra + same-account expense offers Refund and Association, Refund by default', async () => {
    server.use(
      http.get(`${apiBase}/api/transactions/${expenseId}/relations`, () =>
        HttpResponse.json({ outbound: [], inbound: [] }),
      ),
    );
    renderWithProviders(<Wrapper pair={[incomeWithContra(), expenseTx]} />, { initialPath: '/' });

    const refund = screen.getByRole('button', { name: /refund/i });
    const assoc = screen.getByRole('button', { name: /association/i });
    expect(refund).toHaveAttribute('aria-pressed', 'true');
    expect(assoc).toHaveAttribute('aria-pressed', 'false');
    expect(await screen.findByText(/left to refund/i)).toBeInTheDocument();
  });

  it('two plain rows offer Association only (no kind toggle)', () => {
    const a = makeTx({ id: 'a', description: 'Online order' });
    const b = makeTx({ id: 'b', description: 'Delivery charge' });
    renderWithProviders(<Wrapper pair={[a, b]} />, { initialPath: '/' });
    expect(screen.queryByRole('button', { name: /refund/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('group', { name: /relation kind/i })).not.toBeInTheDocument();
  });

  it('Refund: posts relationKind refund on the income owner, targeting the expense', async () => {
    const user = userEvent.setup();
    let calledId = '';
    let captured: unknown;
    server.use(
      http.get(`${apiBase}/api/transactions/${expenseId}/relations`, () =>
        HttpResponse.json({ outbound: [], inbound: [] }),
      ),
      http.post(`${apiBase}/api/transactions/:id/relations`, async ({ request, params }) => {
        calledId = params.id as string;
        captured = await request.json();
        return HttpResponse.json(incomeWithContra());
      }),
    );
    renderWithProviders(<Wrapper pair={[incomeWithContra(), expenseTx]} />, { initialPath: '/' });

    await user.click(screen.getByRole('button', { name: /^link$/i }));
    await waitFor(() => expect(calledId).toBe(incomeId));
    expect(captured).toEqual({ relatedTransactionId: expenseId, relationKind: 'refund' });
  });

  it('Association: posts relationKind associated with the more-recent row as owner', async () => {
    const user = userEvent.setup();
    let calledId = '';
    let captured: unknown;
    const older = makeTx({ id: 'older', description: 'Older', date: '2026-04-01T08:00:00Z' });
    const newer = makeTx({ id: otherId, description: 'Newer', date: '2026-04-20T08:00:00Z' });
    server.use(
      http.post(`${apiBase}/api/transactions/:id/relations`, async ({ request, params }) => {
        calledId = params.id as string;
        captured = await request.json();
        return HttpResponse.json(newer);
      }),
    );
    // Selection order puts the older row first; owner must still be the newer one.
    renderWithProviders(<Wrapper pair={[older, newer]} />, { initialPath: '/' });

    await user.click(screen.getByRole('button', { name: /^link$/i }));
    await waitFor(() => expect(calledId).toBe(otherId));
    expect(captured).toEqual({ relatedTransactionId: 'older', relationKind: 'associated' });
  });

  it('already-related pair disables Link and explains', () => {
    const a = makeTx({
      id: 'a',
      description: 'A',
      relations: [{ relatedTransactionId: 'b', relationKind: 'associated' }],
    });
    const b = makeTx({ id: 'b', description: 'B' });
    renderWithProviders(<Wrapper pair={[a, b]} />, { initialPath: '/' });
    expect(screen.getByText(/already linked/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^link$/i })).toBeDisabled();
  });

  it('Refund: blocks submit and shows "already fully refunded" when the expense is fully refunded', async () => {
    server.use(
      http.get(`${apiBase}/api/transactions/${expenseId}/relations`, () =>
        HttpResponse.json({
          outbound: [],
          inbound: [{ relatedTransactionId: priorRefundId, relationKind: 'refund' }],
        }),
      ),
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
    renderWithProviders(<Wrapper pair={[incomeWithContra(), expenseTx]} />, { initialPath: '/' });

    expect(await screen.findByText(/already fully refunded/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^link$/i })).toBeDisabled();
  });

  it('surfaces a backend ApiError inline and keeps the dialog open', async () => {
    const user = userEvent.setup();
    const a = makeTx({ id: 'a', description: 'A' });
    const b = makeTx({ id: 'b', description: 'B' });
    server.use(
      http.post(`${apiBase}/api/transactions/:id/relations`, () =>
        HttpResponse.json(
          { code: 'RELATION_ALREADY_EXISTS', message: 'These transactions are already linked.' },
          { status: 409 },
        ),
      ),
    );
    renderWithProviders(<Wrapper pair={[a, b]} />, { initialPath: '/' });

    await user.click(screen.getByRole('button', { name: /^link$/i }));
    expect(await screen.findByText(/already linked/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
});
