import { test, expect, type Page } from '@playwright/test';

// End-to-end coverage for bulk label/category on a multi-selection: right-clicking
// a selected row opens a BULK context menu (not the single-row one), and Set
// labels / Set category apply across every selected row with a summary toast.
// Runs against a live backend (@local).

/** Register a fresh user, create a USD "Wallet" (balance 100) and open it. */
async function setupWallet(page: Page) {
  const email = `e2e-bulk-${Date.now()}-${Math.floor(performance.now())}@example.com`;
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

  // The default period is "Last month", which excludes today's freshly-seeded
  // rows — switch to "This month" so seeded expenses are visible.
  await page.getByRole('combobox', { name: /period/i }).click();
  await page.getByRole('option', { name: 'This month' }).click();
}

/** Seed a completed expense in the "Groceries" category and wait for its row. */
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
  await expect(page.getByRole('cell', { name: description, exact: true })).toBeVisible({
    timeout: 10000,
  });
}

test.describe('bulk label & category @local', () => {
  test('bulk-add a label to all selected rows via the right-click menu', async ({ page }) => {
    await setupWallet(page);
    await seedExpense(page, { amount: '4', description: 'Coffee' });
    await seedExpense(page, { amount: '6', description: 'Pastry' });
    await seedExpense(page, { amount: '3', description: 'Tea' });

    // Select all three rows.
    await page.getByRole('checkbox', { name: 'Select Coffee' }).check();
    await page.getByRole('checkbox', { name: 'Select Pastry' }).check();
    await page.getByRole('checkbox', { name: 'Select Tea' }).check();
    await expect(page.getByRole('region', { name: /selection actions/i })).toContainText(
      /3 selected/i,
    );

    // Right-click a selected row → the BULK menu (not the single-row one).
    await page.getByRole('cell', { name: 'Coffee', exact: true }).click({ button: 'right' });
    const menu = page.getByRole('menu');
    await expect(menu).toContainText(/3 selected/i);
    await expect(menu.getByRole('menuitem', { name: /^edit$/i })).toHaveCount(0);

    // Set labels → create a new "Urgent" label → it applies to every row. Sync on
    // the create response so the fan-out has fired before we assert the outcome.
    await menu.getByRole('menuitem', { name: /set labels/i }).hover();
    await page.getByRole('combobox', { name: /search labels/i }).fill('Urgent');
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/dictionaries/label/entries') && r.status() === 201,
      ),
      page.getByRole('option', { name: /create ['‘]?Urgent/i }).click(),
    ]);

    // Success toast + the label chip on all three rows.
    await expect(page.getByText(/updated 3 transactions/i)).toBeVisible({ timeout: 10000 });
    await page.keyboard.press('Escape'); // dismiss the still-open labels submenu
    await expect(page.getByText('Urgent', { exact: true })).toHaveCount(3);
  });

  test('bulk-set category closes the menu and reports success', async ({ page }) => {
    await setupWallet(page);
    await seedExpense(page, { amount: '4', description: 'Coffee' });
    await seedExpense(page, { amount: '6', description: 'Pastry' });

    await page.getByRole('checkbox', { name: 'Select Coffee' }).check();
    await page.getByRole('checkbox', { name: 'Select Pastry' }).check();

    await page.getByRole('cell', { name: 'Coffee', exact: true }).click({ button: 'right' });
    const menu = page.getByRole('menu');
    await menu.getByRole('menuitem', { name: /set category/i }).hover();
    await page.getByRole('option', { name: 'Groceries' }).click();

    // Single-select → the whole menu closes, and a success toast confirms.
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.getByText(/updated 2 transactions/i)).toBeVisible({ timeout: 10000 });
  });
});
