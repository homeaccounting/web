import { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import type { AccountResponse, AccountRole, UUID } from '@/api/types';
import { AccountPicker } from './AccountPicker';

// useFormat → useConfiguration needs an AuthProvider; with no country the
// formatter falls back to the international default.
vi.mock('@/features/configuration/useConfiguration', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/configuration/useConfiguration')>()),
  useConfiguration: () => ({ data: undefined }),
}));

function acc(
  id: string,
  name: string,
  subtype: Record<string, unknown>,
  opts: { currency?: string; role?: AccountRole; balance?: number } = {},
): AccountResponse {
  return {
    id,
    name,
    balance: opts.balance ?? 0,
    currency: opts.currency ?? 'UAH',
    overdraftLimit: null,
    subtype: subtype as AccountResponse['subtype'],
    status: 'Opened',
    role: opts.role ?? 'owner',
    version: 1,
  };
}

const bank = (id: string, name: string, bankName: string, currency = 'UAH') =>
  acc(id, name, { type: 'bankAccount', bankName }, { currency });

const small = [bank('b1', 'Card', 'Mono'), bank('b2', 'Deposit', 'Privat')];
const mixed = [
  acc('c1', 'Pocket', { type: 'cash' }, { currency: 'USD', balance: 12.5 }),
  bank('m1', 'Card', 'Mono'),
  bank('m2', 'Card', 'Mono', 'USD'),
  bank('m3', 'Savings', 'Mono'),
  bank('p1', 'Card', 'Privat'),
  bank('p2', 'Credit', 'Privat'),
  bank('p3', 'Salary', 'Privat'),
];

function Harness({
  accounts,
  initial = null,
  noneLabel,
  onChange,
}: {
  accounts: AccountResponse[];
  initial?: UUID | null;
  noneLabel?: string;
  onChange?: (id: UUID | null) => void;
}) {
  const [value, setValue] = useState<UUID | null>(initial);
  return (
    <AccountPicker
      aria-label="Account"
      accounts={accounts}
      value={value}
      noneLabel={noneLabel}
      onChange={(id) => {
        setValue(id);
        onChange?.(id);
      }}
    />
  );
}

const trigger = () => screen.getByRole('combobox', { name: 'Account' });
const optionNames = () => screen.getAllByRole('option').map((o) => o.getAttribute('aria-label'));

describe('AccountPicker', () => {
  it('shows the placeholder, then the selected short name on the trigger', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness accounts={small} />);
    expect(trigger()).toHaveTextContent('Select an account');
    await user.click(trigger());
    await user.click(screen.getByRole('option', { name: 'Deposit · Privat · UAH' }));
    expect(trigger()).toHaveTextContent('Deposit · Privat · UAH');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('keeps a small single-kind list flat, without headers or search', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness accounts={small} />);
    await user.click(trigger());
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox', { name: 'Search accounts' })).not.toBeInTheDocument();
    expect(optionNames()).toEqual(['Card · Mono · UAH', 'Deposit · Privat · UAH']);
  });

  it('groups rows like the sidebar, with labelled sub-groups', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness accounts={mixed} />);
    await user.click(trigger());
    expect(optionNames()).toEqual([
      'Pocket · USD',
      'Card · Mono · UAH',
      'Card · Mono · USD',
      'Savings · Mono · UAH',
      'Card · Privat · UAH',
      'Credit · Privat · UAH',
      'Salary · Privat · UAH',
    ]);
    const privat = screen.getByRole('group', { name: 'Bank account, Privat' });
    expect(within(privat).getAllByRole('option')).toHaveLength(3);
    expect(screen.getByRole('group', { name: 'Cash' })).toBeInTheDocument();
  });

  it('shows the balance with its currency on each row', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness accounts={mixed} />);
    await user.click(trigger());
    expect(screen.getByRole('option', { name: 'Pocket · USD' })).toHaveTextContent('$12.50');
  });

  it('searches across groups, keeping headers and hiding empty groups', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness accounts={mixed} />);
    await user.click(trigger());
    const search = screen.getByRole('combobox', { name: 'Search accounts' });
    expect(search).toHaveFocus();
    await user.type(search, 'usd');
    expect(optionNames()).toEqual(['Pocket · USD', 'Card · Mono · USD']);
    expect(screen.getByRole('group', { name: 'Bank account, Mono' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Bank account, Privat' })).not.toBeInTheDocument();
    await user.clear(search);
    await user.type(search, 'zzz');
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
    expect(screen.getByText('No matching accounts')).toBeInTheDocument();
  });

  it('is keyboard operable: arrows, Home/End, Enter, Escape', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<Harness accounts={mixed} onChange={onChange} />);
    trigger().focus();
    await user.keyboard('{ArrowDown}');
    const search = screen.getByRole('combobox', { name: 'Search accounts' });
    expect(search).toHaveFocus();
    await user.keyboard('{ArrowDown}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('m1');
    expect(trigger()).toHaveFocus();

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{End}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('p3');

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Home}{Enter}');
    expect(onChange).toHaveBeenLastCalledWith('c1');

    await user.keyboard('{ArrowDown}');
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    expect(trigger()).toHaveFocus();
  });

  it('opens on the selected row', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness accounts={mixed} initial="m3" />);
    await user.click(trigger());
    const search = screen.getByRole('combobox', { name: 'Search accounts' });
    const active = search.getAttribute('aria-activedescendant');
    expect(active && document.getElementById(active)).toHaveAttribute(
      'aria-label',
      'Savings · Mono · UAH',
    );
  });

  it('offers a leading none row that selects null', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <Harness accounts={small} initial="b1" noneLabel="Not imported" onChange={onChange} />,
    );
    await user.click(trigger());
    expect(optionNames()[0]).toBe('Not imported');
    await user.click(screen.getByRole('option', { name: 'Not imported' }));
    expect(onChange).toHaveBeenLastCalledWith(null);
    expect(trigger()).toHaveTextContent('Not imported');
  });

  it('marks the selected option', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Harness accounts={small} initial="b2" />);
    await user.click(trigger());
    expect(screen.getByRole('option', { name: 'Deposit · Privat · UAH' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByRole('option', { name: 'Card · Mono · UAH' })).toHaveAttribute(
      'aria-selected',
      'false',
    );
  });
});
