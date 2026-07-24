import { test, expect } from '@playwright/test';

// End-to-end coverage for tracker#30: merging two completed expenses on the
// same account into one survivor. The target absorbs the combined amount +
// allocations and the other source is cancelled (atomic single-transaction
// merge saga on the backend). Runs against a live backend (@local).

/** Register a fresh user, create a USD "Wallet" (balance 100) and open it. */
async function setupWallet(page: import('@playwright/test').Page) {
  const email = `e2e-merge-${Date.now()}-${Math.floor(performance.now())}@example.com`;
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

/** Seed a completed expense in the "Food"/"Groceries" category and wait for its row. */
async function seedExpense(
  page: import('@playwright/test').Page,
  { amount, description }: { amount: string; description: string },
) {
  await page.getByRole('button', { name: /^add expense$/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/amount/i).fill(amount);
  const category = dialog.getByRole('combobox', { name: /category/i });
  await category.click();
  await category.fill('Groc');
  await dialog.getByRole('option', { name: 'Groceries' }).click();
  await dialog.getByLabel(/description/i).fill(description);
  await dialog.getByRole('button', { name: /^ok$/i }).click();
  await expect(dialog).toBeHidden();
  // `exact` so the description cell isn't confused with the checkbox cell whose
  // accessible name is "Select <description>".
  await expect(page.getByRole('cell', { name: description, exact: true })).toBeVisible({
    timeout: 10000,
  });
}

test.describe('merge transactions @local', () => {
  test('merge two expenses → one combined transaction, the other cancelled', async ({ page }) => {
    await setupWallet(page);
    await seedExpense(page, { amount: '4', description: 'Coffee' });
    await seedExpense(page, { amount: '6', description: 'Pastry' });

    // Right-click the survivor (Coffee) → "Merge into this…".
    await page.getByRole('cell', { name: 'Coffee', exact: true }).click({ button: 'right' });
    await page.getByRole('menuitem', { name: /merge into this/i }).click();

    // The dialog keeps Coffee as the survivor and offers the other compatible
    // rows to fold in. Pick Pastry; the combined total (4 + 6 = 10) previews.
    const dialog = page.getByRole('dialog', { name: /merge transactions/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('checkbox', { name: /Pastry/i }).check();
    await expect(dialog.getByTestId('merge-total')).toHaveText(/\$10\.00/);
    await dialog.getByRole('button', { name: /^merge$/i }).click();
    await expect(dialog).toBeHidden();

    // Default view hides cancelled rows: the survivor (Coffee) now carries the
    // combined $10.00 amount and the merged-away Pastry is gone from the list.
    await expect(page.getByRole('cell', { name: 'Coffee', exact: true })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/\$10\.00/).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Pastry', exact: true })).toHaveCount(0);

    // Reveal cancelled rows → Pastry reappears, now Cancelled — proof the merge
    // cancelled the source (rather than deleting it) as part of the operation.
    await page.getByRole('button', { name: /^filters/i }).click();
    await page.getByRole('checkbox', { name: /cancelled & failed/i }).check();
    await expect(page.getByRole('cell', { name: 'Pastry', exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Cancelled' })).toBeVisible();
  });
});
