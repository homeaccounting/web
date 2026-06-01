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
    version: 1,
  },
  {
    id: A2,
    name: 'EUR acct',
    balance: 0,
    currency: 'EUR',
    overdraftLimit: null,
    subtype: null,
    version: 1,
  },
  {
    id: A3,
    name: 'USD2',
    balance: 0,
    currency: 'USD',
    overdraftLimit: null,
    subtype: null,
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
    await user.click(screen.getByRole('button', { name: /add transfer/i }));
    expect(await screen.findByText(/must differ/i)).toBeInTheDocument();
  });
});
