import { describe, expect, it, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { TransactionsPane } from './TransactionsPane';
import { transactionFixture } from '@/test/fixtures';
import type { TransactionResponse } from '@/api/types';

const apiBase = 'http://localhost:8080';

function ui() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/accounts/:id" element={<TransactionsPane />} />
      </Routes>
    </AuthProvider>
  );
}

const coffee: TransactionResponse = {
  ...transactionFixture,
  id: 't-coffee',
  description: 'Coffee',
};
const pastry: TransactionResponse = {
  ...transactionFixture,
  id: 't-pastry',
  description: 'Pastry',
};

async function rightClickRow(user: ReturnType<typeof userEvent.setup>, description: string) {
  const cell = await screen.findByText(description);
  const row = cell.closest('tr')!;
  await user.pointer({ keys: '[MouseRight]', target: row });
}

beforeEach(() => {
  saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
  server.use(
    http.get(`${apiBase}/api/transactions`, () =>
      HttpResponse.json({ transactions: [coffee, pastry], totalCount: 2, limit: 50, offset: 0 }),
    ),
  );
});

describe('TransactionsPane — merge via context menu', () => {
  it('has no always-on selection checkboxes in the list', async () => {
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText('Coffee');
    expect(screen.queryByRole('checkbox', { name: /select/i })).not.toBeInTheDocument();
  });

  it('offers "Merge into this…" in a completed row\'s context menu', async () => {
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText('Coffee');
    await rightClickRow(user, 'Coffee');
    expect(await screen.findByRole('menuitem', { name: /merge into this/i })).toBeInTheDocument();
  });

  it('opens the merge dialog with the acting row as survivor and the rest as candidates', async () => {
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText('Coffee');
    await rightClickRow(user, 'Coffee');
    await user.click(await screen.findByRole('menuitem', { name: /merge into this/i }));

    expect(await screen.findByRole('dialog')).toHaveTextContent(/merge transactions/i);
    // Pastry is a candidate to fold into Coffee; Coffee itself is not listed.
    expect(screen.getByRole('checkbox', { name: /Pastry/ })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: /Coffee/ })).not.toBeInTheDocument();
  });

  it('merges the picked candidate into the acting row', async () => {
    const user = userEvent.setup();
    let captured: unknown;
    let calledId = '';
    server.use(
      http.post(`${apiBase}/api/transactions/:id/merge`, async ({ request, params }) => {
        calledId = params.id as string;
        captured = await request.json();
        return HttpResponse.json({ ...coffee, amendmentCount: 1 });
      }),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText('Coffee');
    await rightClickRow(user, 'Coffee');
    await user.click(await screen.findByRole('menuitem', { name: /merge into this/i }));

    await user.click(await screen.findByRole('checkbox', { name: /Pastry/ }));
    await user.click(screen.getByRole('button', { name: /^merge$/i }));

    await waitFor(() => expect(calledId).toBe('t-coffee'));
    expect(captured).toEqual({ sourceTransactionIds: ['t-pastry'] });
  });
});
