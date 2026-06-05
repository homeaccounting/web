import { describe, expect, it, beforeEach } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import ProfilePage from './ProfilePage';

function ui() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/profile/:tab" element={<ProfilePage />} />
      </Routes>
    </AuthProvider>
  );
}

describe('ProfilePage', () => {
  beforeEach(() => {
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  });

  it('renders three tabs with General selected by default', () => {
    renderWithProviders(ui(), { initialPath: '/profile' });
    expect(screen.getByRole('tab', { name: /general/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: /dictionaries/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /auth/i })).toBeInTheDocument();
  });

  it('deep-links to the dictionaries tab', () => {
    renderWithProviders(ui(), { initialPath: '/profile/dictionaries' });
    expect(screen.getByRole('tab', { name: /dictionaries/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('clicking a tab makes it active', async () => {
    renderWithProviders(ui(), { initialPath: '/profile' });
    await userEvent.setup().click(screen.getByRole('tab', { name: /auth/i }));
    expect(screen.getByRole('tab', { name: /auth/i })).toHaveAttribute('aria-selected', 'true');
  });
});
