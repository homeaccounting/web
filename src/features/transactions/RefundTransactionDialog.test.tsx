import { describe, it, expect, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { configurationFixture } from '@/test/fixtures';
import { RefundTransactionDialog } from './RefundTransactionDialog';
import type { ConfigurationResponse, TransactionResponse } from '@/api/types';

const apiBase = 'http://localhost:8080';

const accountId = '00000000-0000-0000-0000-000000000001';
const groceriesId = '00000000-0000-0000-0000-000000000601';
const fuelId = '00000000-0000-0000-0000-000000000602';
const archivedId = '00000000-0000-0000-0000-0000000006de';
const originalId = '00000000-0000-0000-0000-0000000000aa';

// Original expense: Groceries 60 + Fuel 40, debited from `accountId`.
function makeOriginal(overrides: Partial<TransactionResponse> = {}): TransactionResponse {
  return {
    id: originalId,
    sourceAccountId: accountId,
    targetAccountId: 'external-1',
    sourceAmount: -100,
    sourceCurrency: 'USD',
    targetAmount: -100,
    targetCurrency: 'USD',
    exchangeRate: null,
    description: 'Weekly shop',
    status: 'Completed',
    failureReason: null,
    transactionType: 'expense',
    allocations: {
      incomes: [],
      expenses: [
        { categoryId: groceriesId, amount: { amount: 60, currency: 'USD' } },
        { categoryId: fuelId, amount: { amount: 40, currency: 'USD' } },
      ],
    },
    date: '2026-04-27T08:00:00Z',
    labels: [],
    amendmentCount: 0,
    contactId: null,
    bankProviderCategory: null,
    bankProviderContact: null,
    relations: [],
    ...overrides,
  };
}

const configWithRefundCategories: ConfigurationResponse = {
  ...configurationFixture,
  dictionaries: {
    ...configurationFixture.dictionaries,
    expense: {
      roots: [
        { id: groceriesId, name: 'Groceries', type: 'item', children: [] },
        { id: fuelId, name: 'Fuel', type: 'item', children: [] },
      ],
    },
  },
};

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  server.use(
    http.get(`${apiBase}/api/accounts`, () =>
      HttpResponse.json({
        accounts: [
          {
            id: accountId,
            name: 'Checking',
            balance: 1234.56,
            currency: 'USD',
            overdraftLimit: null,
            subtype: { type: 'bankAccount', bankName: 'ACME' },
            status: 'Opened',
            version: 1,
          },
        ],
        totalCount: 1,
      }),
    ),
    http.get(`${apiBase}/api/users/me/configuration`, () =>
      HttpResponse.json(configWithRefundCategories),
    ),
    // No prior refunds by default.
    http.get(`${apiBase}/api/transactions/${originalId}/relations`, () =>
      HttpResponse.json({ outbound: [], inbound: [] }),
    ),
  );
});

function Wrapper({ original }: { original: TransactionResponse }) {
  const [open, setOpen] = useState(true);
  return (
    <AuthProvider>
      <RefundTransactionDialog open={open} onOpenChange={setOpen} original={original} />
    </AuthProvider>
  );
}

describe('RefundTransactionDialog', () => {
  it('default (full) seed: pre-fills two expense rows and the target readout', async () => {
    renderWithProviders(<Wrapper original={makeOriginal()} />, { initialPath: '/' });

    await screen.findByLabelText(/account/i);

    const amounts = await screen.findAllByLabelText(/amount/i);
    expect(amounts).toHaveLength(2);
    expect(amounts[0]).toHaveValue(60);
    expect(amounts[1]).toHaveValue(40);

    expect(screen.getByTestId('allocations-target-readout')).toHaveTextContent('$100.00');
  });

  it('renders the contact field defaulting to none', async () => {
    renderWithProviders(<Wrapper original={makeOriginal()} />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);

    const contactCb = await screen.findByRole('combobox', { name: /contact/i });
    expect(contactCb).toHaveValue('');
  });

  it('partial edit + submit: posts a genuine partial refund (sum < remaining) with contra allocations, refund relation, today date, and the original account', async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(`${apiBase}/api/transactions/income`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: 'tx-refund',
          sourceAccountId: 'external-1',
          targetAccountId: accountId,
          sourceAmount: 60,
          sourceCurrency: 'USD',
          targetAmount: 60,
          targetCurrency: 'USD',
          exchangeRate: null,
          description: 'Refund: Weekly shop',
          status: 'Completed',
          failureReason: null,
          transactionType: 'income',
          category: null,
          date: '2026-06-01T00:00:00.000Z',
          labels: [],
          amendmentCount: 0,
          contactId: null,
          bankProviderCategory: null,
          bankProviderContact: null,
          relations: [],
        });
      }),
    );

    renderWithProviders(<Wrapper original={makeOriginal()} />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);

    const amounts = await screen.findAllByLabelText(/amount/i);
    // Remaining total is 100 (Groceries 60 + Fuel 40). Edit Groceries down to 20
    // and leave Fuel at 40, so the refund sums to 60 — a genuine PARTIAL (60 < 100).
    // Before the ceiling fix, the locked target (100) blocked any sum < 100, so
    // this submit would not have fired.
    await user.clear(amounts[0]!);
    await user.type(amounts[0]!, '20');

    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(Object.keys(capturedBody).length).toBeGreaterThan(0));

    expect(capturedBody.accountId).toBe(accountId);
    const expenses = (
      capturedBody.allocations as { expenses?: { category: string; amount: number }[] }
    )?.expenses;
    // Empty comments are normalised to `undefined` (see allocations.ts
    // normalizeComment) and JSON-dropped, so the wire slice has no `comment` key.
    // Partial: Groceries 20 + Fuel 40 = 60, NOT re-filled to the 100 target.
    expect(expenses).toEqual([
      { category: groceriesId, amount: 20 },
      { category: fuelId, amount: 40 },
    ]);
    expect(capturedBody.relation).toEqual({
      relatedTransactionId: originalId,
      relationKind: 'refund',
    });
    expect(capturedBody.date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
  });

  it('per-slice cap: with a prior refund leaving Groceries 30, typing 40 blocks submit', async () => {
    const user = userEvent.setup();
    const priorRefundId = '00000000-0000-0000-0000-0000000000bb';
    let posted = false;
    server.use(
      http.get(`${apiBase}/api/transactions/${originalId}/relations`, () =>
        HttpResponse.json({
          outbound: [],
          inbound: [{ relatedTransactionId: priorRefundId, relationKind: 'refund' }],
        }),
      ),
      // Prior refund: Groceries 30 already refunded (remaining Groceries = 30).
      http.get(`${apiBase}/api/transactions/${priorRefundId}`, () =>
        HttpResponse.json({
          ...makeOriginal({
            id: priorRefundId,
            transactionType: 'income',
            allocations: {
              incomes: [],
              expenses: [{ categoryId: groceriesId, amount: { amount: 30, currency: 'USD' } }],
            },
          }),
        }),
      ),
      http.post(`${apiBase}/api/transactions/income`, () => {
        posted = true;
        return new HttpResponse(null, { status: 201 });
      }),
    );

    renderWithProviders(<Wrapper original={makeOriginal()} />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);

    const amounts = await screen.findAllByLabelText(/amount/i);
    await user.clear(amounts[0]!);
    await user.type(amounts[0]!, '40');

    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByText(/can't exceed .* left to refund/i)).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it('over-total: sum over remaining blocks submit', async () => {
    const user = userEvent.setup();
    let posted = false;
    server.use(
      http.post(`${apiBase}/api/transactions/income`, () => {
        posted = true;
        return new HttpResponse(null, { status: 201 });
      }),
    );

    renderWithProviders(<Wrapper original={makeOriginal()} />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);

    const amounts = await screen.findAllByLabelText(/amount/i);
    // Groceries 60 -> 100: exceeds both its per-slice cap (60) and the total (100).
    await user.clear(amounts[0]!);
    await user.type(amounts[0]!, '100');

    await user.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByText(/can't exceed/i)).toBeInTheDocument();
    expect(posted).toBe(false);
  });

  it('archived category: an unknown-category slice renders read-only and still posts', async () => {
    const user = userEvent.setup();
    let capturedBody: Record<string, unknown> = {};
    server.use(
      http.post(`${apiBase}/api/transactions/income`, async ({ request }) => {
        capturedBody = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({
          id: 'tx-refund',
          sourceAccountId: 'external-1',
          targetAccountId: accountId,
          sourceAmount: 100,
          sourceCurrency: 'USD',
          targetAmount: 100,
          targetCurrency: 'USD',
          exchangeRate: null,
          description: 'Refund: Weekly shop',
          status: 'Completed',
          failureReason: null,
          transactionType: 'income',
          category: null,
          date: '2026-06-01T00:00:00.000Z',
          labels: [],
          amendmentCount: 0,
          contactId: null,
          bankProviderCategory: null,
          bankProviderContact: null,
          relations: [],
        });
      }),
    );

    // Original: Groceries 60 + an archived category 40 (id not in the dictionary).
    const original = makeOriginal({
      allocations: {
        incomes: [],
        expenses: [
          { categoryId: groceriesId, amount: { amount: 60, currency: 'USD' } },
          { categoryId: archivedId, amount: { amount: 40, currency: 'USD' } },
        ],
      },
    });

    renderWithProviders(<Wrapper original={original} />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);

    // The archived slice renders a read-only label, not an editable combobox.
    expect(await screen.findByText(/archived/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(Object.keys(capturedBody).length).toBeGreaterThan(0));
    const expenses = (
      capturedBody.allocations as { expenses?: { category: string; amount: number }[] }
    )?.expenses;
    expect(expenses).toEqual([
      { category: groceriesId, amount: 60 },
      { category: archivedId, amount: 40 },
    ]);
  });

  it('already-refunded readout is shown when part was refunded', async () => {
    const priorRefundId = '00000000-0000-0000-0000-0000000000bb';
    server.use(
      http.get(`${apiBase}/api/transactions/${originalId}/relations`, () =>
        HttpResponse.json({
          outbound: [],
          inbound: [{ relatedTransactionId: priorRefundId, relationKind: 'refund' }],
        }),
      ),
      http.get(`${apiBase}/api/transactions/${priorRefundId}`, () =>
        HttpResponse.json({
          ...makeOriginal({
            id: priorRefundId,
            transactionType: 'income',
            allocations: {
              incomes: [],
              expenses: [{ categoryId: groceriesId, amount: { amount: 30, currency: 'USD' } }],
            },
          }),
        }),
      ),
    );

    renderWithProviders(<Wrapper original={makeOriginal()} />, { initialPath: '/' });
    await screen.findByLabelText(/account/i);

    const dialog = screen.getByRole('dialog');
    expect(await within(dialog).findByText(/already refunded/i)).toBeInTheDocument();
  });
});
