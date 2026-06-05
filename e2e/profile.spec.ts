import { test, expect } from '@playwright/test';

test.describe('profile @local', () => {
  test('view profile, change default currency, add and remove a label', async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;
    const password = 'longenough';

    // Register a fresh user so the books are empty and base currency is editable.
    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    // Navigate to Profile via the user menu.
    await page.getByRole('button', { name: /open user menu/i }).click();
    await page.getByRole('menuitem', { name: /profile/i }).click();
    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByRole('tab', { name: /general/i })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    // Change default currency to EUR.
    await page.getByRole('combobox', { name: 'Default currency' }).click();
    await page.getByRole('option', { name: 'EUR' }).click();
    await page
      .getByRole('button', { name: /^save$/i })
      .first()
      .click();
    await expect(page.getByTestId('defaultCurrency-status')).toBeVisible();

    // Switch to Dictionaries and add a label.
    await page.getByRole('tab', { name: /dictionaries/i }).click();
    await page.getByRole('button', { name: 'Add label' }).click();
    const labelInput = page.getByRole('textbox', { name: 'Add label' });
    await labelInput.fill('trip');
    await labelInput.press('Enter');
    await expect(page.getByText('trip')).toBeVisible();

    // Delete the label we just added.
    await page.getByRole('button', { name: /delete trip/i }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('trip')).toBeHidden();
  });
});
