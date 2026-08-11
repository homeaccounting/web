import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '@/test/server';
import { renderWithProviders, makeQueryClient } from '@/test/utils';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { TransactionsPane } from './TransactionsPane';
import { accountFixture, closedAccountFixture, transactionFixture } from '@/test/fixtures';
import type { AccountResponse } from '@/api/types';

const apiBase = 'http://localhost:8080';

function ui() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/transactions" element={<TransactionsPane />} />
      </Routes>
    </AuthProvider>
  );
}

// Reproduces the reported bug scenario: an out-of-band change (bank import,
// sync signal) invalidates both ['accounts'] and ['transactions']. The
// ['accounts'] request is a single fast round-trip, so it settles almost
// immediately with the new balance. The ['transactions'] query pages through
// multiple requests inside its queryFn and settles later. Without gating, the
// header would show the NEW balance next to the OLD (still-loaded) list for
// the whole refetch window — a visible contradiction. With gating, the
// balance must hold at its old value until the list settles, then both swap
// together.
describe('TransactionsPane balance/list consistency', () => {
  it('never shows the new balance until the transaction list has settled on the new data', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });

    const oldAccount: AccountResponse = { ...accountFixture, balance: 1234.56 };
    const newAccount: AccountResponse = { ...accountFixture, balance: 2000 };
    const oldTx = { ...transactionFixture, id: 'tx-old', description: 'OldRow' };
    const newTx = { ...transactionFixture, id: 'tx-new', description: 'NewRow' };

    let accountsCallCount = 0;
    let transactionsCallCount = 0;
    let releaseSlowFetch: () => void = () => {};

    server.use(
      http.get(`${apiBase}/api/accounts`, () => {
        accountsCallCount += 1;
        const account = accountsCallCount === 1 ? oldAccount : newAccount;
        return HttpResponse.json({ accounts: [account], totalCount: 1 });
      }),
      http.get(`${apiBase}/api/transactions`, async () => {
        transactionsCallCount += 1;
        if (transactionsCallCount === 1) {
          return HttpResponse.json({
            transactions: [oldTx],
            totalCount: 1,
            limit: 200,
            offset: 0,
          });
        }
        // Second (post-invalidation) fetch: blocks until the test releases it,
        // simulating the multi-page loop settling well after the fast
        // accounts refetch already resolved.
        await new Promise<void>((resolve) => {
          releaseSlowFetch = resolve;
        });
        return HttpResponse.json({
          transactions: [newTx],
          totalCount: 1,
          limit: 200,
          offset: 0,
        });
      }),
    );

    const queryClient = makeQueryClient();
    renderWithProviders(ui(), { initialPath: '/transactions?accounts=a1', queryClient });

    // Initial steady state: old balance, old row.
    expect(await screen.findByText('OldRow')).toBeInTheDocument();
    expect(screen.getByText(/1,234\.56/)).toBeInTheDocument();

    // Simulate the data-change signal invalidating both scopes together.
    void queryClient.invalidateQueries({ queryKey: ['accounts'] });
    void queryClient.invalidateQueries({ queryKey: ['transactions'] });

    // The fast accounts refetch resolves...
    await waitFor(() => {
      const cached = queryClient.getQueryData<AccountResponse[]>(['accounts']);
      expect(cached?.[0]?.balance).toBe(2000);
    });

    // ...but the slow transactions refetch has NOT settled yet. The header
    // must still show the OLD balance beside the OLD (still-displayed) row —
    // never the new balance next to stale data.
    expect(screen.queryByText(/2,000\.00/)).not.toBeInTheDocument();
    expect(screen.getByText(/1,234\.56/)).toBeInTheDocument();
    expect(screen.getByText('OldRow')).toBeInTheDocument();
    expect(screen.queryByText('NewRow')).not.toBeInTheDocument();

    // Release the slow transactions fetch — balance and list must swap to the
    // new generation together.
    releaseSlowFetch();

    await waitFor(() => expect(screen.getByText('NewRow')).toBeInTheDocument());
    expect(screen.getByText(/2,000\.00/)).toBeInTheDocument();
    expect(screen.queryByText('OldRow')).not.toBeInTheDocument();
    expect(screen.queryByText(/1,234\.56/)).not.toBeInTheDocument();
  });

  it('shows the live balance with no lag once steady (no permanent staleness)', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/transactions?accounts=a1' });
    expect(await screen.findByText(transactionFixture.description)).toBeInTheDocument();
    // accountFixture.balance === 1234.56 — the plain live figure, unheld.
    expect(screen.getByText(/1,234\.56/)).toBeInTheDocument();
  });

  it('behaves sanely across an in-place account switch: shows the newly selected account’s own (live) balance immediately, never the previous account’s held balance', async () => {
    // Switching the viewed account (via the account filter, which patches
    // just the `accounts` URL param and does not remount TransactionsPane)
    // must not bleed a1's held balance into a2's header — even though a2's
    // OWN transactions query is a brand new query key and is still loading.
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    let releaseA2Fetch: () => void = () => {};
    server.use(
      http.get(`${apiBase}/api/accounts`, () =>
        HttpResponse.json({ accounts: [accountFixture, closedAccountFixture], totalCount: 2 }),
      ),
      http.get(`${apiBase}/api/transactions`, async ({ request }) => {
        const accountId = new URL(request.url).searchParams.get('accountId');
        if (accountId === 'a2') {
          await new Promise<void>((resolve) => {
            releaseA2Fetch = resolve;
          });
          return HttpResponse.json({
            transactions: [{ ...transactionFixture, id: 't-a2', description: 'A2Row' }],
            totalCount: 1,
            limit: 200,
            offset: 0,
          });
        }
        return HttpResponse.json({
          transactions: [{ ...transactionFixture, id: 't-a1', description: 'A1Row' }],
          totalCount: 1,
          limit: 200,
          offset: 0,
        });
      }),
    );

    const { container } = renderWithProviders(ui(), { initialPath: '/transactions?accounts=a1' });
    expect(await screen.findByText('A1Row')).toBeInTheDocument();
    expect(screen.getByText(/1,234\.56/)).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: /^filters/i }));
    // Deselect a1, then pick a2 — the account filter preserves the rest of
    // the URL (unlike the period selector), so this is an in-place scope
    // switch on the same mounted TransactionsPane instance.
    await user.click(screen.getByRole('button', { name: /Remove Checking/i }));
    const accountInput = container.querySelector('.w-64 input[role="combobox"]') as HTMLElement;
    await user.click(accountInput);
    await user.click(await screen.findByRole('option', { name: /Old Savings/i }));

    // a2's own balance (0) shows immediately — not a1's held 1,234.56 — even
    // though a2's transactions query is still loading (blocked below).
    expect(await screen.findByRole('heading', { name: 'Old Savings' })).toBeInTheDocument();
    expect(screen.queryByText(/1,234\.56/)).not.toBeInTheDocument();
    expect(screen.getByText('$0.00')).toBeInTheDocument();

    releaseA2Fetch();
    await waitFor(() => expect(screen.getByText('A2Row')).toBeInTheDocument());
    expect(screen.getByText('$0.00')).toBeInTheDocument();
  });
});
