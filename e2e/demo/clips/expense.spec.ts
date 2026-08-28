import { test, expect } from './fixtures';
import { enterDemo } from '../support/demo';

// Hero flow: record an expense through the dialog and watch it appear.
test('add expense', async ({ page }) => {
  await enterDemo(page, { freezeClock: false });
  await expect(page).toHaveURL(/\/transactions/);
  await page.getByRole('button', { name: 'Add expense' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add expense' });
  await expect(dialog).toBeVisible();
  await dialog
    .getByPlaceholder(/amount/i)
    .first()
    .fill('75');
  await dialog.getByLabel('Description').fill('Bookstore');
  await dialog.getByRole('button', { name: 'OK' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('cell', { name: 'Bookstore' }).first()).toBeVisible();
  await page.waitForTimeout(800);
});
