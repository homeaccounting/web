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
import { BankProviderContactMapEditor } from './BankProviderContactMapEditor';

vi.mock('@/lib/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const apiBase = 'http://localhost:8080';

const ACME = '11111111-1111-1111-1111-111111111111';
const GLOBEX = '22222222-2222-2222-2222-222222222222';

const contacts: DictionaryEntryResponse[] = [
  { id: ACME, name: 'Acme' },
  { id: GLOBEX, name: 'Globex' },
];

function setupEditor(value: Record<string, string> = {}) {
  saveSession({ token: 't', userId: 'u', email: 'e@x', expiresAt: 9e15 });
  renderWithProviders(
    <AuthProvider>
      <BankProviderContactMapEditor value={value} contacts={contacts} />
    </AuthProvider>,
  );
}

function captureBankingPut() {
  const captured: { body: unknown } = { body: null };
  server.use(
    http.put(`${apiBase}/api/users/me/configuration/banking`, async ({ request }) => {
      captured.body = await request.json();
      return HttpResponse.json({}, { status: 200 });
    }),
  );
  return captured;
}

describe('BankProviderContactMapEditor', () => {
  it('renders one row per existing mapping (token + resolved contact name)', () => {
    setupEditor({ MagazinREMONTI: ACME });
    expect(screen.getByDisplayValue('MagazinREMONTI')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Acme')).toBeInTheDocument();
  });

  it('shows the empty state when there are no mappings', () => {
    setupEditor();
    expect(screen.getByText(/no mappings yet/i)).toBeInTheDocument();
  });

  it('a newly added row renders an editable combobox, not an "Archived contact" box', async () => {
    setupEditor();
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /add mapping/i }));
    // The coercion value={row.contactId || null} keeps an empty row editable.
    expect(screen.getByRole('combobox', { name: /contact, row 1/i })).toBeInTheDocument();
    expect(screen.queryByText(/archived contact/i)).not.toBeInTheDocument();
  });

  it('add row → type token + pick contact → Save PUTs the bare-token map', async () => {
    const captured = captureBankingPut();
    setupEditor();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /add mapping/i }));
    await user.type(
      screen.getByRole('textbox', { name: /provider token, row 1/i }),
      'MagazinREMONTI',
    );
    await user.click(screen.getByRole('combobox', { name: /contact, row 1/i }));
    await user.click(await screen.findByRole('option', { name: 'Acme' }));
    await user.click(screen.getByRole('button', { name: /^save mapping$/i }));

    await waitFor(() => expect(captured.body).toEqual({ contactMap: { MagazinREMONTI: ACME } }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Updated.'));
  });

  it('re-points an existing row by changing only its contact', async () => {
    const captured = captureBankingPut();
    setupEditor({ MagazinREMONTI: ACME });
    const user = userEvent.setup();

    await user.click(screen.getByRole('combobox', { name: /contact, row 1/i }));
    await user.click(await screen.findByRole('option', { name: 'Globex' }));
    await user.click(screen.getByRole('button', { name: /^save mapping$/i }));

    await waitFor(() => expect(captured.body).toEqual({ contactMap: { MagazinREMONTI: GLOBEX } }));
  });

  it('remove row drops it from the payload', async () => {
    const captured = captureBankingPut();
    setupEditor({ MagazinREMONTI: ACME, KyivCoffee: GLOBEX });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /remove mapping MagazinREMONTI/i }));
    await user.click(screen.getByRole('button', { name: /^save mapping$/i }));

    await waitFor(() => expect(captured.body).toEqual({ contactMap: { KyivCoffee: GLOBEX } }));
  });

  it('blank token blocks save with a message and no request', async () => {
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
    // leave the token blank, pick a contact
    await user.click(screen.getByRole('combobox', { name: /contact, row 1/i }));
    await user.click(await screen.findByRole('option', { name: 'Acme' }));
    await user.click(screen.getByRole('button', { name: /^save mapping$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/token is required/i);
    expect(called).toBe(0);
  });

  it('duplicate tokens block save with a message and no request', async () => {
    let called = 0;
    server.use(
      http.put(`${apiBase}/api/users/me/configuration/banking`, () => {
        called += 1;
        return HttpResponse.json({}, { status: 200 });
      }),
    );
    setupEditor({ MagazinREMONTI: ACME });
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /add mapping/i }));
    await user.type(
      screen.getByRole('textbox', { name: /provider token, row 2/i }),
      'MagazinREMONTI',
    );
    await user.click(screen.getByRole('combobox', { name: /contact, row 2/i }));
    await user.click(await screen.findByRole('option', { name: 'Globex' }));
    await user.click(screen.getByRole('button', { name: /^save mapping$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/duplicate/i);
    expect(called).toBe(0);
  });

  it('create-and-map: typing a new contact name creates it, then Save includes the new id', async () => {
    const FRESH = '33333333-3333-3333-3333-333333333333';
    server.use(
      http.post(`${apiBase}/api/users/me/configuration/dictionaries/:dictId/entries`, () =>
        HttpResponse.json({ id: FRESH, name: 'Fresh Co' }, { status: 201 }),
      ),
    );
    const captured = captureBankingPut();
    setupEditor();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: /add mapping/i }));
    await user.type(screen.getByRole('textbox', { name: /provider token, row 1/i }), 'NewMerchant');
    await user.click(screen.getByRole('combobox', { name: /contact, row 1/i }));
    await user.type(screen.getByRole('combobox', { name: /contact, row 1/i }), 'Fresh Co');
    await user.click(await screen.findByRole('option', { name: /create/i }));
    // The created id isn't in the static options prop, so once createAndSelect
    // commits it the row shows the archived-value display — confirming the
    // contactId is set before we Save.
    await screen.findByText(/archived contact/i);
    await user.click(screen.getByRole('button', { name: /^save mapping$/i }));

    await waitFor(() => expect(captured.body).toEqual({ contactMap: { NewMerchant: FRESH } }));
  });
});
