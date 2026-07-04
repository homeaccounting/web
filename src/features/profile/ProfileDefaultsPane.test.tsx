import { describe, it, expect } from 'vitest';
import { screen } from '@testing-library/react';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import { ProfileDefaultsPane } from './ProfileDefaultsPane';

describe('ProfileDefaultsPane', () => {
  it('renders both defaults cards once loaded', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(
      <AuthProvider>
        <ProfileDefaultsPane />
      </AuthProvider>,
    );
    expect(await screen.findByText('Default categories')).toBeInTheDocument();
    expect(await screen.findByText('Default accounts')).toBeInTheDocument();
  });
});
