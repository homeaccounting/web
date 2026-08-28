import { test, expect } from './fixtures';
import { enterDemo } from '../support/demo';

// Flow: bank connections — open the add-connection dialog.
test('banking connect', async ({ page }) => {
  await enterDemo(page, { freezeClock: false, path: '/profile/banking' });
  await expect(page.getByRole('tab', { selected: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Add connection' }).click();
  await expect(page.getByRole('dialog', { name: 'Add bank connection' })).toBeVisible();
  await page.waitForTimeout(800);
});
