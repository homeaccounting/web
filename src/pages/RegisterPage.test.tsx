import { describe, expect, it } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import RegisterPage from './RegisterPage';

function ui() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<div>home page</div>} />
      </Routes>
    </AuthProvider>
  );
}

describe('RegisterPage', () => {
  it('shows the brand logo so users recognize the app', () => {
    renderWithProviders(ui(), { initialPath: '/register' });
    expect(screen.getByRole('img', { name: 'HomeAccounting' })).toBeInTheDocument();
  });

  it('rejects short passwords client-side', async () => {
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/register' });
    await user.type(screen.getByLabelText(/password/i), 'short');
    await user.click(screen.getByRole('button', { name: /^create account$/i }));
    expect(await screen.findByText(/at least 8/i)).toBeInTheDocument();
  });

  it('registers successfully and navigates to /', async () => {
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/register' });
    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'longenough');
    await user.click(screen.getByRole('button', { name: /^create account$/i }));
    await waitFor(() => expect(screen.getByText('home page')).toBeInTheDocument());
  });

  it('renders a Sign up with Google button', () => {
    renderWithProviders(ui(), { initialPath: '/register' });
    expect(screen.getByRole('button', { name: /sign up with google/i })).toBeInTheDocument();
  });
});
