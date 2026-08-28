import { test, expect } from '@playwright/test';
import { enterDemo, stabilize } from '../support/demo';

test('transactions home is populated', async ({ page }) => {
  await enterDemo(page);
  await expect(page).toHaveURL(/\/transactions/);
  await expect(page.getByRole('cell').first()).toBeVisible();
  await stabilize(page);
  await expect(page).toHaveScreenshot('home-en.png', { fullPage: true });
});
