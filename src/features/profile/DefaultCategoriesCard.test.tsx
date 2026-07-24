import { describe, it, expect, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import { toast } from '@/lib/toast';
import { DefaultCategoriesCard } from './DefaultCategoriesCard';

vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const apiBase = 'http://localhost:8080';
const income = [{ id: 'inc-1', name: 'Salary' }];
const expense = [{ id: 'exp-1', name: 'Food' }];

function renderCard(props: { incomeCurrent: string | null; expenseCurrent: string | null }) {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  renderWithProviders(
    <AuthProvider>
      <DefaultCategoriesCard
        incomeCurrent={props.incomeCurrent}
        expenseCurrent={props.expenseCurrent}
        incomeCategories={income}
        expenseCategories={expense}
      />
    </AuthProvider>,
  );
}

describe('DefaultCategoriesCard', () => {
  it('has no "none" option and PUTs the chosen income category', async () => {
    let body: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/defaults`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
    renderWithProviders(
      <AuthProvider>
        <DefaultCategoriesCard
          incomeCurrent={null}
          expenseCurrent={null}
          incomeCategories={income}
          expenseCategories={expense}
        />
      </AuthProvider>,
    );
    const user = userEvent.setup();

    const row = screen.getByRole('combobox', { name: 'Default income category' });
    await user.click(row);
    expect(screen.queryByRole('option', { name: '— none —' })).not.toBeInTheDocument();
    await user.click(await screen.findByRole('option', { name: 'Salary' }));
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() => expect(body).toEqual({ incomeCategory: 'inc-1' }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Updated.'));
  });

  it('disables Save when there are no changes', () => {
    renderCard({ incomeCurrent: 'inc-1', expenseCurrent: null });
    expect(screen.getByRole('button', { name: /save/i })).toBeDisabled();
  });

  it('PUTs both income and expense categories together', async () => {
    let body: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/defaults`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    renderCard({ incomeCurrent: null, expenseCurrent: null });
    const user = userEvent.setup();

    await user.click(screen.getByRole('combobox', { name: 'Default income category' }));
    await user.click(await screen.findByRole('option', { name: 'Salary' }));
    await user.click(screen.getByRole('combobox', { name: 'Default expense category' }));
    await user.click(await screen.findByRole('option', { name: 'Food' }));
    await user.click(screen.getByRole('button', { name: /save/i }));
    await waitFor(() =>
      expect(body).toEqual({ incomeCategory: 'inc-1', expenseCategory: 'exp-1' }),
    );
  });
});
