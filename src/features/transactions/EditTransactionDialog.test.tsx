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
const contactAcme = '00000000-0000-0000-0000-0000000000c1';

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
  transactionType: 'income',
  allocations: {
    incomes: [{ categoryId, amount: { amount: 10, currency: 'USD' } }],
    expenses: [],
  },
  date: '2026-03-04T00:00:00.000Z',
  labels: [],
  amendmentCount: 0,
  relations: [],
  contactId: null,
  mcc: null,
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
          income: {
            roots: [{ id: categoryId, name: 'Salary', type: 'item', children: [] }],
          },
          expense: {
            roots: [{ id: categoryId, name: 'Food', type: 'item', children: [] }],
          },
          label: { roots: [] },
          contact: {
            roots: [{ id: contactAcme, name: 'Acme', type: 'item', children: [] }],
          },
        },
        defaults: {
          incomeCategory: null,
          expenseCategory: null,
          account: null,
          subtypeAccounts: {},
        },
        banking: {
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
  it('shows the original MCC for an imported transaction', async () => {
    renderDialog({ tx: { ...baseTx, mcc: '5411' } });
    expect(await screen.findByText(/MCC/i)).toBeInTheDocument();
    expect(screen.getByText('5411')).toBeInTheDocument();
  });

  it('does not show an MCC line for a manual transaction', async () => {
    renderDialog({ tx: { ...baseTx, mcc: null } });
    // Let the dialog settle (form renders once accounts/config resolve).
    await screen.findByRole('dialog');
    expect(screen.queryByText(/MCC/i)).toBeNull();
  });

  it('renders read-only with a status notice when the transaction is not Completed', async () => {
    renderDialog({ tx: { ...baseTx, status: 'Failed' } });
    expect(
      await screen.findByText(/This transaction is Failed and cannot be edited/i),
    ).toBeInTheDocument();
    // The editable form (and thus its submit button, now "OK") must not render;
    // only the read-only notice with its own "OK" dismiss button is shown.
    expect(screen.queryByRole('form')).toBeNull();
  });

  it('renders read-only for an adjustment instead of the expense edit form', async () => {
    // Balance adjustments are booked External -> regular account, so the
    // regular (viewed) account is the *target* leg in account currency while
    // the source leg is the External account in base currency. They must not
    // open the income/expense edit form (the backend cannot amend them).
    const adjustment: TransactionResponse = {
      ...baseTx,
      transactionType: 'adjustment',
      sourceAccountId: 'ext',
      sourceAmount: 40.88,
      sourceCurrency: 'USD',
      targetAccountId: accountId,
      targetAmount: 1833.24,
      targetCurrency: 'UAH',
      allocations: { incomes: [], expenses: [] },
      description: 'Fix2',
    };
    renderDialog({ tx: adjustment });
    expect(await screen.findByText(/balance adjustment and cannot be edited/i)).toBeInTheDocument();
    // Must NOT render the expense edit form (its submit button is now "OK",
    // indistinguishable by name from the notice's dismiss button, so assert on
    // the absence of the form element instead).
    expect(screen.queryByRole('form')).toBeNull();
    expect(screen.queryByLabelText(/^Amount$/i)).toBeNull();
    expect(screen.queryByText(/Edit expense/i)).toBeNull();
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
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await screen.findByRole('button', { name: 'OK' });
    expect(calls).toEqual(['description']);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('total change fires a single amendment carrying the allocations', async () => {
    // A total change folds BOTH allocation buckets into the amendment's
    // `newAllocations` (the backend requires them on every categorised amend),
    // so it must NOT also emit a separate PATCH /allocations. A pure re-split
    // that keeps the total unchanged uses the dedicated allocations endpoint.
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
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await screen.findByRole('button', { name: 'OK' });
    expect(calls).toEqual(['amendment']);
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
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/amount too small/i);
    expect(calls).toEqual(['amendment']);
  });

  it('seeds the contact field from tx.contactId', async () => {
    renderDialog({ tx: { ...baseTx, contactId: contactAcme } });
    const contactCb = await screen.findByRole('combobox', { name: /contact/i });
    expect(contactCb).toHaveValue('Acme');
  });

  it('seeds the account picker with the transaction account after accounts load', async () => {
    // Regression: react-hook-form seeds defaultValues only on mount, so the
    // body must not render until useAccounts has resolved — otherwise the
    // picker is empty and the seeded accountId has no matching option.
    const user = userEvent.setup();
    renderDialog({});
    const select = await screen.findByLabelText(/^Account\b/i);
    // The picker qualifies bank accounts with their bank name (currency shown separately).
    expect(select).toHaveTextContent('Checking · ACME (USD)');
    await user.click(select);
    const options = await screen.findAllByRole('option');
    expect(options.map((o) => o.textContent)).toEqual(['Checking · ACME (USD)']);
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
    await user.click(screen.getByRole('button', { name: 'OK' }));
    // The Account select's error must be rendered.
    expect(await screen.findByText(/unknown account/i)).toBeInTheDocument();
  });

  it('falls back to the banner when allocation/total field errors have no inline target', async () => {
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, () =>
        HttpResponse.json(
          {
            status: 422,
            message: 'fallback message',
            fieldErrors: { newAllocations: 'invalid split', sourceAmount: 'too small' },
          },
          { status: 422 },
        ),
      ),
    );
    const user = userEvent.setup();
    renderDialog({});
    const amount = await screen.findByLabelText(/^Amount$/i);
    await user.clear(amount);
    await user.type(amount, '25');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    // Neither field maps to a form field, so the dialog surfaces the banner.
    expect(await screen.findByRole('alert')).toHaveTextContent(/fallback message/i);
  });
});
