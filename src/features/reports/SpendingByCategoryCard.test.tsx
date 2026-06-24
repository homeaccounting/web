import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen } from '@testing-library/react';
import { server } from '@/test/server';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { renderWithProviders } from '@/test/utils';
import { SpendingByCategoryCard } from './SpendingByCategoryCard';

const apiBase = 'http://localhost:8080';
const signIn = () => saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });

describe('SpendingByCategoryCard', () => {
  it('resolves category names and renders bars largest-first', async () => {
    signIn();
    renderWithProviders(
      <AuthProvider>
        <SpendingByCategoryCard range={{}} />
      </AuthProvider>,
    );
    expect(await screen.findByText('Food')).toBeInTheDocument();
    expect(screen.getByText('Salary')).toBeInTheDocument();
    const labels = screen.getAllByText(/Food|Salary/).map((n) => n.textContent);
    expect(labels[0]).toBe('Food'); // largest first (120 > 30)
  });

  it('shows empty state when there is no spending', async () => {
    signIn();
    server.use(
      http.get(`${apiBase}/api/reports/spending-by-category`, () =>
        HttpResponse.json({ categories: [], total: { amount: 0, currency: 'USD' } }),
      ),
    );
    renderWithProviders(
      <AuthProvider>
        <SpendingByCategoryCard range={{}} />
      </AuthProvider>,
    );
    expect(await screen.findByText(/no spending/i)).toBeInTheDocument();
  });
});
