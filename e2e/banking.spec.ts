import { test, expect } from '@playwright/test';

// SKIPPED: this smoke test requires a backend running with the banking feature
// ENABLED (configuration `bankingFeatureEnabled: true`). Unlike the unit/component
// suite, the e2e suite runs against a real dev server (`pnpm dev`,
// baseURL http://localhost:5173/app/), NOT MSW — so there is no way to stub the
// banking endpoints here. The banking backend PR is not merged/running in CI yet,
// so the `/profile/banking` tab is gated off and "Add connection" would 404.
//
// To enable later: point the e2e dev server at a banking-enabled backend
// (VITE_API_BASE_URL) and remove the `.skip` below. Everything else in this spec
// is written against the real UI (see ProfileBankingPane / BankConnectionDialog)
// and should pass as-is once the backend is available.
test.describe('banking @local', () => {
  test.skip('add a bank connection → listed with masked token', async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;
    const password = 'longenough';

    // Register a fresh user.
    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    // Go straight to the Banking tab. The tab/route is only reachable when the
    // backend reports `bankingFeatureEnabled` (gated in the Profile tab list).
    await page.goto('profile/banking');
    await expect(page).toHaveURL(/\/profile\/banking/);
    await expect(page.getByRole('tab', { name: /banking/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // No connections to start.
    await expect(page.getByText(/no connections yet/i)).toBeVisible();

    // Open the Add connection dialog and fill it.
    await page.getByRole('button', { name: /add connection/i }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Name').fill('My Monobank');
    // Provider is fixed to monobank (disabled select).
    await dialog.getByLabel('Token').fill('test-token-1234567890');
    await dialog.getByRole('button', { name: /^ok$/i }).click();
    await expect(dialog).toBeHidden();

    // The connection is listed with its provider badge and a masked token hint
    // ("•••• <tokenHint>" — the backend never returns the raw token).
    await expect(page.getByText('My Monobank')).toBeVisible();
    await expect(page.getByText('monobank')).toBeVisible();
    await expect(page.getByText(/••••/)).toBeVisible();
  });
});
