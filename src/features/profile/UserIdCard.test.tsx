import { describe, expect, it, beforeEach, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import { UserIdCard } from './UserIdCard';

function renderCard() {
  renderWithProviders(
    <AuthProvider>
      <UserIdCard />
    </AuthProvider>,
  );
}

describe('UserIdCard', () => {
  beforeEach(() => {
    saveSession({ token: 't', userId: 'abc-123', email: 'e@x', expiresAt: 9e15 });
  });

  it('renders the current user id', () => {
    renderCard();
    expect(screen.getByText('abc-123')).toBeInTheDocument();
  });

  it('copies the user id to the clipboard on click', async () => {
    // userEvent.setup() must run before stubbing navigator.clipboard, otherwise it
    // installs its own clipboard shim over ours during setup.
    const user = userEvent.setup();
    const writeText = vi.fn();
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });

    renderCard();
    await user.click(screen.getByRole('button', { name: 'Copy' }));

    expect(writeText).toHaveBeenCalledWith('abc-123');
    expect(screen.getByText('Copied')).toBeInTheDocument();
  });

  it('renders nothing when there is no session', () => {
    localStorage.clear();
    renderCard();
    expect(screen.queryByText(/sharing id/i)).not.toBeInTheDocument();
  });
});
