import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { foodCategoryId, tripLabelId, transactionFixture } from '@/test/fixtures';
import type { TransactionResponse } from '@/api/types';
import { CopyTransactionDialog } from './CopyTransactionDialog';

const apiBase = 'http://localhost:8080';

const accountA = '00000000-0000-0000-0000-000000000001';
const accountB = '00000000-0000-0000-0000-000000000002';

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  server.use(
    http.get(`${apiBase}/api/accounts`, () =>
      HttpResponse.json({
        accounts: [
          {
            id: accountA,
            name: 'Checking',
            balance: 1234.56,
            currency: 'USD',
            overdraftLimit: null,
            subtype: { type: 'bankAccount', bankName: 'ACME' },
            status: 'Opened',
            version: 1,
          },
          {
            id: accountB,
            name: 'Savings',
            balance: 50,
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
  );
});

function Wrapper({ tx }: { tx: TransactionResponse }) {
  const [open, setOpen] = useState(true);
  return (
    <AuthProvider>
      <CopyTransactionDialog open={open} onOpenChange={setOpen} tx={tx} />
    </AuthProvider>
  );
}

const expenseSource: TransactionResponse = {
  ...transactionFixture,
  id: 'src-expense',
  sourceAccountId: accountA,
  targetAccountId: 'external-1',
  sourceAmount: -42,
  sourceCurrency: 'USD',
  targetAmount: -42,
  targetCurrency: 'USD',
  description: 'Lunch',
  transactionType: 'expense',
  category: foodCategoryId,
  date: '2026-01-15T08:00:00.000Z',
  labels: [tripLabelId],
};

describe('CopyTransactionDialog', () => {
  it('seeds an expense copy from the source and defaults the date to now', async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(`${apiBase}/api/transactions/expense`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...expenseSource, id: 'copy-1' });
      }),
    );

    renderWithProviders(<Wrapper tx={expenseSource} />, { initialPath: '/' });

    expect(await screen.findByRole('dialog', { name: /copy expense/i })).toBeInTheDocument();
    await screen.findByLabelText(/account/i);

    expect(screen.getByLabelText(/description/i)).toHaveValue('Lunch');
    expect(screen.getByLabelText(/amount/i)).toHaveValue(42);

    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(Object.keys(capturedBody).length).toBeGreaterThan(0));
    expect(capturedBody.date).not.toContain('2026-01-15');
    expect(capturedBody.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
    expect(capturedBody.accountId).toBe(accountA);
    expect(capturedBody.labels).toEqual([tripLabelId]);
    expect(
      (capturedBody.allocations as { expenses: { category: string }[] }).expenses[0]?.category,
    ).toBe(foodCategoryId);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('copies a transfer using both legs', async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(`${apiBase}/api/transactions/transfer`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...transactionFixture, id: 'copy-transfer' });
      }),
    );

    const transferSource: TransactionResponse = {
      ...transactionFixture,
      id: 'src-transfer',
      sourceAccountId: accountA,
      targetAccountId: accountB,
      sourceAmount: 100,
      targetAmount: 100,
      sourceCurrency: 'USD',
      targetCurrency: 'USD',
      description: 'Move',
      transactionType: 'transfer',
      category: null,
      labels: [],
    };

    renderWithProviders(<Wrapper tx={transferSource} />, { initialPath: '/' });
    expect(await screen.findByRole('dialog', { name: /copy transfer/i })).toBeInTheDocument();
    await screen.findByLabelText(/amount/i);

    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(Object.keys(capturedBody).length).toBeGreaterThan(0));
    expect(capturedBody.sourceAccountId).toBe(accountA);
    expect(capturedBody.targetAccountId).toBe(accountB);
    expect(capturedBody.amount).toBe(100);
    expect(capturedBody.date).not.toContain('2026-04-27');
    expect(capturedBody.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
  });

  it('surfaces a field error on the named field', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${apiBase}/api/transactions/expense`, () =>
        HttpResponse.json(
          { message: 'Validation failed', fieldErrors: { description: 'Too long' } },
          { status: 422 },
        ),
      ),
    );

    renderWithProviders(<Wrapper tx={expenseSource} />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByText(/too long/i)).toBeInTheDocument();
  });

  it('shows a destructive banner for a generic error', async () => {
    const user = userEvent.setup();
    server.use(
      http.post(`${apiBase}/api/transactions/expense`, () =>
        HttpResponse.json({ message: 'Boom' }, { status: 500 }),
      ),
    );

    renderWithProviders(<Wrapper tx={expenseSource} />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);
    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('refuses to copy an adjustment', async () => {
    const adjustment: TransactionResponse = {
      ...transactionFixture,
      id: 'src-adjustment',
      transactionType: 'adjustment',
      category: null,
    };
    renderWithProviders(<Wrapper tx={adjustment} />, { initialPath: '/' });
    expect(await screen.findByText(/balance adjustments can't be copied/i)).toBeInTheDocument();
  });
});
