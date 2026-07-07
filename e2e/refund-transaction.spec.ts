import { test, expect } from '@playwright/test';

// End-to-end coverage for tracker#33: refunding a completed expense creates an
// Income (contra) transaction linked by a `Refund` relation, and the linkage
// surfaces as badges on both rows. Runs against a live backend (@local).

/** Register a fresh user, create a USD "Wallet" (balance 100) and open it. */
async function setupWallet(page: import('@playwright/test').Page) {
  const email = `e2e-${Date.now()}-${Math.floor(performance.now())}@example.com`;
  const password = 'longenough';

  await page.goto('register');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /^create account$/i }).click();
  await expect(page.getByText(/no accounts yet/i)).toBeVisible();

  await page.getByRole('button', { name: /add account/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/name/i).fill('Wallet');
  await dialog.getByLabel(/initial balance/i).fill('100');
  await dialog.getByRole('button', { name: /^ok$/i }).click();

  await expect(page.getByRole('link', { name: /wallet/i })).toBeVisible();
  await page.getByRole('link', { name: /wallet/i }).click();
}

/** Seed a completed expense in the "Food" category and wait for its row. */
async function seedExpense(
  page: import('@playwright/test').Page,
  { amount, description }: { amount: string; description: string },
) {
  await page.getByRole('button', { name: /^add expense$/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/amount/i).fill(amount);
  const category = dialog.getByRole('combobox', { name: /category/i });
  await category.click();
  await category.fill('Fo');
  await dialog.getByRole('option', { name: 'Food' }).click();
  await dialog.getByLabel(/description/i).fill(description);
  await dialog.getByRole('button', { name: /^ok$/i }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('cell', { name: description })).toBeVisible({ timeout: 10000 });
  // The action guard only shows "Refund" once the transaction is Completed.
  await expect(page.getByRole('img', { name: 'Expense' })).toBeVisible({ timeout: 10000 });
}

test.describe('refund transaction @local', () => {
  test('full refund → income row appears, original reads "refunded in full"', async ({ page }) => {
    await setupWallet(page);
    await seedExpense(page, { amount: '9.99', description: 'Coffee' });

    // Right-click the expense row → Refund.
    await page.getByRole('cell', { name: 'Coffee' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: /^refund$/i }).click();

    // The refund dialog opens pre-seeded with the original's Food slice (9.99)
    // and a locked target. A full refund just accepts the defaults.
    const refundDialog = page.getByRole('dialog', { name: /refund transaction/i });
    await expect(refundDialog).toBeVisible();
    await expect(refundDialog.getByLabel(/amount/i)).toHaveValue('9.99');
    await refundDialog.getByRole('button', { name: /^ok$/i }).click();
    await expect(refundDialog).toBeHidden();

    // A new Income transaction "Refund: Coffee" is posted...
    await expect(page.getByRole('cell', { name: /Refund: Coffee/i })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByRole('img', { name: 'Income' })).toBeVisible();
    // ...the original renders "refunded in full", and the refund shows its origin.
    await expect(page.getByText(/refunded in full/i)).toBeVisible();
    await expect(page.getByText(/refund of Coffee/i)).toBeVisible();
  });

  test('partial refund → original reads "partially refunded"', async ({ page }) => {
    await setupWallet(page);
    await seedExpense(page, { amount: '10', description: 'Lunch' });

    await page.getByRole('cell', { name: 'Lunch' }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: /^refund$/i }).click();

    const refundDialog = page.getByRole('dialog', { name: /refund transaction/i });
    await expect(refundDialog).toBeVisible();
    // Edit the slice down for a partial refund (4 of 10). The locked target is a
    // ceiling, so a sub-target sum still submits (tracker#33 partial-refund path).
    await refundDialog.getByLabel(/amount/i).fill('4');
    await refundDialog.getByRole('button', { name: /^ok$/i }).click();
    await expect(refundDialog).toBeHidden();

    await expect(page.getByRole('cell', { name: /Refund: Lunch/i })).toBeVisible({
      timeout: 10000,
    });
    // The original expense now shows a partial-refund badge referencing both amounts.
    await expect(page.getByText(/partially refunded/i)).toBeVisible();
    await expect(page.getByText(/\$4\.00 of \$10\.00/)).toBeVisible();
  });
});
