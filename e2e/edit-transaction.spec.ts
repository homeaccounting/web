import { test, expect } from '@playwright/test';

test.describe('edit transaction @local', () => {
  test('double-click row → change description → row reflects new text', async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;
    const password = 'longenough';

    // 1. Register and create an account.
    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    await page.getByRole('button', { name: /add account/i }).click();
    const createAccountDialog = page.getByRole('dialog');
    await createAccountDialog.getByLabel(/name/i).fill('Wallet');
    await createAccountDialog.getByLabel(/initial balance/i).fill('100');
    await createAccountDialog.getByRole('button', { name: /^ok$/i }).click();

    await expect(page.getByRole('link', { name: /wallet/i })).toBeVisible();
    await page.getByRole('link', { name: /wallet/i }).click();

    // 2. Seed an expense to edit.
    await page.getByRole('button', { name: /^add expense$/i }).click();
    const expenseDialog = page.getByRole('dialog');
    await expenseDialog.getByLabel(/amount/i).fill('9.99');
    const categoryInput = expenseDialog.getByRole('combobox', { name: /category/i });
    await categoryInput.click();
    await categoryInput.fill('Fo');
    await expenseDialog.getByRole('option', { name: 'Food' }).click();
    await expenseDialog.getByLabel(/description/i).fill('Coffee');
    await expenseDialog.getByRole('button', { name: /^add expense$/i }).click();
    await expect(expenseDialog).toBeHidden();
    const row = page.getByRole('cell', { name: 'Coffee' });
    await expect(row).toBeVisible({ timeout: 10000 });

    // 3. Double-click the row to open the edit dialog.
    await row.dblclick();
    const editDialog = page.getByRole('dialog', { name: /edit expense/i });
    await expect(editDialog).toBeVisible();

    // 4. Change the description and save.
    const descInput = editDialog.getByLabel(/description/i);
    await descInput.fill('Latte');
    await editDialog.getByRole('button', { name: /^save$/i }).click();
    await expect(editDialog).toBeHidden();

    // 5. The list reflects the new description.
    await expect(page.getByRole('cell', { name: 'Latte' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('cell', { name: 'Coffee' })).toBeHidden();
  });
});
