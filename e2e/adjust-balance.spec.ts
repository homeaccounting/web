import { test, expect } from '@playwright/test';

// Exercises the "adjust balance consistency" feature:
//  - with no accounts, all four control-bar action buttons are disabled
//    (aria-disabled) with a "Create an account first" tooltip;
//  - the account is chosen inside the Adjust-balance dialog (no longer fixed by
//    a row selection), pre-selected to the first account;
//  - switching the account in the dialog updates the current balance, and the
//    adjustment is booked against the chosen account.
test.describe('adjust balance consistency @local', () => {
  test('disabled with no accounts; pick + switch account inside the dialog', async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;
    const password = 'longenough';

    // 1. Register a new user — starts with no accounts.
    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    // 2. With no accounts, all four control-bar buttons are disabled.
    for (const name of [
      /^add expense$/i,
      /^add income$/i,
      /^add transfer$/i,
      /^adjust balance$/i,
    ]) {
      await expect(page.getByRole('button', { name })).toHaveAttribute('aria-disabled', 'true');
    }

    // The disabled "Adjust balance" button surfaces the explanatory tooltip.
    await page.getByRole('button', { name: /^adjust balance$/i }).focus();
    await expect(page.getByRole('tooltip', { name: /create an account first/i })).toBeVisible();

    // 3. Create two accounts so the in-dialog selector has something to switch to.
    await page.getByRole('button', { name: /add account/i }).click();
    let dialog = page.getByRole('dialog');
    await dialog.getByLabel(/name/i).fill('Wallet');
    await dialog.getByLabel(/initial balance/i).fill('100');
    await dialog.getByRole('button', { name: /^ok$/i }).click();
    await expect(page.getByRole('link', { name: /wallet/i })).toBeVisible();

    await page.getByRole('button', { name: /add account/i }).click();
    dialog = page.getByRole('dialog');
    await dialog.getByLabel(/name/i).fill('Savings');
    await dialog.getByLabel(/initial balance/i).fill('500');
    await dialog.getByRole('button', { name: /^ok$/i }).click();
    await expect(page.getByRole('link', { name: /savings/i })).toBeVisible();

    // 4. Buttons are now enabled (no account row selected required).
    await expect(page.getByRole('button', { name: /^adjust balance$/i })).toHaveAttribute(
      'aria-disabled',
      'false',
    );

    // 5. Open Adjust balance directly from the control bar.
    await page.getByRole('button', { name: /^adjust balance$/i }).click();
    const adjust = page.getByRole('dialog', { name: /adjust balance/i });
    await expect(adjust).toBeVisible();

    // Account is pre-selected to the first account; switching updates the
    // displayed current balance.
    const accountSelect = adjust.getByRole('combobox', { name: 'Account' });
    await expect(adjust.getByText(/current balance/i)).toBeVisible();
    await accountSelect.click();
    await page.getByRole('option', { name: 'Savings (USD)' }).click();
    await expect(adjust.getByText(/current balance/i)).toContainText('500');

    // 6. Adjust the Savings balance to 650 and submit.
    const target = adjust.getByLabel(/target balance/i);
    await target.fill('650');
    await adjust.getByLabel(/description/i).fill('Reconcile savings');
    await adjust.getByRole('button', { name: /^ok$/i }).click();
    await expect(adjust).toBeHidden();

    // 7. Open the Savings account and confirm the adjustment landed there.
    await page.getByRole('link', { name: /savings/i }).click();
    await expect(page.getByRole('cell', { name: 'Reconcile savings' })).toBeVisible({
      timeout: 10000,
    });
  });
});
