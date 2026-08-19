import { test, expect } from '@playwright/test';

// First-run onboarding smoke (tracker#58). Runs against a real backend (@local).
test.describe('onboarding @local', () => {
  test('fresh user is nudged to onboarding; country preset then Get started enters the app', async ({
    page,
  }) => {
    test.setTimeout(120000);
    const email = `e2e-onb-${Date.now()}@example.com`;
    const password = 'longenough';

    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();

    // Redirected to the first-run screen.
    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20000 });
    await expect(page.getByText(/set up the basics/i)).toBeVisible();

    // Pick a country → preset cascade fills currency/language.
    await page.getByRole('combobox', { name: 'Country' }).click();
    await page.getByRole('option', { name: 'United States' }).click();
    await expect(page.getByRole('combobox', { name: 'Country' })).toContainText('United States', {
      timeout: 20000,
    });

    // Enter the app.
    await page.getByRole('button', { name: /get started/i }).click();
    await expect(page).toHaveURL(/\/transactions/);

    // Country is now set → returning to the landing surface does not re-nudge.
    await page.goto('');
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();
  });

  test('Skip for now enters the app without setting a country', async ({ page }) => {
    test.setTimeout(120000);
    const email = `e2e-onb-skip-${Date.now()}@example.com`;
    const password = 'longenough';

    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();

    await expect(page).toHaveURL(/\/onboarding/, { timeout: 20000 });
    await page.getByRole('button', { name: /skip for now/i }).click();
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    // Same session: landing again does not re-nudge (session skip flag).
    await page.goto('');
    await expect(page).toHaveURL(/\/transactions/);
  });
});
