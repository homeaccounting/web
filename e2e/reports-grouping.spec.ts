import { test, expect, type Page } from '@playwright/test';

// End-to-end coverage for the grouped reports UX (tracker#69): reports are split
// into "Cash flow" and "Net worth" tabs, the period selector lives inside the
// Cash flow tab only, and the selected tab + period persist to the URL query
// string. Runs against a live backend (@local).

async function register(page: Page) {
  const email = `e2e-reports-${Date.now()}-${Math.floor(performance.now())}@example.com`;
  const password = 'longenough';
  await page.goto('register');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /^create account$/i }).click();
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

test.describe('reports grouping @local', () => {
  test('groups reports into tabs with per-group period and URL persistence', async ({ page }) => {
    await register(page);
    await addWallet(page);

    await page.getByRole('link', { name: 'Reports' }).click();
    await expect(page).toHaveURL(/\/reports/);

    // Cash flow is the default tab: shows the range reports + a period selector.
    await expect(page.getByRole('tab', { name: 'Cash flow' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByText('Income vs. expense')).toBeVisible();
    await expect(page.getByText('Spending by category')).toBeVisible();
    const period = page.getByRole('combobox', { name: /period/i });
    await expect(period).toBeVisible();
    // Net worth report is not mounted on the Cash flow tab.
    await expect(page.getByText('Wallet')).toBeHidden();

    // Change the period → it is reflected in the URL.
    await period.click();
    await page.getByRole('option', { name: 'All time' }).click();
    await expect(page).toHaveURL(/period=all-time/);

    // Switch to the Net worth tab: net-worth report shows, period selector is gone.
    await page.getByRole('tab', { name: 'Net worth' }).click();
    await expect(page).toHaveURL(/tab=net-worth/);
    await expect(page.getByText('Wallet')).toBeVisible();
    await expect(page.getByText(/250/).first()).toBeVisible();
    await expect(page.getByRole('combobox', { name: /period/i })).toBeHidden();

    // Deep-link / refresh restores the Net worth tab from the URL.
    await page.reload();
    await expect(page.getByRole('tab', { name: 'Net worth' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await expect(page.getByText('Wallet')).toBeVisible();
  });
});
