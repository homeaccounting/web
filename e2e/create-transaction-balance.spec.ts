import { test, expect } from '@playwright/test';

// Issue #46: the create expense/transfer dialogs must block a debit that exceeds
// the source account's available balance (balance + overdraft limit) before it
// reaches the backend.
test.describe('create transaction balance validation @local', () => {
  test('expense over balance is blocked in the dialog, allowed once within balance', async ({
    page,
  }) => {
    const email = `e2e-${Date.now()}@example.com`;
    const password = 'longenough';

    // 1. Register a new user.
    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    // 2. Create an account "Wallet" (USD, balance 100). Regular accounts default
    //    to overdraftLimit 0, so available funds are exactly 100.
    await page.getByRole('button', { name: /add account/i }).click();
    const createAccountDialog = page.getByRole('dialog');
    await createAccountDialog.getByLabel(/name/i).fill('Wallet');
    await createAccountDialog.getByLabel(/initial balance/i).fill('100');
    await createAccountDialog.getByRole('button', { name: /^ok$/i }).click();

    // 3. Open the new account and the Add expense dialog.
    await expect(page.getByRole('link', { name: /wallet/i })).toBeVisible();
    await page.getByRole('link', { name: /wallet/i }).click();
    await page.getByRole('button', { name: /^add expense$/i }).click();
    const expenseDialog = page.getByRole('dialog');

    // 4. Enter an amount above the available balance and pick a category.
    await expenseDialog.getByLabel(/amount/i).fill('150');
    const categoryInput = expenseDialog.getByRole('combobox', { name: /category/i });
    await categoryInput.click();
    await categoryInput.fill('Groc');
    await expenseDialog.getByRole('option', { name: 'Groceries' }).click();
    await expenseDialog.getByLabel(/description/i).fill('Too much');

    // 5. Submit → blocked inline, dialog stays open, nothing posted.
    await expenseDialog.getByRole('button', { name: /^ok$/i }).click();
    await expect(expenseDialog.getByText(/exceeds available balance/i)).toBeVisible();
    await expect(expenseDialog).toBeVisible();

    // 6. Correct the amount to within balance → submit succeeds.
    await expenseDialog.getByLabel(/amount/i).fill('50');
    await expenseDialog.getByLabel(/description/i).fill('Coffee');
    await expenseDialog.getByRole('button', { name: /^ok$/i }).click();
    await expect(expenseDialog).toBeHidden();
    await expect(page.getByRole('cell', { name: 'Coffee' })).toBeVisible({ timeout: 10000 });
  });
});
