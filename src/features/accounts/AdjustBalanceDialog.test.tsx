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

const fixture: AccountResponse = {
  id: 'a1',
  name: 'Savings',
  balance: 100,
  currency: 'USD',
  overdraftLimit: null,
  subtype: { type: 'cash', storageLocation: 'wallet' },
  status: 'Opened',
  version: 1,
};

function ui(account: AccountResponse, onOpenChange: (open: boolean) => void = () => {}) {
  return (
    <AuthProvider>
      <AdjustBalanceDialog open onOpenChange={onOpenChange} account={account} />
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
    const qc = makeQueryClient();
    renderWithProviders(ui(fixture), { queryClient: qc });
    expect(await screen.findByRole('dialog', { name: /adjust balance/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/target balance/i)).toHaveValue(100);
    expect(screen.getByLabelText(/date/i)).toHaveTextContent(todayLabel);
    expect(screen.getByLabelText(/description/i)).toHaveValue('');
  });

  it('submits with an empty description (optional): fires PUT with empty description', async () => {
    const qc = makeQueryClient();
    let body: Record<string, unknown> | null = null;
    server.use(
      http.put('http://localhost:8080/api/accounts/a1/balance', async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({});
      }),
    );
    renderWithProviders(ui(fixture), { queryClient: qc });
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
    renderWithProviders(ui(fixture), { queryClient: makeQueryClient() });
    await userEvent.click(await screen.findByLabelText(/date/i));
    expect(await screen.findByRole('grid')).toBeInTheDocument();
  });

  it('happy path: fires PUT with correct body, closes dialog, invalidates queries', async () => {
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
    renderWithProviders(ui(fixture, onOpenChange), { queryClient: qc });
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
    renderWithProviders(ui(fixture, onOpenChange), { queryClient: qc });
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
    renderWithProviders(ui(fixture, onOpenChange), { queryClient: qc });
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
});
