import { test, expect } from '@playwright/test';

// tracker#45 — the "data changed" signal. An OUT-OF-BAND write (made without the
// open tab's involvement — here a direct backend HTTP call, standing in for the
// Telegram bot / a bank import / another device) must surface in the already-open
// tab within the poll interval, with the balance and the transaction list updating
// together. The tab is never reloaded and never loses focus after setup, so the
// only thing that can refresh it is useDataChangeSignal polling /api/sync/version.
test.describe('live data-change signal @local', () => {
  const API = 'http://localhost:8080';

  test('an out-of-band write surfaces in an open tab (balance + list together)', async ({
    page,
  }) => {
    test.setTimeout(90_000);

    const email = `e2e-sync-${Date.now()}@example.com`;
    const password = 'longenough';

    // 1. Register and create two USD accounts: Wallet (100) and Savings (0).
    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    const createAccount = async (name: string, initial: string) => {
      await page.getByRole('button', { name: /add account/i }).click();
      const dlg = page.getByRole('dialog');
      await dlg.getByLabel(/name/i).fill(name);
      await dlg.getByLabel(/initial balance/i).fill(initial);
      await dlg.getByRole('button', { name: /^ok$/i }).click();
      await expect(page.getByRole('link', { name: new RegExp(name, 'i') })).toBeVisible();
    };
    await createAccount('Wallet', '100');
    await createAccount('Savings', '0');

    // 2. Open the Wallet account view and snapshot its displayed balance.
    await page.getByRole('link', { name: /wallet/i }).click();
    const header = page.locator('div.border-b', {
      has: page.getByRole('heading', { name: 'Wallet' }),
    });
    const balanceEl = header.locator('span.tabular-nums');
    await expect(balanceEl).toBeVisible();
    const balanceBefore = (await balanceEl.innerText()).trim();

    // The out-of-band transaction is not there yet.
    await expect(page.getByRole('cell', { name: /OOB Transfer/i })).toHaveCount(0);

    // 3. Read the session token + account ids WITHOUT touching the tab's caches
    //    (localStorage read + a plain GET; neither invalidates a React Query key).
    const token = await page.evaluate(() => {
      const raw = localStorage.getItem('ha.auth.v1');
      return raw ? (JSON.parse(raw).token as string) : null;
    });
    expect(token, 'session token present in localStorage').toBeTruthy();

    const accountsRes = await page.request.get(`${API}/api/accounts`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(accountsRes.ok(), `GET /api/accounts ${accountsRes.status()}`).toBeTruthy();
    const accounts = (await accountsRes.json()).accounts as Array<{
      id: string;
      name: string;
      currency: string;
    }>;
    const wallet = accounts.find((a) => a.name === 'Wallet')!;
    const savings = accounts.find((a) => a.name === 'Savings')!;
    expect(wallet && savings, 'both accounts resolved').toBeTruthy();

    // 4. OUT-OF-BAND write: a transfer Wallet -> Savings via a direct HTTP call.
    //    The open tab has no knowledge of this mutation. amount 30 is within
    //    Wallet's balance regardless of unit interpretation.
    const transferRes = await page.request.post(`${API}/api/transactions/transfer`, {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        sourceAccountId: wallet.id,
        targetAccountId: savings.id,
        amount: 30,
        currency: wallet.currency,
        description: 'OOB Transfer',
      },
    });
    expect(
      transferRes.ok(),
      `POST /api/transactions/transfer ${transferRes.status()} ${await transferRes.text()}`,
    ).toBeTruthy();

    // 5. Without reloading or interacting with the tab, the poll signal must
    //    surface the change: the row appears AND the balance changes — together.
    await expect(page.getByRole('cell', { name: /OOB Transfer/i }).first()).toBeVisible({
      timeout: 20_000,
    });
    await expect(balanceEl).not.toHaveText(balanceBefore, { timeout: 20_000 });
  });
});
