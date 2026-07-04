import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { foodCategoryId, configurationFixture } from '@/test/fixtures';
import { CreateExpenseDialog } from './CreateExpenseDialog';

const apiBase = 'http://localhost:8080';

// Valid UUID for account (the fixture uses 'a1' which is not a valid UUID)
const accountId = '00000000-0000-0000-0000-000000000001';

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
            version: 1,
          },
        ],
        totalCount: 1,
      }),
    ),
  );
});

function Wrapper() {
  const [open, setOpen] = useState(true);
  return (
    <AuthProvider>
      <CreateExpenseDialog open={open} onOpenChange={setOpen} />
    </AuthProvider>
  );
}

describe('CreateExpenseDialog', () => {
  it('seeds the category from the global default expense category', async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.get(`${apiBase}/api/users/me/configuration`, () =>
        HttpResponse.json({
          ...configurationFixture,
          defaults: { ...configurationFixture.defaults, expenseCategory: foodCategoryId },
        }),
      ),
      http.post(`${apiBase}/api/transactions/expense`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 201 });
      }),
    );

    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);

    // Do NOT pick a category — it should come pre-seeded from the global default.
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '50');
    await user.type(screen.getByLabelText(/description/i), 'Groceries');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => {
      const expenses = (capturedBody.allocations as { expenses?: { category: string }[] })
        ?.expenses;
      expect(expenses?.[0]?.category).toBe(foodCategoryId);
    });
  });

  it('does not render a reimbursement section', async () => {
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);

    expect(screen.queryByRole('button', { name: /reimbursement/i })).not.toBeInTheDocument();
  });

  it('happy path: closes dialog after successful submit', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Wrapper />, { initialPath: '/' });

    expect(await screen.findByRole('dialog', { name: /add expense/i })).toBeInTheDocument();
    await screen.findByLabelText(/account/i);

    await user.click(screen.getByRole('combobox', { name: /category/i }));
    await user.click(await screen.findByRole('option', { name: /food/i }));
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '50');
    await user.type(screen.getByLabelText(/description/i), 'Groceries');

    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('defaults the date to a full timestamp and POSTs to /api/transactions/expense', async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    let requestUrl = '';

    server.use(
      http.post(`${apiBase}/api/transactions/expense`, async ({ request }) => {
        requestUrl = request.url;
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: 'tx-expense-1',
          sourceAccountId: accountId,
          targetAccountId: 'external-1',
          sourceAmount: -50,
          sourceCurrency: 'USD',
          targetAmount: -50,
          targetCurrency: 'USD',
          exchangeRate: null,
          description: 'Groceries',
          status: 'Completed',
          failureReason: null,
          transactionType: 'expense',
          category: foodCategoryId,
          date: '2026-06-01T00:00:00.000Z',
          labels: [],
          amendmentCount: 0,
        });
      }),
    );

    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByRole('dialog', { name: /add expense/i });
    await screen.findByLabelText(/account/i);

    // Do NOT touch the date input — it defaults to the current date+time.
    await user.click(screen.getByRole('combobox', { name: /category/i }));
    await user.click(await screen.findByRole('option', { name: /food/i }));
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '50');
    await user.type(screen.getByLabelText(/description/i), 'Groceries');

    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(Object.keys(capturedBody).length).toBeGreaterThan(0));
    expect(capturedBody.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
    expect(requestUrl).toContain('/api/transactions/expense');
  });

  it('field error surfaces under the named field', async () => {
    const user = userEvent.setup();

    server.use(
      http.post(`${apiBase}/api/transactions/expense`, () =>
        HttpResponse.json(
          { message: 'Validation failed', fieldErrors: { expenses: 'Must be positive' } },
          { status: 422 },
        ),
      ),
    );

    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByRole('dialog', { name: /add expense/i });
    await screen.findByLabelText(/account/i);

    await user.click(screen.getByRole('combobox', { name: /category/i }));
    await user.click(await screen.findByRole('option', { name: /food/i }));
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '50');
    await user.type(screen.getByLabelText(/description/i), 'Groceries');

    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByText(/must be positive/i)).toBeInTheDocument();
  });

  it('blocks submitting an expense that exceeds the account available balance', async () => {
    const user = userEvent.setup();
    let posted = false;

    server.use(
      // Low-balance account with a finite overdraft limit (0 → balance must stay ≥ 0).
      http.get(`${apiBase}/api/accounts`, () =>
        HttpResponse.json({
          accounts: [
            {
              id: accountId,
              name: 'Checking',
              balance: 100,
              currency: 'USD',
              overdraftLimit: 0,
              subtype: { type: 'bankAccount', bankName: 'ACME' },
              version: 1,
            },
          ],
          totalCount: 1,
        }),
      ),
      http.post(`${apiBase}/api/transactions/expense`, () => {
        posted = true;
        return new HttpResponse(null, { status: 201 });
      }),
    );

    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByRole('dialog', { name: /add expense/i });
    await screen.findByLabelText(/account/i);

    await user.click(screen.getByRole('combobox', { name: /category/i }));
    await user.click(await screen.findByRole('option', { name: /food/i }));
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '150'); // > balance 100, overdraft 0
    await user.type(screen.getByLabelText(/description/i), 'Groceries');

    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByText(/exceeds available balance/i)).toBeInTheDocument();
    expect(posted).toBe(false);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('shows destructive alert banner for generic 500 error', async () => {
    const user = userEvent.setup();

    server.use(
      http.post(`${apiBase}/api/transactions/expense`, () =>
        HttpResponse.json({ message: 'Boom' }, { status: 500 }),
      ),
    );

    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByRole('dialog', { name: /add expense/i });
    await screen.findByLabelText(/account/i);

    await user.click(screen.getByRole('combobox', { name: /category/i }));
    await user.click(await screen.findByRole('option', { name: /food/i }));
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '50');
    await user.type(screen.getByLabelText(/description/i), 'Groceries');

    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
  });
});
