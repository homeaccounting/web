import { test, expect } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';
import { uniqueEmail } from './support/email';

test.describe('smoke @local', () => {
  test('register → empty pane → log out → log in → still empty pane', async ({ page }) => {
    const email = uniqueEmail('e2e');
    const password = 'longenough';

    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await skipOnboarding(page);
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    await page.getByRole('button', { name: /open user menu/i }).click();
    await page.getByText(/sign out/i).click();
    await expect(page).toHaveURL(/\/login/);

    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^sign in$/i }).click();
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();
  });
});
