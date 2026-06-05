import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { UserMenu } from './UserMenu';

describe('UserMenu', () => {
  it('shows Profile link and Sign out only', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(
      <AuthProvider>
        <UserMenu />
      </AuthProvider>,
    );
    await userEvent.setup().click(await screen.findByRole('button', { name: /open user menu/i }));
    expect(screen.getByRole('menuitem', { name: /profile/i })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /sign out/i })).toBeInTheDocument();
    expect(screen.queryByText(/link google/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/link telegram/i)).not.toBeInTheDocument();
  });

  it('Profile menu item links to /profile', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(
      <AuthProvider>
        <UserMenu />
      </AuthProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole('button', { name: /open user menu/i }));
    const profile = await screen.findByRole('menuitem', { name: /profile/i });
    // Profile item is rendered with asChild + a <Link to="/profile" />;
    // the <a> itself becomes the menuitem element.
    expect(profile).toHaveAttribute('href', '/profile');
  });
});
