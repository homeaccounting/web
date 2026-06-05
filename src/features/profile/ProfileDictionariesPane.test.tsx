import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import { ProfileDictionariesPane } from './ProfileDictionariesPane';

describe('ProfileDictionariesPane', () => {
  it('renders Categories (Income/Expense) and Labels cards from fixture', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(
      <AuthProvider>
        <ProfileDictionariesPane />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByText('Categories')).toBeInTheDocument());
    expect(screen.getAllByText('Labels').length).toBeGreaterThan(0);
    expect(screen.getByText('Income')).toBeInTheDocument();
    expect(screen.getByText('Expense')).toBeInTheDocument();
    expect(screen.getByText('Salary')).toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.getByText('Trip')).toBeInTheDocument();
  });
});
