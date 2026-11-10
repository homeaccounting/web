import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import type { AccountResponse, DictionaryEntryResponse } from '@/api/types';
import { TransferForm } from './TransferForm';
import type { TransferFormValues } from './schema';

vi.mock('@/features/configuration/useConfiguration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/configuration/useConfiguration')>()),
  useConfiguration: () => ({ data: undefined }),
}));

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
  fees: [],
  feeMode: 'source' as const,
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
        feeCategories={[]}
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

  it('does not offer the selected source as a target', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TransferForm
        mode="create"
        accounts={accounts}
        labels={labels}
        feeCategories={[]}
        defaultValues={defaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: /target account/i }));
    expect(screen.queryByRole('option', { name: /^USD acct/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /^USD2/ })).toBeInTheDocument();
  });

  it('clears the target when the current target is picked as source', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <TransferForm
        mode="create"
        accounts={accounts}
        labels={labels}
        feeCategories={[]}
        defaultValues={defaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: /source account/i }));
    await user.click(screen.getByRole('option', { name: /^USD2/ }));
    expect(screen.getByRole('combobox', { name: /target account/i })).toHaveTextContent(
      'Select an account',
    );
  });

  it('offers only open accounts the user can record on', async () => {
    const user = userEvent.setup();
    const extra: AccountResponse[] = [
      ...accounts,
      { ...accounts[0]!, id: 'closed', name: 'Closed one', status: 'Closed' },
      { ...accounts[0]!, id: 'viewer', name: 'Viewed one', role: 'viewer' },
    ];
    renderWithProviders(
      <TransferForm
        mode="create"
        accounts={extra}
        labels={labels}
        feeCategories={[]}
        defaultValues={defaults}
        isSubmitting={false}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    await user.click(screen.getByRole('combobox', { name: /source account/i }));
    expect(screen.queryByRole('option', { name: /^Closed one/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /^Viewed one/ })).not.toBeInTheDocument();
  });

  it('hides exchangeRate when source/target share a currency', () => {
    renderWithProviders(
      <TransferForm
        mode="create"
        accounts={accounts}
        labels={labels}
        feeCategories={[]}
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
        feeCategories={[]}
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

  it('creating a label calls onCreateLabel and submits the new label', async () => {
    const NEW_ID = '00000000-0000-0000-0000-0000000000d9';
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onCreateLabel = vi.fn().mockResolvedValue(NEW_ID);
    renderWithProviders(
      <TransferForm
        mode="create"
        accounts={accounts}
        labels={labels}
        feeCategories={[]}
        defaultValues={{ ...defaults, amount: 10, date: '2026-03-04T10:00' }}
        isSubmitting={false}
        onSubmit={onSubmit}
        onCreateLabel={onCreateLabel}
        onCancel={vi.fn()}
      />,
    );
    const labelsCb = screen.getByRole('combobox', { name: /labels/i });
    await user.click(labelsCb);
    await user.type(labelsCb, 'Rome');
    await user.click(screen.getByRole('option', { name: /create.*rome/i }));
    await waitFor(() => expect(onCreateLabel).toHaveBeenCalledWith('Rome'));
    await user.click(screen.getByRole('button', { name: /transfer|ok|create/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ labels: [NEW_ID] });
  });

  describe('cross-currency amounts', () => {
    const fxDefaults = { ...defaults, targetAccountId: A2 };

    function renderFx(onSubmit = vi.fn()) {
      renderWithProviders(
        <TransferForm
          mode="create"
          accounts={accounts}
          labels={labels}
          feeCategories={[]}
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

  describe('fees', () => {
    const FEE = '00000000-0000-0000-0000-0000000000f1';
    const feeCategories: DictionaryEntryResponse[] = [{ id: FEE, name: 'Bank fee' }];
    const withFee = {
      ...defaults,
      amount: 1000,
      date: '2026-03-04T10:00',
      fees: [{ category: FEE, amount: 10, comment: '' }],
    };

    function renderFees(defaultValues: TransferFormValues, onSubmit = vi.fn()) {
      renderWithProviders(
        <TransferForm
          mode="create"
          accounts={accounts}
          labels={labels}
          feeCategories={feeCategories}
          defaultValues={defaultValues}
          isSubmitting={false}
          onSubmit={onSubmit}
          onCancel={vi.fn()}
        />,
      );
      return onSubmit;
    }

    const summary = () => screen.getByTestId('transfer-fee-summary');

    it('keeps the fee rows hidden until "Add fee" is switched on', async () => {
      const user = userEvent.setup();
      renderFees(defaults);
      expect(screen.queryByRole('radio', { name: /source/i })).not.toBeInTheDocument();
      await user.click(screen.getByRole('switch', { name: /add fee/i }));
      expect(screen.getByRole('radio', { name: /source/i })).toBeChecked();
      expect(screen.getByLabelText(/^category$/i)).toBeInTheDocument();
    });

    it('opens automatically when the transfer already has a fee', () => {
      renderFees(withFee);
      expect(screen.getByRole('switch', { name: /add fee/i })).toBeChecked();
      expect(summary()).toHaveTextContent(/Debited.*1,010.*Received.*1,000.*Fee.*10/);
    });

    it('a deducted fee lowers what is received instead of raising the debit', async () => {
      const user = userEvent.setup();
      renderFees(withFee);
      await user.click(screen.getByRole('radio', { name: /target/i }));
      expect(summary()).toHaveTextContent(/Debited.*1,000.*Received.*990.*Fee.*10/);
    });

    it('submits the fee rows and the chosen mode', async () => {
      const user = userEvent.setup();
      const onSubmit = renderFees(withFee);
      await user.click(screen.getByRole('radio', { name: /target/i }));
      await user.click(screen.getByRole('button', { name: /transfer|ok|create/i }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0]![0]).toMatchObject({
        amount: 1000,
        feeMode: 'target',
        fees: [{ category: FEE, amount: 10 }],
      });
    });

    it('switching the fee off submits a plain transfer', async () => {
      const user = userEvent.setup();
      const onSubmit = renderFees(withFee);
      await user.click(screen.getByRole('switch', { name: /add fee/i }));
      await user.click(screen.getByRole('button', { name: /transfer|ok|create/i }));
      await waitFor(() => expect(onSubmit).toHaveBeenCalled());
      expect(onSubmit.mock.calls[0]![0]).toMatchObject({ fees: [] });
    });

    it('cross-currency: the rate converts the amount less a deducted fee', async () => {
      const user = userEvent.setup();
      renderFees({ ...withFee, targetAccountId: A2, exchangeRate: 0.5 });
      expect(screen.getByLabelText(/target amount/i)).toHaveValue(500);
      await user.click(screen.getByRole('radio', { name: /target/i }));
      expect(screen.getByLabelText(/target amount/i)).toHaveValue(495);
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
      fees: [],
      feeMode: 'source' as const,
    };

    it('hides "Defaults to today" helper text', () => {
      renderWithProviders(
        <TransferForm
          mode="edit"
          accounts={accounts}
          labels={labels}
          feeCategories={[]}
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
          feeCategories={[]}
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
          feeCategories={[]}
          defaultValues={editDefaults}
          isSubmitting={false}
          onSubmit={vi.fn()}
          onCancel={vi.fn()}
        />,
      );
      expect(screen.getByRole('button', { name: 'OK' })).toBeDisabled();
    });
  });
});
