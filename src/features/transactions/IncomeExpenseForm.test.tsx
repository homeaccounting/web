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
    role: 'owner',
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
    role: 'owner',
    version: 1,
  },
];
const CT1 = '00000000-0000-0000-0000-0000000000c1';
const categories: DictionaryEntryResponse[] = [{ id: C1, name: 'Food' }];
const reimbursementCategories: DictionaryEntryResponse[] = [{ id: RC1, name: 'Refund' }];
const labels: DictionaryEntryResponse[] = [{ id: L1, name: 'Trip' }];
const contacts: DictionaryEntryResponse[] = [{ id: CT1, name: 'Acme' }];

const emptyRow = { category: '', amount: NaN };

const expenseDefaults: IncomeExpenseFormValues = {
  accountId: A1,
  currency: 'USD',
  incomes: [],
  expenses: [{ ...emptyRow }],
  description: '',
  date: '2026-06-01',
  labels: [],
  contactId: null,
};

const incomeDefaults: IncomeExpenseFormValues = {
  accountId: A1,
  currency: 'USD',
  incomes: [{ ...emptyRow }],
  expenses: [],
  description: '',
  date: '2026-06-01',
  labels: [],
  contactId: null,
};

describe('IncomeExpenseForm', () => {
  it('renders only an Expense categories section for an expense', () => {
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        contacts={contacts}
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
        contacts={contacts}
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

  it('lays out the account and currency fields in a 2-column grid on wide screens', () => {
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        contacts={contacts}
        labels={labels}
        defaultValues={expenseDefaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('form-grid-account-currency').className).toContain('sm:grid-cols-2');
  });

  it('keeps a visible currency display', () => {
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        contacts={contacts}
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
        contacts={contacts}
        labels={labels}
        defaultValues={expenseDefaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByTestId('currency-badge')).toHaveTextContent('USD');
    await user.click(screen.getByLabelText(/account/i));
    await user.click(await screen.findByRole('option', { name: /savings/i }));
    await waitFor(() => expect(screen.getByTestId('currency-badge')).toHaveTextContent('EUR'));
  });

  it('qualifies same-named accounts with their bank name in the account picker', async () => {
    const user = userEvent.setup();
    const sameName: AccountResponse[] = [
      { ...accounts[0]!, id: A1, name: 'visa', subtype: { type: 'bankAccount', bankName: 'Monobank' } },
      { ...accounts[1]!, id: A2, name: 'visa', subtype: { type: 'bankAccount', bankName: 'PrivatBank' } },
    ];
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={sameName}
        categories={categories}
        contacts={contacts}
        labels={labels}
        defaultValues={expenseDefaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByLabelText(/account/i));
    expect(await screen.findByRole('option', { name: /visa · Monobank/ })).toBeInTheDocument();
    expect(await screen.findByRole('option', { name: /visa · PrivatBank/ })).toBeInTheDocument();
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
        contacts={contacts}
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
        contacts={contacts}
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
        contacts={contacts}
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
        contacts={contacts}
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
        contacts={contacts}
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

  it('renders a Contact field', () => {
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        contacts={contacts}
        labels={labels}
        defaultValues={expenseDefaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    expect(screen.getByRole('combobox', { name: /contact/i })).toBeInTheDocument();
  });

  it('submits the picked contact as contactId', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        contacts={contacts}
        labels={labels}
        defaultValues={expenseDefaults}
        isSubmitting={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    // Fill a valid expense row.
    const categoryCb = screen.getByPlaceholderText(/select a category/i);
    await user.click(categoryCb);
    await user.type(categoryCb, 'fo');
    await user.click(await screen.findByRole('option', { name: /food/i }));
    const amount = screen.getByRole('spinbutton');
    await user.clear(amount);
    await user.type(amount, '5');
    // Pick a contact.
    const contactCb = screen.getByRole('combobox', { name: /contact/i });
    await user.click(contactCb);
    await user.click(await screen.findByRole('option', { name: /acme/i }));
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const arg = onSubmit.mock.calls[0]![0] as IncomeExpenseFormValues;
    expect(arg.contactId).toBe(CT1);
  });

  it('creating a contact calls onCreateContact and selects the returned id', async () => {
    const NEW_ID = '00000000-0000-0000-0000-0000000000c9';
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onCreateContact = vi.fn().mockResolvedValue(NEW_ID);
    const user = userEvent.setup();
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        contacts={contacts}
        labels={labels}
        defaultValues={expenseDefaults}
        isSubmitting={false}
        onSubmit={onSubmit}
        onCreateContact={onCreateContact}
        onCancel={vi.fn()}
      />,
    );
    // Fill a valid expense row so submit is otherwise allowed.
    const categoryCb = screen.getByPlaceholderText(/select a category/i);
    await user.click(categoryCb);
    await user.type(categoryCb, 'fo');
    await user.click(await screen.findByRole('option', { name: /food/i }));
    const amount = screen.getByRole('spinbutton');
    await user.clear(amount);
    await user.type(amount, '5');
    // Type a novel name and activate the "Create" row.
    const contactCb = screen.getByRole('combobox', { name: /contact/i });
    await user.click(contactCb);
    await user.type(contactCb, 'Carol');
    await user.click(screen.getByText(/create.*carol/i));
    await waitFor(() => expect(onCreateContact).toHaveBeenCalledWith('Carol'));
    // The resolved id is committed to the field, so it rides along on submit.
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const arg = onSubmit.mock.calls[0]![0] as IncomeExpenseFormValues;
    expect(arg.contactId).toBe(NEW_ID);
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
      contactId: null,
    };

    it('hides "Defaults to today" helper text', () => {
      renderWithProviders(
        <IncomeExpenseForm
          kind="expense"
          mode="edit"
          accounts={accounts}
          categories={categories}
          contacts={contacts}
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
          contacts={contacts}
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
          contacts={contacts}
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

  describe('lockTarget (target acts as a ceiling)', () => {
    const lockDefaults: IncomeExpenseFormValues = {
      accountId: A1,
      currency: 'USD',
      incomes: [],
      expenses: [{ category: C1, amount: 100 }],
      description: 'Refund',
      date: '2026-03-04',
      labels: [],
      contactId: null,
      targetMode: true,
      targetTotal: 100,
    };

    it('submits when allocations sum UNDER the locked target (partial)', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderWithProviders(
        <IncomeExpenseForm
          kind="expense"
          mode="create"
          accounts={accounts}
          categories={categories}
          contacts={contacts}
          labels={labels}
          defaultValues={lockDefaults}
          isSubmitting={false}
          lockTarget
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />,
      );
      // Lower the only slice from 100 to 60 — a partial (sum 60 < target 100).
      const amount = screen.getByRole('spinbutton');
      await user.clear(amount);
      await user.type(amount, '60');
      fireEvent.submit(screen.getByRole('form'));
      await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
      const arg = onSubmit.mock.calls[0]![0] as IncomeExpenseFormValues;
      expect(arg.expenses).toEqual([{ category: C1, amount: 60 }]);
    });

    it('blocks when allocations sum OVER the locked target', async () => {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderWithProviders(
        <IncomeExpenseForm
          kind="expense"
          mode="create"
          accounts={accounts}
          categories={categories}
          contacts={contacts}
          labels={labels}
          defaultValues={lockDefaults}
          isSubmitting={false}
          lockTarget
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />,
      );
      const amount = screen.getByRole('spinbutton');
      await user.clear(amount);
      await user.type(amount, '150');
      fireEvent.submit(screen.getByRole('form'));
      await waitFor(() => expect(screen.getByText(/over the target/i)).toBeInTheDocument());
      expect(onSubmit).not.toHaveBeenCalled();
    });
  });

  it('runs an extraRefine that blocks submit and shows its message', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        contacts={contacts}
        labels={labels}
        defaultValues={expenseDefaults}
        isSubmitting={false}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
        extraRefine={(_v, ctx) => {
          ctx.addIssue({
            code: 'custom',
            path: ['expenses'],
            message: 'extra refine blocked this',
          });
        }}
      />,
    );
    // Fill a valid row so only the extraRefine can block submission.
    const categoryCb = screen.getByPlaceholderText(/select a category/i);
    await user.click(categoryCb);
    await user.type(categoryCb, 'fo');
    await user.click(await screen.findByRole('option', { name: /food/i }));
    const amount = screen.getByRole('spinbutton');
    await user.clear(amount);
    await user.type(amount, '5');
    fireEvent.submit(screen.getByRole('form'));
    await waitFor(() => expect(screen.getByText('extra refine blocked this')).toBeInTheDocument());
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('exposes setFieldError via onReady so server errors render under fields', async () => {
    let api!: IncomeExpenseFormApi;
    renderWithProviders(
      <IncomeExpenseForm
        kind="expense"
        mode="create"
        accounts={accounts}
        categories={categories}
        contacts={contacts}
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
