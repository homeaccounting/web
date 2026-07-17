import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { CancelTransactionDialog } from './CancelTransactionDialog';
import type { TransactionResponse } from '@/api/types';

const apiBase = 'http://localhost:8080';

const baseTx: TransactionResponse = {
  id: 'tx-1',
  sourceAccountId: 'ext',
  targetAccountId: 'a1',
  sourceAmount: 10,
  sourceCurrency: 'USD',
  targetAmount: 10,
  targetCurrency: 'USD',
  exchangeRate: null,
  description: 'lunch',
  status: 'Completed',
  failureReason: null,
  transactionType: 'expense',
  allocations: { incomes: [], expenses: [] },
  date: '2026-03-04T00:00:00.000Z',
  labels: [],
  amendmentCount: 0,
  mcc: null,
  relations: [],
};

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
});

function renderDialog(onOpenChange = vi.fn()) {
  renderWithProviders(
    <AuthProvider>
      <CancelTransactionDialog open onOpenChange={onOpenChange} transaction={baseTx} />
    </AuthProvider>,
  );
  return { onOpenChange };
}

describe('CancelTransactionDialog', () => {
  it('renders the confirmation prompt when open', () => {
    renderDialog();
    expect(screen.getByText('Cancel this transaction?')).toBeInTheDocument();
  });

  it('confirming cancels the transaction and closes the dialog', async () => {
    let deletedId: string | undefined;
    server.use(
      http.delete(`${apiBase}/api/transactions/:id`, ({ params }) => {
        deletedId = params.id as string;
        return new HttpResponse(null, { status: 204 });
      }),
    );

    const { onOpenChange } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));

    await waitFor(() => expect(deletedId).toBe('tx-1'));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('shows the backend error inline and stays open on a 409', async () => {
    server.use(
      http.delete(`${apiBase}/api/transactions/:id`, () =>
        HttpResponse.json(
          {
            status: 409,
            code: 'TRANSACTION_ALREADY_CANCELLED',
            message: 'Transaction is already cancelled',
          },
          { status: 409 },
        ),
      ),
    );

    const { onOpenChange } = renderDialog();
    await userEvent.click(screen.getByRole('button', { name: 'OK' }));

    expect(await screen.findByText('Transaction is already cancelled')).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
