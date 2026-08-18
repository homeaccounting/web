import { test, expect, type Page } from '@playwright/test';

// End-to-end coverage for bulk "Set contact" on a multi-selection: right-clicking
// a selected row opens the BULK context menu, and "Set contact" assigns a single
// contact across every selected row with a summary toast. Runs against a live
// backend (@local).

/** Register a fresh user, create a USD "Wallet" (balance 100) and open it. */
async function setupWallet(page: Page) {
  const email = `e2e-bulk-contact-${Date.now()}-${Math.floor(performance.now())}@example.com`;
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

test.describe('bulk set contact @local', () => {
  test('bulk-set a new contact on all selected rows via the right-click menu', async ({ page }) => {
    await setupWallet(page);
    await seedExpense(page, { amount: '4', description: 'Coffee' });
    await seedExpense(page, { amount: '6', description: 'Pastry' });

    // Select both rows.
    await page.getByRole('checkbox', { name: 'Select Coffee' }).check();
    await page.getByRole('checkbox', { name: 'Select Pastry' }).check();
    await expect(page.getByRole('region', { name: /selection actions/i })).toContainText(
      /2 selected/i,
    );

    // Right-click a selected row → the BULK menu (not the single-row one).
    await page.getByRole('cell', { name: 'Coffee', exact: true }).click({ button: 'right' });
    const menu = page.getByRole('menu');
    await expect(menu).toContainText(/2 selected/i);
    await expect(menu.getByRole('menuitem', { name: /^edit$/i })).toHaveCount(0);

    // Set contact → create a new "Acme" contact → it applies to every row.
    // Single-select → the whole menu closes on commit. Sync on the create
    // response so the fan-out has fired before we assert the outcome.
    await menu.getByRole('menuitem', { name: /set contact/i }).hover();
    await page.getByRole('combobox', { name: /search contacts/i }).fill('Acme');
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/dictionaries/contact/entries') && r.status() === 201,
      ),
      page.getByRole('option', { name: /create ['‘]?Acme/i }).click(),
    ]);

    // Single-select → the whole menu closes, a success toast confirms, and the
    // contact chip shows on both rows.
    await expect(page.getByRole('menu')).toHaveCount(0);
    await expect(page.getByText(/updated 2 transactions/i)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Acme', { exact: true })).toHaveCount(2);
  });
});
