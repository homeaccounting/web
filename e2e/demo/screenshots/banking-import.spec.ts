import { test, expect } from '@playwright/test';
import { enterDemo, stabilize } from '../support/demo';

// Tier 1 flow: bank sync / statement import. bankingFeatureEnabled is true in the
// populated seed, so /profile/banking renders the connections pane.
for (const language of ['en', 'uk'] as const) {
  test(`banking (${language})`, async ({ page }) => {
    await enterDemo(page, { language, path: '/profile/banking' });
    // The banking top-tab is active (locale-independent).
    await expect(page.getByRole('tab', { selected: true }).first()).toBeVisible();
    await stabilize(page);
    await expect(page).toHaveScreenshot(`banking-${language}.png`, { fullPage: true });
  });
}
