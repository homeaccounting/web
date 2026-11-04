import { test, expect, type Page } from '@playwright/test';
import { skipOnboarding } from './support/onboarding';

// End-to-end coverage for creating labels and contacts inline from the
// transaction forms (tracker#98), matching what the row context menu already
// offers. Runs against a live backend (@local).

/** Register a fresh user, create a USD "Wallet" (balance 100) and open it. */
async function setupWallet(page: Page) {
  const email = `e2e-inline-create-${Date.now()}-${Math.floor(performance.now())}@example.com`;
  const password = 'longenough';

  await page.goto('register');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /^create account$/i }).click();
  await skipOnboarding(page);
  await expect(page.getByText(/no accounts yet/i)).toBeVisible();

  await page.getByRole('button', { name: /add account/i }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel(/name/i).fill('Wallet');
  await dialog.getByLabel(/initial balance/i).fill('100');
  await dialog.getByRole('button', { name: /^ok$/i }).click();

  await page.getByRole('link', { name: /wallet/i }).click();
  // The default period is "Last month", which excludes today's freshly-seeded
  // rows — switch to "This month" so seeded expenses are visible.
  await page.getByRole('combobox', { name: /period/i }).click();
  await page.getByRole('option', { name: 'This month' }).click();
}

// Transaction rows are clickable (role "button"), named after their select checkbox.
const txRow = (page: Page, description: string) =>
  page.getByRole('button', { name: new RegExp(`^Select ${description} `) });

/** Type a new label name into the form's labels picker and create it. */
async function createLabel(page: Page, dialog: ReturnType<Page['getByRole']>, name: string) {
  const labels = dialog.getByRole('combobox', { name: /labels/i });
  await labels.click();
  await labels.fill(name);
  await Promise.all([
    page.waitForResponse(
      (r) => r.url().includes('/dictionaries/label/entries') && r.status() === 201,
    ),
    dialog.getByRole('option', { name: new RegExp(`create ['‘]?${name}`, 'i') }).click(),
  ]);
  // The configuration refetch brings the new label into the options, so its chip renders.
  await expect(dialog.getByRole('button', { name: `Remove ${name}` })).toBeVisible();
}

test.describe('inline label & contact create @local', () => {
  test('expense form creates a label and a contact from the description', async ({ page }) => {
    await setupWallet(page);

    await page.getByRole('button', { name: /^add expense$/i }).click();
    const dialog = page.getByRole('dialog', { name: /add expense/i });
    await dialog.getByLabel(/amount/i).fill('4');
    const category = dialog.getByRole('combobox', { name: /category/i });
    await category.click();
    await category.fill('Groc');
    await dialog.getByRole('option', { name: 'Groceries' }).click();
    await dialog.getByLabel(/description/i).fill('Coffee Lab');

    await createLabel(page, dialog, 'Rome');

    const contact = dialog.getByRole('combobox', { name: /contact/i });
    await contact.click();
    await dialog.getByRole('button', { name: /use: coffee lab/i }).click();
    await expect(contact).toHaveValue('Coffee Lab');
    await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/dictionaries/contact/entries') && r.status() === 201,
      ),
      dialog.getByRole('option', { name: /create ['‘]?Coffee Lab/i }).click(),
    ]);
    await expect(contact).toHaveValue('Coffee Lab');

    await dialog.getByRole('button', { name: /^ok$/i }).click();
    await expect(dialog).toBeHidden();

    const row = txRow(page, 'Coffee Lab');
    await expect(row.getByText('Rome', { exact: true })).toBeVisible({ timeout: 10000 });
    // The description and the contact chip.
    await expect(row.getByText('Coffee Lab', { exact: true })).toHaveCount(2);
  });

  test('edit and transfer forms create labels', async ({ page }) => {
    await setupWallet(page);

    await page.getByRole('button', { name: /^add expense$/i }).click();
    const add = page.getByRole('dialog', { name: /add expense/i });
    await add.getByLabel(/amount/i).fill('6');
    const category = add.getByRole('combobox', { name: /category/i });
    await category.click();
    await category.fill('Groc');
    await add.getByRole('option', { name: 'Groceries' }).click();
    await add.getByLabel(/description/i).fill('Pastry');
    await add.getByRole('button', { name: /^ok$/i }).click();
    await expect(add).toBeHidden();

    const row = txRow(page, 'Pastry');
    await row.dblclick();
    const edit = page.getByRole('dialog', { name: /edit expense/i });
    await createLabel(page, edit, 'Paris');
    await edit.getByRole('button', { name: /^ok$/i }).click();
    await expect(edit).toBeHidden();
    await expect(row.getByText('Paris', { exact: true })).toBeVisible({ timeout: 10000 });

    // A second account so a transfer has a target.
    await page.getByRole('button', { name: /add account/i }).click();
    const account = page.getByRole('dialog');
    await account.getByLabel(/name/i).fill('Savings');
    await account.getByRole('button', { name: /^ok$/i }).click();
    await expect(account).toBeHidden();

    await page.getByRole('button', { name: /^add transfer$/i }).click();
    const transfer = page.getByRole('dialog', { name: /add transfer/i });
    // Opening Savings made it the default source; move the funded Wallet's money instead.
    await transfer.getByRole('combobox', { name: /source account/i }).click();
    await page.getByRole('option', { name: /wallet/i }).click();
    await transfer.getByRole('combobox', { name: /target account/i }).click();
    await page.getByRole('option', { name: /savings/i }).click();
    await transfer.getByLabel(/^amount/i).fill('10');
    await transfer.getByLabel(/description/i).fill('Move');
    await createLabel(page, transfer, 'Savings goal');
    await transfer.getByRole('button', { name: /^ok$/i }).click();
    await expect(transfer).toBeHidden();
    await expect(txRow(page, 'Move').getByText('Savings goal', { exact: true })).toBeVisible({
      timeout: 10000,
    });
  });
});
