import { test, expect } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';

// Requires a live backend (VITE_API_BASE_URL); @local, not run in CI.
// Exercises the contra-expense / "compensation" case: a single Income
// transaction that carries an income slice (Salary) AND an expense-dictionary
// reimbursement slice (Food), summing to the credited total.
test.describe('create reimbursement (contra-expense) income @local', () => {
  test('income with salary + reimbursement → split row, balance reflects total', async ({
    page,
  }) => {
    const email = `e2e-${Date.now()}@example.com`;
    const password = 'longenough';

    // 1. Register.
    await page.goto('register');
    await page.getByLabel(/email/i).fill(email);
    await page.getByLabel(/password/i).fill(password);
    await page.getByRole('button', { name: /^create account$/i }).click();
    await skipOnboarding(page);
    await expect(page.getByText(/no accounts yet/i)).toBeVisible();

    // 2. Create account "Wallet" (USD, balance 100).
    await page.getByRole('button', { name: /add account/i }).click();
    const createAccountDialog = page.getByRole('dialog');
    await createAccountDialog.getByLabel(/name/i).fill('Wallet');
    await createAccountDialog.getByLabel(/initial balance/i).fill('100');
    await createAccountDialog.getByRole('button', { name: /^ok$/i }).click();

    // 3. Open the account.
    await expect(page.getByRole('link', { name: /wallet/i })).toBeVisible();
    await page.getByRole('link', { name: /wallet/i }).click();

    // 4. Open Add income.
    await page.getByRole('button', { name: /^add income$/i }).click();
    const incomeDialog = page.getByRole('dialog');

    // 5. First (income) row: Salary 5000 — "Salary" is a backend-seeded default
    //    income category (see server-infra/.../Defaults.hs `income`).
    const incomeCategory = incomeDialog.getByRole('combobox', { name: /category/i }).nth(0);
    await incomeCategory.click();
    await incomeCategory.fill('Sal');
    await incomeDialog.getByRole('option', { name: 'Salary' }).click();
    await incomeDialog.getByLabel('Amount').nth(0).fill('5000');

    // 6. Expand the collapsed Reimbursements section and add an expense slice.
    await incomeDialog.getByRole('button', { name: /reimbursements/i }).click();
    await incomeDialog.getByRole('button', { name: /add reimbursement/i }).click();

    // The reimbursement row is the second category/amount pair (expense bucket
    // renders after the income bucket). "Groceries" (under the "Food" group)
    // is a seeded expense category.
    const reimbCategory = incomeDialog.getByRole('combobox', { name: /category/i }).nth(1);
    await reimbCategory.click();
    await reimbCategory.fill('Groc');
    await incomeDialog.getByRole('option', { name: 'Groceries' }).click();
    await incomeDialog.getByLabel('Amount').nth(1).fill('500');

    await incomeDialog.getByLabel(/description/i).fill('Salary + rent reimbursement');

    // 7. Submit; the split income row appears with one category chip per slice
    //    (like labels) — both "Salary" and the "Groceries" reimbursement (chips
    //    render each entry's leaf name, not its parent group).
    await incomeDialog.getByRole('button', { name: /^ok$/i }).click();
    await expect(incomeDialog).toBeHidden();
    await expect(page.getByRole('cell', { name: 'Salary + rent reimbursement' })).toBeVisible({
      timeout: 10000,
    });
    const categoryCell = page
      .getByRole('cell', { name: /salary/i })
      .filter({ hasText: /groceries/i });
    await expect(categoryCell).toBeVisible();

    // 8. The account balance reflects the FULL credited total (100 + 5500 = 5600);
    //    posting ignores the bucket split.
    await expect(page.getByText(/5,?600/).first()).toBeVisible({ timeout: 10000 });
  });
});
