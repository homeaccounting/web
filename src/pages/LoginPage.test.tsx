import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { Routes, Route } from 'react-router-dom';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import LoginPage from './LoginPage';

const apiBase = 'http://localhost:8080';

function ui() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div>home page</div>} />
      </Routes>
    </AuthProvider>
  );
}

describe('LoginPage', () => {
  it('logs in and navigates to /', async () => {
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/login' });
    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'pw1');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    await waitFor(() => expect(screen.getByText('home page')).toBeInTheDocument());
  });

  it('shows backend error message on bad credentials', async () => {
    server.use(
      http.post(`${apiBase}/api/auth/login`, () =>
        HttpResponse.json({ message: 'Invalid email or password' }, { status: 401 }),
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/login' });
    await user.type(screen.getByLabelText(/email/i), 'user@example.com');
    await user.type(screen.getByLabelText(/password/i), 'pw1');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid email or password/i);
  });

  it('renders a Sign in with Google button', () => {
    renderWithProviders(ui(), { initialPath: '/login' });
    expect(screen.getByRole('button', { name: /sign in with google/i })).toBeInTheDocument();
  });
});
