import { describe, it, expect, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders, makeQueryClient } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { AccountHeader } from './AccountHeader';
import type { AccountResponse, AccountSubtypeKind } from '@/api/types';

function fixture(overrides: Partial<AccountResponse> = {}): AccountResponse {
  return {
    id: 'a1',
    name: 'Savings',
    balance: 1234.56,
    currency: 'USD',
    overdraftLimit: null,
    subtype: { type: 'cash', storageLocation: 'wallet' },
    version: 1,
    ...overrides,
  };
}

function ui(account: AccountResponse) {
  return (
    <AuthProvider>
      <AccountHeader account={account} />
    </AuthProvider>
  );
}

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
});

describe('AccountHeader', () => {
  it('renders name, subtype label, and formatted balance for a cash account', () => {
    const qc = makeQueryClient();
    qc.setQueryData(['accounts'], [fixture()]);
    renderWithProviders(ui(fixture()), { queryClient: qc });
    expect(screen.getByRole('heading', { name: 'Savings' })).toBeInTheDocument();
    expect(screen.getByText(/cash/i)).toBeInTheDocument();
    expect(screen.getByText(/1,234\.56/)).toBeInTheDocument();
  });

  it('does not render Edit or Adjust balance buttons (moved to the accounts sidebar)', () => {
    const qc = makeQueryClient();
    qc.setQueryData(['accounts'], [fixture()]);
    renderWithProviders(ui(fixture()), { queryClient: qc });
    expect(screen.queryByRole('button', { name: /edit/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /adjust balance/i })).not.toBeInTheDocument();
  });

  it.each<[AccountSubtypeKind, string]>([
    ['cash', 'Cash'],
    ['bankAccount', 'Bank account'],
    ['eWallet', 'E-wallet'],
    ['asset', 'Asset'],
    ['loan', 'Loan'],
  ])('renders human-readable label "%s" for subtype %s', (kind, label) => {
    const qc = makeQueryClient();
    const acc = fixture({ subtype: { type: kind } });
    qc.setQueryData(['accounts'], [acc]);
    renderWithProviders(ui(acc), { queryClient: qc });
    expect(screen.getByText(label)).toBeInTheDocument();
  });
});
