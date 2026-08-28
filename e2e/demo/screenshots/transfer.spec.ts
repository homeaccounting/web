import { test, expect } from '@playwright/test';
import { enterDemo, stabilize } from '../support/demo';

// Tier 2 flow (en only): transfer between accounts (multi-currency).
test('add transfer dialog (en)', async ({ page }) => {
  await enterDemo(page, { language: 'en' });
  await expect(page).toHaveURL(/\/transactions/);
  await page.getByRole('button', { name: 'Add transfer' }).click();
  const dialog = page.getByRole('dialog', { name: 'Add transfer' });
  await expect(dialog).toBeVisible();
  await stabilize(page);
  await expect(page).toHaveScreenshot('transfer-en.png', { fullPage: true });
});
