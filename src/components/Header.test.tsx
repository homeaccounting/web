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

describe('Header navigation', () => {
  const ui = (
    <AuthProvider>
      <Header />
    </AuthProvider>
  );

  it('renders Accounts and Reports as peer nav tabs plus the brand logo', () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(ui, { initialPath: '/' });
    // Brand is now a logo image (accessible name preserved via alt text); the
    // two section tabs are distinct links.
    expect(screen.getByRole('img', { name: 'HomeAccounting' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'HomeAccounting' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Accounts' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Reports' })).toBeInTheDocument();
  });

  it('marks Accounts active on the default area', () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(ui, { initialPath: '/' });
    expect(screen.getByRole('link', { name: 'Accounts' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Reports' })).not.toHaveAttribute('aria-current');
  });

  it('keeps Accounts active when an account is selected', () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(ui, { initialPath: '/accounts/a1' });
    expect(screen.getByRole('link', { name: 'Accounts' })).toHaveAttribute('aria-current', 'page');
  });

  it('marks Reports active on the reports area', () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(ui, { initialPath: '/reports' });
    expect(screen.getByRole('link', { name: 'Reports' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Accounts' })).not.toHaveAttribute('aria-current');
  });
});
