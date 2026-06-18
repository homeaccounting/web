import { describe, expect, it } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import type { DictionaryEntryResponse } from '@/api/types';
import { DefaultCategoryField } from './DefaultCategoryField';

const apiBase = 'http://localhost:8080';

const GROCERIES = '11111111-1111-1111-1111-111111111111';
const RESTAURANTS = '22222222-2222-2222-2222-222222222222';
const SALARY = '33333333-3333-3333-3333-333333333333';

const expenseCategories: DictionaryEntryResponse[] = [
  { id: GROCERIES, name: 'Groceries' },
  { id: RESTAURANTS, name: 'Restaurants' },
];
const incomeCategories: DictionaryEntryResponse[] = [{ id: SALARY, name: 'Salary' }];

function setupField() {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  renderWithProviders(
    <AuthProvider>
      <DefaultCategoryField
        field="defaultExpenseCategory"
        label="Default expense category"
        current={null}
        categories={expenseCategories}
      />
      <DefaultCategoryField
        field="defaultIncomeCategory"
        label="Default income category"
        current={SALARY}
        categories={incomeCategories}
      />
    </AuthProvider>,
  );
}

describe('DefaultCategoryField', () => {
  it('changing the expense default PUTs defaultExpenseCategory to /configuration/defaults', async () => {
    let body: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/defaults`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    setupField();
    const user = userEvent.setup();

    const row = screen.getByRole('combobox', { name: 'Default expense category' });
    await user.click(row);
    await user.click(await screen.findByRole('option', { name: 'Restaurants' }));
    const form = row.closest('form')!;
    await user.click(within(form).getByRole('button', { name: /save/i }));

    await waitFor(() => expect(body).toEqual({ defaultExpenseCategory: RESTAURANTS }));
  });

  it('selecting — none — sends null in the request body', async () => {
    let body: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/defaults`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    setupField();
    const user = userEvent.setup();

    const row = screen.getByRole('combobox', { name: 'Default income category' });
    await user.click(row);
    await user.click(await screen.findByRole('option', { name: '— none —' }));
    const form = row.closest('form')!;
    await user.click(within(form).getByRole('button', { name: /save/i }));

    await waitFor(() => expect(body).toEqual({ defaultIncomeCategory: null }));
  });
});
