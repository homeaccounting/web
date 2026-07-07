import { describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { server } from '@/test/server';
import { renderWithProviders } from '@/test/utils';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from '@/auth/AuthContext';
import { saveSession } from '@/auth/storage';
import { TransactionsPane } from './TransactionsPane';
import { transactionFixture, tripLabelId, foodCategoryId, salaryCategoryId } from '@/test/fixtures';

const apiBase = 'http://localhost:8080';

function ui() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<TransactionsPane />} />
        <Route path="/accounts/:id" element={<TransactionsPane />} />
      </Routes>
    </AuthProvider>
  );
}

// The filter panel is collapsed by default; expand it before driving any
// filter control.
async function openFilters(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole('button', { name: /^filters/i }));
}

describe('TransactionsPane', () => {
  it('shows placeholder when no account selected', () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/' });
    expect(screen.getByText(/select an account/i)).toBeInTheDocument();
  });

  it('renders transactions for the selected account', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    expect(await screen.findByText(transactionFixture.description)).toBeInTheDocument();
  });

  it('renders the category name resolved from the configuration dictionary', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    expect(await screen.findByText('Food')).toBeInTheDocument();
    // The raw category id must not leak into the cell; only its resolved name.
    expect(
      screen.queryByText(transactionFixture.allocations.expenses[0]!.categoryId),
    ).not.toBeInTheDocument();
  });

  it('renders a single-slice category as one chip with just the name', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    const cell = await screen.findByText('Food');
    expect(cell.textContent).toBe('Food');
    expect(screen.queryByText(/\+\d/)).not.toBeInTheDocument();
  });

  it('renders a multi-slice category as a chip per slice (all names shown)', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            {
              ...transactionFixture,
              id: 'tx-split',
              description: 'Split',
              allocations: {
                incomes: [
                  { categoryId: salaryCategoryId, amount: { amount: 100, currency: 'USD' } },
                ],
                expenses: [{ categoryId: foodCategoryId, amount: { amount: 50, currency: 'USD' } }],
              },
            },
          ],
          totalCount: 1,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    // Both categories render as separate chips; no "+N" summary.
    expect(await screen.findByText('Salary')).toBeInTheDocument();
    expect(screen.getByText('Food')).toBeInTheDocument();
    expect(screen.queryByText(/\+\d/)).not.toBeInTheDocument();
  });

  // A transactions response carrying one expense with two commented slices.
  function commentedTx(description: string, comments: [string, string]) {
    return {
      ...transactionFixture,
      id: 'tx-comments',
      description,
      allocations: {
        incomes: [],
        expenses: [
          {
            categoryId: foodCategoryId,
            amount: { amount: 3, currency: 'USD' },
            comment: comments[0],
          },
          {
            categoryId: salaryCategoryId,
            amount: { amount: 2, currency: 'USD' },
            comment: comments[1],
          },
        ],
      },
    };
  }
  const seed = (tx: object) =>
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({ transactions: [tx], totalCount: 1 }),
      ),
    );

  it('shows allocation comments after the description, muted', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    seed(commentedTx('Groceries', ['milk', 'eggs']));
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    const cell = (await screen.findByText('Groceries')).closest('td')!;
    expect(cell).toHaveTextContent('Groceries · milk, eggs');
  });

  it('shows comments as the primary text when the description is empty', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    seed(commentedTx('', ['milk', 'eggs']));
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    expect(await screen.findByText('milk, eggs')).toBeInTheDocument();
  });

  it('suppresses the comment tail when it equals the description', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    seed(commentedTx('milk, eggs', ['milk', 'eggs']));
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    const cell = (await screen.findByText('milk, eggs')).closest('td')!;
    expect(cell.textContent).not.toContain('·');
  });

  it('renders empty state when there are no transactions', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({ transactions: [], totalCount: 0 }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    expect(await screen.findByText(/no transactions in this date range/i)).toBeInTheDocument();
  });

  it('fetches with the accountId from the URL', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const calledFor: string[] = [];
    server.use(
      http.get(`${apiBase}/api/transactions`, ({ request }) => {
        const url = new URL(request.url);
        calledFor.push(url.searchParams.get('accountId') ?? '');
        return HttpResponse.json({ transactions: [], totalCount: 0 });
      }),
    );
    const first = renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await waitFor(() => expect(calledFor).toContain('a1'));
    first.unmount();
    renderWithProviders(ui(), { initialPath: '/accounts/a2' });
    await waitFor(() => expect(calledFor).toContain('a2'));
  });

  it('renders the AccountHeader above transactions when the account is loaded', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    const heading = await screen.findByRole('heading', { name: 'Checking' });
    expect(heading).toBeInTheDocument();
    expect(heading.tagName).toBe('H2');
  });

  it('renders a header skeleton while the accounts list is still loading', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    server.use(http.get(`${apiBase}/api/accounts`, () => new Promise<never>(() => {})));
    const { container } = renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    // The account header lives in a border-b container above the transactions area.
    // Note: ControlBar also has border-b, so find the one that contains the skeleton.
    await waitFor(() => {
      const borderDivs = Array.from(container.querySelectorAll('.border-b'));
      const headerArea = borderDivs.find((el) => el.querySelector('.animate-pulse'));
      expect(headerArea).not.toBeNull();
      expect(headerArea?.querySelector('.animate-pulse')).not.toBeNull();
    });
    expect(screen.queryByRole('heading', { name: 'Checking' })).not.toBeInTheDocument();
  });

  it('renders an incoming-leg amount in the target currency when the viewed account is the target', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    server.use(
      http.get(`${apiBase}/api/accounts`, () =>
        HttpResponse.json({
          accounts: [
            {
              id: 'a-uah',
              name: 'UAH wallet',
              balance: 0,
              currency: 'UAH',
              overdraftLimit: null,
              subtype: { type: 'cash' },
              version: 1,
            },
          ],
          totalCount: 1,
        }),
      ),
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            {
              id: 'adj-1',
              sourceAccountId: 'ext-usd',
              targetAccountId: 'a-uah',
              sourceAmount: 100,
              sourceCurrency: 'USD',
              targetAmount: 4000,
              targetCurrency: 'UAH',
              exchangeRate: 40,
              description: 'Adjustment',
              status: 'Completed',
              failureReason: null,
              transactionType: 'adjustment',
              allocations: { incomes: [], expenses: [] },
              date: '2026-05-01T00:00:00.000Z',
              labels: [],
              amendmentCount: 0,
              relations: [],
            },
          ],
          totalCount: 1,
          limit: 50,
          offset: 0,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a-uah' });
    expect(await screen.findByText(/4,000/)).toBeInTheDocument();
    expect(screen.queryByText(/100\.00/)).not.toBeInTheDocument();
    expect(screen.queryByText(/USD/)).not.toBeInTheDocument();
  });

  it('renders an outgoing-leg amount as negative in the source currency when the viewed account is the source', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    server.use(
      http.get(`${apiBase}/api/accounts`, () =>
        HttpResponse.json({
          accounts: [
            {
              id: 'a-uah',
              name: 'UAH wallet',
              balance: 0,
              currency: 'UAH',
              overdraftLimit: null,
              subtype: { type: 'cash' },
              version: 1,
            },
          ],
          totalCount: 1,
        }),
      ),
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            {
              id: 'adj-2',
              sourceAccountId: 'a-uah',
              targetAccountId: 'ext-usd',
              sourceAmount: 2000,
              sourceCurrency: 'UAH',
              targetAmount: 50,
              targetCurrency: 'USD',
              exchangeRate: 40,
              description: 'Adjustment',
              status: 'Completed',
              failureReason: null,
              transactionType: 'adjustment',
              allocations: { incomes: [], expenses: [] },
              date: '2026-05-01T00:00:00.000Z',
              labels: [],
              amendmentCount: 0,
              relations: [],
            },
          ],
          totalCount: 1,
          limit: 50,
          offset: 0,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a-uah' });
    expect(await screen.findByText(/-.*2,000\.00/)).toBeInTheDocument();
    expect(screen.queryByText(/USD/)).not.toBeInTheDocument();
  });

  it('renders no header when the account id is not in the loaded accounts list', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    server.use(
      http.get(`${apiBase}/api/accounts`, () => HttpResponse.json({ accounts: [], totalCount: 0 })),
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({ transactions: [], totalCount: 0 }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a99' });
    expect(await screen.findByText(/no transactions in this date range/i)).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 2 })).not.toBeInTheDocument();
  });

  it('renders the control bar even when no account is selected', () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/' });
    expect(screen.getByRole('button', { name: /add income/i })).toBeInTheDocument();
  });

  it('shows the "Select an account." prompt when no account is selected', () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/' });
    expect(screen.getByText(/select an account\./i)).toBeInTheDocument();
  });

  it('opens EditTransactionDialog on double-click of a transaction row', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    const cell = await screen.findByText(transactionFixture.description);
    const row = cell.closest('tr')!;
    await user.dblClick(row);
    expect(await screen.findByRole('dialog', { name: /edit expense/i })).toBeInTheDocument();
  });

  it('opens EditTransactionDialog via context menu Edit item on right-click', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    const cell = await screen.findByText(transactionFixture.description);
    const row = cell.closest('tr')!;
    await user.pointer({ keys: '[MouseRight]', target: row });
    const editItem = await screen.findByRole('menuitem', { name: /edit/i });
    await user.click(editItem);
    expect(await screen.findByRole('dialog', { name: /edit expense/i })).toBeInTheDocument();
  });

  it('opens EditTransactionDialog when Enter is pressed on a focused row', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    const cell = await screen.findByText(transactionFixture.description);
    const row = cell.closest('tr')!;
    row.focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: /edit expense/i })).toBeInTheDocument();
  });

  it('renders label chips for a row that has labels', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [{ ...transactionFixture, labels: [tripLabelId] }],
          totalCount: 1,
          limit: 50,
          offset: 0,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    expect(await screen.findByText('Trip')).toBeInTheDocument();
  });

  it('renders the transaction type icon', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText(transactionFixture.description);
    expect(screen.getByLabelText('Expense')).toBeInTheDocument();
  });

  it('keeps the filter controls collapsed by default', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText(transactionFixture.description);
    // The toggle is present, but the controls are not mounted until expanded.
    expect(screen.getByRole('button', { name: /^filters/i })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/description/i)).not.toBeInTheDocument();
  });

  it('reveals and hides the filter controls when the Filters toggle is clicked', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText(transactionFixture.description);
    await openFilters(user);
    expect(screen.getByPlaceholderText(/description/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^filters/i }));
    expect(screen.queryByPlaceholderText(/description/i)).not.toBeInTheDocument();
  });

  it('shows an active-filter count on the toggle while collapsed', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText(transactionFixture.description);
    // No active filters → toggle reads just "Filters".
    expect(screen.getByRole('button', { name: /^filters$/i })).toBeInTheDocument();
    // Apply a description filter, then collapse.
    await openFilters(user);
    await user.type(screen.getByPlaceholderText(/description/i), 'Coffee');
    await user.click(screen.getByRole('button', { name: /^filters/i }));
    // Collapsed toggle now advertises one active filter.
    expect(screen.getByRole('button', { name: /filters.*1/i })).toBeInTheDocument();
  });

  it('narrows the visible rows when typing in the description filter', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            { ...transactionFixture, id: 'tx-a', description: 'Coffee' },
            { ...transactionFixture, id: 'tx-b', description: 'Groceries' },
          ],
          totalCount: 2,
          limit: 50,
          offset: 0,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    expect(await screen.findByText('Coffee')).toBeInTheDocument();
    expect(screen.getByText('Groceries')).toBeInTheDocument();
    await openFilters(user);
    await user.type(screen.getByPlaceholderText(/description/i), 'Coffee');
    await waitFor(() => expect(screen.queryByText('Groceries')).not.toBeInTheDocument());
    expect(screen.getByText('Coffee')).toBeInTheDocument();
  });

  it('shows a "Showing 1–N of T" pagination footer', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText(transactionFixture.description);
    expect(screen.getByText(/showing 1–1 of 1/i)).toBeInTheDocument();
  });

  it('shows a no-matches message when a filter matches nothing', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText(transactionFixture.description);
    await openFilters(user);
    await user.type(screen.getByPlaceholderText(/description/i), 'zzzznomatch');
    expect(await screen.findByText(/no transactions match your filters/i)).toBeInTheDocument();
  });

  it('hides Failed and Cancelled rows by default', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            { ...transactionFixture, id: 'tx-ok', description: 'CompletedTx', status: 'Completed' },
            {
              ...transactionFixture,
              id: 'tx-fail',
              description: 'FailedTx',
              status: 'Failed',
              failureReason: 'Insufficient funds',
            },
            {
              ...transactionFixture,
              id: 'tx-cancel',
              description: 'CancelledTx',
              status: 'Cancelled',
              failureReason: null,
            },
          ],
          totalCount: 3,
          limit: 50,
          offset: 0,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    expect(await screen.findByText('CompletedTx')).toBeInTheDocument();
    expect(screen.queryByText('FailedTx')).not.toBeInTheDocument();
    expect(screen.queryByText('CancelledTx')).not.toBeInTheDocument();
  });

  it('shows Failed and Cancelled rows with status icons after toggling the checkbox', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            { ...transactionFixture, id: 'tx-ok', description: 'CompletedTx', status: 'Completed' },
            {
              ...transactionFixture,
              id: 'tx-fail',
              description: 'FailedTx',
              status: 'Failed',
              failureReason: 'Insufficient funds',
            },
            {
              ...transactionFixture,
              id: 'tx-cancel',
              description: 'CancelledTx',
              status: 'Cancelled',
              failureReason: null,
            },
          ],
          totalCount: 3,
          limit: 50,
          offset: 0,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    // Wait until the completed row is visible (ensures the list is loaded)
    expect(await screen.findByText('CompletedTx')).toBeInTheDocument();

    // Toggle the checkbox
    await openFilters(user);
    await user.click(screen.getByLabelText(/cancelled & failed/i));

    // All three rows should now be visible with their descriptions
    await waitFor(() => {
      expect(screen.getByText('FailedTx')).toBeInTheDocument();
      expect(screen.getByText('CancelledTx')).toBeInTheDocument();
    });
    // Status icons are present with accessible labels (not text badges)
    expect(screen.getByLabelText('Failed')).toBeInTheDocument();
    expect(screen.getByLabelText('Cancelled')).toBeInTheDocument();
  });

  // The From/To inputs are now mouse-driven DatePickers (shadcn Popover +
  // Calendar). A calendar can only emit complete, in-range dates — it never
  // surfaces the empty '' or from > to states the old native inputs could, so
  // those mid-edit guards no longer apply here (the isValidDateWindow guard
  // itself stays covered by transactionFilters.test.ts). This test exercises
  // the new control end-to-end: opening the From picker and selecting a day
  // refetches with a valid window and keeps the rows without an error state.
  it('picking a From date from the calendar refetches without erroring', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    server.use(
      http.get(`${apiBase}/api/transactions`, ({ request }) => {
        const url = new URL(request.url);
        const dateFrom = url.searchParams.get('dateFrom') ?? '';
        const dateTo = url.searchParams.get('dateTo') ?? '';
        const validDate = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
        if (!validDate.test(dateFrom) || !validDate.test(dateTo) || dateFrom > dateTo) {
          return HttpResponse.json({ message: 'bad range' }, { status: 400 });
        }
        return HttpResponse.json({
          transactions: [{ ...transactionFixture, id: 'tx-guard', description: 'GuardRow' }],
          totalCount: 1,
          limit: 50,
          offset: 0,
        });
      }),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    // Wait for the row to appear (valid initial window).
    expect(await screen.findByText('GuardRow')).toBeInTheDocument();

    // Open the From picker and select an enabled day from the open calendar.
    await openFilters(user);
    await user.click(screen.getByLabelText('From'));
    const grid = await screen.findByRole('grid');
    const days = within(grid)
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-disabled') !== 'true' && !b.hasAttribute('disabled'));
    expect(days.length).toBeGreaterThan(0);
    await user.click(days[0]!);

    // The pane must NOT show the error state and GuardRow must still render.
    await waitFor(() => {
      expect(screen.queryByText(/could not load transactions/i)).toBeNull();
    });
    expect(screen.getByText('GuardRow')).toBeInTheDocument();
    expect(screen.getByLabelText('From')).toBeInTheDocument();
  });

  it('exposes a "Cancel" control on a non-cancelled row', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText(transactionFixture.description);
    expect(screen.getByLabelText('Cancel')).toBeInTheDocument();
  });

  it('opens the cancel dialog from the row control without opening the edit dialog', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText(transactionFixture.description);
    await user.click(screen.getByLabelText('Cancel'));
    expect(await screen.findByText('Cancel this transaction?')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /edit expense/i })).not.toBeInTheDocument();
  });

  it('offers a "Cancel" item in the row context menu', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    const cell = await screen.findByText(transactionFixture.description);
    const row = cell.closest('tr')!;
    await user.pointer({ keys: '[MouseRight]', target: row });
    expect(await screen.findByRole('menuitem', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('does not render a cancel control on an already-cancelled row', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            {
              ...transactionFixture,
              id: 'tx-cancel',
              description: 'CancelledTx',
              status: 'Cancelled',
              failureReason: null,
            },
          ],
          totalCount: 1,
          limit: 50,
          offset: 0,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    // Cancelled rows are hidden by default; reveal them first.
    await openFilters(user);
    await user.click(await screen.findByLabelText(/cancelled & failed/i));
    expect(await screen.findByText('CancelledTx')).toBeInTheDocument();
    expect(screen.queryByLabelText('Cancel')).not.toBeInTheDocument();
  });

  it('opens CopyTransactionDialog via the context menu Duplicate item', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    const cell = await screen.findByText(transactionFixture.description);
    const row = cell.closest('tr')!;
    await user.pointer({ keys: '[MouseRight]', target: row });
    await user.click(await screen.findByRole('menuitem', { name: /duplicate/i }));
    expect(await screen.findByRole('dialog', { name: /copy expense/i })).toBeInTheDocument();
  });

  it('exposes a Duplicate icon control that opens the copy dialog (not edit)', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText(transactionFixture.description);
    await user.click(screen.getByLabelText('Duplicate'));
    expect(await screen.findByRole('dialog', { name: /copy expense/i })).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: /edit expense/i })).not.toBeInTheDocument();
  });

  it('hides the Duplicate control for adjustment rows', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            {
              ...transactionFixture,
              id: 'adj-1',
              description: 'AdjustmentTx',
              transactionType: 'adjustment',
              allocations: { incomes: [], expenses: [] },
            },
          ],
          totalCount: 1,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText('AdjustmentTx');
    expect(screen.queryByLabelText('Duplicate')).not.toBeInTheDocument();

    // Also verify the context menu suppresses Duplicate for adjustment rows.
    const row = screen.getByText('AdjustmentTx').closest('tr')!;
    await user.pointer({ keys: '[MouseRight]', target: row });
    // Edit is always present — confirms the menu opened.
    expect(await screen.findByRole('menuitem', { name: /edit/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /duplicate/i })).not.toBeInTheDocument();
  });

  it('offers the two other kinds in the Convert submenu and opens the dialog', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    const cell = await screen.findByText(transactionFixture.description); // an expense fixture
    const row = cell.closest('tr')!;
    await user.pointer({ keys: '[MouseRight]', target: row });
    const convertTrigger = await screen.findByRole('menuitem', { name: /convert to/i });
    await user.hover(convertTrigger);
    // expense source → offers Income and Transfer, not Expense
    const incomeItem = await screen.findByRole('menuitem', { name: /^income$/i });
    expect(incomeItem).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /^transfer$/i })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /^expense$/i })).not.toBeInTheDocument();
    await user.pointer({ keys: '[MouseLeft]', target: incomeItem });
    expect(await screen.findByRole('dialog', { name: /convert to income/i })).toBeInTheDocument();
  });

  it('hides the Convert submenu for adjustment rows', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            {
              ...transactionFixture,
              id: 'adj-1',
              description: 'AdjustmentTx',
              transactionType: 'adjustment',
              allocations: { incomes: [], expenses: [] },
            },
          ],
          totalCount: 1,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    const row = (await screen.findByText('AdjustmentTx')).closest('tr')!;
    await user.pointer({ keys: '[MouseRight]', target: row });
    await screen.findByRole('menuitem', { name: /edit/i });
    expect(screen.queryByRole('menuitem', { name: /convert to/i })).not.toBeInTheDocument();
  });

  it('hides the Convert submenu for non-completed rows', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            { ...transactionFixture, id: 'pend-1', description: 'PendingTx', status: 'Pending' },
          ],
          totalCount: 1,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    const row = (await screen.findByText('PendingTx')).closest('tr')!;
    await user.pointer({ keys: '[MouseRight]', target: row });
    await screen.findByRole('menuitem', { name: /edit/i });
    expect(screen.queryByRole('menuitem', { name: /convert to/i })).not.toBeInTheDocument();
  });

  it('offers a "Refund" item on a completed expense row and opens the dialog', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    renderWithProviders(ui(), { initialPath: '/accounts/a1' }); // fixture is a completed expense
    const cell = await screen.findByText(transactionFixture.description);
    const row = cell.closest('tr')!;
    await user.pointer({ keys: '[MouseRight]', target: row });
    const refundItem = await screen.findByRole('menuitem', { name: /refund/i });
    await user.click(refundItem);
    expect(await screen.findByRole('dialog', { name: /refund transaction/i })).toBeInTheDocument();
  });

  it('does not offer a "Refund" item on an income row', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            {
              ...transactionFixture,
              id: 'tx-income',
              description: 'Paycheck',
              transactionType: 'income',
              allocations: {
                incomes: [
                  { categoryId: salaryCategoryId, amount: { amount: 100, currency: 'USD' } },
                ],
                expenses: [],
              },
            },
          ],
          totalCount: 1,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    const row = (await screen.findByText('Paycheck')).closest('tr')!;
    await user.pointer({ keys: '[MouseRight]', target: row });
    await screen.findByRole('menuitem', { name: /edit/i });
    expect(screen.queryByRole('menuitem', { name: /refund/i })).not.toBeInTheDocument();
  });

  it('does not offer a "Refund" item on a cancelled expense row', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            {
              ...transactionFixture,
              id: 'tx-cancel',
              description: 'CancelledTx',
              status: 'Cancelled',
              failureReason: null,
            },
          ],
          totalCount: 1,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    // Cancelled rows are hidden by default; reveal them first.
    await openFilters(user);
    await user.click(await screen.findByLabelText(/cancelled & failed/i));
    const row = (await screen.findByText('CancelledTx')).closest('tr')!;
    await user.pointer({ keys: '[MouseRight]', target: row });
    await screen.findByRole('menuitem', { name: /edit/i });
    expect(screen.queryByRole('menuitem', { name: /refund/i })).not.toBeInTheDocument();
  });

  it('shows a "partially refunded" badge on an expense refunded for less than its total', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            {
              ...transactionFixture,
              id: 'exp-1',
              description: 'Laptop',
              allocations: {
                incomes: [],
                expenses: [
                  { categoryId: foodCategoryId, amount: { amount: 100, currency: 'USD' } },
                ],
              },
              relations: [],
            },
            {
              ...transactionFixture,
              id: 'ref-1',
              description: 'Laptop refund',
              transactionType: 'income',
              allocations: {
                incomes: [],
                expenses: [{ categoryId: foodCategoryId, amount: { amount: 30, currency: 'USD' } }],
              },
              relations: [{ relatedTransactionId: 'exp-1', relationKind: 'refund' }],
            },
          ],
          totalCount: 2,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    expect(await screen.findByText('partially refunded ($30.00 of $100.00)')).toBeInTheDocument();
  });

  it('shows a "refunded in full" badge on an expense refunded for its full total', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            {
              ...transactionFixture,
              id: 'exp-1',
              description: 'Laptop',
              allocations: {
                incomes: [],
                expenses: [
                  { categoryId: foodCategoryId, amount: { amount: 100, currency: 'USD' } },
                ],
              },
              relations: [],
            },
            {
              ...transactionFixture,
              id: 'ref-1',
              description: 'Laptop refund',
              transactionType: 'income',
              allocations: {
                incomes: [],
                expenses: [
                  { categoryId: foodCategoryId, amount: { amount: 100, currency: 'USD' } },
                ],
              },
              relations: [{ relatedTransactionId: 'exp-1', relationKind: 'refund' }],
            },
          ],
          totalCount: 2,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    expect(await screen.findByText('refunded in full')).toBeInTheDocument();
  });

  it('shows a "refund of <description>" badge on the refund income row', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            {
              ...transactionFixture,
              id: 'exp-1',
              description: 'Laptop',
              allocations: {
                incomes: [],
                expenses: [
                  { categoryId: foodCategoryId, amount: { amount: 100, currency: 'USD' } },
                ],
              },
              relations: [],
            },
            {
              ...transactionFixture,
              id: 'ref-1',
              description: 'Laptop refund',
              transactionType: 'income',
              allocations: {
                incomes: [],
                expenses: [{ categoryId: foodCategoryId, amount: { amount: 30, currency: 'USD' } }],
              },
              relations: [{ relatedTransactionId: 'exp-1', relationKind: 'refund' }],
            },
          ],
          totalCount: 2,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    expect(await screen.findByText('refund of Laptop')).toBeInTheDocument();
  });

  it('shows a generic "refund" badge when the refunded original is not in the window', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            {
              ...transactionFixture,
              id: 'ref-1',
              description: 'Some refund',
              transactionType: 'income',
              allocations: {
                incomes: [],
                expenses: [{ categoryId: foodCategoryId, amount: { amount: 30, currency: 'USD' } }],
              },
              relations: [{ relatedTransactionId: 'exp-missing', relationKind: 'refund' }],
            },
          ],
          totalCount: 1,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });
    await screen.findByText('Some refund');
    expect(screen.getByText('refund')).toBeInTheDocument();
  });

  it('category filter narrows rows and "All categories" sentinel restores both', async () => {
    saveSession({ token: 't', userId: 'u', email: 'e', expiresAt: 9e15 });
    const user = userEvent.setup();
    server.use(
      http.get(`${apiBase}/api/transactions`, () =>
        HttpResponse.json({
          transactions: [
            {
              ...transactionFixture,
              id: 'tx-income',
              description: 'Paycheck',
              transactionType: 'income',
              allocations: {
                incomes: [
                  { categoryId: salaryCategoryId, amount: { amount: 100, currency: 'USD' } },
                ],
                expenses: [],
              },
            },
            {
              ...transactionFixture,
              id: 'tx-expense',
              description: 'Groceries',
              transactionType: 'expense',
              allocations: {
                incomes: [],
                expenses: [{ categoryId: foodCategoryId, amount: { amount: 50, currency: 'USD' } }],
              },
            },
          ],
          totalCount: 2,
          limit: 200,
          offset: 0,
        }),
      ),
    );
    renderWithProviders(ui(), { initialPath: '/accounts/a1' });

    // Both rows visible initially.
    expect(await screen.findByText('Paycheck')).toBeInTheDocument();
    expect(screen.getByText('Groceries')).toBeInTheDocument();

    // Open the category combobox and pick "Food" (expense category).
    await openFilters(user);
    const categoryInput = screen.getByPlaceholderText(/all categories/i);
    await user.click(categoryInput);
    await user.type(categoryInput, 'Food');
    await user.click(await screen.findByRole('option', { name: 'Food' }));

    // Only the Food row should remain.
    await waitFor(() => expect(screen.queryByText('Paycheck')).not.toBeInTheDocument());
    expect(screen.getByText('Groceries')).toBeInTheDocument();

    // Select the "All categories" sentinel to deselect — both rows come back.
    await user.click(categoryInput);
    await user.clear(categoryInput);
    await user.click(await screen.findByRole('option', { name: 'All categories' }));

    await waitFor(() => expect(screen.getByText('Paycheck')).toBeInTheDocument());
    expect(screen.getByText('Groceries')).toBeInTheDocument();
  });
});
