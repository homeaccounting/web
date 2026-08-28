import { test, expect } from '@playwright/test';
import { enterDemo, stabilize } from '../support/demo';

// Tier 1 flow: first-run onboarding. Uses the fresh (not-onboarded) seed so the
// onboarding form renders with empty selections.
for (const language of ['en', 'uk'] as const) {
  test(`onboarding (${language})`, async ({ page }) => {
    await enterDemo(page, { seed: 'fresh', language, path: '/onboarding' });
    // Country / currency / language selects are present (locale-independent).
    await expect(page.getByRole('combobox').first()).toBeVisible();
    await stabilize(page);
    await expect(page).toHaveScreenshot(`onboarding-${language}.png`, { fullPage: true });
  });
}
