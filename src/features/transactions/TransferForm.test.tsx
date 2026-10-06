import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import type { AccountResponse, DictionaryEntryResponse } from '@/api/types';
import { TransferForm } from './TransferForm';

const A1 = '00000000-0000-0000-0000-000000000001'; // USD
const A2 = '00000000-0000-0000-0000-000000000002'; // EUR
const A3 = '00000000-0000-0000-0000-000000000003'; // USD2

const accounts: AccountResponse[] = [
  {
    id: A1,
    name: 'USD acct',
    balance: 100,
    currency: 'USD',
    overdraftLimit: null,
    subtype: null,
    status: 'Opened',
    role: 'owner',
    version: 1,
  },
  {
    id: A2,
    name: 'EUR acct',
    balance: 0,
    currency: 'EUR',
    overdraftLimit: null,
    subtype: null,
    status: 'Opened',
    role: 'owner',
    version: 1,
  },
  {
    id: A3,
    name: 'USD2',
    balance: 0,
    currency: 'USD',
    overdraftLimit: null,
    subtype: null,
    status: 'Opened',
    role: 'owner',
    version: 1,
  },
];
const labels: DictionaryEntryResponse[] = [];

const defaults = {
  sourceAccountId: A1,
  targetAccountId: A3,
  amount: 0,
  currency: 'USD',
  description: '',
  exchangeRate: undefined,
  date: '',
  labels: [] as string[],
};

describe('TransferForm', () => {
  it('qualifies same-named accounts with their bank name in the source picker', async () => {
    const user = userEvent.setup();
    const sameName: AccountResponse[] = [
      {
        ...accounts[0]!,
        id: A1,
        name: 'visa',
        subtype: { type: 'bankAccount', bankName: 'Monobank' },
      },
      {
        ...accounts[2]!,
        id: A3,
        name: 'visa',
        subtype: { type: 'bankAccount', bankName: 'PrivatBank' },
      },
    ];
    renderWithProviders(
      <TransferForm
        mode="create"
        accounts={sameName}
        labels={labels}
        defaultValues={defaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText(/source account/i));
    expect(await screen.findByRole('option', { name: /visa · Monobank/ })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: /visa · PrivatBank/ })).toBeInTheDocument();
  });

  it('hides exchangeRate when source/target share a currency', () => {
    renderWithProviders(
      <TransferForm
        mode="create"
        accounts={accounts}
        labels={labels}
        defaultValues={defaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.queryByLabelText(/exchange rate/i)).not.toBeInTheDocument();
  });

  it('shows exchangeRate when source/target differ in currency', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TransferForm
        mode="create"
        accounts={accounts}
        labels={labels}
        defaultValues={defaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText(/target account/i));
    await user.click(await screen.findByRole('option', { name: /eur acct/i }));
    await waitFor(() => expect(screen.getByLabelText(/exchange rate/i)).toBeInTheDocument());
  });

  describe('cross-currency amounts', () => {
    const fxDefaults = { ...defaults, targetAccountId: A2 };

    function renderFx(onSubmit = vi.fn()) {
      renderWithProviders(
        <TransferForm
          mode="create"
          accounts={accounts}
          labels={labels}
          defaultValues={{ ...fxDefaults, date: '2026-03-04T10:00' }}
          isSubmitting={false}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />,
      );
      return onSubmit;
    }

    const amountInput = () => screen.getByRole('spinbutton', { name: /^amount/i });
    const rateInput = () => screen.getByLabelText(/exchange rate/i);
    const targetInput = () => screen.getByLabelText(/target amount/i);

    it('derives the target amount from amount and rate', async () => {
      const user = userEvent.setup();
      renderFx();
      await user.type(amountInput(), '100');
      await user.type(rateInput(), '0.9237');
      expect(targetInput()).toHaveValue(92.37);
    });

    it('derives and submits the rate from amount and target amount', async () => {
      const user = userEvent.setup();
      const onSubmit = renderFx();
      await user.type(amountInput(), '100');
      await user.type(targetInput(), '92.37');
      expect(rateInput()).toHaveValue(0.9237);
      await user.click(screen.getByRole('button', { name: /transfer|ok|create/i }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0]![0]).toMatchObject({ amount: 100, exchangeRate: 0.9237 });
    });

    it('keeps the last-entered value fixed when the amount changes', async () => {
      const user = userEvent.setup();
      renderFx();
      await user.type(amountInput(), '100');
      await user.type(targetInput(), '90');
      await user.clear(amountInput());
      await user.type(amountInput(), '200');
      expect(targetInput()).toHaveValue(90);
      expect(rateInput()).toHaveValue(0.45);

      await user.clear(rateInput());
      await user.type(rateInput(), '0.5');
      await user.clear(amountInput());
      await user.type(amountInput(), '300');
      expect(rateInput()).toHaveValue(0.5);
      expect(targetInput()).toHaveValue(150);
    });
  });

  describe('edit mode', () => {
    const editDefaults = {
      sourceAccountId: A1,
      targetAccountId: A3,
      amount: 50,
      currency: 'USD',
      description: 'd',
      exchangeRate: undefined as number | undefined,
      date: '2026-03-04',
      labels: [] as string[],
    };

    it('hides "Defaults to today" helper text', () => {
      renderWithProviders(
        <TransferForm
          mode="edit"
          accounts={accounts}
          labels={labels}
          defaultValues={editDefaults}
          isSubmitting={false}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.queryByText(/Defaults to today/)).not.toBeInTheDocument();
    });

    it('shows an "OK" submit button', () => {
      renderWithProviders(
        <TransferForm
          mode="edit"
          accounts={accounts}
          labels={labels}
          defaultValues={editDefaults}
          isSubmitting={false}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByRole('button', { name: 'OK' })).toBeInTheDocument();
    });

    it('disables OK when form is clean (no user input)', () => {
      renderWithProviders(
        <TransferForm
          mode="edit"
          accounts={accounts}
          labels={labels}
          defaultValues={editDefaults}
          isSubmitting={false}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByRole('button', { name: 'OK' })).toBeDisabled();
    });
  });

  it('renders an inline error when source equals target', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TransferForm
        mode="create"
        accounts={accounts}
        labels={labels}
        defaultValues={defaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText(/target account/i));
    await user.click(await screen.findByRole('option', { name: /usd acct/i }));
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByText(/must differ/i)).toBeInTheDocument();
  });
});
