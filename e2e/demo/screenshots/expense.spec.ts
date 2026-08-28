import { test, expect } from '@playwright/test';
import { enterDemo, stabilize } from '../support/demo';

// Tier 2 flow (en only): manual expense entry — the multi-allocation dialog.
test('add expense dialog (en)', async ({ page }) => {
  await enterDemo(page, { language: 'en' });
  await expect(page).toHaveURL(/\/transactions/);
  await page.getByRole('button', { name: 'Add expense' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add expense' });
  await expect(dialog).toBeVisible();
  await stabilize(page);
  await expect(page).toHaveScreenshot('expense-en.png', { fullPage: true });
});
