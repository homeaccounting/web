import { test, expect } from '@playwright/test';

test.describe('create transaction @local', () => {
  test('add expense → appears in transactions table', async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;
    const password = 'longenough';

    // 1. Register a new user.
    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    // 2. Create an account "Wallet" (USD, balance 100).
    await page.getByRole('button', { name: /add account/i }).click();
    const createAccountDialog = page.getByRole('dialog');
    await createAccountDialog.getByLabel(/name/i).fill('Wallet');
    await createAccountDialog.getByLabel(/initial balance/i).fill('100');
    await createAccountDialog.getByRole('button', { name: /^ok$/i }).click();

    // 3. Open the new account.
    await expect(page.getByRole('link', { name: /wallet/i })).toBeVisible();
    await page.getByRole('link', { name: /wallet/i }).click();

    // 4. Open the Add expense dialog.
    await page.getByRole('button', { name: /^add expense$/i }).click();
    const expenseDialog = page.getByRole('dialog');

    // 5. Fill the form. The backend seeds default expense categories
    //    (see server-infra/.../Defaults.hs) so "Food" is always available
    //    on the `expense-category` dictionary.
    await expenseDialog.getByLabel(/amount/i).fill('9.99');
    // Category is a searchable combobox: type a prefix, then click the option.
    const categoryInput = expenseDialog.getByRole('combobox', { name: /category/i });
    await categoryInput.click();
    await categoryInput.fill('Fo');
    await expenseDialog.getByRole('option', { name: 'Food' }).click();
    await expenseDialog.getByLabel(/description/i).fill('Coffee');
    // Date intentionally left empty — server defaults to today.

    // 6. Submit, expect the new row.
    await expenseDialog.getByRole('button', { name: /^ok$/i }).click();
    await expect(expenseDialog).toBeHidden();
    await expect(page.getByRole('cell', { name: 'Coffee' })).toBeVisible({ timeout: 10000 });
  });
});
