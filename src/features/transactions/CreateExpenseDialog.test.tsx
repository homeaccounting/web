import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import {
  foodCategoryId,
  configurationFixture,
  accountFixture,
  closedAccountFixture,
} from '@/test/fixtures';
import { CreateExpenseDialog } from './CreateExpenseDialog';
import { writeStickyDay } from '@/lib/stickyDate';
import { readRecentAccounts, recordRecentAccount } from '@/features/accounts/recentAccounts';

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
            status: 'Opened',
            role: 'owner',
            version: 1,
          },
        ],
        totalCount: 1,
      }),
    ),
  );
});

const bankAccount = (n: number) => ({
  id: `00000000-0000-0000-0000-00000000000${n}`,
  name: `Acc ${n}`,
  balance: 100,
  currency: 'USD',
  overdraftLimit: null,
  subtype: { type: 'bankAccount', bankName: 'ACME' },
  status: 'Opened',
  role: 'owner',
  version: 1,
});

function serveAccountsWithDefault(count: number, defaultAccount: number) {
  server.use(
    http.get(`${apiBase}/api/accounts`, () =>
      HttpResponse.json({
        accounts: Array.from({ length: count }, (_, i) => bankAccount(i + 1)),
        totalCount: count,
      }),
    ),
    http.get(`${apiBase}/api/users/me/configuration`, () =>
      HttpResponse.json({
        ...configurationFixture,
        defaults: { ...configurationFixture.defaults, account: bankAccount(defaultAccount).id },
      }),
    ),
  );
}

function Wrapper() {
  const [open, setOpen] = useState(true);
  return (
    <AuthProvider>
      <CreateExpenseDialog open={open} onOpenChange={setOpen} />
    </AuthProvider>
  );
}

// The created label's id must be a UUID, or the form's labels schema rejects it.
const newLabelId = '00000000-0000-0000-0000-0000000000d9';
function captureLabelCreate() {
  const created: unknown[] = [];
  server.use(
    http.post(
      `${apiBase}/api/users/me/configuration/dictionaries/label/entries`,
      async ({ request }) => {
        created.push(await request.json());
        return HttpResponse.json({ id: newLabelId, name: 'Rome' }, { status: 201 });
      },
    ),
  );
  return created;
}

describe('CreateExpenseDialog', () => {
  it('defaults to the first eligible account, skipping a closed one', async () => {
    server.use(
      http.get(`${apiBase}/api/accounts`, () =>
        HttpResponse.json({
          // Named to sort before "Checking": accounts arrive label-sorted, so the
          // closed one would be the naive first pick.
          accounts: [{ ...closedAccountFixture, name: 'Aardvark Savings' }, accountFixture],
          totalCount: 2,
        }),
      ),
    );
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByRole('dialog', { name: /add expense/i });
    const trigger = await screen.findByRole('combobox', { name: /^account/i });
    await waitFor(() => expect(trigger).toHaveTextContent('Checking'));
    expect(trigger).not.toHaveTextContent('Aardvark');
  });

  it('seeds from the profile default account when no account is scoped', async () => {
    serveAccountsWithDefault(2, 2);
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    const trigger = await screen.findByRole('combobox', { name: /^account/i });
    await waitFor(() => expect(trigger).toHaveTextContent('Acc 2'));
  });

  it('lists the profile default, then recently used accounts, under Recent', async () => {
    const user = userEvent.setup();
    serveAccountsWithDefault(6, 4);
    recordRecentAccount('expense', bankAccount(2).id);
    renderWithProviders(<Wrapper />, { initialPath: '/' });
    const trigger = await screen.findByRole('combobox', { name: /^account/i });
    await waitFor(() => expect(trigger).toHaveTextContent('Acc 4'));
    await user.click(trigger);
    const recent = screen.getByRole('group', { name: 'Recent' });
    expect(
      within(recent)
        .getAllByRole('option')
        .map((o) => o.getAttribute('aria-label')),
    ).toEqual(['Acc 4 · ACME · USD', 'Acc 2 · ACME · USD']);
  });

  it('creates a label inline and sends it with the expense', async () => {
    const user = userEvent.setup();
    const created = captureLabelCreate();
    let body: { labels?: string[] } = {};
    server.use(
      http.post(`${apiBase}/api/transactions/expense`, async ({ request }) => {
        body = (await request.json()) as typeof body;
        return HttpResponse.json({ id: 'tx-1' });
      }),
    );

    renderWithProviders(<Wrapper />, { initialPath: '/' });
    await screen.findByRole('dialog', { name: /add expense/i });
    await screen.findByLabelText(/account/i);

    await user.click(screen.getByRole('combobox', { name: /category/i }));
    await user.click(await screen.findByRole('option', { name: /food/i }));
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '50');
    const labels = screen.getByRole('combobox', { name: /labels/i });
    await user.click(labels);
    await user.type(labels, 'Rome');
    await user.click(screen.getByRole('option', { name: /create.*rome/i }));
    await waitFor(() => expect(created).toEqual([{ name: 'Rome', type: 'item', parentId: null }]));

    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(body.labels).toEqual([newLabelId]);
  });

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
    // Remembered for the Recent group next time.
    expect(readRecentAccounts('expense')).toEqual([accountId]);
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
              status: 'Opened',
              role: 'owner',
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

  it('defaults the date to the sticky last-used day when reopened on a persistent instance', async () => {
    const user = userEvent.setup();

    function ToggleWrapper() {
      const [open, setOpen] = useState(true);
      return (
        <AuthProvider>
          <button onClick={() => setOpen((o) => !o)}>toggle</button>
          <CreateExpenseDialog open={open} onOpenChange={setOpen} />
        </AuthProvider>
      );
    }

    renderWithProviders(<ToggleWrapper />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);
    // The shared DatePicker is a typable text field ('YYYY-MM-DD HH:MM').
    expect(screen.getByLabelText<HTMLInputElement>(/date/i).value).not.toContain('2020');

    // A prior submit stuck a PAST day, recorded today (reconciliation use case).
    writeStickyDay('2020-01-15T09:30', new Date());

    // Escape closes (siblings are inert while the modal is open); reopen via toggle.
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'toggle' }));

    await screen.findByLabelText(/account/i);
    expect(screen.getByLabelText<HTMLInputElement>(/date/i).value).toMatch(/^2020-01-15/);
  });
});
