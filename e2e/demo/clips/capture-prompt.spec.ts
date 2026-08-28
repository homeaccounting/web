import { test, expect } from './fixtures';
import { enterDemo } from '../support/demo';

const MONOBANK_ACCOUNT_ID = '00000000-0000-0000-0000-0000000000a1';

// Hero flow: type a natural-language prompt, submit, see the transaction land.
test('capture prompt', async ({ page }) => {
  await enterDemo(page, {
    freezeClock: false,
    path: `/transactions?accounts=${MONOBANK_ACCOUNT_ID}`,
  });
  const composer = page.getByTestId('quick-add');
  await expect(composer).toBeVisible();
  const input = composer.getByRole('textbox');
  await input.click();
  await input.pressSequentially('Lunch with friends 220', { delay: 55 });
  await input.press('Enter');
  await expect(page.getByRole('cell', { name: /Lunch with friends 220/ }).first()).toBeVisible();
  await page.waitForTimeout(800);
});
