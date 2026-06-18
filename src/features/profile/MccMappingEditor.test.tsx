import { describe, expect, it } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { saveSession } from '@/auth/storage';
import { AuthProvider } from '@/auth/AuthContext';
import { renderWithProviders } from '@/test/utils';
import type { DictionaryEntryResponse } from '@/api/types';
import { MccMappingEditor } from './MccMappingEditor';

const apiBase = 'http://localhost:8080';

const GROCERIES = '11111111-1111-1111-1111-111111111111';
const RESTAURANTS = '22222222-2222-2222-2222-222222222222';

const expenseCategories: DictionaryEntryResponse[] = [
  { id: GROCERIES, name: 'Groceries' },
  { id: RESTAURANTS, name: 'Restaurants' },
];

function setupEditor(value: Record<string, string> = {}) {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  renderWithProviders(
    <AuthProvider>
      <MccMappingEditor value={value} expenseCategories={expenseCategories} />
    </AuthProvider>,
  );
}

describe('MccMappingEditor', () => {
  it('renders one row per existing mapping', () => {
    setupEditor({ '5411': GROCERIES });
    expect(screen.getByDisplayValue('5411')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /category, row 1/i })).toHaveTextContent(
      'Groceries',
    );
  });

  it('add row → enter 5411 + pick category → Save PUTs the map', async () => {
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

    await waitFor(() => expect(body).toEqual({ mccExpenseCategoryMap: { '5411': GROCERIES } }));
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

  it('remove row drops it from the payload', async () => {
    let body: unknown = null;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/banking`, async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    setupEditor({ '5411': GROCERIES, '5812': RESTAURANTS });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /remove mapping 5411/i }));
    await user.click(screen.getByRole('button', { name: /^save mapping$/i }));

    await waitFor(() => expect(body).toEqual({ mccExpenseCategoryMap: { '5812': RESTAURANTS } }));
  });

  it('duplicate MCC codes block save with a message', async () => {
    let called = 0;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/banking`, () => {
        called += 1;
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    setupEditor({ '5411': GROCERIES });
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
