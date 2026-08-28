import { test, expect } from '@playwright/test';
import { enterDemo, stabilize } from '../support/demo';

// Tier 1 flow: frictionless natural-language capture. QuickAddPrompt only mounts
// when a single account is scoped, so we scope to the Monobank (UAH) account.
const MONOBANK_ACCOUNT_ID = '00000000-0000-0000-0000-0000000000a1';

for (const language of ['en', 'uk'] as const) {
  test(`capture prompt (${language})`, async ({ page }) => {
    await enterDemo(page, { language, path: `/transactions?accounts=${MONOBANK_ACCOUNT_ID}` });
    const composer = page.getByTestId('quick-add');
    await expect(composer).toBeVisible();
    // Show the composer mid-capture with a sample prompt typed in.
    await composer.getByRole('textbox').fill('Coffee 45');
    await stabilize(page);
    await expect(page).toHaveScreenshot(`capture-prompt-${language}.png`, { fullPage: true });
  });
}
