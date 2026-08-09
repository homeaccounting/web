import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import { toast } from '@/lib/toast';
import type { DictionaryEntryResponse } from '@/api/types';
import { BankProviderCategoryMapEditor } from './BankProviderCategoryMapEditor';

vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const apiBase = 'http://localhost:8080';

const GROCERIES = '11111111-1111-1111-1111-111111111111';
const RESTAURANTS = '22222222-2222-2222-2222-222222222222';

const expenseCategories: DictionaryEntryResponse[] = [
  { id: GROCERIES, name: 'Groceries' },
  { id: RESTAURANTS, name: 'Restaurants' },
];

const SALARY = '33333333-3333-3333-3333-333333333333';
const GIFTS = '44444444-4444-4444-4444-444444444444';
const incomeCategories: DictionaryEntryResponse[] = [
  { id: SALARY, name: 'Salary' },
  { id: GIFTS, name: 'Gifts' },
];

function setupEditor(
  value: Record<string, string> = {},
  direction: 'income' | 'expense' = 'expense',
  categories: DictionaryEntryResponse[] = expenseCategories,
) {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  renderWithProviders(
    <AuthProvider>
      <BankProviderCategoryMapEditor value={value} categories={categories} direction={direction} />
    </AuthProvider>,
  );
}

describe('BankProviderCategoryMapEditor (expense)', () => {
  it('renders one row per existing mapping, split by kind (mcc numeric, label text)', () => {
    setupEditor({ 'mcc:5411': GROCERIES, 'label:eating_out': RESTAURANTS });
    expect(screen.getByDisplayValue('5411')).toBeInTheDocument();
    expect(screen.getByDisplayValue('eating_out')).toBeInTheDocument();
    // The label row's kind selector reflects "Label".
    expect(screen.getByRole('combobox', { name: /kind, row 2/i })).toHaveTextContent(/label/i);
  });

  it('add row (defaults to MCC) → enter 5411 + pick category → Save PUTs the tagged map', async () => {
    let body: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/banking`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    setupEditor();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /add mapping/i }));
    await user.type(screen.getByRole('textbox', { name: /mcc code, row 1/i }), '5411');
    await user.click(screen.getByRole('combobox', { name: /category, row 1/i }));
    await user.click(await screen.findByRole('option', { name: 'Groceries' }));
    await user.click(screen.getByRole('button', { name: /^save mapping$/i }));

    await waitFor(() => expect(body).toEqual({ expenseCategoryMap: { 'mcc:5411': GROCERIES } }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Updated.'));
  });

  it('add a LABEL row → switch kind → type label + pick category → Save PUTs the label key', async () => {
    let body: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/banking`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    setupEditor();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /add mapping/i }));
    await user.click(screen.getByRole('combobox', { name: /kind, row 1/i }));
    await user.click(await screen.findByRole('option', { name: /label/i }));
    await user.type(screen.getByRole('textbox', { name: /provider label, row 1/i }), 'eating_out');
    await user.click(screen.getByRole('combobox', { name: /category, row 1/i }));
    await user.click(await screen.findByRole('option', { name: 'Restaurants' }));
    await user.click(screen.getByRole('button', { name: /^save mapping$/i }));

    await waitFor(() =>
      expect(body).toEqual({
        expenseCategoryMap: { 'label:eating_out': RESTAURANTS },
      }),
    );
  });

  it('add a COUNTERPARTY row → switch kind → type token + pick category → Save PUTs the counterparty key', async () => {
    let body: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/banking`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    setupEditor();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /add mapping/i }));
    await user.click(screen.getByRole('combobox', { name: /kind, row 1/i }));
    await user.click(await screen.findByRole('option', { name: /counterparty/i }));
    await user.type(
      screen.getByRole('textbox', { name: /counterparty token, row 1/i }),
      '12345678',
    );
    await user.click(screen.getByRole('combobox', { name: /category, row 1/i }));
    await user.click(await screen.findByRole('option', { name: 'Groceries' }));
    await user.click(screen.getByRole('button', { name: /^save mapping$/i }));

    await waitFor(() =>
      expect(body).toEqual({ expenseCategoryMap: { 'counterparty:12345678': GROCERIES } }),
    );
  });

  it('re-points a seeded label row by changing only its category dropdown', async () => {
    let body: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/banking`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    setupEditor({ 'label:eating_out': GROCERIES });
    const user = userEvent.setup();

    await user.click(screen.getByRole('combobox', { name: /category, row 1/i }));
    await user.click(await screen.findByRole('option', { name: 'Restaurants' }));
    await user.click(screen.getByRole('button', { name: /^save mapping$/i }));

    await waitFor(() =>
      expect(body).toEqual({
        expenseCategoryMap: { 'label:eating_out': RESTAURANTS },
      }),
    );
  });

  it('non-4-digit MCC blocks save with a message and no request', async () => {
    let called = 0;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/banking`, () => {
        called += 1;
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    setupEditor();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /add mapping/i }));
    await user.type(screen.getByRole('textbox', { name: /mcc code, row 1/i }), '54');
    await user.click(screen.getByRole('combobox', { name: /category, row 1/i }));
    await user.click(await screen.findByRole('option', { name: 'Groceries' }));
    await user.click(screen.getByRole('button', { name: /^save mapping$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/4 digits/i);
    expect(called).toBe(0);
  });

  it('blank label blocks save with a message and no request', async () => {
    let called = 0;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/banking`, () => {
        called += 1;
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    setupEditor();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /add mapping/i }));
    await user.click(screen.getByRole('combobox', { name: /kind, row 1/i }));
    await user.click(await screen.findByRole('option', { name: /label/i }));
    // leave the label blank
    await user.click(screen.getByRole('combobox', { name: /category, row 1/i }));
    await user.click(await screen.findByRole('option', { name: 'Groceries' }));
    await user.click(screen.getByRole('button', { name: /^save mapping$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/label is required/i);
    expect(called).toBe(0);
  });

  it('remove row drops it from the payload', async () => {
    let body: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/banking`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    setupEditor({ 'mcc:5411': GROCERIES, 'mcc:5812': RESTAURANTS });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /remove mapping 5411/i }));
    await user.click(screen.getByRole('button', { name: /^save mapping$/i }));

    await waitFor(() => expect(body).toEqual({ expenseCategoryMap: { 'mcc:5812': RESTAURANTS } }));
  });

  it('duplicate tagged keys block save with a message', async () => {
    let called = 0;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/banking`, () => {
        called += 1;
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    setupEditor({ 'mcc:5411': GROCERIES });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /add mapping/i }));
    await user.type(screen.getByRole('textbox', { name: /mcc code, row 2/i }), '5411');
    await user.click(screen.getByRole('combobox', { name: /category, row 2/i }));
    await user.click(await screen.findByRole('option', { name: 'Restaurants' }));
    await user.click(screen.getByRole('button', { name: /^save mapping$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/duplicate/i);
    expect(called).toBe(0);
  });
});

describe('BankProviderCategoryMapEditor (income)', () => {
  it('renders an existing counterparty→income mapping row', () => {
    setupEditor({ 'counterparty:12345678': SALARY }, 'income', incomeCategories);
    expect(screen.getByDisplayValue('12345678')).toBeInTheDocument();
    // Income offers no kind selector — counterparty is the only signal.
    expect(screen.queryByRole('combobox', { name: /kind, row 1/i })).not.toBeInTheDocument();
  });

  it('add row → type counterparty token + pick income category → Save PUTs incomeCategoryMap', async () => {
    let body: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/banking`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    setupEditor({}, 'income', incomeCategories);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /add mapping/i }));
    await user.type(
      screen.getByRole('textbox', { name: /counterparty token, row 1/i }),
      '12345678',
    );
    await user.click(screen.getByRole('combobox', { name: /category, row 1/i }));
    await user.click(await screen.findByRole('option', { name: 'Salary' }));
    await user.click(screen.getByRole('button', { name: /^save mapping$/i }));

    await waitFor(() =>
      expect(body).toEqual({ incomeCategoryMap: { 'counterparty:12345678': SALARY } }),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Updated.'));
  });

  it('the income category dropdown offers only income categories', async () => {
    setupEditor({}, 'income', incomeCategories);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /add mapping/i }));
    await user.click(screen.getByRole('combobox', { name: /category, row 1/i }));
    expect(await screen.findByRole('option', { name: 'Salary' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Gifts' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Groceries' })).not.toBeInTheDocument();
  });

  it('blank counterparty token blocks save with a message and no request', async () => {
    let called = 0;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/banking`, () => {
        called += 1;
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    setupEditor({}, 'income', incomeCategories);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /add mapping/i }));
    // leave token blank
    await user.click(screen.getByRole('combobox', { name: /category, row 1/i }));
    await user.click(await screen.findByRole('option', { name: 'Salary' }));
    await user.click(screen.getByRole('button', { name: /^save mapping$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/counterparty token is required/i);
    expect(called).toBe(0);
  });
});
