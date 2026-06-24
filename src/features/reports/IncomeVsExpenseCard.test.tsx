import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import { server } from '@/test/server';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { renderWithProviders } from '@/test/utils';
import { IncomeVsExpenseCard } from './IncomeVsExpenseCard';

const apiBase = 'http://localhost:8080';
const signIn = () => saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });

describe('IncomeVsExpenseCard', () => {
  it('renders income, expense, and net', async () => {
    signIn();
    renderWithProviders(
      <AuthProvider>
        <IncomeVsExpenseCard range={{}} />
      </AuthProvider>,
    );
    expect(await screen.findByText('$500.00')).toBeInTheDocument();
    expect(screen.getByText('$150.00')).toBeInTheDocument();
    expect(screen.getByText('$350.00')).toBeInTheDocument();
  });

  it('shows an error state on failure', async () => {
    signIn();
    server.use(
      http.get(
        `${apiBase}/api/reports/income-vs-expense`,
        () => new HttpResponse(null, { status: 500 }),
      ),
    );
    renderWithProviders(
      <AuthProvider>
        <IncomeVsExpenseCard range={{}} />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
  });
});
