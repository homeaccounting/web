import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import type { AccountResponse, DictionaryEntryResponse } from '@/api/types';
import { IncomeExpenseForm, type IncomeExpenseFormApi } from './IncomeExpenseForm';

const A1 = '00000000-0000-0000-0000-000000000001';
const A2 = '00000000-0000-0000-0000-000000000002';
const C1 = '00000000-0000-0000-0000-000000000003';
const L1 = '00000000-0000-0000-0000-000000000004';

const accounts: AccountResponse[] = [
  {
    id: A1,
    name: 'Checking',
    balance: 100,
    currency: 'USD',
    overdraftLimit: null,
    subtype: null,
    version: 1,
  },
  {
    id: A2,
    name: 'Savings',
    balance: 0,
    currency: 'EUR',
    overdraftLimit: null,
    subtype: null,
    version: 1,
  },
];
const categories: DictionaryEntryResponse[] = [{ id: C1, name: 'Food' }];
const labels: DictionaryEntryResponse[] = [{ id: L1, name: 'Trip' }];

const defaults = {
  accountId: A1,
  amount: 0,
  currency: 'USD',
  category: '',
  description: '',
  date: '',
  labels: [] as string[],
};

describe('IncomeExpenseForm', () => {
  it('renders all expected fields', () => {
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        labels={labels}
        defaultValues={defaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/account/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/amount/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/category/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
  });

  it('updates the locked currency badge when the account changes', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        labels={labels}
        defaultValues={defaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('currency-badge')).toHaveTextContent('USD');
    await user.selectOptions(screen.getByLabelText(/account/i), A2);
    await waitFor(() => expect(screen.getByTestId('currency-badge')).toHaveTextContent('EUR'));
  });

  it('calls onSubmit with parsed values on submit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        labels={labels}
        defaultValues={defaults}
        isSubmitting={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    await user.clear(screen.getByLabelText(/amount/i));
    await user.type(screen.getByLabelText(/amount/i), '12.5');
    await user.click(screen.getByRole('combobox', { name: /category/i }));
    await user.type(screen.getByRole('combobox', { name: /category/i }), 'fo');
    await user.click(await screen.findByRole('option', { name: /food/i }));
    await user.type(screen.getByLabelText(/description/i), 'Lunch');
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({
      accountId: A1,
      amount: 12.5,
      currency: 'USD',
      category: C1,
      description: 'Lunch',
    });
  });

  it('labels combobox filters by typed prefix and toggles entries', async () => {
    const user = userEvent.setup();
    const manyLabels: DictionaryEntryResponse[] = [
      { id: L1, name: 'Trip' },
      { id: '00000000-0000-0000-0000-000000000088', name: 'Treat' },
      { id: '00000000-0000-0000-0000-000000000077', name: 'Home' },
    ];
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        labels={manyLabels}
        defaultValues={defaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const cb = screen.getByRole('combobox', { name: /labels/i });
    await user.click(cb);
    await user.type(cb, 'tr');
    expect(screen.getByRole('option', { name: /trip/i })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: /treat/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /home/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /trip/i }));
    // After picking, a removable chip with the label name appears and the input clears.
    expect(screen.getByRole('button', { name: /remove trip/i })).toBeInTheDocument();
    expect(cb).toHaveValue('');
  });

  it('category combobox filters by typed prefix', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    const manyCategories: DictionaryEntryResponse[] = [
      { id: C1, name: 'Food' },
      { id: '00000000-0000-0000-0000-000000000099', name: 'Fuel' },
      { id: '00000000-0000-0000-0000-0000000000aa', name: 'Travel' },
    ];
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={manyCategories}
        labels={labels}
        defaultValues={defaults}
        isSubmitting={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    const cb = screen.getByRole('combobox', { name: /category/i });
    await user.click(cb);
    await user.type(cb, 'fo');
    expect(screen.getByRole('option', { name: /food/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /travel/i })).not.toBeInTheDocument();
    // "Fuel" contains "fu" but not "fo" — confirm it's filtered out too.
    expect(screen.queryByRole('option', { name: /fuel/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /food/i }));
    expect(cb).toHaveValue('Food');
  });

  it('exposes setFieldError via onReady so server errors render under fields', async () => {
    let api!: IncomeExpenseFormApi;
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        labels={labels}
        defaultValues={defaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        onReady={(a) => {
          api = a;
        }}
      />,
    );
    api.setFieldError('amount', 'Server says no');
    expect(await screen.findByText('Server says no')).toBeInTheDocument();
  });
});
