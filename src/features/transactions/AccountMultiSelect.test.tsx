import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountResponse, AccountStatus, UUID } from '@/api/types';
import { AccountMultiSelect } from './AccountMultiSelect';

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
  opts: { currency?: string; status?: AccountStatus } = {},
): AccountResponse {
  return {
    id,
    name,
    balance: 0,
    currency: opts.currency ?? 'UAH',
    overdraftLimit: null,
    subtype: subtype as AccountResponse['subtype'],
    status: opts.status ?? 'Opened',
    role: 'owner',
    version: 1,
  };
}

const bank = (id: string, name: string, bankName: string, currency = 'UAH') =>
  acc(id, name, { type: 'bankAccount', bankName }, { currency });

const accounts = [
  acc('a1', 'Checking', { type: 'cash' }, { currency: 'USD' }),
  acc('a2', 'Savings', { type: 'cash' }, { currency: 'USD' }),
];

// Six bank accounts over two banks, so the sidebar sub-groups them by bank.
const grouped = [
  acc('c1', 'Pocket', { type: 'cash' }),
  bank('m1', 'Card', 'Mono'),
  bank('m2', 'Card', 'Mono', 'USD'),
  bank('m3', 'Savings', 'Mono'),
  bank('p1', 'Card', 'Privat'),
  bank('p2', 'Card', 'Privat', 'USD'),
  bank('p3', 'Salary', 'Privat'),
  acc('x1', 'Old wallet', { type: 'cash' }, { status: 'Closed' }),
];

function Harness({ initial = [] }: { initial?: UUID[] }) {
  const [value, setValue] = useState<UUID[]>(initial);
  return (
    <>
      <AccountMultiSelect options={grouped} value={value} onChange={setValue} />
      <output data-testid="value">{value.join(',')}</output>
    </>
  );
}

const selectedIds = () => screen.getByTestId('value').textContent;

describe('AccountMultiSelect', () => {
  it('shows the "All accounts" placeholder when nothing is selected', () => {
    render(<AccountMultiSelect options={accounts} value={[]} onChange={() => {}} />);
    expect(screen.getByPlaceholderText('All accounts')).toBeInTheDocument();
  });

  it('adds an account id on pick', async () => {
    const onChange = vi.fn();
    render(<AccountMultiSelect options={accounts} value={[]} onChange={onChange} />);
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: /Checking/ }));
    expect(onChange).toHaveBeenCalledWith(['a1']);
  });

  it('renders a removable chip for a selected account', () => {
    render(<AccountMultiSelect options={accounts} value={['a1']} onChange={() => {}} />);
    expect(screen.getByRole('button', { name: /Remove .*Checking/ })).toBeInTheDocument();
  });

  it('groups accounts as the sidebar does, closed accounts last', async () => {
    render(<Harness />);
    await userEvent.click(screen.getByRole('combobox'));
    const names = screen.getAllByRole('option').map((o) => o.getAttribute('aria-label'));
    expect(names).toEqual([
      'All in Cash',
      'Pocket · UAH',
      'All in Bank account',
      'All in Bank account, Mono',
      'Card · Mono · UAH',
      'Card · Mono · USD',
      'Savings · Mono · UAH',
      'All in Bank account, Privat',
      'Card · Privat · UAH',
      'Card · Privat · USD',
      'Salary · Privat · UAH',
      'All in Closed',
      'Old wallet · UAH',
    ]);
    const privat = screen.getByRole('group', { name: 'Bank account, Privat' });
    expect(within(privat).getAllByRole('option')).toHaveLength(4);
  });

  it('toggles every account in a group from its header', async () => {
    render(<Harness initial={['m1']} />);
    await userEvent.click(screen.getByRole('combobox'));
    const header = screen.getByRole('option', { name: 'All in Bank account' });
    expect(header).toHaveAttribute('aria-selected', 'false');

    await userEvent.click(header);
    expect(selectedIds()).toBe('m1,m2,m3,p1,p2,p3');
    expect(screen.getByRole('option', { name: 'All in Bank account' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await userEvent.click(screen.getByRole('option', { name: 'All in Bank account' }));
    expect(selectedIds()).toBe('');
  });

  it('toggles only the bank under a sub-header', async () => {
    render(<Harness initial={['c1']} />);
    await userEvent.click(screen.getByRole('combobox'));
    await userEvent.click(screen.getByRole('option', { name: 'All in Bank account, Privat' }));
    expect(selectedIds()).toBe('c1,p1,p2,p3');
  });

  it('searches every word against the full name, and a header toggles only matches', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByRole('combobox'), 'card usd');
    expect(
      screen
        .getAllByRole('option')
        .map((o) => o.getAttribute('aria-label'))
        .filter((n) => !n?.startsWith('All in')),
    ).toEqual(['Card · Mono · USD', 'Card · Privat · USD']);

    await userEvent.click(screen.getByRole('option', { name: 'All in Bank account' }));
    expect(selectedIds()).toBe('m2,p2');
  });

  it('shows a message when nothing matches', async () => {
    render(<Harness />);
    await userEvent.type(screen.getByRole('combobox'), 'zzz');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText('No matches')).toBeInTheDocument();
  });

  it('toggles a group header from the keyboard', async () => {
    render(<Harness />);
    const input = screen.getByRole('combobox');
    await userEvent.click(input);
    // Row 0 is "All in Cash"; row 2 is "All in Bank account".
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(input).toHaveAttribute(
      'aria-activedescendant',
      screen.getByRole('option', { name: 'All in Bank account' }).id,
    );
    await userEvent.keyboard('{Enter}');
    expect(selectedIds()).toBe('m1,m2,m3,p1,p2,p3');
  });
});
