import { test, expect, type Page } from '@playwright/test';

// End-to-end coverage for the selection-driven Link/Merge UX (tracker#30 + the
// selection redesign): a checkbox column drives a floating action bar. Merging
// two completed expenses folds the sources into a chosen survivor and cancels
// the rest; linking associates two rows. Runs against a live backend (@local).

/** Register a fresh user, create a USD "Wallet" (balance 100) and open it. */
async function setupWallet(page: Page) {
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
  page: Page,
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

test.describe('selection-driven transaction actions @local', () => {
  test('merge two expenses via selection → one survivor, the other cancelled', async ({ page }) => {
    await setupWallet(page);
    await seedExpense(page, { amount: '4', description: 'Coffee' });
    await seedExpense(page, { amount: '6', description: 'Pastry' });

    // Select both rows via their checkboxes; the floating action bar appears.
    await page.getByRole('checkbox', { name: 'Select Coffee' }).check();
    await page.getByRole('checkbox', { name: 'Select Pastry' }).check();
    const bar = page.getByRole('region', { name: /selection actions/i });
    await expect(bar).toContainText(/2 selected/i);

    await bar.getByRole('button', { name: /merge selected/i }).click();

    // Keep Coffee as the survivor; the combined total (4 + 6 = 10) previews.
    const dialog = page.getByRole('dialog', { name: /merge 2 transactions/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('radio', { name: /Coffee/i }).check();
    await expect(dialog.getByTestId('merge-total')).toHaveText(/\$10\.00/);
    await dialog.getByRole('button', { name: /^merge$/i }).click();
    await expect(dialog).toBeHidden();

    // Coffee now carries the combined $10.00; Pastry is gone from the default view.
    await expect(page.getByRole('cell', { name: 'Coffee', exact: true })).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(/\$10\.00/).first()).toBeVisible();
    await expect(page.getByRole('cell', { name: 'Pastry', exact: true })).toHaveCount(0);

    // Reveal cancelled rows → Pastry reappears, now Cancelled.
    await page.getByRole('button', { name: /^filters/i }).click();
    await page.getByRole('checkbox', { name: /cancelled & failed/i }).check();
    await expect(page.getByRole('cell', { name: 'Pastry', exact: true })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Cancelled' })).toBeVisible();
  });

  test('link two expenses via selection → an association badge', async ({ page }) => {
    await setupWallet(page);
    await seedExpense(page, { amount: '5', description: 'Online order' });
    await seedExpense(page, { amount: '3', description: 'Delivery charge' });

    await page.getByRole('checkbox', { name: 'Select Online order' }).check();
    await page.getByRole('checkbox', { name: 'Select Delivery charge' }).check();
    const bar = page.getByRole('region', { name: /selection actions/i });
    await expect(bar).toContainText(/2 selected/i);

    await bar.getByRole('button', { name: /link selected/i }).click();

    // Two plain expenses → Association (no kind toggle). Confirm the link.
    const dialog = page.getByRole('dialog', { name: /link 2 transactions/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: /^link$/i }).click();
    await expect(dialog).toBeHidden();

    // An association badge now surfaces on the linked rows.
    await expect(page.getByText(/associated with/i).first()).toBeVisible({ timeout: 10000 });
  });
});
