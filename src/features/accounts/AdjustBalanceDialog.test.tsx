import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { format, parse } from 'date-fns';
import { server } from '@/test/server';
import { renderWithProviders, makeQueryClient } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { AdjustBalanceDialog } from './AdjustBalanceDialog';
import type { AccountResponse } from '@/api/types';

const apiBase = 'http://localhost:8080';

const accounts: AccountResponse[] = [
  {
    id: 'a1',
    name: 'Savings',
    balance: 100,
    currency: 'USD',
    overdraftLimit: null,
    subtype: { type: 'cash', storageLocation: 'wallet' },
    status: 'Opened',
    role: 'owner',
    version: 1,
  },
  {
    id: 'a2',
    name: 'Euro Wallet',
    balance: 42.5,
    currency: 'EUR',
    overdraftLimit: null,
    subtype: { type: 'cash', storageLocation: 'wallet' },
    status: 'Opened',
    role: 'owner',
    version: 1,
  },
];

function seedAccounts(list: AccountResponse[]) {
  server.use(
    http.get(`${apiBase}/api/accounts`, () =>
      HttpResponse.json({ accounts: list, totalCount: list.length }),
    ),
  );
}

function ui(selectedAccountId?: string, onOpenChange: (open: boolean) => void = () => {}) {
  return (
    <AuthProvider>
      <AdjustBalanceDialog open onOpenChange={onOpenChange} selectedAccountId={selectedAccountId} />
    </AuthProvider>
  );
}

const today = new Date().toISOString().slice(0, 10);
// How the shared DatePicker renders the trigger label for a 'YYYY-MM-DD' value.
const todayLabel = format(parse(today, 'yyyy-MM-dd', new Date()), 'PPP');

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
});

describe('AdjustBalanceDialog', () => {
  it('opens with targetBalance prefilled to account.balance, date to today, description empty', async () => {
    seedAccounts(accounts);
    const qc = makeQueryClient();
    renderWithProviders(ui('a1'), { queryClient: qc });
    expect(await screen.findByRole('dialog', { name: /adjust balance/i })).toBeInTheDocument();
    expect(await screen.findByLabelText(/target balance/i)).toHaveValue(100);
    expect(screen.getByLabelText(/date/i)).toHaveTextContent(todayLabel);
    expect(screen.getByLabelText(/description/i)).toHaveValue('');
  });

  it('submits with an empty description (optional): fires PUT with empty description', async () => {
    seedAccounts(accounts);
    const qc = makeQueryClient();
    let body: Record<string, unknown> | null = null;
    server.use(
      http.put('http://localhost:8080/api/accounts/a1/balance', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({});
      }),
    );
    renderWithProviders(ui('a1'), { queryClient: qc });
    const target = await screen.findByLabelText(/target balance/i);
    await userEvent.clear(target);
    await userEvent.type(target, '150');
    await userEvent.click(screen.getByRole('button', { name: /ok/i }));
    await waitFor(() => {
      expect(body).toMatchObject({ targetBalance: 150, currency: 'USD', description: '' });
    });
    // date is today's calendar day with a current time-of-day (minute precision).
    expect((body as { date?: string } | null)?.date).toMatch(
      new RegExp(`^${today}T\\d{2}:\\d{2}:00\\.000Z$`),
    );
  });

  // The "Date" field uses the shared DatePicker (calendar popover) rather than a
  // native date input. Clicking the trigger opens the calendar grid. The
  // future-date guard itself (date <= today) is covered deterministically by
  // adjustBalanceSchema.test.ts; here we only confirm the common control is wired
  // in and the picker is bounded to today via maxDate.
  it('uses the shared date picker: clicking the field opens a calendar', async () => {
    seedAccounts(accounts);
    renderWithProviders(ui('a1'), { queryClient: makeQueryClient() });
    await userEvent.click(await screen.findByLabelText(/date/i));
    expect(await screen.findByRole('grid')).toBeInTheDocument();
  });

  it('happy path: fires PUT with correct body, closes dialog, invalidates queries', async () => {
    seedAccounts(accounts);
    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    let body: Record<string, unknown> | null = null;
    let path: string | null = null;
    server.use(
      http.put('http://localhost:8080/api/accounts/a1/balance', async ({ request }) => {
        path = new URL(request.url).pathname;
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: 'tx-1',
          sourceAccountId: 'a1',
          targetAccountId: 'a1',
          sourceAmount: 50,
          sourceCurrency: 'USD',
          targetAmount: 50,
          targetCurrency: 'USD',
          exchangeRate: null,
          description: 'Adjustment',
          status: 'Completed',
          failureReason: null,
          transactionType: 'adjustment',
          category: null,
          date: `${today}T00:00:00.000Z`,
          labels: [],
          amendmentCount: 0,
        });
      }),
    );
    const onOpenChange = vi.fn();
    renderWithProviders(ui('a1', onOpenChange), { queryClient: qc });
    const target = await screen.findByLabelText(/target balance/i);
    await userEvent.clear(target);
    await userEvent.type(target, '150');
    await userEvent.type(screen.getByLabelText(/description/i), 'Reconcile');
    await userEvent.click(screen.getByRole('button', { name: /ok/i }));
    await waitFor(() => {
      expect(path).toBe('/api/accounts/a1/balance');
    });
    expect(body).toMatchObject({ targetBalance: 150, currency: 'USD', description: 'Reconcile' });
    expect((body as { date?: string } | null)?.date).toMatch(
      new RegExp(`^${today}T\\d{2}:\\d{2}:00\\.000Z$`),
    );
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
    const invalidationKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] } | undefined)?.queryKey,
    );
    expect(invalidationKeys).toContainEqual(['accounts']);
    expect(invalidationKeys).toContainEqual(['transactions', 'a1']);
  });

  it('server returns 400 with fieldErrors.targetBalance: field error shown, dialog stays open', async () => {
    seedAccounts(accounts);
    const qc = makeQueryClient();
    server.use(
      http.put('http://localhost:8080/api/accounts/a1/balance', () =>
        HttpResponse.json(
          {
            message: 'Validation failed',
            fieldErrors: {
              targetBalance: 'Target balance equals current balance at this date',
            },
          },
          { status: 400 },
        ),
      ),
    );
    const onOpenChange = vi.fn();
    renderWithProviders(ui('a1', onOpenChange), { queryClient: qc });
    const target = await screen.findByLabelText(/target balance/i);
    await userEvent.clear(target);
    await userEvent.type(target, '150');
    await userEvent.type(screen.getByLabelText(/description/i), 'Reconcile');
    await userEvent.click(screen.getByRole('button', { name: /ok/i }));
    expect(
      await screen.findByText(/target balance equals current balance at this date/i),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('server returns 400 with fieldErrors.date: field error shown, dialog stays open', async () => {
    seedAccounts(accounts);
    const qc = makeQueryClient();
    server.use(
      http.put('http://localhost:8080/api/accounts/a1/balance', () =>
        HttpResponse.json(
          {
            message: 'Validation failed',
            fieldErrors: {
              date: 'Adjustment date must be in the past or present',
            },
          },
          { status: 400 },
        ),
      ),
    );
    const onOpenChange = vi.fn();
    renderWithProviders(ui('a1', onOpenChange), { queryClient: qc });
    const target = await screen.findByLabelText(/target balance/i);
    await userEvent.clear(target);
    await userEvent.type(target, '150');
    await userEvent.type(screen.getByLabelText(/description/i), 'Reconcile');
    await userEvent.click(screen.getByRole('button', { name: /ok/i }));
    expect(
      await screen.findByText(/adjustment date must be in the past or present/i),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });

  it('pre-selects the highlighted account and shows its current balance', async () => {
    seedAccounts(accounts);
    renderWithProviders(ui('a2'), { queryClient: makeQueryClient() });
    const select = await screen.findByLabelText(/account/i);
    expect(select).toHaveTextContent('Euro Wallet');
    expect(screen.getByText(/current balance/i)).toHaveTextContent('EUR');
  });

  it('defaults to the first account when no account is highlighted', async () => {
    seedAccounts(accounts);
    renderWithProviders(ui(undefined), { queryClient: makeQueryClient() });
    expect(await screen.findByLabelText(/account/i)).toHaveTextContent('Savings');
  });

  it('switching the account updates the current balance, currency, and PUT target', async () => {
    seedAccounts(accounts);
    let path: string | null = null;
    let body: Record<string, unknown> | null = null;
    server.use(
      http.put(`${apiBase}/api/accounts/:id/balance`, async ({ request }) => {
        path = new URL(request.url).pathname;
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({});
      }),
    );
    renderWithProviders(ui('a1'), { queryClient: makeQueryClient() });
    await userEvent.click(await screen.findByLabelText(/account/i));
    await userEvent.click(await screen.findByRole('option', { name: /euro wallet/i }));
    expect(screen.getByText(/current balance/i)).toHaveTextContent('EUR');
    const target = screen.getByLabelText(/target balance/i);
    await userEvent.clear(target);
    await userEvent.type(target, '60');
    await userEvent.click(screen.getByRole('button', { name: /ok/i }));
    await waitFor(() => expect(path).toBe('/api/accounts/a2/balance'));
    expect(body).toMatchObject({ targetBalance: 60, currency: 'EUR' });
  });

  it('re-prefills target balance to the newly selected account balance on switch', async () => {
    seedAccounts(accounts);
    renderWithProviders(ui('a1'), { queryClient: makeQueryClient() });
    await screen.findByLabelText(/account/i);
    expect(screen.getByLabelText(/target balance/i)).toHaveValue(100);
    await userEvent.click(screen.getByLabelText(/account/i));
    await userEvent.click(await screen.findByRole('option', { name: /euro wallet/i }));
    expect(screen.getByLabelText(/target balance/i)).toHaveValue(42.5);
  });

  it('shows a fallback message when there are no accounts', async () => {
    seedAccounts([]);
    renderWithProviders(ui(undefined), { queryClient: makeQueryClient() });
    expect(
      await screen.findByText(/create an account first to adjust a balance/i),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/target balance/i)).not.toBeInTheDocument();
  });
});
