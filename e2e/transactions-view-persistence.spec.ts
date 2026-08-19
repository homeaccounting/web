import { test, expect, type Page } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';

// End-to-end coverage for the transactions "view persistence" feature: the
// selected account's period + filters survive a reload (localStorage lastView)
// and a cold-start visit to `/` restores the last-opened account scope via
// `/transactions?accounts=<id>`. Runs against a live backend (@local). Follows
// the register/addWallet pattern used by e2e/reports-grouping.spec.ts and
// e2e/sticky-transaction-date.spec.ts.

async function register(page: Page) {
  const email = `e2e-tx-view-${Date.now()}-${Math.floor(performance.now())}@example.com`;
  const password = 'longenough';
  await page.goto('register');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /^create account$/i }).click();
  await skipOnboarding(page);
  await expect(page.getByText(/no accounts yet/i)).toBeVisible();
}

async function addWallet(page: Page) {
  await page.getByRole('button', { name: /add account/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/name/i).fill('Wallet');
  await dialog.getByLabel(/initial balance/i).fill('250');
  await dialog.getByRole('button', { name: /^ok$/i }).click();
  await expect(page.getByRole('link', { name: /wallet/i })).toBeVisible();
}

test.describe('transactions view persistence @local', () => {
  test('period + filters survive reload, cold-start restores last account', async ({ page }) => {
    await register(page);
    await addWallet(page);

    await page.getByRole('link', { name: /wallet/i }).click();
    await expect(page).toHaveURL(/\/transactions\?accounts=/);

    // Change the period → reflected in the URL.
    const period = page.getByRole('combobox', { name: /period/i });
    await period.click();
    await page.getByRole('option', { name: 'This year' }).click();
    await expect(page).toHaveURL(/period=this-year/);

    // Open the Filters panel and set a description filter.
    await page.getByRole('button', { name: /^filters/i }).click();
    const description = page.getByPlaceholder(/description/i);
    await description.fill('Coffee');
    await expect(description).toHaveValue('Coffee');

    // Reload: the period stays in the URL, and the filter is restored from
    // localStorage lastView. The Filters panel itself is not persisted (it's
    // local UI state), so reopen it before checking the input.
    await page.reload();
    await expect(page).toHaveURL(/period=this-year/);
    await page.getByRole('button', { name: /^filters/i }).click();
    await expect(page.getByPlaceholder(/description/i)).toHaveValue('Coffee');

    // Cold-start: visiting the bare app root redirects back to the last
    // scope (`/transactions?accounts=<id>`) once the accounts list loads.
    await page.goto('');
    await expect(page).toHaveURL(/\/transactions/);
  });
});
