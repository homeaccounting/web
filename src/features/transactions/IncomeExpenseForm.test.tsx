import { describe, expect, it, vi } from 'vitest';
import { screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import type { AccountResponse, DictionaryEntryResponse } from '@/api/types';
import { IncomeExpenseForm, type IncomeExpenseFormApi } from './IncomeExpenseForm';
import type { IncomeExpenseFormValues } from './schema';

const A1 = '00000000-0000-0000-0000-000000000001';
const A2 = '00000000-0000-0000-0000-000000000002';
const C1 = '00000000-0000-0000-0000-000000000003';
const C2 = '00000000-0000-0000-0000-000000000006';
const L1 = '00000000-0000-0000-0000-000000000004';
const RC1 = '00000000-0000-0000-0000-000000000005';

const accounts: AccountResponse[] = [
  {
    id: A1,
    name: 'Checking',
    balance: 100,
    currency: 'USD',
    overdraftLimit: null,
    subtype: null,
    status: 'Opened',
    version: 1,
  },
  {
    id: A2,
    name: 'Savings',
    balance: 0,
    currency: 'EUR',
    overdraftLimit: null,
    subtype: null,
    status: 'Opened',
    version: 1,
  },
];
const categories: DictionaryEntryResponse[] = [{ id: C1, name: 'Food' }];
const reimbursementCategories: DictionaryEntryResponse[] = [{ id: RC1, name: 'Refund' }];
const labels: DictionaryEntryResponse[] = [{ id: L1, name: 'Trip' }];

const emptyRow = { category: '', amount: NaN };

const expenseDefaults: IncomeExpenseFormValues = {
  accountId: A1,
  currency: 'USD',
  incomes: [],
  expenses: [{ ...emptyRow }],
  description: '',
  date: '',
  labels: [],
};

const incomeDefaults: IncomeExpenseFormValues = {
  accountId: A1,
  currency: 'USD',
  incomes: [{ ...emptyRow }],
  expenses: [],
  description: '',
  date: '',
  labels: [],
};

describe('IncomeExpenseForm', () => {
  it('renders only an Expense categories section for an expense', () => {
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        labels={labels}
        defaultValues={expenseDefaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByLabelText(/account/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /expense categories/i })).toBeInTheDocument();
    expect(screen.queryByText(/income categories/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/reimbursement/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/description/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/date/i)).toBeInTheDocument();
  });

  it('renders Income categories and a collapsed Reimbursements section for income', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <IncomeExpenseForm
        kind="income"
        mode="create"
        accounts={accounts}
        categories={categories}
        reimbursementCategories={reimbursementCategories}
        labels={labels}
        defaultValues={incomeDefaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByText(/income categories/i)).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /reimbursement/i });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    // Collapsed: the reimbursement section's "Add reimbursement" button is hidden.
    expect(screen.queryByRole('button', { name: /add reimbursement/i })).not.toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: /add reimbursement/i })).toBeInTheDocument();
  });

  it('keeps a visible currency display', () => {
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        labels={labels}
        defaultValues={expenseDefaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('currency-badge')).toHaveTextContent('USD');
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
        defaultValues={expenseDefaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('currency-badge')).toHaveTextContent('USD');
    await user.selectOptions(screen.getByLabelText(/account/i), A2);
    await waitFor(() => expect(screen.getByTestId('currency-badge')).toHaveTextContent('EUR'));
  });

  it('calls onSubmit with the expense slice in the expenses array', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        labels={labels}
        defaultValues={expenseDefaults}
        isSubmitting={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    // The editor's category combobox is identified by its placeholder (the
    // labels multi-select is the page's other combobox).
    const categoryCb = screen.getByPlaceholderText(/select a category/i);
    await user.click(categoryCb);
    await user.type(categoryCb, 'fo');
    await user.click(await screen.findByRole('option', { name: /food/i }));
    // Fill the amount (the only spinbutton in the editor row).
    const amount = screen.getByRole('spinbutton');
    await user.clear(amount);
    await user.type(amount, '12.5');
    await user.type(screen.getByLabelText(/description/i), 'Lunch');
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const arg = onSubmit.mock.calls[0]![0] as IncomeExpenseFormValues;
    expect(arg).toMatchObject({
      accountId: A1,
      currency: 'USD',
      description: 'Lunch',
      incomes: [],
    });
    expect(arg.expenses).toEqual([{ category: C1, amount: 12.5 }]);
  });

  it('drops a fully-empty extra row before calling onSubmit', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        labels={labels}
        defaultValues={expenseDefaults}
        isSubmitting={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    // Fill the first row.
    const categoryCb = screen.getByPlaceholderText(/select a category/i);
    await user.click(categoryCb);
    await user.type(categoryCb, 'fo');
    await user.click(await screen.findByRole('option', { name: /food/i }));
    const amount = screen.getByRole('spinbutton');
    await user.clear(amount);
    await user.type(amount, '5');
    // Add a second, blank row.
    await user.click(screen.getByRole('button', { name: /add category/i }));
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const arg = onSubmit.mock.calls[0]![0] as IncomeExpenseFormValues;
    expect(arg.expenses).toEqual([{ category: C1, amount: 5 }]);
  });

  it('keeps a partial row (category set, blank amount) and blocks submit', async () => {
    // A row with a category but a blank (NaN) amount is NOT fully-empty, so the
    // resolver-wrap keeps it; it then fails positive-amount validation and the
    // form must not submit.
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const partialDefaults: IncomeExpenseFormValues = {
      ...expenseDefaults,
      // Row 1 valid; row 2 has a category but a blank amount (NaN).
      expenses: [
        { category: C1, amount: 10 },
        { category: C2, amount: NaN },
      ],
    };
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        labels={labels}
        defaultValues={partialDefaults}
        isSubmitting={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    // The blank-amount row renders its amount input as '' (see AllocationsEditor).
    const amounts = screen.getAllByRole('spinbutton');
    expect(amounts).toHaveLength(2);
    expect(amounts[1]).toHaveValue(null);
    fireEvent.submit(screen.getByRole('form'));
    // z.coerce.number() on a NaN amount fails type coercion before .positive()
    // runs, so the per-row FormMessage shows the coercion error. Either way the
    // partial row is validated (not dropped) and submit is blocked.
    await waitFor(() =>
      expect(screen.getByText(/received nan|amount must be positive/i)).toBeInTheDocument(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('shows the at-least-one-category error when the only row is fully empty', async () => {
    // The single seeded row is fully-empty (category:'' + NaN amount), so the
    // resolver-wrap drops it; with no slices in either bucket the section-level
    // "Add at least one category" error renders at the expenses error slot.
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        labels={labels}
        defaultValues={expenseDefaults}
        isSubmitting={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(screen.getByText(/add at least one category/i)).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
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
        defaultValues={expenseDefaults}
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
    expect(screen.getByRole('button', { name: /remove trip/i })).toBeInTheDocument();
    expect(cb).toHaveValue('');
  });

  describe('edit mode', () => {
    const editDefaults: IncomeExpenseFormValues = {
      accountId: A1,
      currency: 'USD',
      incomes: [],
      expenses: [{ category: C1, amount: 10 }],
      description: 'old',
      date: '2026-03-04',
      labels: [],
    };

    it('hides "Defaults to today" helper text', () => {
      renderWithProviders(
        <IncomeExpenseForm
          kind="expense"
          mode="edit"
          accounts={accounts}
          categories={categories}
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
        <IncomeExpenseForm
          kind="expense"
          mode="edit"
          accounts={accounts}
          categories={categories}
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
        <IncomeExpenseForm
          kind="expense"
          mode="edit"
          accounts={accounts}
          categories={categories}
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

  it('exposes setFieldError via onReady so server errors render under fields', async () => {
    let api!: IncomeExpenseFormApi;
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        labels={labels}
        defaultValues={expenseDefaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
        onReady={(a) => {
          api = a;
        }}
      />,
    );
    api.setFieldError('description', 'Server says no');
    expect(await screen.findByText('Server says no')).toBeInTheDocument();
  });
});
