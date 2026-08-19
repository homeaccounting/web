// Requires a live backend (VITE_API_BASE_URL); @local, not run in CI.
// UNVERIFIED in the authoring environment — review selectors before first local run.
import { test, expect } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';

test.describe('create multi-allocation transaction @local', () => {
  test('add a 2-category expense → split row appears in transactions table', async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;
    const password = 'longenough';

    // 1. Register a new user.
    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await skipOnboarding(page);
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

    // 5. Fill the FIRST expense row. The backend seeds default expense categories
    //    (see ../server-infra/src/Domain/Configuration/Defaults.hs `expense`),
    //    so both "Food" and "Transport" are always on the `expense-category`
    //    dictionary.
    //
    //    The allocation editor repeats the "Amount"/"Category" accessible names
    //    once per row, so every selector is scoped by position (.nth(i)).
    await expenseDialog
      .getByLabel(/amount/i)
      .nth(0)
      .fill('6.00');
    // Category is a searchable combobox: click, type a prefix, then click the option.
    const firstCategory = expenseDialog.getByRole('combobox', { name: /category/i }).nth(0);
    await firstCategory.click();
    await firstCategory.fill('Groc');
    await expenseDialog.getByRole('option', { name: 'Groceries' }).click();

    // 6. Add a SECOND allocation row, then fill it (Transport, 3.99).
    await expenseDialog.getByRole('button', { name: /add category/i }).click();
    await expenseDialog
      .getByLabel(/amount/i)
      .nth(1)
      .fill('3.99');
    const secondCategory = expenseDialog.getByRole('combobox', { name: /category/i }).nth(1);
    await secondCategory.click();
    await secondCategory.fill('Tra');
    await expenseDialog.getByRole('option', { name: 'Transport' }).click();

    await expenseDialog.getByLabel(/description/i).fill('Split coffee');
    // Date intentionally left empty — server defaults to today.

    // 7. Submit, expect the new split row. The Category column renders one
    //    colored chip per slice (like labels), using each entry's leaf name —
    //    both "Groceries" and "Transport".
    await expenseDialog.getByRole('button', { name: /^ok$/i }).click();
    await expect(expenseDialog).toBeHidden();
    await expect(page.getByRole('cell', { name: 'Split coffee' })).toBeVisible({ timeout: 10000 });
    const categoryCell = page
      .getByRole('cell', { name: /groceries/i })
      .filter({ hasText: /transport/i });
    await expect(categoryCell).toBeVisible();
  });
});
