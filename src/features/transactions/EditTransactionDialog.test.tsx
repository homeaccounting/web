import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { EditTransactionDialog } from './EditTransactionDialog';
import type { TransactionResponse } from '@/api/types';

const apiBase = 'http://localhost:8080';

// Valid UUID for account (the fixture uses 'a1' which is not a valid UUID)
const accountId = '00000000-0000-0000-0000-000000000001';
const categoryId = '00000000-0000-0000-0000-000000000002';

const baseTx: TransactionResponse = {
  id: 'tx-1',
  sourceAccountId: 'ext',
  targetAccountId: accountId,
  sourceAmount: 10,
  sourceCurrency: 'USD',
  targetAmount: 10,
  targetCurrency: 'USD',
  exchangeRate: null,
  description: 'old',
  status: 'Completed',
  failureReason: null,
  transferType: 'Income',
  category: categoryId,
  date: '2026-03-04T00:00:00.000Z',
  labels: [],
};

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
    http.get(`${apiBase}/api/users/me/configuration`, () =>
      HttpResponse.json({
        baseCurrency: 'USD',
        defaultCurrency: 'USD',
        dictionaries: {
          'income-category': {
            entries: [{ id: categoryId, name: 'Salary' }],
          },
          'expense-category': {
            entries: [{ id: categoryId, name: 'Food' }],
          },
          labels: { entries: [] },
        },
        banking: {
          defaultIncomeCategory: null,
          defaultExpenseCategory: null,
          mccExpenseCategoryMap: {},
        },
      }),
    ),
  );
});

function renderDialog(props: {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  tx?: TransactionResponse;
}) {
  const { open = true, onOpenChange = vi.fn(), tx = baseTx } = props;
  return renderWithProviders(
    <AuthProvider>
      <EditTransactionDialog open={open} onOpenChange={onOpenChange} tx={tx} />
    </AuthProvider>,
  );
}

describe('EditTransactionDialog', () => {
  it('renders read-only with a status notice when the transaction is not Completed', async () => {
    renderDialog({ tx: { ...baseTx, status: 'Failed' } });
    expect(
      await screen.findByText(/This transaction is Failed and cannot be edited/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Save$/ })).toBeNull();
  });

  it('description-only edit fires exactly one PUT description and closes the dialog', async () => {
    const calls: string[] = [];
    server.use(
      http.put(`${apiBase}/api/transactions/:id/description`, () => {
        calls.push('description');
        return HttpResponse.json({ ...baseTx, description: 'new' });
      }),
    );
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderDialog({ onOpenChange });
    const descInput = await screen.findByLabelText(/Description/i);
    await user.clear(descInput);
    await user.type(descInput, 'new');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    await screen.findByRole('button', { name: /^Save$/ });
    expect(calls).toEqual(['description']);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('amount edit fires amendment then allocations in order', async () => {
    const calls: string[] = [];
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, () => {
        calls.push('amendment');
        return HttpResponse.json({ ...baseTx, sourceAmount: 25, targetAmount: 25 });
      }),
      http.patch(`${apiBase}/api/transactions/:id/allocations`, () => {
        calls.push('allocations');
        return HttpResponse.json({ ...baseTx, sourceAmount: 25, targetAmount: 25 });
      }),
    );
    const user = userEvent.setup();
    renderDialog({});
    const amount = await screen.findByLabelText(/^Amount$/i);
    await user.clear(amount);
    await user.type(amount, '25');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    await screen.findByRole('button', { name: /^Save$/ });
    expect(calls).toEqual(['amendment', 'allocations']);
  });

  it('first-failure surfaces a banner and stops further requests', async () => {
    const calls: string[] = [];
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, () => {
        calls.push('amendment');
        return HttpResponse.json({ status: 422, message: 'amount too small' }, { status: 422 });
      }),
      http.patch(`${apiBase}/api/transactions/:id/allocations`, () => {
        calls.push('allocations');
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    const user = userEvent.setup();
    renderDialog({});
    const amount = await screen.findByLabelText(/^Amount$/i);
    await user.clear(amount);
    await user.type(amount, '25');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/amount too small/i);
    expect(calls).toEqual(['amendment']);
  });

  it('seeds the account picker with the transaction account after accounts load', async () => {
    // Regression: react-hook-form seeds defaultValues only on mount, so the
    // body must not render until useAccounts has resolved — otherwise the
    // picker is empty and the seeded accountId has no matching <option>.
    renderDialog({});
    const select = await screen.findByLabelText<HTMLSelectElement>(/^Account$/i);
    const options = Array.from(select.options).map((o) => ({ value: o.value, text: o.text }));
    expect(options).toEqual([{ value: accountId, text: 'Checking (USD)' }]);
    expect(select.value).toBe(accountId);
  });

  it('fieldErrors.targetAccountId on income amendment maps to the accountId field', async () => {
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, () =>
        HttpResponse.json(
          { status: 422, message: 'bad', fieldErrors: { targetAccountId: 'unknown account' } },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderDialog({});
    const amount = await screen.findByLabelText(/^Amount$/i);
    await user.clear(amount);
    await user.type(amount, '25');
    await user.click(screen.getByRole('button', { name: /^Save$/ }));
    // The Account select's error must be rendered.
    expect(await screen.findByText(/unknown account/i)).toBeInTheDocument();
  });
});
