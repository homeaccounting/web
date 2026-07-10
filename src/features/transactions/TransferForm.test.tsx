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
    await user.selectOptions(screen.getByLabelText(/target account/i), A2);
    await waitFor(() => expect(screen.getByLabelText(/exchange rate/i)).toBeInTheDocument());
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
    await user.selectOptions(screen.getByLabelText(/target account/i), A1);
    await user.click(screen.getByRole('button', { name: 'OK' }));
    expect(await screen.findByText(/must differ/i)).toBeInTheDocument();
  });
});
