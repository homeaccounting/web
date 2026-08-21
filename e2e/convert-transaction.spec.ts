import { test, expect } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';

test.describe('convert transaction @local', () => {
  test('context menu → Convert to → Income → row becomes income', async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;
    const password = 'longenough';

    // 1. Register and create an account.
    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await skipOnboarding(page);
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    await page.getByRole('button', { name: /add account/i }).click();
    const createAccountDialog = page.getByRole('dialog');
    await createAccountDialog.getByLabel(/name/i).fill('Wallet');
    await createAccountDialog.getByLabel(/initial balance/i).fill('100');
    await createAccountDialog.getByRole('button', { name: /^ok$/i }).click();

    await expect(page.getByRole('link', { name: /wallet/i })).toBeVisible();
    await page.getByRole('link', { name: /wallet/i }).click();

    // 2. Seed an expense to convert.
    await page.getByRole('button', { name: /^add expense$/i }).click();
    const expenseDialog = page.getByRole('dialog');
    await expenseDialog.getByLabel(/amount/i).fill('9.99');
    const categoryInput = expenseDialog.getByRole('combobox', { name: /category/i });
    await categoryInput.click();
    await categoryInput.fill('Groc');
    await expenseDialog.getByRole('option', { name: 'Groceries' }).click();
    await expenseDialog.getByLabel(/description/i).fill('Coffee');
    await expenseDialog.getByRole('button', { name: /^ok$/i }).click();
    await expect(expenseDialog).toBeHidden();

    const coffeeCell = page.getByRole('cell', { name: 'Coffee', exact: true });
    await expect(coffeeCell).toBeVisible({ timeout: 10000 });
    // The single transaction row carries a type icon (role=img, name=kind). It
    // starts life as an expense.
    await expect(page.getByRole('img', { name: 'Expense' })).toBeVisible({ timeout: 10000 });

    // 3. Right-click the row → "Convert to" submenu → Income. The submenu only
    //    renders once the transaction is Completed; the locators auto-wait.
    await coffeeCell.click({ button: 'right' });
    await page.getByRole('menuitem', { name: /convert to/i }).hover();
    await page.getByRole('menuitem', { name: /^income$/i }).click();

    // 4. Convert dialog opens pre-filled. A fresh user has no banking default
    //    income category, so the category is empty/required — pick "Salary"
    //    (a backend-seeded default income category) before submitting.
    const convertDialog = page.getByRole('dialog', { name: /convert to income/i });
    await expect(convertDialog).toBeVisible();
    const convertCategory = convertDialog.getByRole('combobox', { name: /category/i });
    await convertCategory.click();
    await convertCategory.fill('Sal');
    await convertDialog.getByRole('option', { name: 'Salary' }).click();
    await convertDialog.getByRole('button', { name: /^ok$/i }).click();
    await expect(convertDialog).toBeHidden();

    // 5. The transaction (same description "Coffee", same account) now reads as
    //    income: its type icon flips and the expense icon is gone.
    await expect(page.getByRole('img', { name: 'Income' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('img', { name: 'Expense' })).toBeHidden();
    await expect(page.getByRole('cell', { name: 'Coffee', exact: true })).toBeVisible();
  });
});
