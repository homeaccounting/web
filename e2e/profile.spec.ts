import { test, expect } from '@playwright/test';

test.describe('profile @local', () => {
  test('view profile, change default currency, add and remove a label', async ({ page }) => {
    // The currency-save round trip has been observed taking several seconds
    // through the browser against the local backend — raise the test budget
    // so that doesn't blow past the suite-wide 30s default.
    test.setTimeout(60000);
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
    const saveDefaultCurrency = page.getByRole('button', { name: /^save$/i }).first();
    await saveDefaultCurrency.click();
    // Success surfaces as an "Updated." toast. Note the Save button's
    // `disabled` state is NOT a reliable "mutation settled" signal — it goes
    // true as soon as the mutation is *pending* (isPending), not once it
    // resolves, so asserting on it lets the test race ahead into the next
    // mutation (add-label) while this one is still in flight. That race is
    // real: this PUT has been observed taking several seconds to round-trip
    // through the browser against the local backend (vs. <300ms via curl),
    // and firing the label POST before it settles has been observed causing
    // a 500 from the label POST. Wait for the toast (the true completion
    // signal) with generous headroom instead.
    await expect(page.getByText('Updated.')).toBeVisible({ timeout: 20000 });

    // Switch to Dictionaries → Label sub-tab and add a label.
    await page.getByRole('tab', { name: /dictionaries/i }).click();
    await page.getByRole('tab', { name: /^label$/i }).click();
    await page.getByRole('button', { name: 'Add label' }).click();
    const labelInput = page.getByRole('textbox', { name: 'Add label' });
    await labelInput.fill('trip');
    await labelInput.press('Enter');
    await expect(page.getByText('trip')).toBeVisible({ timeout: 20000 });

    // Delete the label we just added.
    await page.getByRole('button', { name: /delete trip/i }).click();
    await page.getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByText('trip')).toBeHidden();
  });
});
