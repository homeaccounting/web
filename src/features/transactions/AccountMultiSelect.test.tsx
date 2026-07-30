import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AccountResponse } from '@/api/types';
import { AccountMultiSelect } from './AccountMultiSelect';

const accounts = [
  { id: 'a1', name: 'Checking', currency: 'USD' },
  { id: 'a2', name: 'Savings', currency: 'USD' },
] as AccountResponse[];

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
});
