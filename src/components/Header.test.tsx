import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { Header } from './Header';

describe('Header / UserMenu', () => {
  it('renders the user menu trigger', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(
      <AuthProvider>
        <Header />
      </AuthProvider>,
    );
    expect(await screen.findByRole('button', { name: /open user menu/i })).toBeInTheDocument();
  });

  it('shows Profile and Sign out in the menu', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(
      <AuthProvider>
        <Header />
      </AuthProvider>,
    );
    await userEvent.setup().click(await screen.findByRole('button', { name: /open user menu/i }));
    expect(screen.getByRole('menuitem', { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
  });
});
