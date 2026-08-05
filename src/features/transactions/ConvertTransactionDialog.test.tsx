import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import {
  configurationFixture,
  foodCategoryId,
  salaryCategoryId,
  tripLabelId,
} from '@/test/fixtures';
import type { TransactionResponse } from '@/api/types';
import type { TransactionKind } from './labels';
import { ConvertTransactionDialog } from './ConvertTransactionDialog';

const apiBase = 'http://localhost:8080';
const accountA = '00000000-0000-0000-0000-000000000001';
const accountB = '00000000-0000-0000-0000-000000000002';
const external = 'ext-1'; // matches profileFixture.externalAccountId

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  server.use(
    http.get(`${apiBase}/api/accounts`, () =>
      HttpResponse.json({
        accounts: [
          {
            id: accountA,
            name: 'Checking',
            balance: 1000,
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
    // Default config has null defaults; override with top-level default categories.
    http.get(`${apiBase}/api/users/me/configuration`, () =>
      HttpResponse.json({
        ...configurationFixture,
        defaults: {
          ...configurationFixture.defaults,
          expenseCategory: foodCategoryId,
          incomeCategory: salaryCategoryId,
        },
      }),
    ),
  );
});

const expenseSource: TransactionResponse = {
  id: 'src-expense',
  sourceAccountId: accountA,
  targetAccountId: external,
  sourceAmount: -42,
  sourceCurrency: 'USD',
  targetAmount: -42,
  targetCurrency: 'USD',
  exchangeRate: null,
  description: 'Lunch',
  status: 'Completed',
  failureReason: null,
  transactionType: 'expense',
  allocations: {
    incomes: [],
    expenses: [{ categoryId: foodCategoryId, amount: { amount: 42, currency: 'USD' } }],
  },
  date: '2026-01-15T08:00:00.000Z',
  labels: [tripLabelId],
  amendmentCount: 0,
  contactId: null,
  bankProviderCategory: null,
  relations: [],
};

function Wrapper({ tx, targetKind }: { tx: TransactionResponse; targetKind: TransactionKind }) {
  const [open, setOpen] = useState(true);
  return (
    <AuthProvider>
      <ConvertTransactionDialog
        open={open}
        onOpenChange={setOpen}
        tx={tx}
        targetKind={targetKind}
      />
    </AuthProvider>
  );
}

describe('ConvertTransactionDialog', () => {
  it('converts an expense to income: External→Regular legs + income allocations, seeded default category', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> = {};
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...expenseSource, transactionType: 'income' });
      }),
    );

    renderWithProviders(<Wrapper tx={expenseSource} targetKind="income" />, { initialPath: '/' });

    expect(await screen.findByRole('dialog', { name: /convert to income/i })).toBeInTheDocument();
    await screen.findByLabelText(/account/i);
    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(Object.keys(body).length).toBeGreaterThan(0));
    expect(body.sourceAccountId).toBe(external);
    expect(body.targetAccountId).toBe(accountA);
    expect(body.targetAmount).toBe(42);
    expect((body.newAllocations as { incomes: unknown[] }).incomes).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('does not send description/date/labels when the user only converts', async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, () => {
        calls.push('amend');
        return HttpResponse.json({ ...expenseSource, transactionType: 'income' });
      }),
      http.put(`${apiBase}/api/transactions/:id/description`, () => {
        calls.push('description');
        return HttpResponse.json(expenseSource);
      }),
      http.put(`${apiBase}/api/transactions/:id/date`, () => {
        calls.push('date');
        return HttpResponse.json(expenseSource);
      }),
      http.put(`${apiBase}/api/transactions/:id/labels`, () => {
        calls.push('labels');
        return HttpResponse.json(expenseSource);
      }),
    );
    renderWithProviders(<Wrapper tx={expenseSource} targetKind="income" />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(calls).toContain('amend'));
    expect(calls).toEqual(['amend']);
  });

  it('leaves the category empty (required) when no banking default is set', async () => {
    server.use(
      http.get(`${apiBase}/api/users/me/configuration`, () =>
        HttpResponse.json(configurationFixture),
      ),
    );
    renderWithProviders(<Wrapper tx={expenseSource} targetKind="income" />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);
    // Category combobox shows its placeholder, not a selected value.
    expect(await screen.findByPlaceholderText(/select a category/i)).toBeInTheDocument();
  });

  it('converts a transfer to expense keeping the "from" leg', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> = {};
    const transferSource: TransactionResponse = {
      ...expenseSource,
      id: 'src-transfer',
      transactionType: 'transfer',
      sourceAccountId: accountA,
      targetAccountId: accountB,
      sourceAmount: 30,
      targetAmount: 30,
      allocations: { incomes: [], expenses: [] },
    };
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...transferSource, transactionType: 'expense' });
      }),
    );
    renderWithProviders(<Wrapper tx={transferSource} targetKind="expense" />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(Object.keys(body).length).toBeGreaterThan(0));
    expect(body.sourceAccountId).toBe(accountA); // kept "from"
    expect(body.targetAccountId).toBe(external);
    expect((body.newAllocations as { expenses: unknown[] }).expenses).toHaveLength(1);
  });

  it('converts income to expense: Regular→External legs + expense allocations', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> = {};
    const incomeSource: TransactionResponse = {
      ...expenseSource,
      id: 'src-income',
      sourceAccountId: external,
      targetAccountId: accountB,
      sourceAmount: 55,
      sourceCurrency: 'USD',
      targetAmount: 55,
      targetCurrency: 'USD',
      transactionType: 'income',
      allocations: {
        incomes: [{ categoryId: salaryCategoryId, amount: { amount: 55, currency: 'USD' } }],
        expenses: [],
      },
    };
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...incomeSource, transactionType: 'expense' });
      }),
    );
    renderWithProviders(<Wrapper tx={incomeSource} targetKind="expense" />, { initialPath: '/' });
    expect(await screen.findByRole('dialog', { name: /convert to expense/i })).toBeInTheDocument();
    await screen.findByLabelText(/account/i);
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(Object.keys(body).length).toBeGreaterThan(0));
    expect(body.sourceAccountId).toBe(accountB); // kept income target → becomes expense source
    expect(body.targetAccountId).toBe(external);
    expect(body.targetAmount).toBe(55);
    expect((body.newAllocations as { expenses: unknown[] }).expenses).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('converts income to transfer: kept income target as transfer target, user picks source', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> = {};
    const incomeSource: TransactionResponse = {
      ...expenseSource,
      id: 'src-income-transfer',
      sourceAccountId: external,
      targetAccountId: accountB,
      sourceAmount: 55,
      sourceCurrency: 'USD',
      targetAmount: 55,
      targetCurrency: 'USD',
      transactionType: 'income',
      allocations: {
        incomes: [{ categoryId: salaryCategoryId, amount: { amount: 55, currency: 'USD' } }],
        expenses: [],
      },
    };
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...incomeSource, transactionType: 'transfer' });
      }),
    );
    renderWithProviders(<Wrapper tx={incomeSource} targetKind="transfer" />, {
      initialPath: '/',
    });
    expect(await screen.findByRole('dialog', { name: /convert to transfer/i })).toBeInTheDocument();
    await screen.findByLabelText(/source account/i);
    // Source is empty by default (user must pick); select accountA.
    await user.click(screen.getByLabelText(/source account/i));
    await user.click(await screen.findByRole('option', { name: /checking/i }));
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(Object.keys(body).length).toBeGreaterThan(0));
    expect(body.sourceAccountId).toBe(accountA); // user-picked source
    expect(body.targetAccountId).toBe(accountB); // kept income target
    expect(body.newAllocations).toBeUndefined();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('converts expense to transfer: kept expense source as transfer source, user picks target', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> = {};
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...expenseSource, transactionType: 'transfer' });
      }),
    );
    renderWithProviders(<Wrapper tx={expenseSource} targetKind="transfer" />, { initialPath: '/' });
    expect(await screen.findByRole('dialog', { name: /convert to transfer/i })).toBeInTheDocument();
    await screen.findByLabelText(/source account/i);
    // Target is empty by default (user must pick); select accountB.
    await user.click(screen.getByLabelText(/target account/i));
    await user.click(await screen.findByRole('option', { name: /savings/i }));
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(Object.keys(body).length).toBeGreaterThan(0));
    expect(body.sourceAccountId).toBe(accountA); // kept expense source
    expect(body.targetAccountId).toBe(accountB); // user-picked target
    expect(body.newAllocations).toBeUndefined();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('converts transfer to income: External→kept "to" legs + income allocations', async () => {
    const user = userEvent.setup();
    let body: Record<string, unknown> = {};
    const transferSource: TransactionResponse = {
      ...expenseSource,
      id: 'src-transfer-income',
      transactionType: 'transfer',
      sourceAccountId: accountA,
      targetAccountId: accountB,
      sourceAmount: 30,
      targetAmount: 30,
      allocations: { incomes: [], expenses: [] },
    };
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ ...transferSource, transactionType: 'income' });
      }),
    );
    renderWithProviders(<Wrapper tx={transferSource} targetKind="income" />, { initialPath: '/' });
    expect(await screen.findByRole('dialog', { name: /convert to income/i })).toBeInTheDocument();
    await screen.findByLabelText(/account/i);
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(Object.keys(body).length).toBeGreaterThan(0));
    expect(body.sourceAccountId).toBe(external); // external account
    expect(body.targetAccountId).toBe(accountB); // kept transfer "to" leg
    expect((body.newAllocations as { incomes: unknown[] }).incomes).toHaveLength(1);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('fires description sub-call when user changes description before submitting', async () => {
    const user = userEvent.setup();
    const calls: string[] = [];
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, () => {
        calls.push('amend');
        return HttpResponse.json({ ...expenseSource, transactionType: 'income' });
      }),
      http.put(`${apiBase}/api/transactions/:id/description`, () => {
        calls.push('description');
        return HttpResponse.json(expenseSource);
      }),
      http.put(`${apiBase}/api/transactions/:id/date`, () => {
        calls.push('date');
        return HttpResponse.json(expenseSource);
      }),
      http.put(`${apiBase}/api/transactions/:id/labels`, () => {
        calls.push('labels');
        return HttpResponse.json(expenseSource);
      }),
    );
    renderWithProviders(<Wrapper tx={expenseSource} targetKind="income" />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);
    // Change the description field before submitting.
    const descInput = screen.getByLabelText(/description/i);
    await user.clear(descInput);
    await user.type(descInput, 'Modified description');
    await user.click(screen.getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(calls).toContain('amend'));
    await waitFor(() => expect(calls).toContain('description'));
    expect(calls).not.toContain('date');
    expect(calls).not.toContain('labels');
  });

  it('surfaces a generic error in a destructive banner', async () => {
    const user = userEvent.setup();
    server.use(
      http.put(`${apiBase}/api/transactions/:id/amendment`, () =>
        HttpResponse.json({ message: 'Boom' }, { status: 500 }),
      ),
    );
    renderWithProviders(<Wrapper tx={expenseSource} targetKind="income" />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByText(/boom/i)).toBeInTheDocument();
  });
});
