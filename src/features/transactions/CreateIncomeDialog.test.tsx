import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { salaryCategoryId } from '@/test/fixtures';
import { CreateIncomeDialog } from './CreateIncomeDialog';

const apiBase = 'http://localhost:8080';

// Valid UUID for account (the fixture uses 'a1' which is not a valid UUID)
const accountId = '00000000-0000-0000-0000-000000000001';

// Override accounts handler to return a proper UUID account
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
      <CreateIncomeDialog open={open} onOpenChange={setOpen} />
    </AuthProvider>
  );
}

describe('CreateIncomeDialog', () => {
  it('happy path: closes dialog after successful submit', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Wrapper />, { initialPath: '/' });

    expect(await screen.findByRole('dialog', { name: /add income/i })).toBeInTheDocument();

    // Wait for accounts to load (form renders)
    await screen.findByLabelText(/account/i);

    await user.click(screen.getByRole('combobox', { name: /category/i }));
    await user.click(await screen.findByRole('option', { name: /salary/i }));
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '100');
    await user.type(screen.getByLabelText(/description/i), 'Salary');

    await user.click(screen.getByRole('button', { name: /add income/i }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('empty date is omitted from the request payload', async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};

    server.use(
      http.post(`${apiBase}/api/transactions/income`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: 'tx-1',
          sourceAccountId: 'external-1',
          targetAccountId: accountId,
          sourceAmount: 100,
          sourceCurrency: 'USD',
          targetAmount: 100,
          targetCurrency: 'USD',
          exchangeRate: null,
          description: 'Salary',
          status: 'Completed',
          failureReason: null,
          transferType: 'Income',
          category: salaryCategoryId,
          date: '2026-06-01T00:00:00.000Z',
          labels: [],
        });
      }),
    );

    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByRole('dialog', { name: /add income/i });
    await screen.findByLabelText(/account/i);

    // Do NOT touch the date input
    await user.click(screen.getByRole('combobox', { name: /category/i }));
    await user.click(await screen.findByRole('option', { name: /salary/i }));
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '100');
    await user.type(screen.getByLabelText(/description/i), 'Salary');

    await user.click(screen.getByRole('button', { name: /add income/i }));

    await waitFor(() => expect(Object.keys(capturedBody).length).toBeGreaterThan(0));
    expect(capturedBody.date).toBeUndefined();
  });

  it('field error surfaces under the named field', async () => {
    const user = userEvent.setup();

    server.use(
      http.post(`${apiBase}/api/transactions/income`, () =>
        HttpResponse.json(
          { message: 'Validation failed', fieldErrors: { amount: 'Must be positive' } },
          { status: 422 },
        ),
      ),
    );

    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByRole('dialog', { name: /add income/i });
    await screen.findByLabelText(/account/i);

    await user.click(screen.getByRole('combobox', { name: /category/i }));
    await user.click(await screen.findByRole('option', { name: /salary/i }));
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '100');
    await user.type(screen.getByLabelText(/description/i), 'Salary');

    await user.click(screen.getByRole('button', { name: /add income/i }));

    expect(await screen.findByText(/must be positive/i)).toBeInTheDocument();
  });

  it('shows destructive alert banner for generic 500 error', async () => {
    const user = userEvent.setup();

    server.use(
      http.post(`${apiBase}/api/transactions/income`, () =>
        HttpResponse.json({ message: 'Boom' }, { status: 500 }),
      ),
    );

    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByRole('dialog', { name: /add income/i });
    await screen.findByLabelText(/account/i);

    await user.click(screen.getByRole('combobox', { name: /category/i }));
    await user.click(await screen.findByRole('option', { name: /salary/i }));
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '100');
    await user.type(screen.getByLabelText(/description/i), 'Salary');

    await user.click(screen.getByRole('button', { name: /add income/i }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
  });
});
