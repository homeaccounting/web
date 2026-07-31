import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { salaryCategoryId, configurationFixture } from '@/test/fixtures';
import { CreateIncomeDialog } from './CreateIncomeDialog';
import { writeStickyDay } from '@/lib/stickyDate';

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
  it('seeds the category from the global default income category', async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.get(`${apiBase}/api/users/me/configuration`, () =>
        HttpResponse.json({
          ...configurationFixture,
          defaults: { ...configurationFixture.defaults, incomeCategory: salaryCategoryId },
        }),
      ),
      http.post(`${apiBase}/api/transactions/income`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 201 });
      }),
    );

    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);

    // Do NOT pick a category — it should come pre-seeded from the global default.
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '50');
    await user.type(screen.getByLabelText(/description/i), 'Paycheck');
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => {
      const incomes = (capturedBody.allocations as { incomes?: { category: string }[] })?.incomes;
      expect(incomes?.[0]?.category).toBe(salaryCategoryId);
    });
  });

  it('renders the collapsed reimbursement section', async () => {
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);

    // The reimbursement (expense-category) section is offered on the income
    // form, collapsed by default.
    const toggle = screen.getByRole('button', { name: /reimbursement/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

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

    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('defaults the date to the current time (full timestamp) when untouched', async () => {
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
          transactionType: 'income',
          category: salaryCategoryId,
          date: '2026-06-01T00:00:00.000Z',
          labels: [],
          amendmentCount: 0,
        });
      }),
    );

    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByRole('dialog', { name: /add income/i });
    await screen.findByLabelText(/account/i);

    // Do NOT touch the date input — it defaults to the current date+time.
    await user.click(screen.getByRole('combobox', { name: /category/i }));
    await user.click(await screen.findByRole('option', { name: /salary/i }));
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '100');
    await user.type(screen.getByLabelText(/description/i), 'Salary');

    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(Object.keys(capturedBody).length).toBeGreaterThan(0));
    // Full-precision timestamp (minute-granular) so same-day rows are ordered.
    expect(capturedBody.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
  });

  it('field error surfaces under the named field', async () => {
    const user = userEvent.setup();

    server.use(
      http.post(`${apiBase}/api/transactions/income`, () =>
        HttpResponse.json(
          { message: 'Validation failed', fieldErrors: { incomes: 'Must be positive' } },
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

    await user.click(screen.getByRole('button', { name: 'OK' }));

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

    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
  });

  it('defaults the date to the sticky last-used day when reopened on a persistent instance', async () => {
    const user = userEvent.setup();

    // A persistent dialog instance whose visibility toggles — mirrors how
    // ControlBar renders the create dialogs unconditionally. A frozen-at-mount
    // default would keep showing today on reopen; recompute-on-open must not.
    function ToggleWrapper() {
      const [open, setOpen] = useState(true);
      return (
        <AuthProvider>
          <button onClick={() => setOpen((o) => !o)}>toggle</button>
          <CreateIncomeDialog open={open} onOpenChange={setOpen} />
        </AuthProvider>
      );
    }

    renderWithProviders(<ToggleWrapper />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);
    // First open (empty store) shows today, not the past day. The shared
    // DatePicker is a typable text field ('YYYY-MM-DD HH:MM').
    expect(screen.getByLabelText<HTMLInputElement>(/date/i).value).not.toContain('2020');

    // Simulate a prior submit that stuck a PAST day, recorded today (the
    // reconciliation use case: entering rows dated Jan 15 2020 today).
    writeStickyDay('2020-01-15T09:30', new Date());

    // Close via Escape (the dialog's own close path fires onOpenChange). While
    // the modal is open its siblings are inert, so the toggle button is only
    // reachable once closed — then click it to reopen the same instance.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'toggle' }));

    await screen.findByLabelText(/account/i);
    expect(screen.getByLabelText<HTMLInputElement>(/date/i).value).toMatch(/^2020-01-15/);
  });
});
