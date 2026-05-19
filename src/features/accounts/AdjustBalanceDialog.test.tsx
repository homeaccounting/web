import { describe, it, expect, beforeEach, vi } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
});

describe('AdjustBalanceDialog', () => {
  it('opens with targetBalance prefilled to account.balance, date to today, reason empty', async () => {
    const qc = makeQueryClient();
    renderWithProviders(ui(fixture), { queryClient: qc });
    expect(await screen.findByRole('dialog', { name: /adjust balance/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/target balance/i)).toHaveValue(100);
    expect(screen.getByLabelText(/date/i)).toHaveValue(today);
    expect(screen.getByLabelText(/reason/i)).toHaveValue('');
  });

  it('submitting empty reason shows field error, does not call API', async () => {
    const qc = makeQueryClient();
    let called = false;
    server.use(
      http.put('http://localhost:8080/api/accounts/a1/balance', () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    renderWithProviders(ui(fixture), { queryClient: qc });
    await userEvent.click(await screen.findByRole('button', { name: /ok/i }));
    expect(await screen.findByText(/reason is required/i)).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('submitting a future date shows field error, does not call API', async () => {
    const qc = makeQueryClient();
    let called = false;
    server.use(
      http.put('http://localhost:8080/api/accounts/a1/balance', () => {
        called = true;
        return HttpResponse.json({});
      }),
    );
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    renderWithProviders(ui(fixture), { queryClient: qc });
    await userEvent.type(screen.getByLabelText(/reason/i), 'Reconcile');
    const dateInput = screen.getByLabelText(/date/i);
    fireEvent.change(dateInput, { target: { value: tomorrow } });
    await userEvent.click(screen.getByRole('button', { name: /ok/i }));
    expect(await screen.findByText(/date cannot be in the future/i)).toBeInTheDocument();
    expect(called).toBe(false);
  });

  it('happy path: fires PUT with correct body, closes dialog, invalidates queries', async () => {
    const qc = makeQueryClient();
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries');
    let body: unknown = null;
    let path: string | null = null;
    server.use(
      http.put('http://localhost:8080/api/accounts/a1/balance', async ({ request }) => {
        path = new URL(request.url).pathname;
        body = await request.json();
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
          transferType: 'Adjustment',
          category: null,
          date: `${today}T00:00:00.000Z`,
          labels: [],
        });
      }),
    );
    const onOpenChange = vi.fn();
    renderWithProviders(ui(fixture, onOpenChange), { queryClient: qc });
    const target = await screen.findByLabelText(/target balance/i);
    await userEvent.clear(target);
    await userEvent.type(target, '150');
    await userEvent.type(screen.getByLabelText(/reason/i), 'Reconcile');
    await userEvent.click(screen.getByRole('button', { name: /ok/i }));
    await waitFor(() => {
      expect(path).toBe('/api/accounts/a1/balance');
    });
    expect(body).toEqual({
      targetBalance: 150,
      currency: 'USD',
      date: `${today}T00:00:00.000Z`,
      reason: 'Reconcile',
    });
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
    await userEvent.type(screen.getByLabelText(/reason/i), 'Reconcile');
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
    await userEvent.type(screen.getByLabelText(/reason/i), 'Reconcile');
    await userEvent.click(screen.getByRole('button', { name: /ok/i }));
    expect(
      await screen.findByText(/adjustment date must be in the past or present/i),
    ).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
