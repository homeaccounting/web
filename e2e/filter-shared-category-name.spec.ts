import { test, expect } from '@playwright/test';

// Requires a live backend (VITE_API_BASE_URL); @local, not run in CI.
// Regression for the "Other" filter bug: "Other" is seeded into BOTH the
// income- and expense-category dictionaries with distinct ids. Filtering by
// the category name "Other" must match income AND expense rows, not just one.
test.describe('filter by a category name shared across dictionaries @local', () => {
  test('filtering "Other" matches both the income and the expense row', async ({ page }) => {
    const email = `e2e-${Date.now()}@example.com`;
    const password = 'longenough';

    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    await page.getByRole('button', { name: /add account/i }).click();
    const acct = page.getByRole('dialog');
    await acct.getByLabel(/name/i).fill('Wallet');
    await acct.getByLabel(/initial balance/i).fill('1000');
    await acct.getByRole('button', { name: /^ok$/i }).click();
    await page.getByRole('link', { name: /wallet/i }).click();

    // Income categorised as "Other" (income dictionary).
    await page.getByRole('button', { name: /^add income$/i }).click();
    const inc = page.getByRole('dialog');
    const incCat = inc.getByRole('combobox', { name: /category/i }).nth(0);
    await incCat.click();
    await incCat.fill('Oth');
    await inc.getByRole('option', { name: 'Other' }).click();
    await inc.getByLabel('Amount').nth(0).fill('100');
    await inc.getByLabel(/description/i).fill('Income other');
    await inc.getByRole('button', { name: /^ok$/i }).click();
    await expect(inc).toBeHidden();

    // Expense categorised as "Other" (expense dictionary — a different id).
    await page.getByRole('button', { name: /^add expense$/i }).click();
    const exp = page.getByRole('dialog');
    const expCat = exp.getByRole('combobox', { name: /category/i }).nth(0);
    await expCat.click();
    await expCat.fill('Oth');
    await exp.getByRole('option', { name: 'Other' }).click();
    await exp.getByLabel('Amount').nth(0).fill('50');
    await exp.getByLabel(/description/i).fill('Expense other');
    await exp.getByRole('button', { name: /^ok$/i }).click();
    await expect(exp).toBeHidden();

    await expect(page.getByRole('cell', { name: 'Income other' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('cell', { name: 'Expense other' })).toBeVisible();

    // Filter by the category name "Other" — both rows must remain.
    await page
      .getByRole('button', { name: /^filters/i })
      .first()
      .click();
    const categoryInput = page.getByPlaceholder(/all categories/i);
    await categoryInput.click();
    await categoryInput.fill('Other');
    await page.getByRole('option', { name: 'Other' }).click();

    await expect(page.getByRole('cell', { name: 'Income other' })).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Expense other' })).toBeVisible();
  });
});
