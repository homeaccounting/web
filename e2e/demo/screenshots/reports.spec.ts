import { test, expect } from '@playwright/test';
import { enterDemo, stabilize } from '../support/demo';

// Tier 1 flow: reports (spending-by-category, income-vs-expense, net worth).
for (const language of ['en', 'uk'] as const) {
  test(`reports (${language})`, async ({ page }) => {
    await enterDemo(page, { language, path: '/reports' });
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    // A report card/chart must be present before we capture.
    await expect(page.getByRole('tab').first()).toBeVisible();
    await stabilize(page);
    await expect(page).toHaveScreenshot(`reports-${language}.png`, { fullPage: true });
  });
}
