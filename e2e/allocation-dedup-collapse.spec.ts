// Requires a live backend (VITE_API_BASE_URL); @local, not run in CI.
// Verification spec for: list category dedup + edit-dialog "Collapse duplicates".
import { test, expect } from '@playwright/test';

test.describe('allocation dedup + collapse @local', () => {
  test('duplicate-category split: one chip in list, collapses in edit dialog', async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;
    const password = 'longenough';

    // Register + account.
    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    await page.getByRole('button', { name: /add account/i }).click();
    const acct = page.getByRole('dialog');
    await acct.getByLabel(/name/i).fill('Wallet');
    await acct.getByLabel(/initial balance/i).fill('100');
    await acct.getByRole('button', { name: /^ok$/i }).click();
    await page.getByRole('link', { name: /wallet/i }).click();

    // Add an expense with TWO allocation rows of the SAME category (Groceries).
    await page.getByRole('button', { name: /^add expense$/i }).click();
    const dlg = page.getByRole('dialog');
    await dlg
      .getByLabel(/amount/i)
      .nth(0)
      .fill('6.00');
    const cat0 = dlg.getByRole('combobox', { name: /category/i }).nth(0);
    await cat0.click();
    await cat0.fill('Groc');
    await dlg.getByRole('option', { name: 'Groceries' }).click();
    await dlg.getByLabel('Comment').nth(0).fill('milk');

    await dlg.getByRole('button', { name: /add category/i }).click();
    await dlg
      .getByLabel(/amount/i)
      .nth(1)
      .fill('4.00');
    const cat1 = dlg.getByRole('combobox', { name: /category/i }).nth(1);
    await cat1.click();
    await cat1.fill('Groc');
    await dlg.getByRole('option', { name: 'Groceries' }).click();
    await dlg.getByLabel('Comment').nth(1).fill('bread');

    await dlg.getByLabel(/description/i).fill('DupCat');
    await dlg.getByRole('button', { name: /^ok$/i }).click();
    await expect(dlg).toBeHidden();

    // SURFACE 1 — list: the row's category cell shows ONE "Groceries" chip, not two.
    const row = page.getByRole('button', { name: /^Select DupCat Expense/ });
    await expect(row).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('cell', { name: 'Groceries' })).toHaveCount(1);
    await expect(page.getByText('Groceries', { exact: true })).toHaveCount(1);

    // SURFACE 2 — edit dialog: two rows + a "Collapse duplicates" button.
    await row.dblclick();
    const edit = page.getByRole('dialog', { name: /edit expense/i });
    await expect(edit).toBeVisible();
    await expect(edit.getByRole('combobox', { name: /category/i })).toHaveCount(2);
    const collapse = edit.getByRole('button', { name: /collapse duplicates/i });
    await expect(collapse).toBeVisible();

    // Click collapse → one row, summed amount 10, comments joined "milk, bread".
    await collapse.click();
    await expect(edit.getByRole('combobox', { name: /category/i })).toHaveCount(1);
    await expect(edit.getByLabel(/amount/i)).toHaveValue('10');
    await expect(edit.getByLabel('Comment')).toHaveValue('milk, bread');
    await expect(collapse).toBeHidden();

    // Save the collapsed edit.
    await edit.getByRole('button', { name: /^ok$/i }).click();
    await expect(edit).toBeHidden();
    await expect(page.getByRole('button', { name: /^Select DupCat Expense/ })).toBeVisible();
    await expect(page.getByText('Groceries', { exact: true })).toHaveCount(1);
  });
});
